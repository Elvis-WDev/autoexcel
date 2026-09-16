/** Lo que puede contener una celda una vez leida del archivo. */
export type CellValue = string | number | boolean | Date | null;

export type Row = readonly CellValue[];

/** `true` si la celda no aporta valor: vacia, nula o solo espacios. */
export function isBlank(value: CellValue): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

/**
 * Representacion textual estable de una celda.
 *
 * Las fechas se emiten en ISO para que el mismo instante produzca siempre el
 * mismo texto: de ese texto salen el conteo de valores distintos y, en F6, la
 * clave de deduplicacion.
 */
export function toText(value: CellValue): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return value.trim();
}

/** Numero de celdas con contenido en una fila. */
export function width(row: Row): number {
  return row.reduce<number>((count, cell) => (isBlank(cell) ? count : count + 1), 0);
}
