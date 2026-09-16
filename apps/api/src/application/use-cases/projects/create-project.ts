import { AppError } from '../../../domain/errors.js';
import { generateSchemaName, toSlug } from '../../../domain/identifiers.js';
import type { ProjectRecord, ProjectRepository } from '../../ports/project-repository.js';

export interface CreateProjectCommand {
  ownerId: string;
  name: string;
}

export type CreateProject = (command: CreateProjectCommand) => Promise<ProjectRecord>;

/** Cuantos sufijos probamos antes de rendirnos con el slug. */
const MAX_SLUG_ATTEMPTS = 50;

async function resolveSlug(
  repository: ProjectRepository,
  ownerId: string,
  name: string,
): Promise<string> {
  const base = toSlug(name);

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!(await repository.slugTaken(ownerId, candidate))) return candidate;
  }

  // Salida garantizada: el sufijo aleatorio no puede colisionar en la practica.
  return `${base}-${Date.now().toString(36)}`;
}

export interface CreateProjectOptions {
  /**
   * Cuota de proyectos por persona.
   *
   * Seguimiento del ADR 0001: cada proyecto crea un schema de PostgreSQL, y el
   * numero de schemas por base de datos no es infinito. Sin cuota, una sola
   * cuenta puede agotar el recurso para todas las demas.
   */
  maxProjectsPerUser: number;
}

export function createProjectUseCase(
  repository: ProjectRepository,
  options: CreateProjectOptions,
): CreateProject {
  return async ({ ownerId, name }) => {
    const existing = await repository.countByOwner(ownerId);

    if (existing >= options.maxProjectsPerUser) {
      throw AppError.conflict(
        `Has alcanzado el limite de ${options.maxProjectsPerUser} proyectos. Elimina alguno para crear uno nuevo.`,
      );
    }

    const trimmed = name.trim();

    return repository.create({
      ownerId,
      name: trimmed,
      slug: await resolveSlug(repository, ownerId, trimmed),
      // Nunca deriva del nombre escrito por el usuario (ADR 0001).
      schemaName: generateSchemaName(),
    });
  };
}
