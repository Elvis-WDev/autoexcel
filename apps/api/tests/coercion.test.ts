import { describe, expect, it } from 'vitest';
import { coerceValue } from '../src/domain/import/coercion.js';

/**
 * Conversion de celda a valor.
 *
 * Aqui se decide que filas entran y cuales se reportan, asi que cada caso de
 * este archivo es una fila de un Excel real que entra o que la persona usuaria
 * va a tener que arreglar.
 */

function ok(
  raw: Parameters<typeof coerceValue>[0],
  type: Parameters<typeof coerceValue>[1],
  options: string[] | null = null,
): unknown {
  const result = coerceValue(raw, type, false, options, 'Campo');
  if (!result.ok) throw new Error(`esperaba exito, y fallo: ${result.reason}`);
  return result.value;
}

function fails(
  raw: Parameters<typeof coerceValue>[0],
  type: Parameters<typeof coerceValue>[1],
  options: string[] | null = null,
): string {
  const result = coerceValue(raw, type, false, options, 'Campo');
  if (result.ok) throw new Error(`esperaba fallo, y devolvio ${String(result.value)}`);
  return result.reason;
}

describe('celdas vacias', () => {
  it('dan null cuando el campo es opcional', () => {
    for (const raw of [null, '', '   ']) {
      expect(coerceValue(raw, 'text', false, null, 'Campo')).toEqual({ ok: true, value: null });
    }
  });

  it('se rechazan cuando el campo es obligatorio', () => {
    const result = coerceValue(null, 'text', true, null, 'Fecha');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('Falta "Fecha"');
  });
});

describe('numeros', () => {
  it('acepta enteros como numero y como texto', () => {
    expect(ok(350, 'integer')).toBe(350);
    expect(ok('350', 'integer')).toBe(350);
    expect(ok(' 350 ', 'integer')).toBe(350);
    expect(ok('-12', 'integer')).toBe(-12);
  });

  // Excel guarda enteros como flotantes con frecuencia; rechazarlos seria
  // castigar a la persona por algo que no hizo.
  it('redondea un decimal en una columna entera', () => {
    expect(ok(350.0, 'integer')).toBe(350);
    expect(ok(350.4, 'integer')).toBe(350);
  });

  it('entiende la coma decimal y el punto de millares', () => {
    expect(ok('1.234,56', 'decimal')).toBeCloseTo(1234.56);
    expect(ok('1,234.56', 'decimal')).toBeCloseTo(1234.56);
    expect(ok('1234,5', 'decimal')).toBeCloseTo(1234.5);
    expect(ok('$ 1.500,00', 'decimal')).toBeCloseTo(1500);
  });

  it('rechaza lo que no es un numero, y lo dice', () => {
    expect(fails('pendiente', 'integer')).toContain('deberia ser un numero entero');
    expect(fails('pendiente', 'decimal')).toContain('deberia ser un numero');
  });
});

describe('booleanos', () => {
  it('entiende las formas habituales en espanol y en ingles', () => {
    for (const raw of ['si', 'Sí', 'TRUE', 'x', '1', 'verdadero']) {
      expect(ok(raw, 'boolean'), String(raw)).toBe(true);
    }
    for (const raw of ['no', 'FALSE', '0', 'falso']) {
      expect(ok(raw, 'boolean'), String(raw)).toBe(false);
    }
    expect(ok(true, 'boolean')).toBe(true);
  });

  it('rechaza lo ambiguo', () => {
    expect(fails('quiza', 'boolean')).toContain('deberia ser si o no');
  });
});

describe('fechas', () => {
  /**
   * Regresion de un fallo encontrado importando contra PostgreSQL real: las
   * fechas se guardaban un dia antes.
   *
   * El driver serializa un objeto `Date` en hora LOCAL con su desplazamiento, y
   * al convertirlo a una columna `DATE` desde un servidor al oeste de Greenwich
   * se pierde el dia. Una fecha de negocio no tiene zona horaria, asi que viaja
   * como texto `YYYY-MM-DD`.
   */
  it('emite una fecha sin hora como texto, sin zona horaria de por medio', () => {
    expect(ok(new Date('2026-09-15T00:00:00Z'), 'date')).toBe('2026-09-15');
    expect(ok('2026-09-15', 'date')).toBe('2026-09-15');
    expect(ok('01/09/26', 'date')).toBe('2026-09-01');
  });

  // Una fecha CON hora si es un instante: ahi el objeto Date es lo correcto.
  it('emite una fecha con hora como instante', () => {
    const date = new Date('2026-09-15T14:30:00Z');
    expect(ok(date, 'datetime')).toBe(date);
  });

  // El ERS usa `01/09/26`: dia primero, que es la convencion en espanol.
  it('interpreta el dia primero', () => {
    expect(ok('01/09/26', 'date')).toBe('2026-09-01');
    expect(ok('09/01/26', 'date')).toBe('2026-01-09');
  });

  it('acepta anos de cuatro digitos y separadores distintos', () => {
    expect(ok('15-09-2026', 'date')).toBe('2026-09-15');
    expect(ok('15.09.2026', 'date')).toBe('2026-09-15');
  });

  // `new Date(2026, 1, 31)` no falla: se desborda a marzo. Hay que detectarlo.
  it('rechaza una fecha que no existe en vez de desbordarla', () => {
    expect(fails('31/02/2026', 'date')).toContain('no existe');
    expect(fails('45/13/2026', 'date')).toContain('fecha');
  });

  it('rechaza el texto que no es una fecha', () => {
    expect(fails('proximamente', 'date')).toContain('deberia ser una fecha');
  });
});

describe('seleccion', () => {
  it('acepta un valor de la lista, aunque cambie la caja o los acentos', () => {
    expect(ok('abierto', 'select', ['Abierto', 'Cerrado'])).toBe('Abierto');
    expect(ok('  CERRADO  ', 'select', ['Abierto', 'Cerrado'])).toBe('Cerrado');
  });

  // La restriccion CHECK de la tabla lo rechazaria igual; mejor explicarlo aqui.
  it('rechaza un valor fuera de la lista y enumera los posibles', () => {
    const reason = fails('Pendiente', 'select', ['Abierto', 'Cerrado']);

    expect(reason).toContain('no admite el valor');
    expect(reason).toContain('Abierto, Cerrado');
  });
});

describe('texto', () => {
  it('recorta los espacios de los bordes', () => {
    expect(ok('  ACME  ', 'text')).toBe('ACME');
  });

  it('no valida la forma de correos ni telefonos al importar', () => {
    // Su forma se comprueba en los formularios, donde se puede explicar. Una
    // restriccion aqui perderia la fila entera por un correo mal escrito.
    expect(ok('no-es-un-correo', 'email')).toBe('no-es-un-correo');
    expect(ok('llamar al fijo', 'phone')).toBe('llamar al fijo');
  });

  it('recorta el valor en el mensaje de error para que quepa', () => {
    const reason = fails('x'.repeat(200), 'integer');
    expect(reason.length).toBeLessThan(120);
    expect(reason).toContain('...');
  });
});
