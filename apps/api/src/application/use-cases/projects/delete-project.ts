import { AppError } from '../../../domain/errors.js';
import type { Logger } from '../../ports/logger.js';
import type { DataPlaneSchemaManager } from '../../ports/data-plane.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface DeleteProjectCommand {
  projectId: string;
  actorId: string;
  /** El nombre exacto del proyecto, tecleado por la persona usuaria. */
  confirmName: string;
}

export type DeleteProject = (command: DeleteProjectCommand) => Promise<void>;

export interface DeleteProjectDependencies {
  repository: ProjectRepository;
  schemas: DataPlaneSchemaManager;
  logger: Logger;
}

/**
 * Borra un proyecto y su schema de datos.
 *
 * Es la accion mas destructiva del sistema: se lleva por delante todos los
 * registros importados. `docs/architecture/forms-and-workflows.md` exige, para
 * una eliminacion irreversible, teclear el nombre exacto del registro; esa regla
 * se aplica aqui, en el servidor, no solo en el formulario.
 *
 * Orden: primero el schema, despues la fila.
 *
 * `DROP SCHEMA IF EXISTS` es idempotente, asi que si el borrado de la fila falla
 * basta con reintentar la operacion completa. Al reves no: borrar la fila
 * primero y fallar al soltar el schema dejaria un schema huerfano del que ya no
 * quedaria constancia en ningun sitio.
 */
export function deleteProjectUseCase(dependencies: DeleteProjectDependencies): DeleteProject {
  const { repository, schemas, logger } = dependencies;

  return async ({ projectId, actorId, confirmName }) => {
    const project = await loadOwnedProject(repository, projectId, actorId);

    if (confirmName !== project.name) {
      throw AppError.validation(
        'Para eliminar el proyecto escribe su nombre exactamente como aparece.',
        { expectedLabel: project.name },
      );
    }

    await schemas.dropSchema(project.schemaName);
    await repository.deleteById(project.id);

    logger.info('Proyecto eliminado', { projectId: project.id, actorId });
  };
}
