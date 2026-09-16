import { AppError } from '../../../domain/errors.js';
import type { ProjectRecord, ProjectRepository } from '../../ports/project-repository.js';

/**
 * Carga un proyecto comprobando que pertenece a quien lo pide.
 *
 * Responde NOT_FOUND, no FORBIDDEN, cuando el proyecto existe pero es de otra
 * persona. Un 403 confirmaria que ese identificador existe y permitiria
 * enumerar los proyectos ajenos; un 404 no distingue ambos casos.
 *
 * Esta es la unica puerta de entrada a un proyecto. Ningun caso de uso debe
 * llamar a `findById` directamente.
 */
export async function loadOwnedProject(
  repository: ProjectRepository,
  projectId: string,
  actorId: string,
): Promise<ProjectRecord> {
  const project = await repository.findById(projectId);

  if (!project || project.ownerId !== actorId) {
    throw AppError.notFound('No encontramos ese proyecto.');
  }

  return project;
}
