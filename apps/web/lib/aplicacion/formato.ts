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
