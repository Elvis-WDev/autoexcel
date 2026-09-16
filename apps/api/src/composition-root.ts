import type { BlueprintProposer } from './application/ports/blueprint-proposer.js';
import type { SessionReader } from './application/ports/session.js';
import type { Env } from './config/env.js';
import { createAuth, createSessionReader, type Auth } from './infrastructure/auth/auth.js';
import { createPools, type DatabasePools } from './infrastructure/database/pool.js';
import { createPrismaClient, type PrismaClient } from './infrastructure/database/prisma.js';
import { createProjectRepository } from './infrastructure/database/project.repository.js';
import { createImporter } from './infrastructure/database/importer.js';
import { createRecordRepository } from './infrastructure/database/record.repository.js';
import {
  createMaterializer,
  roleFromConnectionString,
} from './infrastructure/database/materializer.js';
import { createBlueprintRepository } from './infrastructure/database/blueprint.repository.js';
import { createJobRepository } from './infrastructure/database/job.repository.js';
import { createSourceFileRepository } from './infrastructure/database/source-file.repository.js';
import { createClaudeProposer } from './infrastructure/inference/claude-proposer.js';
import { spreadsheetUpload } from './infrastructure/http/upload.js';
import { createExcelJsReader } from './infrastructure/spreadsheet/exceljs-reader.js';
import { detectFileKind } from './infrastructure/storage/file-signature.js';
import { createLocalFileStorage } from './infrastructure/storage/local-file-storage.js';
import type { Logger } from './infrastructure/logging/logger.js';
import type { AppDependencies } from './app.js';
import { createProjectUseCase } from './application/use-cases/projects/create-project.js';
import { deleteProjectUseCase } from './application/use-cases/projects/delete-project.js';
import { getProjectUseCase } from './application/use-cases/projects/get-project.js';
import { ingestSpreadsheetUseCase } from './application/use-cases/projects/ingest-spreadsheet.js';
import { listProjectsUseCase } from './application/use-cases/projects/list-projects.js';
import { listSheetsUseCase } from './application/use-cases/projects/list-sheets.js';
import {
  createRecordUseCase,
  deleteRecordUseCase,
  getManifestUseCase,
  getRecordUseCase,
  listOptionsUseCase,
  listRecordsUseCase,
  updateRecordUseCase,
} from './application/use-cases/app/records.js';
import { advanceStepUseCase } from './application/use-cases/projects/advance-step.js';
import { analyzeProjectUseCase } from './application/use-cases/projects/analyze-project.js';
import { confirmBlueprintUseCase } from './application/use-cases/projects/confirm-blueprint.js';
import { editBlueprintUseCase } from './application/use-cases/projects/edit-blueprint.js';
import { getBlueprintUseCase } from './application/use-cases/projects/get-blueprint.js';
import { getJobFailuresUseCase } from './application/use-cases/projects/get-job-failures.js';
import { getJobUseCase } from './application/use-cases/projects/get-job.js';
import { buildApplicationUseCase } from './application/use-cases/projects/build-application.js';
import { importDataUseCase } from './application/use-cases/projects/import-data.js';
import { startAnalysisUseCase } from './application/use-cases/projects/start-analysis.js';
import { startBuildUseCase } from './application/use-cases/projects/start-build.js';
import { updateSheetSelectionUseCase } from './application/use-cases/projects/update-sheet-selection.js';

export interface Composition {
  dependencies: AppDependencies;
  /** Crea el directorio de almacenamiento antes de aceptar subidas. */
  prepare(): Promise<void>;
  pools: DatabasePools;
  prisma: PrismaClient;
  auth: Auth;
  close(): Promise<void>;
}

/**
 * Sustituciones para levantar el sistema completo con una pieza cambiada.
 *
 * Elegir implementaciones es precisamente el trabajo de este archivo, asi que
 * el parametro va aqui y no en una puerta trasera del resto del codigo. Lo usa
 * `scripts/acceptance-live.ts`, que necesita el sistema real —PostgreSQL, DDL,
 * importacion, CRUD— con dos piezas fijadas: una propuesta conocida, para que
 * la verificacion no dependa de lo que conteste un modelo, y una sesion dada,
 * para no tener que iniciar sesion por HTTP.
 *
 * `main.ts` no pasa nada: en produccion no hay sustituciones.
 */
export interface CompositionOverrides {
  proposer?: BlueprintProposer | null;
  sessions?: SessionReader;
}

/**
 * Unico lugar donde se construyen implementaciones concretas y se conectan con
 * los casos de uso. Fuera de aqui, cada capa solo conoce sus puertos.
 */
