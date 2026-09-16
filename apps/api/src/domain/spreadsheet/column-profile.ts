import { isBlank, toText, type CellValue } from './cell.js';
import { normalizeHeader, normalizeValue } from './normalization.js';
import { inferColumnType, type ApparentType } from './type-inference.js';

/** Cuantos ejemplos se guardan por columna (RF-04). */
export const MAX_SAMPLES = 20;

/**
 * Por encima de esta proporcion de valores distintos, la columna identifica
 * filas en vez de agrupar: no puede originar una entidad (RI-01).
 */
export const IDENTIFYING_CARDINALITY = 0.95;

/**
 * Por debajo de esta proporcion, los valores se repiten lo bastante como para
 * sugerir un concepto reutilizado (RI-02).
 */
export const REPEATED_CARDINALITY = 0.5;

export interface ColumnProfile {
  /** Filas de datos consideradas, vacias incluidas. */
  total: number;
  empty: number;
  distinct: number;
  /**
   * `distinct / (total - empty)`. Cerca de 1 la columna identifica cada fila;
   * cerca de 0 repite mucho. Es la senal principal de RI-02 y la usa F3.
   */
  cardinalityRatio: number;
  samples: string[];
  inferredType: ApparentType;
  typeConfidence: number;
  maxLength: number;
  /** Cumple RI-02: se repite lo bastante como para sugerir una entidad. */
  repeatsEnoughForEntity: boolean;
  /** Identifica cada fila: candidata a clave, nunca a entidad derivada. */
  identifying: boolean;
  /**
   * Candidata a clave de deduplicacion (decision 3 del plan): identifica filas y
   * su nombre suena a identificador de negocio.
   */
  identityCandidate: boolean;
}

/** Encabezados que suenan a identificador de negocio, no a descripcion. */
const IDENTITY_HEADERS =
  /(^|_)(ruc|nit|cedula|dni|nif|cif|cuit|rfc|curp|codigo|cod|id|placa|patente|matricula|serie|sku|folio|numero|nro)($|_)/;

/**
 * Perfila una columna (RF-04).
 *
 * Todo lo que sale de aqui es determinista. Es la entrada de la inferencia de
 * F3: al modelo se le manda este perfil, nunca las filas completas, que es lo
 * que hace que un Excel de 50.000 filas cueste lo mismo que uno de 50.
 */
export function profileColumn(values: readonly CellValue[], header: string): ColumnProfile {
  const total = values.length;
  let empty = 0;
  let maxLength = 0;

  const distinctKeys = new Set<string>();
  const samples: string[] = [];
  const sampleKeys = new Set<string>();

  for (const value of values) {
    if (isBlank(value)) {
      empty += 1;
      continue;
    }

    const text = toText(value);
    maxLength = Math.max(maxLength, text.length);

    const key = normalizeValue(value);
    distinctKeys.add(key);

    // Ejemplos distintos entre si: veinte veces "ACME" no ensena nada.
    if (samples.length < MAX_SAMPLES && !sampleKeys.has(key)) {
      sampleKeys.add(key);
      samples.push(text);
    }
  }

  const present = total - empty;
  const distinct = distinctKeys.size;
  const cardinalityRatio = present === 0 ? 0 : distinct / present;
  const guess = inferColumnType(values, header);

  const identifying = present > 0 && cardinalityRatio >= IDENTIFYING_CARDINALITY;

  return {
    total,
    empty,
    distinct,
    cardinalityRatio,
    samples,
    inferredType: guess.type,
    typeConfidence: guess.confidence,
    maxLength,
    // Con dos o tres filas cualquier cosa parece repetida: hace falta volumen
    // para que la senal signifique algo.
    repeatsEnoughForEntity:
      present >= 10 && distinct >= 2 && cardinalityRatio <= REPEATED_CARDINALITY,
    identifying,
    identityCandidate: identifying && IDENTITY_HEADERS.test(normalizeHeader(header)),
  };
}
