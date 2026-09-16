import { Router } from 'express';
import { z } from 'zod';
import type { SessionReader } from '../../../application/ports/session.js';
import type {
  CreateRecord,
  DeleteRecord,
  GetManifest,
  GetRecord,
  ListOptions,
  ListRecords,
  UpdateRecord,
} from '../../../application/use-cases/app/records.js';
import { getActor, requireAuth } from '../authenticated-request.js';
import { success } from '../envelope.js';
import { toManifestView, toRecordView } from '../presenters/app.presenter.js';

export interface AppRouterDependencies {
  sessions: SessionReader;
  getManifest: GetManifest;
  listRecords: ListRecords;
  getRecord: GetRecord;
  createRecord: CreateRecord;
  updateRecord: UpdateRecord;
  deleteRecord: DeleteRecord;
  listOptions: ListOptions;
}

const projectParams = z.object({ id: z.uuid() });

const entityParams = projectParams.extend({
  /** Se resuelve contra el descriptor; nunca llega al SQL (ADR 0001). */
  entity: z.string().min(1).max(63),
});

const recordParams = entityParams.extend({
  recordId: z.uuid('Ese identificador de registro no es valido.'),
});

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().min(1).max(63).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().max(200).optional(),
});

const optionsQuery = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * La aplicacion generada.
 *
 * Es lo que convierte un schema de PostgreSQL en un producto: navegacion,
 * listas, formularios y selectores, todo derivado del blueprint sin una linea de
 * codigo especifica por proyecto.
 *
 * Los modulos se direccionan por su nombre publico, igual que en el asistente.
 * Ese valor se resuelve contra el descriptor antes de tocar la base: pedir
 * `/app/x";DROP/records` produce un 404, no una sentencia.
 */
export function createAppRouter(dependencies: AppRouterDependencies): Router {
  const router = Router();
  router.use(requireAuth(dependencies.sessions));

  // RF-22: navegacion entre los modulos creados.
  router.get('/projects/:id/app', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const application = await dependencies.getManifest({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(success(toManifestView(application)));
  });

  // RF-14: la tabla de registros.
  router.get('/projects/:id/app/:entity/records', async (request, response) => {
    const { id, entity } = entityParams.parse(request.params);
    const query = listQuery.parse(request.query);

    const result = await dependencies.listRecords({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      sort: query.sort ?? null,
      direction: query.dir,
      search: query.q ?? null,
      limit: query.limit,
      offset: query.offset,
    });

    response.json(
      success(result.items.map(toRecordView), {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
        entity: result.entityLabel,
      }),
    );
  });

  // RF-17: opciones de un selector de relacion.
  router.get('/projects/:id/app/:entity/options', async (request, response) => {
    const { id, entity } = entityParams.parse(request.params);
    const query = optionsQuery.parse(request.query);

    const options = await dependencies.listOptions({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      search: query.q ?? null,
      limit: query.limit,
    });

    response.json(success(options, { limit: query.limit }));
  });

  // RF-15 y RF-23: crear un registro.
  router.post('/projects/:id/app/:entity/records', async (request, response) => {
    const { id, entity } = entityParams.parse(request.params);

    const created = await dependencies.createRecord({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      values: request.body,
    });

    response.status(201).json(success(toRecordView(created)));
  });

  // RF-16: abrir un registro.
  router.get('/projects/:id/app/:entity/records/:recordId', async (request, response) => {
    const { id, entity, recordId } = recordParams.parse(request.params);

    const record = await dependencies.getRecord({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      recordId,
    });

    response.json(success(toRecordView(record)));
  });

  // RF-24: editar un registro, incluidos los que vinieron del Excel.
  router.patch('/projects/:id/app/:entity/records/:recordId', async (request, response) => {
    const { id, entity, recordId } = recordParams.parse(request.params);

    const updated = await dependencies.updateRecord({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      recordId,
      values: request.body,
    });

    response.json(success(toRecordView(updated)));
  });

  router.delete('/projects/:id/app/:entity/records/:recordId', async (request, response) => {
    const { id, entity, recordId } = recordParams.parse(request.params);

    await dependencies.deleteRecord({
      projectId: id,
      actorId: getActor(request).id,
      entityName: entity,
      recordId,
    });

    response.status(204).send();
  });

  return router;
}
