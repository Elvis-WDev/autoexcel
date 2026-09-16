import { isBlank, toText, width, type Row } from './cell.js';
import { normalizeHeader } from './normalization.js';

/** Cuantas filas del principio se examinan buscando el encabezado. */
const SCAN_DEPTH = 25;

/**
 * Ancho minimo de una fila para pasar por encabezado.
 *
 * Lo que separa un titulo de un encabezado es el numero de celdas: un titulo
 * ocupa una, un encabezado ocupa varias. Comparar contra una fraccion de la fila
 * mas ancha no sirve, y por dos motivos opuestos: en una hoja de dos columnas
 * deja pasar el titulo, y en una cuyo encabezado tiene huecos por celdas
 * combinadas rechaza el encabezado bueno. El umbral absoluto acierta en ambos.
 */
function minimumWidth(maxWidth: number): number {
  return maxWidth >= 2 ? 2 : 1;
}

/** Un encabezado no suele ser una frase larga. */
const MAX_HEADER_LENGTH = 80;

export interface HeaderDetection {
  /** Indice de la fila de encabezados dentro de la hoja, empezando en 0. */
  rowIndex: number;
  headers: string[];
}

/**
 * Localiza la fila de encabezados de una hoja (RF-03).
 *
 * El caso facil es la fila 0, pero los Excel reales llevan titulos, logos y
 * filas en blanco encima. La heuristica busca la primera fila que se comporte
 * como un encabezado:
 *
 *   - casi tan ancha como la fila mas ancha de la zona examinada (un titulo
 *     ocupa una celda; un encabezado, todas);
 *   - todas sus celdas con contenido son texto, no numeros ni fechas;
 *   - sin nombres repetidos entre ellas;
 *   - con al menos una fila de datos debajo.
 *
 * Devuelve `null` si nada encaja, lo que el llamante traduce a RE-03.
 */
export function detectHeaderRow(rows: readonly Row[]): HeaderDetection | null {
  if (rows.length === 0) return null;

  const scanned = rows.slice(0, SCAN_DEPTH);
  const maxWidth = Math.max(...scanned.map(width));

  if (maxWidth === 0) return null;

  const threshold = minimumWidth(maxWidth);

  for (let index = 0; index < scanned.length; index += 1) {
    const row = scanned[index];
    if (!row) continue;

    if (width(row) < threshold) continue;
    if (!looksLikeHeaderRow(row)) continue;
    if (!hasDataBelow(rows, index)) continue;

    return { rowIndex: index, headers: buildHeaders(row) };
  }

  return null;
}

function looksLikeHeaderRow(row: Row): boolean {
  const present = row.filter((cell) => !isBlank(cell));
  if (present.length === 0) return false;

  // Un numero o una fecha en la fila significa que ya son datos.
  const allText = present.every(
    (cell) => typeof cell === 'string' && cell.trim().length <= MAX_HEADER_LENGTH,
  );
  if (!allText) return false;

  const normalized = present.map((cell) => normalizeHeader(toText(cell)));
  if (normalized.some((name) => name.length === 0)) return false;

  // Los encabezados repetidos son habituales en archivos reales y los resuelve
  // `buildHeaders` anadiendo un sufijo. Solo se descarta la fila cuando TODAS
  // sus celdas dicen lo mismo, que ya no parece un encabezado sino datos.
  return new Set(normalized).size > 1 || normalized.length === 1;
}

function hasDataBelow(rows: readonly Row[], headerIndex: number): boolean {
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row && width(row) > 0) return true;
  }
  return false;
}

/**
 * Nombres de columna finales.
 *
 * Los huecos en medio del encabezado se rellenan (`Columna 3`) en vez de
 * descartarse: la posicion importa, porque es la que alinea cada encabezado con
 * su columna de datos. Suele pasar con celdas combinadas.
 */
function buildHeaders(row: Row): string[] {
  const lastUsed = lastNonBlankIndex(row);
  const headers: string[] = [];
  const seen = new Map<string, number>();

  for (let index = 0; index <= lastUsed; index += 1) {
    const cell = row[index];
    const base = cell === undefined || isBlank(cell) ? `Columna ${index + 1}` : toText(cell);

    // Dos columnas no pueden llamarse igual: la segunda se desambigua.
    const key = normalizeHeader(base);
    const repetitions = seen.get(key) ?? 0;
    seen.set(key, repetitions + 1);

    headers.push(repetitions === 0 ? base : `${base} (${repetitions + 1})`);
  }

  return headers;
}

function lastNonBlankIndex(row: Row): number {
  for (let index = row.length - 1; index >= 0; index -= 1) {
    const cell = row[index];
    if (cell !== undefined && !isBlank(cell)) return index;
  }
  return -1;
}
