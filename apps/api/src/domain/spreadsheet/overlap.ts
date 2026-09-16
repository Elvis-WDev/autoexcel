export interface ColumnValues {
  sheetIndex: number;
  columnIndex: number;
  header: string;
  /** Valores distintos ya normalizados. */
  values: ReadonlySet<string>;
}

export interface ColumnOverlap {
  left: { sheetIndex: number; columnIndex: number; header: string };
  right: { sheetIndex: number; columnIndex: number; header: string };
  shared: number;
  /** Interseccion sobre union. Baja cuando los tamanos son muy distintos. */
  jaccard: number;
  /**
   * Interseccion sobre el conjunto mas pequeno.
   *
   * Esta es la senal que importa: una hoja `Clientes` con 3.000 clientes
   * "contiene" la columna Cliente de la hoja `Viajes` aunque esta solo use 80.
   * El Jaccard seria 0,027 y no diria nada; la contencion es 1.
   */
  containment: number;
}

export interface OverlapLimits {
  /** Columnas con mas valores distintos que esto no se comparan. */
  maxDistinct: number;
  /** Tope de comparaciones, para que el coste no explote con muchas hojas. */
  maxPairs: number;
  /** Contencion minima para que el solapamiento se considere una senal. */
  minContainment: number;
  /** Valores compartidos minimos: con uno o dos podria ser casualidad. */
  minShared: number;
}

export const DEFAULT_OVERLAP_LIMITS: OverlapLimits = {
  maxDistinct: 20_000,
  maxPairs: 20_000,
  minContainment: 0.7,
  minShared: 2,
};

/**
 * Busca columnas de hojas distintas que hablan de lo mismo.
 *
 * Es la pieza que hace posible la decision 2 del plan: leer todas las hojas y
 * construir UN modelo, en vez de tantos modelos inconexos como pestanas. Si la
 * hoja `Clientes` cubre la columna `Cliente` de la hoja `Viajes`, son la misma
 * entidad y hay una relacion entre ellas; sin esta senal, la inferencia crearia
 * dos entidades `Clientes` separadas y el usuario perderia la mitad de su
 * informacion.
 *
 * Todo lo que sale de aqui es determinista y se calcula ANTES de hablar con la
 * IA: al modelo se le entregan estas conclusiones, no los datos para deducirlas.
 */
export function findColumnOverlaps(
  columns: readonly ColumnValues[],
  limits: OverlapLimits = DEFAULT_OVERLAP_LIMITS,
): ColumnOverlap[] {
  // Una columna con valores casi todos distintos y enormes no puede ser el
  // vinculo entre dos hojas, y compararla cuesta mucho.
  const candidates = columns.filter(
    (column) => column.values.size >= 2 && column.values.size <= limits.maxDistinct,
  );

  const overlaps: ColumnOverlap[] = [];
  let pairs = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i]!;
      const right = candidates[j]!;

      // Dos columnas de la misma hoja no dicen nada sobre si dos hojas hablan
      // del mismo concepto.
      if (left.sheetIndex === right.sheetIndex) continue;

      if (pairs >= limits.maxPairs) return sortOverlaps(overlaps);
      pairs += 1;

      const shared = countShared(left.values, right.values);
      if (shared < limits.minShared) continue;

      const containment = shared / Math.min(left.values.size, right.values.size);
      if (containment < limits.minContainment) continue;

      const union = left.values.size + right.values.size - shared;

      overlaps.push({
        left: { sheetIndex: left.sheetIndex, columnIndex: left.columnIndex, header: left.header },
        right: {
          sheetIndex: right.sheetIndex,
          columnIndex: right.columnIndex,
          header: right.header,
        },
        shared,
        jaccard: union === 0 ? 0 : shared / union,
        containment,
      });
    }
  }

  return sortOverlaps(overlaps);
}

function countShared(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  // Recorrer siempre el conjunto menor.
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];

  let shared = 0;
  for (const value of small) {
    if (large.has(value)) shared += 1;
  }
  return shared;
}

/** Orden estable y por fuerza de la senal, para que la salida sea determinista. */
function sortOverlaps(overlaps: ColumnOverlap[]): ColumnOverlap[] {
  return overlaps.sort(
    (a, b) =>
      b.containment - a.containment ||
      b.shared - a.shared ||
      a.left.sheetIndex - b.left.sheetIndex ||
      a.left.columnIndex - b.left.columnIndex ||
      a.right.sheetIndex - b.right.sheetIndex ||
      a.right.columnIndex - b.right.columnIndex,
  );
}