export function compose(
  env: Env,
  logger: Logger,
  overrides: CompositionOverrides = {},
): Composition {
  const pools = createPools(env);
  const prisma = createPrismaClient(pools.control);

  const auth = createAuth(prisma, env);
  const sessions = overrides.sessions ?? createSessionReader(auth);

  const projects = createProjectRepository(prisma);
  const sourceFiles = createSourceFileRepository(prisma);
  const blueprints = createBlueprintRepository(prisma);
  const jobs = createJobRepository(prisma);
  // El materializador emite DDL, asi que usa el pool de control. El rol de
  // runtime sale de su propia URL y solo se usa para concederle DML.
  const materializer = createMaterializer(pools.control, {
    runtimeRole: roleFromConnectionString(env.DATABASE_URL_RUNTIME),
    logger,
  });

  const storage = createLocalFileStorage(env.STORAGE_DIR);
  const reader = createExcelJsReader({ maxUncompressedBytes: env.MAX_UNCOMPRESSED_BYTES });
  const limits = {
    maxSheets: env.MAX_SHEETS,
    maxRowsPerSheet: env.MAX_SHEET_ROWS,
    maxColumnsPerSheet: env.MAX_SHEET_COLUMNS,
  };

  // Sin clave configurada no hay motor de inferencia, y el analisis usa el
  // camino determinista de RE-04. Arrancar igualmente es deliberado: el resto
  // del producto funciona sin IA.
  const proposer =
    overrides.proposer !== undefined
      ? overrides.proposer
      : env.ANTHROPIC_API_KEY
        ? createClaudeProposer({ apiKey: env.ANTHROPIC_API_KEY, logger })
        : null;

  // La importacion corre con el mismo rol que creo el schema.
  const importer = createImporter(pools.control, logger);

  // El CRUD de las aplicaciones generadas corre con el rol de RUNTIME: solo DML.
  // Es donde la separacion del ADR 0001 deja de ser teoria.
  const records = createRecordRepository(pools.runtime);
  const appAccess = { projects, blueprints, records };

  const analyze = analyzeProjectUseCase({
    projects,
    sourceFiles,
    blueprints,
    storage,
    reader,
    limits,
    proposer,
    logger,
  });

  return {
    pools,
    prisma,
    auth,
    async prepare(): Promise<void> {
      await storage.ensureReady();

      // Los trabajos corren dentro del proceso: un reinicio los mata sin que
      // nadie actualice su fila. Sin esto, la interfaz mostraria "Analizando
      // archivo..." indefinidamente.
      const orphaned = await jobs.failOrphaned(
        'El proceso se interrumpio al reiniciar el servidor. Puedes volver a intentarlo.',
      );
      if (orphaned > 0) logger.warn('Trabajos huerfanos marcados como fallidos', { orphaned });
    },
    dependencies: {
      env,
      pools,
      logger,
      authHandler: (request) => auth.handler(request),
      sessions,
      useCases: {
        createProject: createProjectUseCase(projects, {
          maxProjectsPerUser: env.MAX_PROJECTS_PER_USER,
        }),
        listProjects: listProjectsUseCase(projects),
        getProject: getProjectUseCase(projects),
        deleteProject: deleteProjectUseCase({
          repository: projects,
          schemas: materializer,
          logger,
        }),
        ingestSpreadsheet: ingestSpreadsheetUseCase({
          projects,
          sourceFiles,
          storage,
          reader,
          limits,
          logger,
          detectKind: detectFileKind,
        }),
        listSheets: listSheetsUseCase(projects, sourceFiles),
        updateSheetSelection: updateSheetSelectionUseCase({
          projects,
          sourceFiles,
          storage,
          reader,
          limits,
          logger,
        }),
        uploadMiddleware: spreadsheetUpload(storage, env.MAX_UPLOAD_BYTES),
        limits: {
          analysesPerHour: env.MAX_ANALYSES_PER_HOUR,
          uploadsPerHour: env.MAX_UPLOADS_PER_HOUR,
        },
        startAnalysis: startAnalysisUseCase({ projects, jobs, analyze, logger }),
        getBlueprint: getBlueprintUseCase(projects, blueprints),
        getJob: getJobUseCase(projects, jobs),
        getJobFailures: getJobFailuresUseCase(projects, jobs),
        startBuild: startBuildUseCase({
          projects,
          blueprints,
          jobs,
          logger,
          build: buildApplicationUseCase({
            projects,
            sourceFiles,
            blueprints,
            materializer,
            logger,
          }),
          importData: importDataUseCase({
            sourceFiles,
            storage,
            reader,
            importer,
            limits,
            logger,
          }),
        }),
        applyEdit: editBlueprintUseCase({ projects, sourceFiles, blueprints, logger }),
        confirmBlueprint: confirmBlueprintUseCase({
          projects,
          sourceFiles,
          blueprints,
          logger,
        }),
        advanceStep: advanceStepUseCase(projects, logger),
        getManifest: getManifestUseCase(appAccess),
        listRecords: listRecordsUseCase(appAccess),
        getRecord: getRecordUseCase(appAccess),
        createRecord: createRecordUseCase(appAccess),
        updateRecord: updateRecordUseCase(appAccess),
        deleteRecord: deleteRecordUseCase(appAccess),
        listOptions: listOptionsUseCase(appAccess),
      },
    },
    async close(): Promise<void> {
      await prisma.$disconnect();
      await pools.close();
    },
  };
}
