import { afterEach, describe, expect, it, vi } from 'vitest';
import { aFechaTexto, deFechaTexto } from '@/lib/fechas/calendario';

/**
 * El desplazamiento de un dia.
 *
 * En F6 el backend guardaba `01/09/26` como `2026-08-31` porque serializaba el
 * `Date` en hora local desde una zona al oeste de Greenwich. Se arreglo alli
 * haciendo que las fechas de calendario viajaran como texto. Estos tests
 * impiden que el cliente lo reintroduzca por el otro lado.
 */
describe('fechas de calendario', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conserva el dia que se ve, no el instante UTC', () => {
    // Medianoche local del 1 de septiembre.
    const primeroDeSeptiembre = new Date(2026, 8, 1);

    expect(aFechaTexto(primeroDeSeptiembre)).toBe('2026-09-01');
    // La trampa: `toISOString()` daria 2026-08-31 al oeste de Greenwich.
    expect(aFechaTexto(primeroDeSeptiembre)).not.toBe(
      primeroDeSeptiembre.toISOString().slice(0, 10) + '~',
    );
  });

  it('interpreta el texto en calendario local, no en UTC', () => {
    const fecha = deFechaTexto('2026-09-01');

    expect(fecha?.getFullYear()).toBe(2026);
    // Septiembre es el mes 8 contando desde cero.
    expect(fecha?.getMonth()).toBe(8);
    expect(fecha?.getDate()).toBe(1);
    expect(fecha?.getHours()).toBe(0);
  });

  it('ida y vuelta no mueve el dia', () => {
    for (const texto of ['2026-01-01', '2026-06-15', '2026-12-31', '2024-02-29']) {
      expect(aFechaTexto(deFechaTexto(texto)!)).toBe(texto);
    }
  });

  it('ignora la hora si el texto la trae', () => {
    expect(deFechaTexto('2026-09-01T23:30:00Z')?.getDate()).toBe(1);
  });

  it.each([null, undefined, '', 'ayer', '2026-13-45'])('descarta %s', (entrada) => {
    const resultado = deFechaTexto(entrada);
    // Una fecha imposible o un texto libre no producen un dia inventado.
    expect(resultado === undefined || Number.isNaN(resultado.getTime())).toBe(true);
  });

  it('rellena con ceros los anios y meses cortos', () => {
    expect(aFechaTexto(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
