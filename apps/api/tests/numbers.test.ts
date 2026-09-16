import { describe, expect, it } from 'vitest';
import { parseHumanNumber } from '../src/domain/numbers.js';

/**
 * La tabla de casos compartida.
 *
 * El panel tiene su propia copia de esta funcion —vive en otro paquete y no
 * puede importar el dominio de la API— y **la misma tabla** en su suite. Si las
 * dos implementaciones se separan, una de las dos suites falla. Es la unica
 * garantia posible sin montar un paquete compartido para veinte lineas.
 */
export const CASOS: [entrada: string, esperado: number | null][] = [
  // Notacion canonica.
  ['1234.56', 1234.56],
  ['1234', 1234],
  ['0', 0],
  ['-5.5', -5.5],

  // Notacion española: la coma decide.
  ['1.234,56', 1234.56],
  ['-5,5', -5.5],
  ['1.234.567,89', 1234567.89],

  // Notacion inglesa: el punto decide.
  ['1,234.56', 1234.56],
  ['1,234,567.89', 1234567.89],

  // Espacios, que se escriben mas de lo que parece.
  ['1 234,56', 1234.56],
  ['  42  ', 42],

  // Repetido y solo: separador de millares, sin ambiguedad posible.
  ['1.234.567', 1234567],
  ['1,234,567', 1234567],

  // Nada que interpretar.
  ['', null],
  ['abc', null],
  ['   ', null],
];

describe('numeros escritos por personas', () => {
  it.each(CASOS)('%s -> %s', (entrada, esperado) => {
    expect(parseHumanNumber(entrada)).toBe(esperado);
  });

  /**
   * El caso ambiguo, fijado a proposito.
   *
   * `1.234` puede ser mil doscientos treinta y cuatro o uno con tres decimales.
   * La ambiguedad es del texto, no del codigo. Se resuelve siempre igual —gana
   * el ultimo separador— y este test existe para que nadie la cambie sin
   * enterarse de que la esta cambiando.
   */
  it('1.234 se lee como 1,234 y no como mil doscientos treinta y cuatro', () => {
    expect(parseHumanNumber('1.234')).toBe(1.234);
    expect(parseHumanNumber('1,234')).toBe(1.234);
  });

  /**
   * Un entero español con dos separadores de millares se rechazaba, tanto en el
   * formulario como al importar. Lo encontro el test del esquema de registros.
   */
  it('dos puntos y ninguna coma son millares, no un decimal imposible', () => {
    expect(parseHumanNumber('1.234.567')).toBe(1234567);
    expect(parseHumanNumber('12.345.678,90')).toBe(12345678.9);
  });

  it('el simbolo de moneda no estorba', () => {
    expect(parseHumanNumber('$ 1.234,56')).toBe(1234.56);
    expect(parseHumanNumber('1.234,56 USD')).toBe(1234.56);
  });
});
