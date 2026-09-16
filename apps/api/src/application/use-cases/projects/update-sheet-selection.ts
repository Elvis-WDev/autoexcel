import { AppError } from '../../../domain/errors.js';
import { assertTransition } from '../../../domain/project-status.js';
import { analyzeSheet } from '../../../domain/spreadsheet/sheet-analysis.js';
import type { FileStorage } from '../../ports/file-storage.js';
import type { Logger } from '../../ports/logger.js';
import type { ProjectRepository } from '../../ports/project-repository.js';
import type {
  SheetRecord,
  SheetSelectionChange,
  SourceFileRepository,
} from '../../ports/source-file-repository.js';
import type { ReadLimits, SpreadsheetReader } from '../../ports/spreadsheet-reader.js';
import { loadOwnedProject } from './ownership.js';

export interface UpdateSheetSelectionCommand {
  projectId: string;
  actorId: string;
  changes: SheetSelectionChange[];
}

export type UpdateSheetSelection = (command: UpdateSheetSelectionCommand) => Promise<SheetRecord[]>;

export interface UpdateSheetSelectionDependencies {
  projects: ProjectRepository;
  sourceFiles: SourceFileRepository;
  storage: FileStorage;
  reader: SpreadsheetReader;
  limits: ReadLimits;
  logger: Logger;
}

/**
 * Confirma que hojas entran en el modelo (RF-02, redefinido).
 *
 * El ERS pedia elegir UNA hoja. Con la decision 2 del plan el paso cambia de
 * naturaleza: todas vienen marcadas y aqui solo se descartan las que no
 * interesen. Tambien permite corregir la fila de encabezados cuando la
 * deteccion automatica se equivoco, que es el otro remedio de RE-03.
 */
export function updateSheetSelectionUseCase(
  dependencies: UpdateSheetSelectionDependencies,
): UpdateSheetSelection {
  const { projects, sourceFiles, storage, reader, limits, logger } = dependencies;

  return async ({ projectId, actorId, changes }) => {
    const project = await loadOwnedProject(projects, projectId, actorId);
    assertTransition(project.status, 'sheet_selected');

    const existing = await sourceFiles.listSheets(projectId);
    if (existing.length === 0) {
      throw AppError.invalidState('Todavia no has subido un archivo a este proyecto.');
    }

    const known = new Set(existing.map((sheet) => sheet.id));
    for (const change of changes) {
      if (!known.has(change.sheetId)) {
        throw AppError.notFound('Una de las hojas indicadas no pertenece a este proyecto.');
      }
    }

    // Cambiar la fila de encabezados invalida el perfilado de esa hoja: hay que
    // releer el archivo y rehacerlo antes de aplicar la seleccion.
    for (const change of changes) {
      if (change.headerRowIndex === undefined || change.headerRowIndex === null) continue;
      await reanalyze(change.sheetId, change.headerRowIndex);
    }

    await sourceFiles.applySheetSelection(
      projectId,
      changes.map(({ sheetId, included }) => ({ sheetId, included })),
    );

    const updated = await sourceFiles.listSheets(projectId);

    if (!updated.some((sheet) => sheet.included)) {
      throw AppError.validation('Deja al menos una hoja seleccionada para poder continuar.');
    }

    await projects.updateStatus(projectId, 'sheet_selected', null);

    logger.info('Seleccion de hojas confirmada', {
      projectId,
      included: updated.filter((sheet) => sheet.included).length,
      total: updated.length,
    });

    return updated;

    async function reanalyze(sheetId: string, headerRowIndex: number): Promise<void> {
      const locator = await sourceFiles.findSheet(projectId, sheetId);
      if (!locator) {
        throw AppError.notFound('Una de las hojas indicadas no pertenece a este proyecto.');
      }

      const rawSheets = await reader.read(storage.resolve(locator.storagePath), limits);
      const raw = rawSheets.find((sheet) => sheet.index === locator.index);

      if (!raw) {
        throw AppError.internal(
          'No pudimos volver a leer esa hoja del archivo.',
          new Error(`Hoja ${locator.index} ausente en ${locator.storagePath}`),
        );
      }

      if (headerRowIndex < 0 || headerRowIndex >= raw.rows.length) {
        throw AppError.validation('Esa fila no existe en la hoja seleccionada.', {
          headerRowIndex,
          rows: raw.rows.length,
        });
      }

      const analysis = analyzeSheet({
        name: raw.name,
        index: raw.index,
        rows: raw.rows,
        truncated: raw.truncated,
        forcedHeaderRowIndex: headerRowIndex,
      });

      if (analysis.columns.length === 0) {
        throw AppError.validation(
          'Esa fila no sirve como encabezado: no pudimos leer nombres de columna en ella.',
        );
      }

      await sourceFiles.replaceSheetAnalysis(sheetId, analysis);
    }
  };
}
