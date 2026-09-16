import type { ProjectRecord, ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface GetProjectQuery {
  projectId: string;
  actorId: string;
}

export type GetProject = (query: GetProjectQuery) => Promise<ProjectRecord>;

export function getProjectUseCase(repository: ProjectRepository): GetProject {
  return ({ projectId, actorId }) => loadOwnedProject(repository, projectId, actorId);
}
