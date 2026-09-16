import type { ColumnProfile } from '../spreadsheet/column-profile.js';
import type { ColumnOverlap } from '../spreadsheet/overlap.js';

export interface AnalyzedColumnSignal {
  index: number;
  header: string;
  normalizedHeader: string;
  profile: ColumnProfile;
}

export interface AnalyzedSheetSignal {
  index: number;
  name: string;
  rowCount: number;
  columns: AnalyzedColumnSignal[];
}

/**
 * Todo lo que el motor de inferencia recibe para trabajar.
 *
 * Lo que NO contiene es igual de importante: aqui no hay filas. Al modelo se le
 * entregan encabezados, estadisticas, hasta veinte ejemplos por columna y los
 * solapamientos ya calculados. Un Excel de 50.000 filas produce exactamente el
 * mismo tamano de entrada que uno de 50, y ningun dato de negocio masivo sale
 * del servidor.
 */
export interface AnalysisInput {
  /** Nombre del archivo, unica pista sobre de que va el negocio. */
  fileName: string;
  sheets: AnalyzedSheetSignal[];
  /** Columnas de hojas distintas que parecen hablar de lo mismo. */
  overlaps: ColumnOverlap[];
}
