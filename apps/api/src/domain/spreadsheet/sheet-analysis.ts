import type { CellValue, Row } from './cell.js';
import { width } from './cell.js';
import { profileColumn, type ColumnProfile } from './column-profile.js';
import { detectHeaderRow } from './header-detection.js';
import { normalizeHeader } from './normalization.js';

/**
 * Por que una hoja no puede usarse.
 *
 * El ERS trata estos casos como errores del proceso (RE-02, RE-03) porque asume
 * una sola hoja. Con varias hojas eso seria desproporcionado: un archivo real
 * suele traer una pestana "Resumen" vacia o una leyenda sin encabezados junto a
 * los datos buenos. Aqui el problema se anota en la hoja, se excluye del modelo
 * y el proceso continua. Solo si NINGUNA hoja sirve se detiene la carga.
 */
export type SheetIssue = 'empty' | 'no_headers' | 'truncated';

export interface AnalyzedColumn {
  index: number;
  header: string;
  normalizedHeader: string;
  profile: ColumnProfile;
}

export interface AnalyzedSheet {
  name: string;
  index: number;
  /** Filas de datos, sin contar la de encabezados. */
  rowCount: number;
  headerRowIndex: number | null;
  issue: SheetIssue | null;
  /** Se incluye en el modelo salvo que tenga algun problema. */
  included: boolean;
  columns: AnalyzedColumn[];
}

export interface AnalyzeSheetInput {
  name: string;
  index: number;
  rows: readonly Row[];
  /** `true` si la lectura se corto por el tope de filas. */
  truncated?: boolean;
  /**
   * Fila de encabezados impuesta por la persona usuaria, cuando corrige la
   * deteccion automatica.
   */
  forcedHeaderRowIndex?: number | null;
}

/**
 * Analiza una hoja: localiza encabezados y perfila cada columna.
 *
 * Determinista de principio a fin. Sin IA, sin acceso a red, sin base de datos.
 */
export function analyzeSheet(input: AnalyzeSheetInput): AnalyzedSheet {
  const base = {
    name: input.name,
    index: input.index,
  };

  const hasContent = input.rows.some((row) => width(row) > 0);
  if (!hasContent) {
    return {
      ...base,
      rowCount: 0,
      headerRowIndex: null,
      issue: 'empty',
      included: false,
      columns: [],
    };
  }

  const detected =
    input.forcedHeaderRowIndex === undefined || input.forcedHeaderRowIndex === null
      ? detectHeaderRow(input.rows)
      : forceHeaderRow(input.rows, input.forcedHeaderRowIndex);

  if (!detected) {
    return {
      ...base,
      rowCount: 0,
      headerRowIndex: null,
      issue: 'no_headers',
      included: false,
      columns: [],
    };
  }

  const dataRows = input.rows.slice(detected.rowIndex + 1).filter((row) => width(row) > 0);

  const columns = detected.headers.map((header, columnIndex) => ({
    index: columnIndex,
    header,
    normalizedHeader: normalizeHeader(header),
    profile: profileColumn(columnValues(dataRows, columnIndex), header),
  }));

  return {
    ...base,
    rowCount: dataRows.length,
    headerRowIndex: detected.rowIndex,
    issue: input.truncated === true ? 'truncated' : null,
    // Una hoja truncada sigue siendo utilizable: el aviso es para la persona,
    // no un motivo para descartarla.
    included: true,
    columns,
  };
}

/** Toma la fila indicada como encabezado, aunque la heuristica no la eligiese. */
function forceHeaderRow(
  rows: readonly Row[],
  rowIndex: number,
): { rowIndex: number; headers: string[] } | null {
  const row = rows[rowIndex];
  if (!row || width(row) === 0) return null;

  const detected = detectHeaderRow(rows.slice(rowIndex));
  if (detected && detected.rowIndex === 0) {
    return { rowIndex, headers: detected.headers };
  }

  // La fila elegida no parece un encabezado, pero mandar la persona usuaria:
  // se usan sus celdas tal cual, rellenando huecos por posicion.
  const lastUsed = lastNonBlankIndex(row);
  const headers: string[] = [];
  for (let index = 0; index <= lastUsed; index += 1) {
    const cell = row[index];
    const text = cell === null || cell === undefined ? '' : String(cell).trim();
    headers.push(text.length > 0 ? text : `Columna ${index + 1}`);
  }

  return headers.length > 0 ? { rowIndex, headers } : null;
}

function lastNonBlankIndex(row: Row): number {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const cell = row[index];
    if (cell !== null && cell !== undefined && String(cell).trim().length > 0) return index;
  }
  return -1;
}

function columnValues(rows: readonly Row[], columnIndex: number): CellValue[] {
  return rows.map((row) => row[columnIndex] ?? null);
}
