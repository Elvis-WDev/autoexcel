import type { Row } from '../../domain/spreadsheet/cell.js';

export interface RawSheet {
  name: string;
  index: number;
  rows: Row[];
  /** `true` si la lectura se corto por alcanzar el tope de filas. */
  truncated: boolean;
}

export interface ReadLimits {
  maxSheets: number;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
}

/**
 * Puerto de lectura de hojas de calculo.
 *
 * Devuelve celdas crudas: interpretar que significan es del dominio, no de la
 * libreria de turno. Cambiar de libreria no debe tocar nada mas que la
 * implementacion de este puerto.
 */
export interface SpreadsheetReader {
  read(filePath: string, limits: ReadLimits): Promise<RawSheet[]>;
}
