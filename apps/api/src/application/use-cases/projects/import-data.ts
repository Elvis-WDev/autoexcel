import { SYSTEM_COLUMNS, type PhysicalPlan } from '../../../domain/blueprint/physical-plan.js';
import { coerceValue } from '../../../domain/import/coercion.js';
import { buildImportPlan, type ImportStep } from '../../../domain/import/import-plan.js';
import { AppError } from '../../../domain/errors.js';
import type { CellValue, Row } from '../../../domain/spreadsheet/cell.js';
import { toText } from '../../../domain/spreadsheet/cell.js';
import { normalizeText, normalizeValue } from '../../../domain/spreadsheet/normalization.js';
import { analyzeSheet } from '../../../domain/spreadsheet/sheet-analysis.js';
import type { DataPlaneImporter, FailedImportRow, ImportRow } from '../../ports/data-plane.js';
import type { FileStorage } from '../../ports/file-storage.js';
import type { Logger } from '../../ports/logger.js';
import type { SourceFileRepository } from '../../ports/source-file-repository.js';
import type { ReadLimits, SpreadsheetReader } from '../../ports/spreadsheet-reader.js';

export interface ImportDataCommand {
  projectId: string;
  plan: PhysicalPlan;
  /** Se llama al terminar cada tabla, para el avance del proceso (RNF-06). */
  onProgress?: (done: number, total: number, message: string) => Promise<void>;
}

export interface ImportedTable {
  label: string;
  records: number;
}

export interface ImportSummary {
  tables: ImportedTable[];
  /** Total de registros creados en toda la aplicacion. */
  records: number;
  /** Filas del Excel que no se pudieron guardar (RE-06). */
  failures: ImportFailure[];
}

export interface ImportFailure {
  entityLabel: string;
  sheetName: string;
  rowNumber: number;
  reason: string;
  raw: unknown[];
}

export type ImportData = (command: ImportDataCommand) => Promise<ImportSummary>;

export interface ImportDataDependencies {
  sourceFiles: SourceFileRepository;
  storage: FileStorage;
  reader: SpreadsheetReader;
  importer: DataPlaneImporter;
  limits: ReadLimits;
  logger: Logger;
  /** Tope de fallos que se guardan con detalle; el resto solo se cuentan. */
  maxStoredFailures?: number;
}

const DEFAULT_MAX_STORED_FAILURES = 500;

/**
 * Importa los datos del Excel a la estructura ya creada (RF-18 a RF-20).
 *
 * Ni una linea de IA: P-04 lo prohibe, y con razon. Mover cincuenta mil filas es
 * un trabajo mecanico donde la unica virtud que importa es hacer siempre lo
 * mismo.
 *
 * El recorrido es en orden topologico, que es lo que hace posible RF-19. Cuando
 * le toca el turno a `Viajes`, la tabla `Clientes` ya esta llena y su indice
 * `valor -> id` construido, asi que cada viaje encuentra a su cliente sin una
 * segunda pasada de correccion.
 *
 * La deduplicacion (RF-20) ocurre dos veces, a proposito: en memoria antes de
 * insertar —para no mandar cincuenta mil filas y crear ochenta registros— y en
 * la base de datos, mediante el indice unico, como red de seguridad.
 */
