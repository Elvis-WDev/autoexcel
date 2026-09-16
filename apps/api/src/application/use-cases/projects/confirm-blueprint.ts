import { validateBlueprint } from '../../../domain/blueprint/validator.js';
import { AppError } from '../../../domain/errors.js';
import { assertStatusIn } from '../../../domain/project-status.js';
import type { BlueprintRepository, StoredBlueprint } from '../../ports/blueprint-repository.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import { buildEditContext, toProposed } from './edit-blueprint.js';
import { loadOwnedProject } from './ownership.js';

export interface ConfirmBlueprintCommand {
  projectId: string;
  actorId: string;
}

export type ConfirmBlueprint = (command: ConfirmBlueprintCommand) => Promise<StoredBlueprint>;

export interface ConfirmBlueprintDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  blueprints: BlueprintRepository;
  logger: Logger;
}

/**
 * Congela la estructura aprobada (RX-07, RNF-04).
 *
 * Es la bisagra del ERS: "La aplicacion no se creara hasta que el usuario vea el
 * resumen y confirme". A partir de aqui el blueprint deja de ser editable y pasa
 * a ser el contrato que F5 materializa, sin intervencion de IA (P-03).
 *
 * Se valida otra vez, entera, aunque cada edicion ya se validara por su cuenta.
 * Es barato y cierra la puerta a que un blueprint escrito por otra via —una
 * migracion, un arreglo manual, un bug futuro— llegue al materializador.
 */
export function confirmBlueprintUseCase(
  dependencies: ConfirmBlueprintDependencies,
): ConfirmBlueprint {
  const { projects, sourceFiles, blueprints, logger } = dependencies;

  return async ({ projectId, actorId }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);
    assertStatusIn(project.status, ['reviewing_summary']);

    const stored = await blueprints.findByProject(projectId);
    if (!stored) throw AppError.invalidState('Todavia no hemos analizado este archivo.');

    if (stored.status === 'confirmed') return stored;

    const context = await buildEditContext(sourceFiles, projectId);
    const validated = validateBlueprint(toProposed(stored), {
      profiles: context.profiles,
      includedSheetIndexes: new Set(
        [...context.profiles.keys()].map((key) => Number(key.split(':')[0])),
      ),
    });

    if (!validated.ok) {
      throw AppError.validation(
        'Todavia no podemos crear tu aplicacion con esta estructura.',
        validated.issues
          .filter((issue) => issue.severity === 'error')
          .map((issue) => issue.message),
      );
    }

    await blueprints.confirm(projectId);
    logger.info('Blueprint confirmado', {
      projectId,
      entities: stored.entities.length,
      relations: stored.relations.length,
    });

    const confirmed = await blueprints.findByProject(projectId);
    if (!confirmed) throw AppError.internal();

    return confirmed;
  };
}
