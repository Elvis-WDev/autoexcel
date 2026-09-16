import { describe, expect, it } from 'vitest';
import { comoDecimal, comoNumero } from '@/lib/aplicacion/formato';
import { renderizadorDe } from '@/lib/aplicacion/campos';
import type { CampoDelManifiesto } from '@/lib/api/aplicacion';

/**
 * **La misma tabla que `apps/api/tests/numbers.test.ts`.**
 *
 * `comoNumero` es una copia del analizador del dominio de la API, que vive en
 * otro paquete y no se puede importar. Esta tabla duplicada es la garantia de
 * que las dos no se separen: si una implementacion cambia, una de las dos suites
 * falla. Al tocar una, hay que tocar las dos.
 */
const CASOS: [entrada: string, esperado: number | null][] = [
  ['1234.56', 1234.56],
  ['1234', 1234],
  ['0', 0],
  ['-5.5', -5.5],
  ['1.234,56', 1234.56],
  ['-5,5', -5.5],
  ['1.234.567,89', 1234567.89],
  ['1,234.56', 1234.56],
  ['1,234,567.89', 1234567.89],
  ['1 234,56', 1234.56],
  ['  42  ', 42],
  ['1.234.567', 1234567],
  ['1,234,567', 1234567],
  ['', null],
  ['abc', null],
  ['   ', null],
];

function campo(parcial: Partial<CampoDelManifiesto> = {}): CampoDelManifiesto {
  return {
    name: 'valor',
    label: 'Valor',
    type: 'decimal',
    required: true,
    options: null,
    relatedTo: null,
    ...parcial,
  };
}

describe('numeros escritos por personas', () => {
  it.each(CASOS)('%s -> %s', (entrada, esperado) => {
    expect(comoNumero(entrada)).toBe(esperado);
  });

  it('1.234 se lee como 1,234, igual que en la API', () => {
    expect(comoNumero('1.234')).toBe(1.234);
  });
});

describe('lo que la tabla muestra, el formulario lo acepta', () => {
  /**
   * La contradiccion que motivo C1: la tabla mostraba `1.234,56` y ese mismo
   * texto, escrito en el campo, daba "debe ser un numero".
   */
  it('el ida y vuelta entre mostrar y escribir se cierra', () => {
    const mostrado = comoDecimal(1234.56);
    expect(mostrado).toBe('1.234,56');

    const esquema = renderizadorDe('decimal').esquema(campo());
    const resultado = esquema.safeParse(mostrado);

    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data).toBe(1234.56);
  });

  it.each(['1234.56', '1.234,56', '1,234.56', '1 234,56'])('acepta %s', (entrada) => {
    expect(renderizadorDe('decimal').esquema(campo()).safeParse(entrada).success).toBe(true);
  });

  /** Se envia el numero, no el texto: ningun consumidor de la API adivina. */
  it('envia el valor canonico, no lo que se tecleo', () => {
    const resultado = renderizadorDe('decimal').esquema(campo()).safeParse('1.234,56');

    expect(resultado.success && typeof resultado.data).toBe('number');
    expect(resultado.success && resultado.data).toBe(1234.56);
  });

  it('un entero rechaza los decimales, y lo dice por su etiqueta', () => {
    const esquema = renderizadorDe('integer').esquema(campo({ type: 'integer' }));

    expect(esquema.safeParse('1.234.567').success).toBe(true);

    const fallo = esquema.safeParse('350,7');
    expect(fallo.success).toBe(false);
    if (!fallo.success) expect(fallo.error.issues[0]?.message).toContain('Valor');
  });

  it('sigue rechazando lo que no es un numero', () => {
    for (const malo of ['abc', 'por definir']) {
      expect(renderizadorDe('decimal').esquema(campo()).safeParse(malo).success).toBe(false);
    }
  });
});

describe('el formulario se abre diciendo lo mismo que la tabla', () => {
  /**
   * `pg` devuelve `numeric` como texto, asi que un valor guardado llega como
   * `'350.00'`. Sin hidratar, la celda mostraba `350,00` y el control `350.00`:
   * dos verdades para el mismo dato en la misma pantalla.
   */
  it('el valor guardado entra al control ya formateado, y vuelve a salir canonico', () => {
    const renderizador = renderizadorDe('decimal');
    const guardado = '350.00';

    const enLaCelda = comoDecimal(guardado);
    const enElControl = renderizador.hidratar?.(guardado);

    expect(enElControl).toBe(enLaCelda);
    expect(enElControl).toBe('350,00');

    const resultado = renderizador.esquema(campo()).safeParse(enElControl);
    expect(resultado.success && resultado.data).toBe(350);
  });

  it('un entero guardado hace el mismo recorrido', () => {
    const renderizador = renderizadorDe('integer');
    const hidratado = renderizador.hidratar?.('1234567');

    expect(hidratado).toBe('1.234.567');

    const resultado = renderizador.esquema(campo({ type: 'integer' })).safeParse(hidratado);
    expect(resultado.success && resultado.data).toBe(1234567);
  });

  it('un vacio sigue vacio: no se convierte en cero', () => {
    expect(renderizadorDe('decimal').hidratar?.(null)).toBeNull();
    expect(renderizadorDe('integer').hidratar?.(undefined)).toBeNull();
  });
});
