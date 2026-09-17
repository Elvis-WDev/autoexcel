import { describe, expect, it } from 'vitest';
import { isBlank, toText, width } from '../src/domain/spreadsheet/cell.js';
import { profileColumn } from '../src/domain/spreadsheet/column-profile.js';
import { detectHeaderRow } from '../src/domain/spreadsheet/header-detection.js';
import {
  normalizeHeader,
  normalizeText,
  normalizeValue,
} from '../src/domain/spreadsheet/normalization.js';
import { analyzeSheet } from '../src/domain/spreadsheet/sheet-analysis.js';
import { inferColumnType } from '../src/domain/spreadsheet/type-inference.js';

describe('celdas', () => {
  it('reconoce lo que no aporta valor', () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank('')).toBe(true);
    expect(isBlank('   ')).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank(false)).toBe(false);
  });

  it('da una representacion textual estable', () => {
    expect(toText('  ACME  ')).toBe('ACME');
    expect(toText(42)).toBe('42');
    expect(toText(true)).toBe('true');
    expect(toText(new Date('2026-09-15T00:00:00Z'))).toBe('2026-09-15T00:00:00.000Z');
    expect(toText(null)).toBe('');
  });

  it('cuenta solo las celdas con contenido', () => {
    expect(width(['a', null, '', 'b', '  '])).toBe(2);
  });
});

describe('normalizacion', () => {
  // Esta funcion decide cuantos registros crea la importacion de F6.
  it('colapsa mayusculas, espacios y acentos al mismo valor', () => {
    const variants = ['ACME', 'acme', '  ACME  ', 'Acme', 'ACME'];
    const normalized = new Set(variants.map((value) => normalizeValue(value)));
    expect(normalized.size).toBe(1);
  });

  it('colapsa espacios internos repetidos', () => {
    expect(normalizeText('Comercial   Andes')).toBe('comercial andes');
  });

  it('quita diacriticos', () => {
    expect(normalizeValue('Gestión')).toBe('gestion');
    expect(normalizeValue('Ñandú')).toBe('nandu');
  });

  it('no confunde valores que si son distintos', () => {
    expect(normalizeValue('ACME SA')).not.toBe(normalizeValue('ACME SL'));
  });

  it('normaliza encabezados a un identificador comparable', () => {
    expect(normalizeHeader('Email Cliente')).toBe('email_cliente');
    expect(normalizeHeader('EMAIL-CLIENTE')).toBe('email_cliente');
    expect(normalizeHeader('  email_cliente  ')).toBe('email_cliente');
    expect(normalizeHeader('Número de Guía')).toBe('numero_de_guia');
  });
});

describe('inferencia de tipo', () => {
  it('reconoce enteros y decimales', () => {
    expect(inferColumnType([1, 2, 3]).type).toBe('integer');
    expect(inferColumnType([1.5, 2.25]).type).toBe('decimal');
    expect(inferColumnType(['10', '20', '30']).type).toBe('integer');
  });

  it('reconoce booleanos en espanol y en ingles', () => {
    expect(inferColumnType(['si', 'no', 'si']).type).toBe('boolean');
    expect(inferColumnType([true, false]).type).toBe('boolean');
  });

  it('reconoce fechas como objeto y como texto', () => {
    expect(inferColumnType([new Date('2026-09-15T00:00:00Z')]).type).toBe('date');
    expect(inferColumnType(['2026-09-15', '2026-09-16']).type).toBe('date');
    expect(inferColumnType(['01/09/2026', '02/09/2026']).type).toBe('date');
  });

  it('distingue fecha con hora de fecha sin hora', () => {
    expect(inferColumnType([new Date('2026-09-15T14:30:00Z')]).type).toBe('datetime');
  });

  it('reconoce correos', () => {
    expect(inferColumnType(['a@b.com', 'c@d.org']).type).toBe('email');
  });

  // Un importe no puede acabar siendo un telefono: seria peor que dejarlo como
  // numero, porque el formulario generado pediria un telefono.
  it('no confunde numeros pelados con telefonos', () => {
    expect(inferColumnType([350, 420, 290], 'Valor').type).toBe('integer');
    expect(inferColumnType(['3501234', '4201234'], 'Valor').type).toBe('integer');
  });

  it('reconoce telefonos con prefijo y separadores', () => {
    expect(inferColumnType(['+593 99 123 4567', '+593 98 765 4321']).type).toBe('phone');
  });

  // RI-03: el encabezado aporta evidencia, pero no manda sobre los datos.
  it('una pista del encabezado no impone un tipo que los datos contradicen', () => {
    expect(inferColumnType([350, 420, 290], 'Telefono').type).not.toBe('phone');
    expect(inferColumnType(['hola', 'que tal'], 'Email').type).toBe('text');
  });

  it('cae a texto cuando la columna mezcla cosas', () => {
    expect(inferColumnType(['ACME', 42, '2026-09-15', true]).type).toBe('text');
  });

  it('tolera una minoria de valores discrepantes', () => {
    const values = [...Array.from({ length: 19 }, (_, i) => i), 'pendiente'];
    expect(inferColumnType(values).type).toBe('integer');
  });

  it('ignora los vacios al decidir', () => {
    expect(inferColumnType([1, null, 2, '', 3, '   ']).type).toBe('integer');
  });

  it('devuelve texto sin confianza cuando no hay nada que mirar', () => {
    expect(inferColumnType([null, '', '  '])).toEqual({ type: 'text', confidence: 0 });
  });

  /**
   * El cero a la izquierda: la marca de que eso no es un numero.
   *
   * Encontrado probando con un motor de inferencia real: una cedula
   * `0923456789` se guardaba como `923456789` y el cero no volvia. El modelo
   * elegia `integer` porque nosotros se lo sugeriamos.
   */
  describe('un cero a la izquierda significa que no es un numero', () => {
    it.each([
      ['cedulas', ['1712345678', '0923456789', '0134567890']],
      ['codigos de producto', ['007', '012', '003']],
      ['meses con relleno', ['01', '02', '11']],
      ['codigos postales', ['08001', '28013']],
    ])('%s se quedan como texto', (_nombre, valores) => {
      expect(inferColumnType(valores, 'Codigo').type).toBe('text');
    });

    /** Y lo que si es un numero sigue siendolo: la regla pide OTRO digito. */
    it.each([
      ['enteros normales', ['40', '24', '60'], 'integer'],
      ['el cero solo', ['0', '1', '2'], 'integer'],
      ['decimales bajo uno', ['0.5', '0.75'], 'decimal'],
      ['negativos bajo uno', ['-0.25', '-1.5'], 'decimal'],
    ] as const)('%s siguen siendo %s', (_nombre, valores, esperado) => {
      expect(inferColumnType([...valores], 'Valor').type).toBe(esperado);
    });

    it('basta con que una fila lo lleve para no arriesgar la columna entera', () => {
      // Cuatro numeros limpios y una cedula con cero: si gana el entero, esa
      // fila pierde su cero para siempre.
      const mezcla = ['1712345678', '1745678901', '1798765432', '0923456789'];
      expect(inferColumnType(mezcla, 'Cedula').type).toBe('text');
    });
  });
});

