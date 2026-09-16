import { AppError } from '../../../domain/errors.js';
import { assertTransition, type ProjectStatus } from '../../../domain/project-status.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRecord, ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from './ownership.js';

export interface AdvanceStepCommand {
  projectId: string;
  actorId: string;
  to: ProjectStatus;
}

export type AdvanceStep = (command: AdvanceStepCommand) => Promise<ProjectRecord>;

/** Pasos del asistente a los que se puede saltar desde la interfaz. */
const NAVIGABLE: ReadonlySet<ProjectStatus> = new Set([
  'reviewing_entities',
  'reviewing_fields',
  'reviewing_relations',
  'reviewing_summary',
]);

/**
 * Avanza o retrocede entre los pasos de revision (RX-04).
 *
 * "El usuario debera poder volver a pasos anteriores antes de crear
 * definitivamente la aplicacion." Aqui eso deja de ser una promesa de la
 * interfaz y pasa a ser una operacion del servidor, gobernada por la misma tabla
 * de transiciones que todo lo demas.
 *
 * Los pasos que tocan la base de datos (`creating`, `importing`) no son
 * navegables: se alcanzan ejecutando trabajo, no pulsando "siguiente".
 */
export function advanceStepUseCase(projects: ProjectRepository, logger: Logger): AdvanceStep {
  return async ({ projectId, actorId, to }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);

    // `creating` es alcanzable segun la tabla de transiciones, pero no pulsando
    // "siguiente": se llega ejecutando el trabajo de construccion.
    if (!NAVIGABLE.has(to)) {
      throw AppError.invalidState('Ese paso no se alcanza desde el asistente.', { to });
    }

    assertTransition(project.status, to);
    const updated = await projects.updateStatus(projectId, to, null);

    logger.info('Paso del asistente', { projectId, from: project.status, to });
    return updated;
  };
}
