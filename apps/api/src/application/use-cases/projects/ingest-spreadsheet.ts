import { AppError } from '../../../domain/errors.js';
import { assertTransition } from '../../../domain/project-status.js';
import { analyzeSheet, type AnalyzedSheet } from '../../../domain/spreadsheet/sheet-analysis.js';
import type { FileStorage, StoredFile } from '../../ports/file-storage.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import type { ReadLimits, SpreadsheetReader } from '../../ports/spreadsheet-reader.js';
import { loadOwnedProject } from './ownership.js';

export interface IngestSpreadsheetCommand {
  projectId: string;
  actorId: string;
  originalName: string;
  /** Ruta relativa donde ya quedo escrito el archivo. */
  storagePath: string;
}

export interface IngestionResult {
  sheets: AnalyzedSheet[];
  file: StoredFile & { originalName: string };
}

export type IngestSpreadsheet = (command: IngestSpreadsheetCommand) => Promise<IngestionResult>;

export interface IngestSpreadsheetDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  storage: FileStorage & { describe(path: string): Promise<StoredFile> };
  reader: SpreadsheetReader;
  limits: ReadLimits;
  logger: Logger;
  /** Comprueba el contenido real del archivo, no su extension. */
  detectKind: (absolutePath: string) => Promise<'ooxml' | 'legacy-xls' | 'unknown'>;
}

/**
 * Sube un Excel, lo lee entero y lo perfila (RF-01 a RF-04).
 *
 * Se leen TODAS las hojas, no una. Es la decision 2 del plan y deroga la
 * restriccion 1 del ERS 16: quien automatiza su Excel real suele tener los datos
 * repartidos en varias pestanas, y obligarle a elegir una sola le haria perder
 * la mitad de su informacion.
 *
 * Ni una linea de IA en todo el recorrido. Lo que sale de aqui es el perfilado
 * determinista que F3 usara como entrada.
 */
export function ingestSpreadsheetUseCase(
  dependencies: IngestSpreadsheetDependencies,
): IngestSpreadsheet {
  const { projects, sourceFiles, storage, reader, limits, logger, detectKind } = dependencies;

  return async ({ projectId, actorId, originalName, storagePath }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);

    // Volver a subir es legitimo mientras no se haya creado nada. Despues no:
    // la estructura ya existe y los datos ya se importaron. Quien decide es la
    // maquina de estados, no una lista repetida aqui.
    try {
      assertTransition(project.status, 'uploaded');
    } catch (error) {
      await storage.remove(storagePath);
      throw error;
    }

    // A partir del momento en que la fila apunta al archivo, borrarlo dejaria un
    // registro apuntando a la nada. El limpiado solo cubre los fallos anteriores.
    let persisted = false;

    try {
      const absolute = storage.resolve(storagePath);
      const kind = await detectKind(absolute);

      if (kind === 'legacy-xls') {
        // RE-01, con el motivo concreto: es accionable.
        throw new AppError(
          'UNSUPPORTED_FILE',
          'Este es un archivo Excel en formato antiguo (.xls). Abrelo en Excel y guardalo como .xlsx para continuar.',
        );
      }

      if (kind !== 'ooxml') {
        throw new AppError(
          'UNSUPPORTED_FILE',
          'No pudimos leer este archivo. Comprueba que sea un archivo Excel valido e intentalo nuevamente.',
        );
      }

      const rawSheets = await reader.read(absolute, limits);

      if (rawSheets.length === 0) {
        // RE-02 a nivel de archivo.
        throw AppError.validation('Este archivo no contiene ninguna hoja.');
      }

      const sheets = rawSheets.map((raw) =>
        analyzeSheet({
          name: raw.name,
          index: raw.index,
          rows: raw.rows,
          truncated: raw.truncated,
        }),
      );

      // Con varias hojas, que una este vacia o sin encabezados no detiene nada:
      // se excluye y el proceso sigue. Solo si ninguna sirve hay que parar.
      if (!sheets.some((sheet) => sheet.included)) {
        throw AppError.validation(describeWhyNothingUsable(sheets));
      }

      const described = await storage.describe(storagePath);
      const previous = await sourceFiles.findByProject(projectId);

      await sourceFiles.replaceIngestion({
        projectId,
        file: { originalName, ...described },
        sheets,
      });
      persisted = true;

      // El archivo anterior deja de tener duenno: se borra despues de que la
      // transaccion haya ido bien, nunca antes.
      if (previous && previous.storagePath !== storagePath) {
        await storage.remove(previous.storagePath).catch((error: unknown) => {
          logger.warn('No se pudo borrar el archivo anterior', {
            projectId,
            storagePath: previous.storagePath,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      }

      await projects.updateStatus(projectId, 'uploaded', null);

      logger.info('Archivo analizado', {
        projectId,
        sheets: sheets.length,
        usable: sheets.filter((sheet) => sheet.included).length,
        rows: sheets.reduce((total, sheet) => total + sheet.rowCount, 0),
      });

      return { sheets, file: { originalName, ...described } };
    } catch (error) {
      // Nada de archivos huerfanos cuando la ingesta falla antes de persistir.
      if (!persisted) await storage.remove(storagePath).catch(() => undefined);
      throw error;
    }
  };
}

/** RE-02 y RE-03, en lenguaje de negocio y con el motivo dominante. */
function describeWhyNothingUsable(sheets: readonly AnalyzedSheet[]): string {
  const allEmpty = sheets.every((sheet) => sheet.issue === 'empty');

  if (allEmpty) {
    return sheets.length === 1
      ? 'La hoja de este archivo no contiene datos suficientes para crear una aplicacion.'
      : 'Ninguna hoja de este archivo contiene datos suficientes para crear una aplicacion.';
  }

  return 'No pudimos identificar correctamente los nombres de las columnas en ninguna hoja de este archivo.';
}
