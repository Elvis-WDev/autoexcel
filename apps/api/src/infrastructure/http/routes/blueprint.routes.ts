import { Router } from 'express';
import { z } from 'zod';
import type { SessionReader } from '../../../application/ports/session.js';
import type { AdvanceStep } from '../../../application/use-cases/projects/advance-step.js';
import type { ConfirmBlueprint } from '../../../application/use-cases/projects/confirm-blueprint.js';
import type { ApplyBlueprintEdit } from '../../../application/use-cases/projects/edit-blueprint.js';
import type { GetBlueprint } from '../../../application/use-cases/projects/get-blueprint.js';
import {
  addField,
  rejectRelation,
  removeEntity,
  removeField,
  renameEntity,
  setApplicationName,
  setDedupeField,
  setDisplayField,
  updateField,
} from '../../../domain/blueprint/edits.js';
import { FIELD_TYPES } from '../../../domain/blueprint/types.js';
import { PROJECT_STATUSES } from '../../../domain/project-status.js';
import { getActor, requireAuth } from '../authenticated-request.js';
import { success } from '../envelope.js';
import { toBlueprintView, toSummaryView } from '../presenters/blueprint.presenter.js';

export interface BlueprintRouterDependencies {
  sessions: SessionReader;
  getBlueprint: GetBlueprint;
  applyEdit: ApplyBlueprintEdit;
  confirmBlueprint: ConfirmBlueprint;
  advanceStep: AdvanceStep;
}

const projectParams = z.object({ id: z.uuid() });

const entityParams = projectParams.extend({
  entityName: z.string().min(1).max(63),
});

const fieldParams = entityParams.extend({
  fieldName: z.string().min(1).max(63),
});

const label = z.string().trim().min(1, 'Escribe un nombre.').max(120);

/** Tipos que la persona usuaria puede elegir a mano. */
const editableTypes = FIELD_TYPES.filter((type) => type !== 'relation') as [string, ...string[]];

/**
 * Rutas de revision y edicion del modelo propuesto.
 *
 * Todas responden con el blueprint completo actualizado, no con el fragmento
 * modificado. La razon es la validacion: una edicion puede tener consecuencias
 * en otra entidad —al eliminar un grupo, los campos que lo referenciaban dejan
 * de ser relaciones— y devolver solo lo tocado dejaria a la interfaz mostrando
 * un estado que ya no existe.
 *
 * Las entidades y los campos se direccionan por su nombre, no por un
 * identificador de base de datos. Es legible en la URL y no expone UUID internos.
 */
