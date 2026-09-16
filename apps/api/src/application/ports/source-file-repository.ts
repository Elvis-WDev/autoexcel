import type { AnalyzedSheet } from '../../domain/spreadsheet/sheet-analysis.js';

export interface SourceFileRecord {
  id: string;
  projectId: string;
  originalName: string;
  storagePath: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}

export interface SheetRecord {
  id: string;
  name: string;
  index: number;
  rowCount: number;
  headerRowIndex: number | null;
  included: boolean;
  columns: ColumnRecord[];
}

export interface ColumnRecord {
  id: string;
  index: number;
  header: string;
  normalizedHeader: string;
  profile: unknown;
}

export interface SaveIngestionInput {
  projectId: string;
  file: {
    originalName: string;
    storagePath: string;
    sizeBytes: number;
    sha256: string;
  };
  sheets: AnalyzedSheet[];
}

export interface SheetSelectionChange {
  sheetId: string;
  included?: boolean;
  headerRowIndex?: number | null;
}

export interface SheetLocator {
  id: string;
  index: number;
  storagePath: string;
}

export interface SourceFileRepository {
  /**
   * Reemplaza el archivo del proyecto y todo su analisis, en una transaccion.
   * Volver a subir deja el proyecto como si fuera la primera vez.
   */
  replaceIngestion(input: SaveIngestionInput): Promise<SourceFileRecord>;
  findByProject(projectId: string): Promise<SourceFileRecord | null>;
  listSheets(projectId: string): Promise<SheetRecord[]>;
  /** Localiza una hoja y el archivo del que salio, dentro de un proyecto. */
  findSheet(projectId: string, sheetId: string): Promise<SheetLocator | null>;
  /** Sustituye el analisis de una hoja tras corregir su fila de encabezados. */
  replaceSheetAnalysis(sheetId: string, analysis: AnalyzedSheet): Promise<void>;
  applySheetSelection(projectId: string, changes: SheetSelectionChange[]): Promise<void>;
}
