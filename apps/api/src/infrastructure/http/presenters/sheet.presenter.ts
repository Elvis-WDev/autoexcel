import type { SheetRecord } from '../../../application/ports/source-file-repository.js';
import type { AnalyzedSheet } from '../../../domain/spreadsheet/sheet-analysis.js';

/**
 * Motivos por los que una hoja no se puede usar, en lenguaje de negocio.
 * RX-03: la interfaz no debe exigir vocabulario tecnico.
 */
const ISSUE_MESSAGES: Record<string, string> = {
  empty: 'Esta hoja no contiene datos.',
  no_headers: 'No pudimos identificar los nombres de las columnas de esta hoja.',
  truncated: 'Esta hoja es muy grande y solo leimos sus primeras filas.',
};

export interface ColumnView {
  id?: string;
  index: number;
  header: string;
  rows: number;
  empty: number;
  distinct: number;
  samples: string[];
  type: string;
}

export interface SheetView {
  id?: string;
  name: string;
  index: number;
  rowCount: number;
  headerRowIndex: number | null;
  included: boolean;
  issue: string | null;
  columns: ColumnView[];
}

/** Perfil guardado como JSON, leido de vuelta con las garantias minimas. */
interface StoredProfile {
  total?: number;
  empty?: number;
  distinct?: number;
  samples?: unknown;
  inferredType?: unknown;
}

export function toSheetViewFromAnalysis(sheet: AnalyzedSheet): SheetView {
  return {
    name: sheet.name,
    index: sheet.index,
    rowCount: sheet.rowCount,
    headerRowIndex: sheet.headerRowIndex,
    included: sheet.included,
    issue: sheet.issue === null ? null : (ISSUE_MESSAGES[sheet.issue] ?? null),
    columns: sheet.columns.map((column) => ({
      index: column.index,
      header: column.header,
      rows: column.profile.total,
      empty: column.profile.empty,
      distinct: column.profile.distinct,
      samples: column.profile.samples,
      type: column.profile.inferredType,
    })),
  };
}

export function toSheetViewFromRecord(sheet: SheetRecord): SheetView {
  return {
    id: sheet.id,
    name: sheet.name,
    index: sheet.index,
    rowCount: sheet.rowCount,
    headerRowIndex: sheet.headerRowIndex,
    included: sheet.included,
    issue: sheet.headerRowIndex === null ? ISSUE_MESSAGES['no_headers']! : null,
    columns: sheet.columns.map((column) => {
      const profile = (column.profile ?? {}) as StoredProfile;

      return {
        id: column.id,
        index: column.index,
        header: column.header,
        rows: typeof profile.total === 'number' ? profile.total : 0,
        empty: typeof profile.empty === 'number' ? profile.empty : 0,
        distinct: typeof profile.distinct === 'number' ? profile.distinct : 0,
        samples: Array.isArray(profile.samples) ? (profile.samples as string[]) : [],
        type: typeof profile.inferredType === 'string' ? profile.inferredType : 'text',
      };
    }),
  };
}
