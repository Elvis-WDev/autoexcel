import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import { createApp, type AppDependencies } from '../../src/app.js';
import type { DataPlaneMaterializer } from '../../src/application/ports/data-plane.js';
import type { PhysicalPlan } from '../../src/domain/blueprint/physical-plan.js';
import type { AuthenticatedUser, SessionReader } from '../../src/application/ports/session.js';
import { createProjectUseCase } from '../../src/application/use-cases/projects/create-project.js';
import { deleteProjectUseCase } from '../../src/application/use-cases/projects/delete-project.js';
import { getProjectUseCase } from '../../src/application/use-cases/projects/get-project.js';
import { ingestSpreadsheetUseCase } from '../../src/application/use-cases/projects/ingest-spreadsheet.js';
import { listProjectsUseCase } from '../../src/application/use-cases/projects/list-projects.js';
import { listSheetsUseCase } from '../../src/application/use-cases/projects/list-sheets.js';
import {
  createRecordUseCase,
  deleteRecordUseCase,
  getManifestUseCase,
  getRecordUseCase,
  listOptionsUseCase,
  listRecordsUseCase,
  updateRecordUseCase,
} from '../../src/application/use-cases/app/records.js';
import { advanceStepUseCase } from '../../src/application/use-cases/projects/advance-step.js';
import { analyzeProjectUseCase } from '../../src/application/use-cases/projects/analyze-project.js';
import { buildApplicationUseCase } from '../../src/application/use-cases/projects/build-application.js';
import { importDataUseCase } from '../../src/application/use-cases/projects/import-data.js';
import { startBuildUseCase } from '../../src/application/use-cases/projects/start-build.js';
import { confirmBlueprintUseCase } from '../../src/application/use-cases/projects/confirm-blueprint.js';
import { editBlueprintUseCase } from '../../src/application/use-cases/projects/edit-blueprint.js';
import { getBlueprintUseCase } from '../../src/application/use-cases/projects/get-blueprint.js';
import { getJobFailuresUseCase } from '../../src/application/use-cases/projects/get-job-failures.js';
import { getJobUseCase } from '../../src/application/use-cases/projects/get-job.js';
import { startAnalysisUseCase } from '../../src/application/use-cases/projects/start-analysis.js';
import { updateSheetSelectionUseCase } from '../../src/application/use-cases/projects/update-sheet-selection.js';
import { spreadsheetUpload } from '../../src/infrastructure/http/upload.js';
import { createExcelJsReader } from '../../src/infrastructure/spreadsheet/exceljs-reader.js';
import { detectFileKind } from '../../src/infrastructure/storage/file-signature.js';
import { createLocalFileStorage } from '../../src/infrastructure/storage/local-file-storage.js';
import type { BlueprintProposer } from '../../src/application/ports/blueprint-proposer.js';
import {
  createInMemoryBlueprintRepository,
  type InMemoryBlueprintRepository,
} from './in-memory-blueprint-repository.js';
import { createInMemoryImporter, type InMemoryImporter } from './in-memory-importer.js';
import {
  createInMemoryJobRepository,
  type InMemoryJobRepository,
} from './in-memory-job-repository.js';
import {
  createInMemorySourceFileRepository,
  type InMemorySourceFileRepository,
} from './in-memory-source-file-repository.js';
import { parseEnv, type Env } from '../../src/config/env.js';
import { createSilentLogger } from '../../src/infrastructure/logging/logger.js';
import { createFakePools } from './fake-pools.js';
import {
  createInMemoryRecordRepository,
  type InMemoryRecordRepository,
} from './in-memory-records.js';
import {
  createInMemoryProjectRepository,
  type InMemoryProjectRepository,
} from './in-memory-project-repository.js';

export const TEST_ENV: Env = parseEnv({
  DATABASE_URL: 'postgres://ets_owner:pw@localhost:5432/ets',
  DATABASE_URL_RUNTIME: 'postgres://app_runtime:pw@localhost:5432/ets',
  AUTH_SECRET: 'x'.repeat(32),
  NODE_ENV: 'test',
});

export const ALICE: AuthenticatedUser = {
  id: 'user-alice',
  email: 'alice@example.com',
  name: 'Alice',
};

export const BOB: AuthenticatedUser = {
  id: 'user-bob',
  email: 'bob@example.com',
  name: 'Bob',
};

/** Lector de sesion controlable: devuelve el usuario que se le indique, o nadie. */
export function createFakeSessions(user: AuthenticatedUser | null): SessionReader {
  return { getUser: () => Promise.resolve(user) };
}

export interface RecordingSchemaManager extends DataPlaneMaterializer {
  dropped: string[];
  /** Planes materializados, para afirmar sobre lo que se habria creado. */
  created: PhysicalPlan[];
  failNext?: Error;
  failCreate?: Error;
}

export function createRecordingSchemaManager(): RecordingSchemaManager {
  const manager: RecordingSchemaManager = {
    dropped: [],
    created: [],

    dropSchema(schemaName: string): Promise<void> {
      if (manager.failNext) {
        const error = manager.failNext;
        manager.failNext = undefined;
        return Promise.reject(error);
      }
      manager.dropped.push(schemaName);
      return Promise.resolve();
    },

    createSchema(plan: PhysicalPlan): Promise<void> {
      if (manager.failCreate) {
        const error = manager.failCreate;
        manager.failCreate = undefined;
        return Promise.reject(error);
      }
      manager.created.push(plan);
      return Promise.resolve();
    },
  };
  return manager;
}

