import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { deFechaTexto } from '@/lib/fechas/calendario';

/**
 * Texto mostrable de un valor cualquiera.
 *
 * `String(valor)` sobre un objeto imprime `[object Object]` en la pantalla de
 * alguien. El backend ya se topo con esto y lo resolvio igual, con su
 * `toLabelText`: lo que no tiene representacion util se descarta en vez de
 * ensuciarse.
 */
export function comoTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return null;
}

/**
 * El numero que hay detras de lo que alguien escribe.
 *
 * Es la inversa de `comoDecimal`, y por eso vive aqui: la tabla muestra
 * `1.234,56` y quien edita escribe eso mismo. Sin esto, el formulario rechazaba
 * el valor que la propia aplicacion acababa de enseñar.
 *
 * **Es una copia de `domain/numbers.ts` de la API**, que vive en otro paquete y
 * no se puede importar. La garantia de que no se separen es que las dos suites
 * comparten la misma tabla de casos: si una implementacion cambia, la otra
 * falla. Un paquete compartido para veinte lineas costaria mas de lo que ahorra.
 *
 * La regla es "gana el ultimo separador", con una excepcion: un separador
 * repetido y solo es de millares, porque `1.234.567` no puede tener dos comas
 * decimales. Consecuencia conocida: `1.234` se lee como **1,234**.
 */
export function comoNumero(texto: string): number | null {
  const sinEspacios = texto.replace(/\s/g, '');
  if (sinEspacios.length === 0) return null;

  const limpio = sinEspacios.replace(/[^\d,.+-]/g, '');
  if (limpio.length === 0) return null;

  const comas = (limpio.match(/,/g) ?? []).length;
  const puntos = (limpio.match(/\./g) ?? []).length;

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
    normalizado = limpio.replace(/\./g, '').replace(',', '.');
  } else if (ultimoPunto > ultimaComa) {
    normalizado = limpio.replace(/,/g, '');
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

const ENTEROS = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });
const DECIMALES = new Intl.NumberFormat('es-EC', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function comoEntero(valor: unknown): string {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? ENTEROS.format(numero) : String(valor);
}

export function comoDecimal(valor: unknown): string {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? DECIMALES.format(numero) : String(valor);
}

/**
 * Una fecha de calendario, sin tocar la zona horaria.
 *
 * El backend la devuelve como texto `YYYY-MM-DD` precisamente para que nadie la
 * meta en un `Date` y la desplace un dia. Aqui se respeta ese trato: la lectura
 * pasa por `deFechaTexto`, que construye en calendario local.
 */
export function comoFecha(valor: unknown): string {
  if (typeof valor !== 'string') return '—';
  const fecha = deFechaTexto(valor);
  return fecha ? format(fecha, 'd MMM yyyy', { locale: es }) : valor;
}

/** Un instante si es un instante: aqui la zona horaria si importa. */
export function comoFechaHora(valor: unknown): string {
  if (typeof valor !== 'string') return '—';
  const momento = new Date(valor);
  return Number.isNaN(momento.getTime())
    ? valor
    : format(momento, 'd MMM yyyy, HH:mm', { locale: es });
}