export function createBlueprintRouter(dependencies: BlueprintRouterDependencies): Router {
  const router = Router();
  router.use(requireAuth(dependencies.sessions));

  const respond = (
    response: Parameters<Parameters<Router['get']>[1]>[1],
    outcome: Awaited<ReturnType<ApplyBlueprintEdit>>,
  ): void => {
    response.json(success(toBlueprintView(outcome.blueprint), { notes: outcome.notes }));
  };

  router.get('/projects/:id/blueprint', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const blueprint = await dependencies.getBlueprint({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(success(toBlueprintView(blueprint)));
  });

  // RF-12: el resumen que se ve justo antes de crear.
  router.get('/projects/:id/blueprint/summary', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const blueprint = await dependencies.getBlueprint({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(success(toSummaryView(blueprint)));
  });

  router.patch('/projects/:id/blueprint', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const { applicationName } = z.object({ applicationName: label }).parse(request.body);

    respond(
      response,
      await dependencies.applyEdit({
        projectId: id,
        actorId: getActor(request).id,
        edit: (blueprint) => setApplicationName(blueprint, applicationName),
      }),
    );
  });

  // RF-06: revisar entidades.
  router.patch('/projects/:id/blueprint/entities/:entityName', async (request, response) => {
    const { id, entityName } = entityParams.parse(request.params);
    const body = z
      .object({
        label: label.optional(),
        displayField: z.string().min(1).optional(),
        dedupeField: z.string().min(1).nullable().optional(),
      })
      .parse(request.body);

    respond(
      response,
      await dependencies.applyEdit({
        projectId: id,
        actorId: getActor(request).id,
        edit: (blueprint, context) => {
          let current = blueprint;
          const notes: string[] = [];

          if (body.label !== undefined) {
            const step = renameEntity(current, entityName, body.label);
            current = step.blueprint;
            notes.push(...step.notes);
          }

          if (body.displayField !== undefined) {
            const step = setDisplayField(current, entityName, body.displayField);
            current = step.blueprint;
            notes.push(...step.notes);
          }

          if (body.dedupeField !== undefined) {
            const step = setDedupeField(current, entityName, body.dedupeField, context);
            current = step.blueprint;
            notes.push(...step.notes);
          }

          return { blueprint: current, notes };
        },
      }),
    );
  });

  router.delete('/projects/:id/blueprint/entities/:entityName', async (request, response) => {
    const { id, entityName } = entityParams.parse(request.params);

    respond(
      response,
      await dependencies.applyEdit({
        projectId: id,
        actorId: getActor(request).id,
        edit: (blueprint, context) => removeEntity(blueprint, entityName, context),
      }),
    );
  });

  // RF-09: revisar campos.
  router.post('/projects/:id/blueprint/entities/:entityName/fields', async (request, response) => {
    const { id, entityName } = entityParams.parse(request.params);
    const body = z
      .object({
        label,
        type: z.enum(editableTypes),
        required: z.boolean().default(false),
        options: z.array(z.string()).max(50).optional(),
      })
      .parse(request.body);

    respond(
      response,
      await dependencies.applyEdit({
        projectId: id,
        actorId: getActor(request).id,
        edit: (blueprint) =>
          addField(blueprint, entityName, {
            label: body.label,
            type: body.type as (typeof FIELD_TYPES)[number],
            required: body.required,
            ...(body.options ? { options: body.options } : {}),
          }),
      }),
    );
  });

  router.patch(
    '/projects/:id/blueprint/entities/:entityName/fields/:fieldName',
    async (request, response) => {
      const { id, entityName, fieldName } = fieldParams.parse(request.params);
      const body = z
        .object({
          label: label.optional(),
          type: z.enum(editableTypes).optional(),
          required: z.boolean().optional(),
          options: z.array(z.string()).max(50).optional(),
        })
        .parse(request.body);

      respond(
        response,
        await dependencies.applyEdit({
          projectId: id,
          actorId: getActor(request).id,
          edit: (blueprint, context) =>
            updateField(
              blueprint,
              entityName,
              fieldName,
              {
                ...(body.label === undefined ? {} : { label: body.label }),
                ...(body.type === undefined
                  ? {}
                  : { type: body.type as (typeof FIELD_TYPES)[number] }),
                ...(body.required === undefined ? {} : { required: body.required }),
                ...(body.options === undefined ? {} : { options: body.options }),
              },
              context,
            ),
        }),
      );
    },
  );

  router.delete(
    '/projects/:id/blueprint/entities/:entityName/fields/:fieldName',
    async (request, response) => {
      const { id, entityName, fieldName } = fieldParams.parse(request.params);

      respond(
        response,
        await dependencies.applyEdit({
          projectId: id,
          actorId: getActor(request).id,
          edit: (blueprint) => removeField(blueprint, entityName, fieldName),
        }),
      );
    },
  );

  // RF-11: aceptar o rechazar una relacion. Se direcciona por la entidad que la
  // lleva y el campo que la sostiene, que es como se lee en la interfaz.
  router.patch(
    '/projects/:id/blueprint/relations/:entityName/:fieldName',
    async (request, response) => {
      const { id, entityName, fieldName } = fieldParams.parse(request.params);
      const { accepted } = z.object({ accepted: z.boolean() }).parse(request.body);

      const actorId = getActor(request).id;

      if (accepted) {
        // Aceptar es el estado por defecto: no hay nada que cambiar, pero la
        // interfaz necesita poder confirmarlo explicitamente.
        const blueprint = await dependencies.getBlueprint({ projectId: id, actorId });
        response.json(success(toBlueprintView(blueprint), { notes: [] }));
        return;
      }

      respond(
        response,
        await dependencies.applyEdit({
          projectId: id,
          actorId,
          edit: (blueprint, context) => rejectRelation(blueprint, entityName, fieldName, context),
        }),
      );
    },
  );

  // RX-07: la confirmacion explicita que congela la estructura.
  router.post('/projects/:id/blueprint/confirm', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const blueprint = await dependencies.confirmBlueprint({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(success(toSummaryView(blueprint)));
  });

  // RX-04: volver a pasos anteriores antes de crear.
  router.post('/projects/:id/step', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const { to } = z.object({ to: z.enum(PROJECT_STATUSES) }).parse(request.body);

    const project = await dependencies.advanceStep({
      projectId: id,
      actorId: getActor(request).id,
      to,
    });

    response.json(success({ status: project.status }));
  });

  return router;
}
