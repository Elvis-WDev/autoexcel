import { AppError } from '../../../domain/errors.js';
import { assertTransition } from '../../../domain/project-status.js';
import type { BlueprintRepository } from '../../ports/blueprint-repository.js';
import type { JobRecord, JobRepository } from '../../ports/job-repository.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { BuildApplication } from './build-application.js';
import type { ImportData } from './import-data.js';
import { loadOwnedProject } from './ownership.js';

export interface StartBuildCommand {
  projectId: string;
  actorId: string;
}

export type StartBuild = (command: StartBuildCommand) => Promise<JobRecord>;

export interface StartBuildDependencies {
  projects: ProjectRepository;
  blueprints: BlueprintRepository;
  jobs: JobRepository;
  build: BuildApplication;
  importData: ImportData;
  logger: Logger;
  schedule?: (work: () => Promise<void>) => void;
}

/**
 * "Crear aplicacion": el boton del ERS 12 (RNF-06).
 *
 * Igual que el analisis, devuelve enseguida y deja el trabajo corriendo, porque
 * crear e importar puede tardar y la interfaz tiene que poder mostrar "Creando
 * modulos..." sin una peticion HTTP colgada.
 *
 * Las comprobaciones que pueden fallar rapido —estado, blueprint confirmado— se
 * hacen ANTES de crear el trabajo, para que un error del usuario devuelva 409 al
 * instante en vez de un proceso que falla un segundo despues.
 */
export function startBuildUseCase(dependencies: StartBuildDependencies): StartBuild {
  const { projects, blueprints, jobs, build, importData, logger } = dependencies;
  const schedule =
    dependencies.schedule ??
    ((work: () => Promise<void>): void => {
      setImmediate(() => void work());
    });

  return async ({ projectId, actorId }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);
    assertTransition(project.status, 'creating');

    const stored = await blueprints.findByProject(projectId);
    if (!stored) throw AppError.invalidState('Todavia no hemos analizado este archivo.');

    if (stored.status !== 'confirmed') {
      throw AppError.invalidState('Confirma la estructura antes de crear la aplicacion.');
    }

    const running = await jobs.findLatest(projectId, 'build');
    if (running && (running.status === 'queued' || running.status === 'running')) {
      throw AppError.conflict('Ya estamos creando esta aplicacion.');
    }

    const job = await jobs.create(projectId, 'build', 'Creando modulos...');
    await projects.updateStatus(projectId, 'creating', null);

    schedule(async () => {
      try {
        await jobs.markRunning(job.id, 'Creando modulos...');
        const { plan } = await build({ projectId, actorId });

        // RF-18: la importacion es parte del mismo proceso. Para la persona
        // usuaria, "Crear aplicacion" es un solo boton.
        await projects.updateStatus(projectId, 'importing', null);
        await jobs.updateProgress(job.id, 20, 'Importando registros...');

        const summary = await importData({
          projectId,
          plan,
          onProgress: async (done, total, message) => {
            // El 20% inicial ya se consumio creando la estructura.
            await jobs.updateProgress(job.id, 20 + (done / Math.max(total, 1)) * 75, message);
          },
        });

        const relations = plan.tables.reduce(
          (total, table) =>
            total + table.columns.filter((column) => column.referencesTable !== null).length,
          0,
        );

        const result = {
          modules: plan.tables.length,
          records: summary.records,
          relations,
          failedRows: summary.failures.length,
        };

        await jobs.recordFailures(job.id, summary.failures);
        await projects.updateStatus(projectId, 'completed', null);

        // Decision 4 del plan: se continua y se reporta. Un archivo con una
        // celda mala produce una aplicacion utilizable, no un error.
        if (summary.failures.length > 0) {
          await jobs.markPartial(
            job.id,
            `Tu aplicacion esta lista. Importamos ${summary.records} registros y ${summary.failures.length} fila(s) quedaron fuera.`,
            result,
          );
        } else {
          // RF-21, tal cual: "Se crearon 4 modulos, 842 registros, 3 relaciones".
          await jobs.markCompleted(
            job.id,
            `Tu aplicacion esta lista. Se crearon ${result.modules} modulos, ${result.records} registros y ${result.relations} relaciones.`,
            result,
          );
        }
      } catch (error) {
        const reason =
          error instanceof AppError
            ? error.message
            : 'No pudimos crear tu aplicacion. Intentalo nuevamente.';

        logger.error('La creacion fallo', {
          projectId,
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error),
        });

        await jobs.markFailed(job.id, reason).catch(() => undefined);
        // RE-05: la aplicacion no debe mostrarse como completada.
        await projects.updateStatus(projectId, 'failed', reason).catch(() => undefined);
      }
    });

    return job;
  };
}