describe('deteccion de encabezados', () => {
  it('encuentra el encabezado en la primera fila', () => {
    const detected = detectHeaderRow([
      ['Cliente', 'Monto'],
      ['ACME', 100],
    ]);

    expect(detected).toEqual({ rowIndex: 0, headers: ['Cliente', 'Monto'] });
  });

  // El caso real: titulo, fecha de generacion y filas en blanco encima.
  it('salta filas de titulo y encuentra el encabezado real', () => {
    const detected = detectHeaderRow([
      ['REPORTE MENSUAL'],
      [],
      ['Generado el 2026-09-15'],
      ['Producto', 'Cantidad', 'Precio'],
      ['Tornillos', 100, 2.5],
    ]);

    expect(detected?.rowIndex).toBe(3);
    expect(detected?.headers).toEqual(['Producto', 'Cantidad', 'Precio']);
  });

  it('rellena los huecos del encabezado conservando la posicion', () => {
    const detected = detectHeaderRow([
      ['Cliente', null, 'Total'],
      ['ACME', 'algo', 100],
    ]);

    expect(detected?.headers).toEqual(['Cliente', 'Columna 2', 'Total']);
  });

  it('desambigua encabezados repetidos', () => {
    const detected = detectHeaderRow([
      ['Nombre', 'Nombre', 'Valor'],
      ['a', 'b', 1],
    ]);

    expect(detected?.headers).toEqual(['Nombre', 'Nombre (2)', 'Valor']);
  });

  it('no toma una fila de datos por encabezado', () => {
    expect(
      detectHeaderRow([
        [1, 2, 3],
        [4, 5, 6],
      ]),
    ).toBeNull();
  });

  it('exige que haya datos debajo', () => {
    expect(detectHeaderRow([['Cliente', 'Monto']])).toBeNull();
  });

  it('devuelve null en una hoja vacia', () => {
    expect(detectHeaderRow([])).toBeNull();
    expect(detectHeaderRow([[], [null, null]])).toBeNull();
  });
});

