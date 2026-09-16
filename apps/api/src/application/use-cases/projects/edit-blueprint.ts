import type { EditContext, EditResult } from '../../../domain/blueprint/edits.js';
import type { ProposedBlueprint } from '../../../domain/blueprint/types.js';
import { profileKey, validateBlueprint } from '../../../domain/blueprint/validator.js';
import { AppError } from '../../../domain/errors.js';
import { assertStatusIn, isBeforeMaterialization } from '../../../domain/project-status.js';
import type { ColumnProfile } from '../../../domain/spreadsheet/column-profile.js';
import type { BlueprintRepository, StoredBlueprint } from '../../ports/blueprint-repository.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import { loadOwnedProject } from './ownership.js';

/** Una edicion: recibe la propuesta actual y devuelve la siguiente. */
export type BlueprintEdit = (blueprint: ProposedBlueprint, context: EditContext) => EditResult;

export interface ApplyEditCommand {
  projectId: string;
  actorId: string;
  edit: BlueprintEdit;
}

export interface EditOutcome {
  blueprint: StoredBlueprint;
  /** Consecuencias de la edicion, en lenguaje de negocio. */
  notes: string[];
}

export type ApplyBlueprintEdit = (command: ApplyEditCommand) => Promise<EditOutcome>;

export interface EditBlueprintDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  blueprints: BlueprintRepository;
  logger: Logger;
}

/**
 * Aplica una edicion al blueprint.
 *
 * Todas las ediciones pasan por aqui, y el orden no es negociable:
 *
 *   1. El proyecto debe estar en un paso de revision. Despues de `creating` la
 *      estructura ya existe y editarla seria mentir sobre lo que hay en la base
 *      de datos.
 *   2. La edicion se aplica sobre una copia, en memoria.
 *   3. El resultado se valida ENTERO con el mismo validador que uso F3. Si no
 *      pasa, no se escribe nada (RNF-04: "No se debera crear una aplicacion a
 *      partir de un Blueprint invalido"; aqui se adelanta el momento en que eso
 *      se comprueba).
 *   4. Solo entonces se persiste.
 *
 * El validador ademas repara: si al borrar un campo se quedo sin `displayField`,
 * elige otro en vez de rechazar la edicion.
 */
export function editBlueprintUseCase(dependencies: EditBlueprintDependencies): ApplyBlueprintEdit {
  const { projects, sourceFiles, blueprints, logger } = dependencies;

  return async ({ projectId, actorId, edit }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);

    if (!isBeforeMaterialization(project.status)) {
      throw AppError.invalidState(
        'Tu aplicacion ya fue creada, asi que su estructura no se puede seguir cambiando aqui.',
      );
    }

    assertStatusIn(project.status, [
      'reviewing_entities',
      'reviewing_fields',
      'reviewing_relations',
      'reviewing_summary',
    ]);

    const stored = await blueprints.findByProject(projectId);
    if (!stored) throw AppError.invalidState('Todavia no hemos analizado este archivo.');

    if (stored.status === 'confirmed') {
      throw AppError.invalidState(
        'Ya confirmaste esta estructura. Si quieres cambiarla, vuelve al resumen.',
      );
    }

    const context = await buildEditContext(sourceFiles, projectId);
    const edited = edit(toProposed(stored), context);
    const validated = validateBlueprint(edited.blueprint, {
      profiles: context.profiles,
      includedSheetIndexes: new Set(
        [...context.profiles.keys()].map((key) => Number(key.split(':')[0])),
      ),
    });

    if (!validated.ok) {
      throw AppError.validation(
        'Ese cambio dejaria la estructura en un estado que no podemos construir.',
        validated.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => issue.message),
      );
    }

    await blueprints.replace({
      projectId,
      applicationName: validated.blueprint.applicationName,
      // Una vez que la persona usuaria toca la propuesta, deja de ser solo
      // inferida. RX-05 pide distinguir que fue automatico.
      origin: stored.origin,
      notes: validated.issues,
      blueprint: validated.blueprint,
    });

    const refreshed = await blueprints.findByProject(projectId);
    if (!refreshed) throw AppError.internal();

    logger.info('Blueprint editado', {
      projectId,
      entities: refreshed.entities.length,
      relations: refreshed.relations.length,
    });

    return {
      blueprint: refreshed,
      notes: [
        ...edited.notes,
        ...validated.issues
          .filter((issue) => issue.severity === 'repair')
          .map((issue) => issue.message),
      ],
    };
  };
}

/**
 * Reconstruye el contexto de validacion desde la base de datos.
 *
 * No hace falta releer el archivo: los perfiles se guardaron en F2 y son
 * justamente lo que el validador necesita.
 */
export async function buildEditContext(
  sourceFiles: SourceFileRepository,
  projectId: string,
): Promise<EditContext> {
  const sheets = await sourceFiles.listSheets(projectId);
  const profiles = new Map<string, ColumnProfile>();

  for (const sheet of sheets) {
    if (!sheet.included) continue;

    for (const column of sheet.columns) {
      if (column.profile && typeof column.profile === 'object') {
        profiles.set(profileKey(sheet.index, column.index), column.profile as ColumnProfile);
      }
    }
  }

  return { profiles };
}

/** Lo guardado -> el modelo con el que trabajan las ediciones. */
export function toProposed(stored: StoredBlueprint): ProposedBlueprint {
  return {
    applicationName: stored.applicationName,
    entities: stored.entities.map((entity) => ({
      name: entity.name,
      label: entity.label,
      origin: entity.origin,
      ...(entity.sourceSheetIndex === null ? {} : { sourceSheetIndex: entity.sourceSheetIndex }),
      displayField: entity.displayFieldName ?? '',
      ...(entity.dedupeFieldName === null ? {} : { dedupeField: entity.dedupeFieldName }),
      fields: entity.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
        ...(field.options === null ? {} : { options: field.options }),
        ...(field.targetEntityName === null ? {} : { targetEntity: field.targetEntityName }),
        ...(field.sourceSheetIndex === null || field.sourceColumnIndex === null
          ? {}
          : {
              source: {
                sheetIndex: field.sourceSheetIndex,
                columnIndex: field.sourceColumnIndex,
              },
            }),
      })),
    })),
    relations: stored.relations.map((relation) => ({
      fromEntity: relation.fromEntityName,
      toEntity: relation.toEntityName,
      fieldName: relation.fieldName,
      type: relation.type,
    })),
  };
}
