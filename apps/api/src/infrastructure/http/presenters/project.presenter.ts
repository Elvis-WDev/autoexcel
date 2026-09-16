import type { ProjectRecord } from '../../../application/ports/project-repository.js';
import { allowedTransitionsFrom } from '../../../domain/project-status.js';

export interface ProjectView {
  id: string;
  name: string;
  slug: string;
  status: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convierte un proyecto en lo que puede ver el cliente.
 *
 * Deja fuera `schemaName` y `ownerId` a proposito. El nombre del schema es un
 * detalle del motor de base de datos y la *Technical Information Boundary* de
 * `docs/architecture/frontend.md` prohibe exponerlo; el propietario ya esta
 * implicito en la sesion.
 */
export function toProjectView(project: ProjectRecord): ProjectView {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    failureReason: project.failureReason,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/**
 * Vista de detalle. Anade los pasos a los que el proyecto puede avanzar, para
 * que el asistente sepa que ofrecer sin duplicar la maquina de estados en el
 * cliente.
 */
export function toProjectDetailView(
  project: ProjectRecord,
): ProjectView & { nextStatuses: readonly string[] } {
  return {
    ...toProjectView(project),
    nextStatuses: allowedTransitionsFrom(project.status),
  };
}
