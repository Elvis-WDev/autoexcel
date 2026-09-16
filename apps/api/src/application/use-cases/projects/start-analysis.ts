import { AppError } from '../../../domain/errors.js';
import { assertTransition } from '../../../domain/project-status.js';
import type { JobRecord, JobRepository } from '../../ports/job-repository.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { AnalyzeProject } from './analyze-project.js';
import { loadOwnedProject } from './ownership.js';

export interface StartAnalysisCommand {
  projectId: string;
  actorId: string;
}

export type StartAnalysis = (command: StartAnalysisCommand) => Promise<JobRecord>;

export interface StartAnalysisDependencies {
  projects: ProjectRepository;
  jobs: JobRepository;
  analyze: AnalyzeProject;
  logger: Logger;
  /**
   * Lanza el trabajo. Inyectable para que los tests lo ejecuten de forma
   * sincrona y puedan afirmar sobre el resultado sin esperas ni temporizadores.
   */
  schedule?: (work: () => Promise<void>) => void;
}

/**
 * Arranca el analisis y devuelve enseguida (RNF-06).
 *
 * El analisis tarda segundos: llamar al modelo, validar y quiza reparar. Dejar
 * la peticion HTTP abierta durante todo eso significa que cualquier recarga del
 * navegador perderia el trabajo y que un proxy podria cortarlo a mitad. En su
 * lugar se crea una fila de trabajo, se devuelve su identificador y la interfaz
 * pregunta por el.
 *
 * Limitacion conocida del MVP: el trabajo corre dentro del proceso, asi que un
 * reinicio del servidor lo mata. La fila sobrevive, y `failOrphaned` la marca
 * como fallida al arrancar para que nadie se quede mirando "Analizando..." para
 * siempre. Una cola de verdad es trabajo de F8.
 */
export function startAnalysisUseCase(dependencies: StartAnalysisDependencies): StartAnalysis {
  const { projects, jobs, analyze, logger } = dependencies;
  const schedule =
    dependencies.schedule ??
    ((work: () => Promise<void>): void => {
      setImmediate(() => void work());
    });

  return async ({ projectId, actorId }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);

    // Se valida aqui, antes de crear el trabajo, para que un estado incorrecto
    // devuelva 409 de inmediato en vez de un trabajo que falla un segundo mas
    // tarde sin que nadie lo vea.
    assertTransition(project.status, 'analyzing');

    const running = await jobs.findLatest(projectId, 'analysis');
    if (running && (running.status === 'queued' || running.status === 'running')) {
      throw AppError.conflict('Ya hay un analisis en curso para este proyecto.');
    }

    const job = await jobs.create(projectId, 'analysis', 'Analizando archivo...');
    await projects.updateStatus(projectId, 'analyzing', null);

    schedule(async () => {
      try {
        await jobs.markRunning(job.id, 'Analizando archivo...');
        const outcome = await analyze({ projectId, actorId });

        await jobs.markCompleted(
          job.id,
          outcome.origin === 'fallback'
            ? 'Empezamos con una estructura simple que puedes ajustar.'
            : `Encontramos ${outcome.blueprint.entities.length} grupos de informacion.`,
        );
      } catch (error) {
        const reason =
          error instanceof AppError
            ? error.message
            : 'No pudimos analizar el archivo. Intentalo nuevamente.';

        logger.error('El analisis fallo', {
          projectId,
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error),
        });

        await jobs.markFailed(job.id, reason).catch(() => undefined);
        // RNF-05: el archivo sigue ahi, asi que desde `failed` se puede
        // reintentar sin volver a subirlo.
        await projects.updateStatus(projectId, 'failed', reason).catch(() => undefined);
      }
    });

    return job;
  };
}
