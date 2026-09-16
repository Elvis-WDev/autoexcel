/**
 * Numeros escritos por personas.
 *
 * `1.234,56` y `1,234.56` son el mismo importe segun de donde sea quien lo
 * escriba, y ninguno de los dos lo entiende `Number()`. Esta funcion es la unica
 * del sistema que decide que numero hay detras de un texto.
 *
 * Vivia dentro del importador, y de ahi salio cuando el formulario la necesito:
 * la tabla mostraba `1.234,56` y ese mismo texto, escrito en el campo, daba
 * "debe ser un numero". El producto se contradecia consigo mismo.
 *
 * **La regla es "gana el ultimo separador"**, y conviene conocer su
 * consecuencia: `1.234` se lee como **1,234** y no como mil doscientos treinta y
 * cuatro. La ambiguedad es del texto, no del codigo; esto la resuelve siempre
 * igual, que es lo unico que se puede prometer.
 */
export function parseHumanNumber(text: string): number | null {
  // Los espacios de cualquier clase sobran: `1 234,56` se escribe asi a menudo.
  const sinEspacios = text.replace(/\s/g, '');
  if (sinEspacios.length === 0) return null;

  const limpio = sinEspacios.replace(/[^\d,.+-]/g, '');
  if (limpio.length === 0) return null;

  const comas = (limpio.match(/,/g) ?? []).length;
  const puntos = (limpio.match(/\./g) ?? []).length;

  /*
   * Repetido y solo: separador de millares, sin ambiguedad.
   *
   * `1.234.567` no puede tener dos comas decimales, asi que los puntos son de
   * millares. Antes esto se rechazaba —`Number('1.234.567')` es `NaN`— y afectaba
   * tambien a la importacion, que comparte esta funcion.
   */
  const soloPuntos = puntos > 1 && comas === 0;
  const soloComas = comas > 1 && puntos === 0;
  if (soloPuntos || soloComas) {
    const valor = Number(limpio.replace(soloPuntos ? /\./g : /,/g, ''));
    return Number.isFinite(valor) ? valor : null;
  }

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');

  let normalizado: string;
  if (ultimaComa > ultimoPunto) {
    // La coma es el separador decimal: los puntos son de millares.
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > ultimaComa) {
    normalizado = limpio.replace(/,/g, '');
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}