describe('perfilado de columnas', () => {
  it('cuenta filas, vacios, distintos y ejemplos', () => {
    const profile = profileColumn(['ACME', 'ACME', null, 'NORTE', '  acme  ', ''], 'Cliente');

    expect(profile.total).toBe(6);
    expect(profile.empty).toBe(2);
    // ACME, acme y "  acme  " son el mismo valor.
    expect(profile.distinct).toBe(2);
    expect(profile.samples).toEqual(['ACME', 'NORTE']);
  });

  it('acota los ejemplos a veinte y no los repite', () => {
    const values = Array.from({ length: 200 }, (_, i) => `Cliente ${i}`);
    expect(profileColumn(values, 'Cliente').samples).toHaveLength(20);

    const repeated = Array.from({ length: 200 }, () => 'ACME');
    expect(profileColumn(repeated, 'Cliente').samples).toEqual(['ACME']);
  });

  // RI-02: pocos valores distintos sobre muchas filas sugiere una entidad.
  it('marca como repetida una columna con baja cardinalidad y volumen', () => {
    const values = Array.from({ length: 5000 }, (_, i) => `Cliente ${i % 80}`);
    const profile = profileColumn(values, 'Cliente');

    expect(profile.cardinalityRatio).toBeCloseTo(80 / 5000, 5);
    expect(profile.repeatsEnoughForEntity).toBe(true);
    expect(profile.identifying).toBe(false);
  });

  // RI-01: una columna que identifica cada fila no puede originar una entidad.
  it('marca como identificadora una columna de valores unicos', () => {
    const values = Array.from({ length: 500 }, (_, i) => `FAC-${i}`);
    const profile = profileColumn(values, 'Factura');

    expect(profile.identifying).toBe(true);
    expect(profile.repeatsEnoughForEntity).toBe(false);
  });

  // Con tres filas todo parece repetido: hace falta volumen para concluir algo.
  it('no concluye nada sobre repeticion con muy pocas filas', () => {
    expect(profileColumn(['a', 'a', 'b'], 'Cliente').repeatsEnoughForEntity).toBe(false);
  });

  // Decision 3 del plan: la clave de deduplicacion se sugiere, no se adivina.
  it('propone como clave una columna unica con nombre de identificador', () => {
    const rucs = Array.from({ length: 100 }, (_, i) => `RUC-${i}`);
    expect(profileColumn(rucs, 'RUC').identityCandidate).toBe(true);
    expect(profileColumn(rucs, 'Observaciones').identityCandidate).toBe(false);
  });

  it('no propone como clave una columna que se repite', () => {
    const values = Array.from({ length: 100 }, (_, i) => `C-${i % 5}`);
    expect(profileColumn(values, 'Codigo').identityCandidate).toBe(false);
  });

  it('sobrevive a una columna completamente vacia', () => {
    const profile = profileColumn([null, null, ''], 'Vacia');

    expect(profile.distinct).toBe(0);
    expect(profile.cardinalityRatio).toBe(0);
    expect(profile.identifying).toBe(false);
    expect(profile.inferredType).toBe('text');
  });
});

describe('analisis de hoja', () => {
  it('perfila una hoja normal', () => {
    const analysis = analyzeSheet({
      name: 'Viajes',
      index: 0,
      rows: [
        ['Cliente', 'Valor'],
        ['ACME', 100],
        ['NORTE', 200],
        ['ACME', 300],
      ],
    });

    expect(analysis.included).toBe(true);
    expect(analysis.issue).toBeNull();
    expect(analysis.headerRowIndex).toBe(0);
    expect(analysis.rowCount).toBe(3);
    expect(analysis.columns.map((column) => column.header)).toEqual(['Cliente', 'Valor']);
    expect(analysis.columns[1]?.profile.inferredType).toBe('integer');
  });

  // Con varias hojas, una pestana vacia se excluye en vez de detener el proceso.
  it('excluye una hoja vacia sin romper nada', () => {
    const analysis = analyzeSheet({ name: 'Resumen', index: 2, rows: [] });

    expect(analysis.issue).toBe('empty');
    expect(analysis.included).toBe(false);
    expect(analysis.columns).toEqual([]);
  });

  it('excluye una hoja sin encabezados identificables', () => {
    const analysis = analyzeSheet({
      name: 'Datos',
      index: 1,
      rows: [
        [1, 2],
        [3, 4],
      ],
    });

    expect(analysis.issue).toBe('no_headers');
    expect(analysis.included).toBe(false);
  });

  // Una hoja truncada sigue siendo utilizable: el aviso es para la persona.
  it('avisa de que una hoja se leyo a medias pero la conserva', () => {
    const analysis = analyzeSheet({
      name: 'Grande',
      index: 0,
      rows: [['Cliente'], ['ACME']],
      truncated: true,
    });

    expect(analysis.issue).toBe('truncated');
    expect(analysis.included).toBe(true);
  });

  it('acepta la fila de encabezado que imponga la persona usuaria', () => {
    const rows = [['TITULO'], ['Producto', 'Cantidad'], ['Tornillos', 100]];

    const automatic = analyzeSheet({ name: 'Hoja', index: 0, rows });
    expect(automatic.headerRowIndex).toBe(1);

    const forced = analyzeSheet({ name: 'Hoja', index: 0, rows, forcedHeaderRowIndex: 0 });
    expect(forced.headerRowIndex).toBe(0);
    expect(forced.columns.map((column) => column.header)).toEqual(['TITULO']);
  });

  it('ignora las filas en blanco al contar los datos', () => {
    const analysis = analyzeSheet({
      name: 'Hoja',
      index: 0,
      rows: [['Cliente'], ['ACME'], [], [null], ['NORTE']],
    });

    expect(analysis.rowCount).toBe(2);
  });
});
