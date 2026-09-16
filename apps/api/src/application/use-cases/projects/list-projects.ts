import type { ListResult, ProjectRepository } from '../../ports/project-repository.js';

export interface ListProjectsQuery {
  ownerId: string;
  limit: number;
  offset: number;
  search?: string | null;
}

export type ListProjects = (query: ListProjectsQuery) => Promise<ListResult>;

export function listProjectsUseCase(repository: ProjectRepository): ListProjects {
  return ({ ownerId, limit, offset, search }) =>
    repository.listByOwner(ownerId, { limit, offset, search: search ?? null });
}
