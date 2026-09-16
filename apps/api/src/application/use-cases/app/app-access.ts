import { AppError } from '../../../domain/errors.js';
import {
  buildRuntimeApplication,
  findEntity,
  type RuntimeApplication,
  type RuntimeEntity,
} from '../../../domain/runtime/application.js';
import type { BlueprintRepository } from '../../ports/blueprint-repository.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import { loadOwnedProject } from '../projects/ownership.js';

export interface AppAccessDependencies {
  projects: ProjectRepository;
  blueprints: BlueprintRepository;
}

/**
 * Puerta de entrada unica a una aplicacion generada.
 *
 * Todo endpoint del CRUD pasa por aqui, y por tres comprobaciones que no se
 * pueden saltar:
 *
 *   1. El proyecto pertenece a quien lo pide.
 *   2. La aplicacion existe: la estructura se construyo de verdad.
 *   3. El nombre que llego por la URL se RESUELVE contra el descriptor. Nunca se
 *      usa para componer SQL, asi que pedir `/app/x";DROP/records` solo produce
 *      un 404 (ADR 0001).
 */
export async function openApplication(
  dependencies: AppAccessDependencies,
  projectId: string,
  actorId: string,
): Promise<RuntimeApplication> {
  const project = await loadOwnedProject(dependencies.projects, projectId, actorId);

  if (project.status !== 'completed' && project.status !== 'importing') {
    throw AppError.invalidState('Tu aplicacion todavia no esta lista.');
  }

  const blueprint = await dependencies.blueprints.findByProject(projectId);
  if (!blueprint) throw AppError.invalidState('Tu aplicacion todavia no esta lista.');

  return buildRuntimeApplication(project.schemaName, blueprint);
}

export async function openEntity(
  dependencies: AppAccessDependencies,
  projectId: string,
  actorId: string,
  entityName: string,
): Promise<{ application: RuntimeApplication; entity: RuntimeEntity }> {
  const application = await openApplication(dependencies, projectId, actorId);
  return { application, entity: findEntity(application, entityName) };
}
