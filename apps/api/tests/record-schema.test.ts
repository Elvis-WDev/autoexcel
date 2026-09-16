import { describe, expect, it } from 'vitest';
import { buildRecordSchema } from '../src/domain/runtime/record-schema.js';
import type { RuntimeEntity, RuntimeField } from '../src/domain/runtime/application.js';

function entidadCon(campo: Partial<RuntimeField>): RuntimeEntity {
  return {
    name: 'viajes',
    label: 'Viajes',
    tableName: 'viajes',
    displayField: 'valor',
    fields: [
      {
        name: 'valor',
        label: 'Valor',
        type: 'decimal',
        required: true,
        options: null,
        columnName: 'valor',
        relatedEntity: null,
        ...campo,
      },
    ],
  };
}

function validar(campo: Partial<RuntimeField>, valor: unknown): unknown {
  const resultado = buildRecordSchema(entidadCon(campo)).safeParse({ valor });
  return resultado.success ? (resultado.data as { valor: unknown }).valor : null;
}

describe('numeros en el formulario de un registro', () => {
  /**
   * El caso que motiva C1: la tabla muestra `1.234,56` y ese mismo texto, antes,
   * daba "debe ser un numero".
   */
  it.each([
    ['1234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['-5,5', -5.5],
    ['1234', 1234],
  ])('acepta %s y guarda %s', (entrada, esperado) => {
    expect(validar({ type: 'decimal' }, entrada)).toBe(esperado);
  });

  /** Un cliente que no sea el panel enviara el numero ya canonico. */
  it('acepta tambien un numero, no solo texto', () => {
    expect(validar({ type: 'decimal' }, 1234.56)).toBe(1234.56);
  });

  it.each(['abc', '', '   '])('rechaza %s', (entrada) => {
    expect(validar({ type: 'decimal' }, entrada)).toBeNull();
  });

  it('el mensaje nombra el campo por su etiqueta', () => {
    const resultado = buildRecordSchema(entidadCon({ type: 'decimal' })).safeParse({
      valor: 'abc',
    });

    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toContain('Valor');
      expect(resultado.error.issues[0]?.message).not.toContain('valor"');
    }
  });
});

describe('enteros en el formulario', () => {
  it('acepta notacion española', () => {
    expect(validar({ type: 'integer' }, '1.234')).toBe(null); // 1,234 no es entero
    expect(validar({ type: 'integer' }, '1.234.567')).toBe(1234567);
  });

  /**
   * Rechaza el decimal en vez de redondearlo, al reves que la importacion. Un
   * `350.0` guardado por Excel es un detalle de Excel; un `350,7` escrito en un
   * formulario es lo que alguien quiso poner.
   */
  it('rechaza un decimal en vez de redondearlo', () => {
    expect(validar({ type: 'integer' }, '350,7')).toBeNull();
    expect(validar({ type: 'integer' }, '350.0')).toBe(350);
  });
});