export interface TestHarness {
  app: Express;
  projects: InMemoryProjectRepository;
  sourceFiles: InMemorySourceFileRepository;
  blueprints: InMemoryBlueprintRepository;
  jobs: InMemoryJobRepository;
  importer: InMemoryImporter;
  records: InMemoryRecordRepository;
  schemas: RecordingSchemaManager;
  /** Directorio temporal donde aterrizan los archivos subidos. */
  storageDir: string;
  /** Espera a que termine el trabajo en segundo plano que se haya lanzado. */
  settled: () => Promise<void>;
}

export interface TestHarnessOptions {
  user?: AuthenticatedUser | null;
  /** Respuesta del manejador de Better Auth, que aqui no se ejercita de verdad. */
  authHandler?: AppDependencies['authHandler'];
  /** Directorio de almacenamiento. Por defecto, uno temporal propio. */
  storageDir?: string;
  limits?: Partial<{ maxSheets: number; maxRowsPerSheet: number; maxColumnsPerSheet: number }>;
  maxUploadBytes?: number;
  maxUncompressedBytes?: number;
  /** Motor de inferencia. `null` fuerza el camino determinista de RE-04. */
  proposer?: BlueprintProposer | null;
  maxProjectsPerUser?: number;
  analysesPerHour?: number;
  uploadsPerHour?: number;
}

export function createTestHarness(options: TestHarnessOptions = {}): TestHarness {
  const projects = createInMemoryProjectRepository();
  const sourceFiles = createInMemorySourceFileRepository();
  const blueprints = createInMemoryBlueprintRepository();
  const jobs = createInMemoryJobRepository();
  const importer = createInMemoryImporter();
  const records = createInMemoryRecordRepository();
  const schemas = createRecordingSchemaManager();
  const logger = createSilentLogger();

  // Almacenamiento y lector reales: la ingesta se prueba contra xlsx de verdad,
  // porque lo que rompe en produccion son los archivos, no los dobles.
  const storageDir = options.storageDir ?? mkdtempSync(join(tmpdir(), 'ets-storage-'));
  const storage = createLocalFileStorage(storageDir);
  mkdirSync(storage.uploadsDir, { recursive: true });

  const pending: Promise<unknown>[] = [];

  const reader = createExcelJsReader({
    maxUncompressedBytes: options.maxUncompressedBytes ?? 300 * 1024 * 1024,
  });
  const limits = {
    maxSheets: options.limits?.maxSheets ?? 50,
    maxRowsPerSheet: options.limits?.maxRowsPerSheet ?? 200_000,
    maxColumnsPerSheet: options.limits?.maxColumnsPerSheet ?? 256,
  };

  const app = createApp({
    env: TEST_ENV,
    pools: createFakePools(),
    logger,
    authHandler:
      options.authHandler ?? (() => Promise.resolve(new Response(null, { status: 501 }))),
    sessions: createFakeSessions(options.user === undefined ? ALICE : options.user),
    useCases: {
      createProject: createProjectUseCase(projects, {
        maxProjectsPerUser: options.maxProjectsPerUser ?? 1000,
      }),
      listProjects: listProjectsUseCase(projects),
      getProject: getProjectUseCase(projects),
      deleteProject: deleteProjectUseCase({ repository: projects, schemas, logger }),
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
      uploadMiddleware: spreadsheetUpload(storage, options.maxUploadBytes ?? 20 * 1024 * 1024),
      limits: {
        analysesPerHour: options.analysesPerHour ?? 1000,
        uploadsPerHour: options.uploadsPerHour ?? 1000,
      },
      startAnalysis: startAnalysisUseCase({
        projects,
        jobs,
        logger,
        analyze: analyzeProjectUseCase({
          projects,
          sourceFiles,
          blueprints,
          storage,
          reader,
          limits,
          proposer: options.proposer ?? null,
          logger,
        }),
        // El trabajo corre de forma sincrona en los tests: asi se puede afirmar
        // sobre el resultado sin esperas ni temporizadores.
        schedule: (work) => {
          pending.push(work());
        },
      }),
      getBlueprint: getBlueprintUseCase(projects, blueprints),
      getJob: getJobUseCase(projects, jobs),
      getJobFailures: getJobFailuresUseCase(projects, jobs),
      applyEdit: editBlueprintUseCase({ projects, sourceFiles, blueprints, logger }),
      confirmBlueprint: confirmBlueprintUseCase({ projects, sourceFiles, blueprints, logger }),
      advanceStep: advanceStepUseCase(projects, logger),
      getManifest: getManifestUseCase({ projects, blueprints }),
      listRecords: listRecordsUseCase({ projects, blueprints, records }),
      getRecord: getRecordUseCase({ projects, blueprints, records }),
      createRecord: createRecordUseCase({ projects, blueprints, records }),
      updateRecord: updateRecordUseCase({ projects, blueprints, records }),
      deleteRecord: deleteRecordUseCase({ projects, blueprints, records }),
      listOptions: listOptionsUseCase({ projects, blueprints, records }),
      startBuild: startBuildUseCase({
        projects,
        blueprints,
        jobs,
        logger,
        build: buildApplicationUseCase({
          projects,
          sourceFiles,
          blueprints,
          materializer: schemas,
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
        schedule: (work) => {
          pending.push(work());
        },
      }),
    },
    version: '0.1.0',
  });

  return {
    app,
    projects,
    sourceFiles,
    blueprints,
    jobs,
    importer,
    records,
    schemas,
    storageDir,
    settled: () => Promise.allSettled(pending).then(() => undefined),
  };
}
