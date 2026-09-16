import { AppError } from '../../../domain/errors.js';
import type { BlueprintRepository, StoredBlueprint } from '../../ports/blueprint-repository.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface GetBlueprintQuery {
  projectId: string;
  actorId: string;
}

export type GetBlueprint = (query: GetBlueprintQuery) => Promise<StoredBlueprint>;

export function getBlueprintUseCase(
  projects: ProjectRepository,
  blueprints: BlueprintRepository,
): GetBlueprint {
  return async ({ projectId, actorId }) => {
    await loadOwnedProject(projects, projectId, actorId);

    const blueprint = await blueprints.findByProject(projectId);
    if (!blueprint) {
      throw AppError.invalidState('Todavia no hemos analizado este archivo.');
    }

    return blueprint;
  };
}
