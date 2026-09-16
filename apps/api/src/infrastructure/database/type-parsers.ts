import pg from 'pg';

/**
 * Como se leen los tipos de PostgreSQL en JavaScript.
 *
 * Los valores por defecto del driver son correctos para una libreria general y
 * equivocados para este producto, que devuelve estos valores directamente a un
 * formulario. Se corrigen tres, y los tres se detectaron mirando una respuesta
 * real:
 *
 *   DATE      volvia como `Date`, y al serializarlo salia
 *             `2026-09-11T05:00:00.000Z`. Una fecha de negocio no tiene hora ni
 *             zona horaria; es el mismo problema que en la importacion, ahora al
 *             leer. Vuelve como texto `YYYY-MM-DD`, tal cual esta guardada.
 *
 *   BIGINT    volvia como texto, porque no todo `bigint` cabe en un numero de
 *   NUMERIC   JavaScript. Cierto, pero devolver `"500"` a un formulario que
 *             espera un numero obliga a cada consumidor a adivinar. Se convierte
 *             cuando el valor es representable con exactitud, y solo entonces.
 *
 * Se aplica una vez al arrancar, antes de abrir ninguna conexion.
 */

/** Identificadores de tipo de PostgreSQL. */
const OID = {
  int8: 20,
  numeric: 1700,
  date: 1082,
} as const;

/**
 * Convierte a numero solo si no se pierde nada por el camino.
 *
 * Un `bigint` por encima de 2^53 o un `numeric` con mas precision de la que
 * admite un `double` se quedan como texto: es preferible que el consumidor vea
 * una cadena a que vea un numero equivocado.
 */
function toExactNumber(raw: string | null): number | string | null {
  if (raw === null) return null;

  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  if (String(value) !== raw.trim()) return raw;

  return value;
}

export function configureTypeParsers(): void {
  // La fecha, tal cual esta en la base: sin `Date`, sin zona horaria.
  pg.types.setTypeParser(OID.date, (raw: string) => raw);

  pg.types.setTypeParser(OID.int8, toExactNumber as (raw: string) => number | string);
  pg.types.setTypeParser(OID.numeric, toExactNumber as (raw: string) => number | string);
}
