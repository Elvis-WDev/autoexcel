import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { SessionReader } from '../../../application/ports/session.js';
import type { CreateProject } from '../../../application/use-cases/projects/create-project.js';
import type { DeleteProject } from '../../../application/use-cases/projects/delete-project.js';
import type { GetProject } from '../../../application/use-cases/projects/get-project.js';
import type { GetJobFailures } from '../../../application/use-cases/projects/get-job-failures.js';
import type { GetJob } from '../../../application/use-cases/projects/get-job.js';
import type { IngestSpreadsheet } from '../../../application/use-cases/projects/ingest-spreadsheet.js';
import type { StartAnalysis } from '../../../application/use-cases/projects/start-analysis.js';
import type { StartBuild } from '../../../application/use-cases/projects/start-build.js';
import type { ListProjects } from '../../../application/use-cases/projects/list-projects.js';
import type { ListSheets } from '../../../application/use-cases/projects/list-sheets.js';
import type { UpdateSheetSelection } from '../../../application/use-cases/projects/update-sheet-selection.js';
import { getActor, requireAuth } from '../authenticated-request.js';
import { rateLimit } from '../rate-limit.js';
import { success } from '../envelope.js';
import { toJobView } from '../presenters/blueprint.presenter.js';
import { toProjectDetailView, toProjectView } from '../presenters/project.presenter.js';
import { toSheetViewFromAnalysis, toSheetViewFromRecord } from '../presenters/sheet.presenter.js';
import { getUpload } from '../upload.js';

export interface ProjectRouterDependencies {
  sessions: SessionReader;
  createProject: CreateProject;
  listProjects: ListProjects;
  getProject: GetProject;
  deleteProject: DeleteProject;
  ingestSpreadsheet: IngestSpreadsheet;
  listSheets: ListSheets;
  updateSheetSelection: UpdateSheetSelection;
  startAnalysis: StartAnalysis;
  startBuild: StartBuild;
  getJob: GetJob;
  getJobFailures: GetJobFailures;
  /** Middleware que recibe el archivo antes de llegar al manejador. */
  uploadMiddleware: RequestHandler;
  limits: { analysesPerHour: number; uploadsPerHour: number };
}

const createBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre para el proyecto.')
    .max(120, 'El nombre no puede pasar de 120 caracteres.'),
});

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const projectParams = z.object({
  id: z.uuid('Ese identificador de proyecto no es valido.'),
});

const jobParams = projectParams.extend({
  jobId: z.uuid('Ese identificador de proceso no es valido.'),
});

const deleteBody = z.object({
  confirmName: z.string().min(1, 'Escribe el nombre del proyecto para confirmar.'),
});

const sheetSelectionBody = z.object({
  sheets: z
    .array(
      z.object({
        sheetId: z.uuid(),
        included: z.boolean().optional(),
        headerRowIndex: z.number().int().min(0).max(1000).nullable().optional(),
      }),
    )
    .max(200),
});

/**
 * Rutas de proyectos.
 *
 * Todas exigen sesion. La comprobacion de propiedad no vive aqui sino en los
 * casos de uso (`loadOwnedProject`), para que no exista ninguna via de entrada
 * a un proyecto que la salte.
 */