export function importDataUseCase(dependencies: ImportDataDependencies): ImportData {
  const { sourceFiles, storage, reader, importer, limits, logger } = dependencies;
  const maxStoredFailures = dependencies.maxStoredFailures ?? DEFAULT_MAX_STORED_FAILURES;

  return async ({ projectId, plan, onProgress }) => {
    const file = await sourceFiles.findByProject(projectId);
    if (!file) throw AppError.invalidState('Este proyecto no tiene archivo que importar.');

    const storedSheets = await sourceFiles.listSheets(projectId);
    const rawSheets = await reader.read(storage.resolve(file.storagePath), limits);

    // Filas de datos por hoja, ya sin la de encabezados.
    const dataRows = new Map<number, Row[]>();
    const sheetNames = new Map<number, string>();

    for (const sheet of storedSheets) {
      if (!sheet.included) continue;

      const raw = rawSheets.find((candidate) => candidate.index === sheet.index);
      if (!raw) continue;

      const analysis = analyzeSheet({
        name: raw.name,
        index: raw.index,
        rows: raw.rows,
        forcedHeaderRowIndex: sheet.headerRowIndex,
      });

      const headerRow = analysis.headerRowIndex ?? 0;
      dataRows.set(
        sheet.index,
        raw.rows.slice(headerRow + 1).filter((row) => row.some((cell) => cell !== null)),
      );
      sheetNames.set(sheet.index, raw.name);
    }

    const importPlan = buildImportPlan(plan);
    const tables: ImportedTable[] = [];
    const failures: ImportFailure[] = [];

    /** Indices `valor normalizado -> id` de las tablas ya importadas. */
    const lookups = new Map<string, Map<string, string>>();

    for (const [index, step] of importPlan.steps.entries()) {
      const rows = dataRows.get(step.sheetIndex) ?? [];
      const sheetName = sheetNames.get(step.sheetIndex) ?? `Hoja ${step.sheetIndex + 1}`;

      await onProgress?.(
        index,
        importPlan.steps.length,
        `Importando ${step.table.label.toLowerCase()}...`,
      );

      const outcome = await importStep(plan.schemaName, step, rows, sheetName, lookups);

      tables.push({ label: step.table.label, records: outcome.inserted });
      failures.push(...outcome.failures);

      // El indice de esta tabla puede hacer falta para resolver las relaciones
      // de las siguientes.
      lookups.set(step.table.tableName, await buildLookup(plan.schemaName, step));
    }

    const records = tables.reduce((total, table) => total + table.records, 0);

    logger.info('Importacion terminada', {
      projectId,
      tables: tables.length,
      records,
      failures: failures.length,
    });

    return { tables, records, failures: failures.slice(0, maxStoredFailures) };
  };

  /** Importa una tabla completa. */
  async function importStep(
    schemaName: string,
    step: ImportStep,
    rows: readonly Row[],
    sheetName: string,
    lookups: ReadonlyMap<string, Map<string, string>>,
  ): Promise<{ inserted: number; failures: ImportFailure[] }> {
    const columns = [...step.mapped.map((column) => column.columnName), SYSTEM_COLUMNS.source];
    if (step.dedupeColumn) columns.push(SYSTEM_COLUMNS.dedupeKey);

    const prepared: ImportRow[] = [];
    const failures: ImportFailure[] = [];
    const seenKeys = new Set<string>();

    for (const [offset, row] of rows.entries()) {
      // La fila que ve la persona en Excel: encabezado incluido, base 1.
      const rowNumber = offset + 2;
      const values: unknown[] = [];
      let rejected: string | null = null;

      for (const column of step.mapped) {
        const cell = column.source ? (row[column.source.columnIndex] ?? null) : null;

        if (column.referencesTable) {
          const resolved = resolveRelation(column.referencesTable, cell, lookups);

          if (resolved === null && column.required) {
            rejected = `No encontramos "${toText(cell)}" entre los registros de ${column.fieldName}.`;
            break;
          }

          values.push(resolved);
          continue;
        }

        const coerced = coerceValue(
          cell,
          column.type,
          column.required,
          column.options,
          column.fieldName,
        );

        if (!coerced.ok) {
          rejected = coerced.reason;
          break;
        }

        values.push(coerced.value);
      }

      if (rejected !== null) {
        failures.push({
          entityLabel: step.table.label,
          sheetName,
          rowNumber,
          reason: rejected,
          raw: row.map((cell) => toText(cell)),
        });
        continue;
      }

      // Trazabilidad RNF-02: de que hoja y fila salio cada registro.
      values.push({ sheet: step.sheetIndex, row: rowNumber });

      if (step.dedupeColumn) {
        const source = step.dedupeColumn.source;
        const key = normalizeValue(source ? (row[source.columnIndex] ?? null) : null);

        // Una clave vacia no identifica nada: la fila no puede formar un registro.
        if (key.length === 0) continue;
        // RF-20: la segunda aparicion de "ACME" no crea un registro nuevo.
        if (seenKeys.has(key)) continue;

        seenKeys.add(key);
        values.push(key);
      }

      prepared.push({ rowNumber, values, raw: row.map((cell) => toText(cell)) });
    }

    const result = await importer.insertBatch({
      schemaName,
      tableName: step.table.tableName,
      columns,
      rows: prepared,
      deduplicated: step.dedupeColumn !== null,
    });

    return {
      inserted: result.inserted,
      failures: [...failures, ...result.failed.map((failed) => toFailure(failed, step, sheetName))],
    };
  }

  /** Indice para que las tablas posteriores resuelvan sus relaciones. */
  async function buildLookup(schemaName: string, step: ImportStep): Promise<Map<string, string>> {
    const lookup = new Map<string, string>();

    // La columna mostrada es la que contiene el valor legible: el nombre del
    // cliente que aparece en la hoja de viajes. Es por donde se enlaza.
    const byDisplay = await importer.lookupByColumn(
      schemaName,
      step.table.tableName,
      step.table.displayColumn,
      normalizeText,
    );
    for (const [key, id] of byDisplay) lookup.set(key, id);

    // Si la clave de deduplicacion es otra columna —un RUC, un codigo—, tambien
    // sirve para enlazar: la hoja de origen podria traer el codigo en vez del
    // nombre.
    if (step.dedupeColumn && step.dedupeColumn.columnName !== step.table.displayColumn) {
      const byDedupe = await importer.lookupByColumn(
        schemaName,
        step.table.tableName,
        step.dedupeColumn.columnName,
        normalizeText,
      );
      for (const [key, id] of byDedupe) if (!lookup.has(key)) lookup.set(key, id);
    }

    return lookup;
  }
}

/**
 * Resuelve el valor de una celda contra los registros ya importados.
 *
 * Es el corazon de RF-19: "Cliente A" en la columna de un viaje tiene que
 * convertirse en el identificador del unico registro Cliente A, no en tres
 * clientes identicos.
 */
function resolveRelation(
  targetTable: string,
  cell: CellValue,
  lookups: ReadonlyMap<string, Map<string, string>>,
): string | null {
  const lookup = lookups.get(targetTable);
  if (!lookup) return null;

  const key = normalizeValue(cell);
  if (key.length === 0) return null;

  return lookup.get(key) ?? null;
}

function toFailure(failed: FailedImportRow, step: ImportStep, sheetName: string): ImportFailure {
  return {
    entityLabel: step.table.label,
    sheetName,
    rowNumber: failed.rowNumber,
    reason: failed.reason,
    raw: failed.raw,
  };
}
