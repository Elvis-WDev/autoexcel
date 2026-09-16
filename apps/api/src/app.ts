import { toNodeHandler } from 'better-auth/node';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { SessionReader } from './application/ports/session.js';
import type { CreateProject } from './application/use-cases/projects/create-project.js';
import type { DeleteProject } from './application/use-cases/projects/delete-project.js';
import type { GetProject } from './application/use-cases/projects/get-project.js';
import type { AdvanceStep } from './application/use-cases/projects/advance-step.js';
import type { ConfirmBlueprint } from './application/use-cases/projects/confirm-blueprint.js';
import type {
  CreateRecord,
  DeleteRecord,
  GetManifest,
  GetRecord,
  ListOptions,
  ListRecords,
  UpdateRecord,
} from './application/use-cases/app/records.js';
import type { ApplyBlueprintEdit } from './application/use-cases/projects/edit-blueprint.js';
import type { GetBlueprint } from './application/use-cases/projects/get-blueprint.js';
import type { GetJobFailures } from './application/use-cases/projects/get-job-failures.js';
import type { GetJob } from './application/use-cases/projects/get-job.js';
import type { IngestSpreadsheet } from './application/use-cases/projects/ingest-spreadsheet.js';
import type { StartAnalysis } from './application/use-cases/projects/start-analysis.js';
import type { StartBuild } from './application/use-cases/projects/start-build.js';
import type { ListProjects } from './application/use-cases/projects/list-projects.js';
import type { ListSheets } from './application/use-cases/projects/list-sheets.js';
import type { UpdateSheetSelection } from './application/use-cases/projects/update-sheet-selection.js';
import type { Env } from './config/env.js';
import type { Logger } from './infrastructure/logging/logger.js';
import type { DatabasePools } from './infrastructure/database/pool.js';
import { accessLog } from './infrastructure/http/access-log.js';
import { errorHandler, notFoundHandler } from './infrastructure/http/error-handler.js';
import { normalizeClientAddress } from './infrastructure/http/client-address.js';
import { requestContext } from './infrastructure/http/request-context.js';
import { createHealthRouter } from './infrastructure/http/routes/health.routes.js';
import { createAppRouter } from './infrastructure/http/routes/app.routes.js';
import { createBlueprintRouter } from './infrastructure/http/routes/blueprint.routes.js';
import { createProjectRouter } from './infrastructure/http/routes/project.routes.js';
import { APP_VERSION } from './version.js';

export interface AppDependencies {
  env: Env;
  pools: DatabasePools;
  logger: Logger;
  /**
   * Manejador de Better Auth. Se recibe como funcion, no como el objeto `Auth`
   * completo, para que esta capa no dependa de la libreria y los tests puedan
   * sustituirlo por una respuesta fija.
   */
  authHandler: (request: Request) => Promise<Response>;
  sessions: SessionReader;
  useCases: {
    createProject: CreateProject;
    listProjects: ListProjects;
    getProject: GetProject;
    deleteProject: DeleteProject;
    ingestSpreadsheet: IngestSpreadsheet;
    listSheets: ListSheets;
    updateSheetSelection: UpdateSheetSelection;
    startAnalysis: StartAnalysis;
    startBuild: StartBuild;
    getBlueprint: GetBlueprint;
    getJob: GetJob;
    getJobFailures: GetJobFailures;
    applyEdit: ApplyBlueprintEdit;
    confirmBlueprint: ConfirmBlueprint;
    advanceStep: AdvanceStep;
    getManifest: GetManifest;
    listRecords: ListRecords;
    getRecord: GetRecord;
    createRecord: CreateRecord;
    updateRecord: UpdateRecord;
    deleteRecord: DeleteRecord;
    listOptions: ListOptions;
    uploadMiddleware: RequestHandler;
    limits: { analysesPerHour: number; uploadsPerHour: number };
  };
  version?: string;
}

/**
 * Fabrica de la aplicacion Express.
 *
 * Recibe sus dependencias en vez de construirlas: asi los tests montan la app
 * con repositorios y sesiones falsos, sin tocar la base de datos.
 *
 * El orden importa mas de lo que parece:
 *
 *   1. `requestContext` primero, para que todo log y todo error lleven
 *      `requestId`.
 *   2. Better Auth ANTES de `express.json`. Su manejador necesita el cuerpo sin
 *      parsear; si el parser de JSON se adelanta, el login se queda colgado
 *      esperando un stream que ya fue consumido (`AGENTS.md`).
 *   3. `express.json` despues, para el resto de rutas.
 *   4. 404 y manejador de errores al final.
 */
export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.env.NODE_ENV === 'production');

  app.use(requestContext());
  app.use(accessLog(dependencies.logger));
  app.use(helmet());

  /*
   * Antes del manejador de sesion, y solo para el: lo que el cliente diga sobre
   * su propia direccion no puede creerse. Ver `client-address.ts`.
   */
  app.use('/api/auth', normalizeClientAddress(dependencies.env.AUTH_TRUSTED_PROXIES));
  app.all('/api/auth/*splat', toNodeHandler(dependencies.authHandler));

  app.use(express.json({ limit: '1mb' }));

  app.use(
    createHealthRouter({
      pools: dependencies.pools,
      version: dependencies.version ?? APP_VERSION,
    }),
  );

  app.use(
    '/api',
    createProjectRouter({
      sessions: dependencies.sessions,
      ...dependencies.useCases,
    }),
  );

  app.use(
    '/api',
    createBlueprintRouter({
      sessions: dependencies.sessions,
      getBlueprint: dependencies.useCases.getBlueprint,
      applyEdit: dependencies.useCases.applyEdit,
      confirmBlueprint: dependencies.useCases.confirmBlueprint,
      advanceStep: dependencies.useCases.advanceStep,
    }),
  );

  app.use(
    '/api',
    createAppRouter({
      sessions: dependencies.sessions,
      getManifest: dependencies.useCases.getManifest,
      listRecords: dependencies.useCases.listRecords,
      getRecord: dependencies.useCases.getRecord,
      createRecord: dependencies.useCases.createRecord,
      updateRecord: dependencies.useCases.updateRecord,
      deleteRecord: dependencies.useCases.deleteRecord,
      listOptions: dependencies.useCases.listOptions,
    }),
  );

  app.use(notFoundHandler());
  app.use(errorHandler(dependencies.logger));

  return app;
}
