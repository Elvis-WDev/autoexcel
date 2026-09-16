import { buildPhysicalPlan, type PhysicalPlan } from '../../../domain/blueprint/physical-plan.js';
import { validateBlueprint } from '../../../domain/blueprint/validator.js';
import { AppError } from '../../../domain/errors.js';
import { assertStatusIn } from '../../../domain/project-status.js';
import type { BlueprintRepository } from '../../ports/blueprint-repository.js';
import type { DataPlaneMaterializer } from '../../ports/data-plane.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import { buildEditContext, toProposed } from './edit-blueprint.js';
import { loadOwnedProject } from './ownership.js';

export interface BuildApplicationCommand {
  projectId: string;
  actorId: string;
}

export interface BuildOutcome {
  plan: PhysicalPlan;
}

export type BuildApplication = (command: BuildApplicationCommand) => Promise<BuildOutcome>;

export interface BuildApplicationDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  blueprints: BlueprintRepository;
  materializer: DataPlaneMaterializer;
  logger: Logger;
}

/**
 * Construye la estructura de la aplicacion (RF-13).
 *
 * Es el momento en que el producto deja de proponer y empieza a ejecutar. A
 * partir de aqui no interviene ninguna IA: se lee un blueprint confirmado y se
 * emite SQL determinista (P-03).
 *
 * El blueprint se vuelve a validar aunque ya se validara al confirmarlo. Es
 * barato y cierra la puerta a que algo escrito por otra via llegue al DDL.
 * RNF-04 no dice "validalo una vez", dice que no se cree una aplicacion a partir
 * de un blueprint invalido.
 */
export function buildApplicationUseCase(
  dependencies: BuildApplicationDependencies,
): BuildApplication {
  const { projects, sourceFiles, blueprints, materializer, logger } = dependencies;

  return async ({ projectId, actorId }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);
    assertStatusIn(project.status, ['creating']);

    const stored = await blueprints.findByProject(projectId);
    if (!stored) throw AppError.invalidState('Todavia no hemos analizado este archivo.');

    if (stored.status !== 'confirmed') {
      throw AppError.invalidState('Confirma la estructura antes de crear la aplicacion.');
    }

    const context = await buildEditContext(sourceFiles, projectId);
    const validated = validateBlueprint(toProposed(stored), {
      profiles: context.profiles,
      includedSheetIndexes: new Set(
        [...context.profiles.keys()].map((key) => Number(key.split(':')[0])),
      ),
    });

    if (!validated.ok) {
      throw AppError.validation(
        'No podemos crear tu aplicacion con esta estructura.',
        validated.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => issue.message),
      );
    }

    // El nombre del schema se genero al crear el proyecto y nunca deriva del
    // texto del usuario (ADR 0001).
    const plan = buildPhysicalPlan(project.schemaName, validated.blueprint);
    await materializer.createSchema(plan);
    await blueprints.savePhysicalNames(projectId, plan);

    logger.info('Aplicacion construida', {
      projectId,
      tables: plan.tables.length,
      columns: plan.tables.reduce((total, table) => total + table.columns.length, 0),
    });

    return { plan };
  };
}
