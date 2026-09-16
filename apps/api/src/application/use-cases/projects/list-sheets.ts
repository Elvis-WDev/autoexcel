import { AppError } from '../../../domain/errors.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SheetRecord, SourceFileRepository } from '../../ports/source-file-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface ListSheetsQuery {
  projectId: string;
  actorId: string;
}

export interface SheetsResult {
  fileName: string;
  sheets: SheetRecord[];
}

export type ListSheets = (query: ListSheetsQuery) => Promise<SheetsResult>;

export function listSheetsUseCase(
  projects: ProjectRepository,
  sourceFiles: SourceFileRepository,
): ListSheets {
  return async ({ projectId, actorId }) => {
    await loadOwnedProject(projects, projectId, actorId);

    const file = await sourceFiles.findByProject(projectId);
    if (!file) {
      throw AppError.invalidState('Todavia no has subido un archivo a este proyecto.');
    }

    return { fileName: file.originalName, sheets: await sourceFiles.listSheets(projectId) };
  };
}
