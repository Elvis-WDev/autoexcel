import { toText, type CellValue } from './cell.js';

/**
 * Normalizacion de valores.
 *
 * Esta funcion es la decision 3 del plan hecha codigo: define cuando dos celdas
 * de un Excel son "el mismo valor". De ella salen tres cosas distintas:
 *
 *   - el conteo de valores distintos del perfilado (F2);
 *   - el solapamiento entre columnas de hojas distintas (F3);
 *   - la clave de deduplicacion que decide cuantos registros se crean (F6).
 *
 * Cambiarla cambia cuantos clientes aparecen en la aplicacion generada, asi que
 * vive en el dominio y esta cubierta por tests explicitos.
 *
 * `ACME`, `acme`, `  ACME  ` y `Acmé` colapsan al mismo valor.
 */
export function normalizeValue(value: CellValue): string {
  return normalizeText(toText(value));
}

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Normalizacion de encabezados, algo mas agresiva: ademas colapsa separadores a
 * guion bajo, para que `Email Cliente`, `email_cliente` y `EMAIL-CLIENTE` sean
 * comparables al buscar pistas semanticas (RI-03).
 */
export function normalizeHeader(header: string): string {
  return normalizeText(header)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