export function createProjectRouter(dependencies: ProjectRouterDependencies): Router {
  const router = Router();

  router.use(requireAuth(dependencies.sessions));

  router.post('/projects', async (request, response) => {
    const { name } = createBody.parse(request.body);
    const project = await dependencies.createProject({ ownerId: getActor(request).id, name });

    response.status(201).json(success(toProjectView(project)));
  });

  router.get('/projects', async (request, response) => {
    const { limit, offset } = listQuery.parse(request.query);
    const { items, total } = await dependencies.listProjects({
      ownerId: getActor(request).id,
      limit,
      offset,
    });

    response.json(success(items.map(toProjectView), { total, limit, offset }));
  });

  router.get('/projects/:id', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const project = await dependencies.getProject({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(success(toProjectDetailView(project)));
  });

  router.delete('/projects/:id', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    // Algunos intermediarios descartan el cuerpo de un DELETE; aceptamos tambien
    // la confirmacion por query para no depender de eso.
    const { confirmName } = deleteBody.parse({
      confirmName:
        (request.body as { confirmName?: unknown } | undefined)?.confirmName ??
        request.query.confirmName,
    });

    await dependencies.deleteProject({
      projectId: id,
      actorId: getActor(request).id,
      confirmName,
    });

    response.status(204).send();
  });

  // RF-01 a RF-04. `uploadMiddleware` corre antes del manejador porque necesita
  // el cuerpo sin parsear.
  router.post(
    '/projects/:id/file',
    // Subir cuesta disco y CPU de parseo: se acota antes de recibir el archivo.
    rateLimit({
      bucket: 'upload',
      max: dependencies.limits.uploadsPerHour,
      windowMs: 60 * 60 * 1000,
      message: 'Has subido demasiados archivos seguidos. Espera un momento e intentalo de nuevo.',
    }),
    dependencies.uploadMiddleware,
    async (request, response) => {
      const { id } = projectParams.parse(request.params);
      const upload = getUpload(request);

      const result = await dependencies.ingestSpreadsheet({
        projectId: id,
        actorId: getActor(request).id,
        originalName: upload.originalName,
        storagePath: upload.storagePath,
      });

      response.status(201).json(
        success(
          {
            fileName: result.file.originalName,
            sheets: result.sheets.map(toSheetViewFromAnalysis),
          },
          { sheets: result.sheets.length },
        ),
      );
    },
  );

  router.get('/projects/:id/sheets', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const { fileName, sheets } = await dependencies.listSheets({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.json(
      success({ fileName, sheets: sheets.map(toSheetViewFromRecord) }, { sheets: sheets.length }),
    );
  });

  // RF-02, redefinido: no se elige una hoja, se descartan las que sobran.
  router.patch('/projects/:id/sheets', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const { sheets } = sheetSelectionBody.parse(request.body);

    const updated = await dependencies.updateSheetSelection({
      projectId: id,
      actorId: getActor(request).id,
      changes: sheets,
    });

    response.json(success(updated.map(toSheetViewFromRecord)));
  });

  // RF-05 a RF-11. Devuelve enseguida: el analisis corre en segundo plano y la
  // interfaz sigue su avance por el identificador del proceso (RNF-06).
  router.post(
    '/projects/:id/analyze',
    // Este es el endpoint que cuesta dinero: cada llamada invoca un modelo.
    rateLimit({
      bucket: 'analyze',
      max: dependencies.limits.analysesPerHour,
      windowMs: 60 * 60 * 1000,
      message:
        'Has analizado demasiados archivos seguidos. Espera un momento e intentalo de nuevo.',
    }),
    async (request, response) => {
      const { id } = projectParams.parse(request.params);
      const job = await dependencies.startAnalysis({
        projectId: id,
        actorId: getActor(request).id,
      });

      response.status(202).json(success(toJobView(job)));
    },
  );

  // RF-13: "Crear aplicacion". A partir de aqui se emite DDL.
  router.post('/projects/:id/build', async (request, response) => {
    const { id } = projectParams.parse(request.params);
    const job = await dependencies.startBuild({
      projectId: id,
      actorId: getActor(request).id,
    });

    response.status(202).json(success(toJobView(job)));
  });

  router.get('/projects/:id/jobs/:jobId', async (request, response) => {
    const { id, jobId } = jobParams.parse(request.params);
    const job = await dependencies.getJob({
      projectId: id,
      actorId: getActor(request).id,
      jobId,
    });

    response.json(success(toJobView(job)));
  });

  // RE-06: el reporte de las filas que quedaron fuera. Con `?format=csv` se
  // descarga, que es lo que pide `docs/architecture/forms-and-workflows.md`
  // para una importacion con exito parcial.
  router.get('/projects/:id/jobs/:jobId/errors', async (request, response) => {
    const { id, jobId } = jobParams.parse(request.params);
    const failures = await dependencies.getJobFailures({
      projectId: id,
      actorId: getActor(request).id,
      jobId,
    });

    if (request.query['format'] === 'csv') {
      response
        .status(200)
        .type('text/csv; charset=utf-8')
        .setHeader('content-disposition', 'attachment; filename="filas-no-importadas.csv"')
        .send(toCsv(failures));
      return;
    }

    response.json(success(failures, { total: failures.length }));
  });

  return router;
}

/** CSV minimo, con las comillas escapadas como manda el formato. */
function toCsv(
  failures: readonly {
    sheetName: string;
    rowNumber: number;
    entityLabel: string;
    reason: string;
  }[],
): string {
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

  return [
    'Hoja,Fila,Modulo,Motivo',
    ...failures.map((failure) =>
      [
        escape(failure.sheetName),
        String(failure.rowNumber),
        escape(failure.entityLabel),
        escape(failure.reason),
      ].join(','),
    ),
  ].join('\n');
}
