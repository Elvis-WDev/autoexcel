import { describe, expect, it } from 'vitest';
import { buildPhysicalPlan, SYSTEM_COLUMNS } from '../src/domain/blueprint/physical-plan.js';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import {
  isSafeIdentifier,
  MAX_IDENTIFIER_LENGTH,
  toIdentifier,
} from '../src/domain/identifiers.js';
import { ident, literal } from '../src/infrastructure/database/sql/builder.js';
import { buildCreateSchemaStatements } from '../src/infrastructure/database/sql/ddl.js';

/**
 * Tests de adversario del materializador.
 *
 * El ADR 0001 acepta un riesgo concreto a cambio de integridad real: se emite
 * DDL en tiempo de ejecucion a partir de un archivo que sube cualquiera. Estos
 * tests son la contrapartida de esa decision.
 *
 * Todo lo de aqui parte de texto que una persona escribio en su Excel: nombres
 * de hoja, encabezados de columna, valores de un `select`. Ninguno puede
 * convertirse en SQL ejecutable.
 */

/** Lo que alguien intentaria colar, mas lo que un Excel real trae por descuido. */
const HOSTILE_LABELS = [
  '"; DROP TABLE user; --',
  "'; DROP SCHEMA public CASCADE; --",
  'clientes"; DELETE FROM viajes WHERE ""=""',
  'x" ); DROP SCHEMA proj_a CASCADE; CREATE TABLE "y',
  '../../etc/passwd',
  'public.user',
  'SELECT',
  'order',
  'table',
  'id',
  'created_at',
  '__dedupe_key',
  '123',
  '   ',
  '\u0000nulo',
  'a'.repeat(400),
  '\u{1F69A} Vehículos',
  'Gestión de Viajes',
];

function blueprintWithLabel(label: string): ProposedBlueprint {
  return {
    applicationName: label,
    entities: [
      {
        name: 'entidad',
        label,
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'campo',
        fields: [
          {
            name: 'campo',
            label,
            type: 'text',
            required: false,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
        ],
      },
    ],
    relations: [],
  };
}

/** Todo el SQL generado, en un solo texto. */
function sqlFor(blueprint: ProposedBlueprint, schemaName = 'proj_ab12cd34ef567890'): string {
  const plan = buildPhysicalPlan(schemaName, blueprint);
  return buildCreateSchemaStatements(plan)
    .map((item) => item.text)
    .join(';\n');
}

describe('generacion de identificadores desde texto hostil', () => {
  it('siempre produce un identificador valido', () => {
    for (const label of HOSTILE_LABELS) {
      const taken = new Set<string>();
      const identifier = toIdentifier(label, { taken, fallback: 'campo' });

      expect(isSafeIdentifier(identifier), JSON.stringify(label)).toBe(true);
      expect(identifier.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
    }
  });

  it('no deja pasar ninguna palabra clave de SQL intacta', () => {
    for (const label of HOSTILE_LABELS) {
      const identifier = toIdentifier(label, { taken: new Set(), fallback: 'campo' });

      // Lo importante no es que no contenga la palabra, sino que no pueda
      // ejecutarse: sin espacios, comillas ni punto y coma, `drop_table_user` es
      // un nombre, no una sentencia.
      expect(identifier).not.toMatch(/[;'"\s()-]/);
    }
  });

  it('nunca produce un nombre reservado del sistema', () => {
    const reserved = new Set(['id', 'created_at', 'updated_at']);

    for (const label of ['id', 'ID', 'Id', 'created at', 'Created_At', 'updated at']) {
      const identifier = toIdentifier(label, { taken: new Set(), fallback: 'campo', reserved });
      expect(reserved.has(identifier), label).toBe(false);
    }
  });

  it('nunca invade el prefijo de las columnas de sistema', () => {
    for (const label of ['__dedupe_key', '__source', '___', '__']) {
      const identifier = toIdentifier(label, { taken: new Set(), fallback: 'campo' });
      expect(identifier.startsWith('__'), label).toBe(false);
    }
  });

  // Dos columnas distintas no pueden acabar en la misma, o una perderia sus datos.
  it('desambigua nombres que colisionan al reducirse', () => {
    const taken = new Set<string>();
    const identifiers = ['Cliente', 'cliente', 'CLIENTE', 'Cli-ente', 'Cli ente'].map((label) =>
      toIdentifier(label, { taken, fallback: 'campo' }),
    );

    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  // 63 bytes es el limite de PostgreSQL: truncar sin desambiguar las fundiria.
  it('desambigua tambien cuando la colision ocurre al truncar', () => {
    const taken = new Set<string>();
    const base = 'columna_muy_larga_'.repeat(6);

    const identifiers = [`${base}uno`, `${base}dos`, `${base}tres`].map((label) =>
      toIdentifier(label, { taken, fallback: 'campo' }),
    );

    for (const identifier of identifiers) {
      expect(identifier.length).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
      expect(isSafeIdentifier(identifier)).toBe(true);
    }
    expect(new Set(identifiers).size).toBe(3);
  });

  it('conserva algo legible cuando el texto lo permite', () => {
    expect(toIdentifier('Gestión de Viajes', { taken: new Set(), fallback: 'x' })).toBe(
      'gestion_de_viajes',
    );
    expect(toIdentifier('RUC / NIT', { taken: new Set(), fallback: 'x' })).toBe('ruc_nit');
  });
});

describe('DDL generado a partir de etiquetas hostiles', () => {
  it('no contiene ninguna sentencia inyectada', () => {
    for (const label of HOSTILE_LABELS) {
      const sql = sqlFor(blueprintWithLabel(label));

      // El SQL legitimo tiene exactamente las sentencias que esperamos. Si una
      // etiqueta hubiera escapado del citado, apareceria una de mas.
      const statements = sql.split(';\n');
      expect(statements.length, JSON.stringify(label)).toBeLessThanOrEqual(6);

      // Cada sentencia tiene que empezar por una palabra que nosotros emitimos.
      for (const item of statements) {
        expect(item, JSON.stringify(label)).toMatch(
          /^(DROP SCHEMA IF EXISTS|CREATE SCHEMA|CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX)\b/,
        );
      }

      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain('DELETE FROM');
      expect(sql).not.toContain('DROP SCHEMA public');
    }
  });

  it('cita todos los identificadores', () => {
    const sql = sqlFor(blueprintWithLabel('Gestión de Viajes'));

    // Tabla y columna comparten etiqueta, pero viven en ambitos distintos: se
    // llaman igual sin colisionar.
    expect(sql).toContain('"proj_ab12cd34ef567890"."gestion_de_viajes"');
    expect(sql).toContain('"gestion_de_viajes" TEXT');
  });

  it('no deja escapar un valor de select en la restriccion CHECK', () => {
    const blueprint = blueprintWithLabel('Estado');
    blueprint.entities[0]!.fields[0]!.type = 'select';
    blueprint.entities[0]!.fields[0]!.options = [
      "Abierto'); DROP SCHEMA public CASCADE; --",
      'Cerrado',
    ];

    const sql = sqlFor(blueprint);

    // La comilla simple queda duplicada, asi que el texto entero es UN literal
    // y no puede cerrar la sentencia.
    expect(sql).toContain("'Abierto''); DROP SCHEMA public CASCADE; --'");
    // Una sola sentencia DROP: la del propio schema al reintentar.
    expect(sql.split(';\n').filter((line) => line.startsWith('DROP SCHEMA'))).toHaveLength(1);
  });

  it('rechaza un nombre de schema que no haya generado la maquina', () => {
    expect(() => sqlFor(blueprintWithLabel('X'), 'public; DROP SCHEMA x')).toThrow();
    expect(() => sqlFor(blueprintWithLabel('X'), 'Proyecto')).toThrow();
    expect(() => sqlFor(blueprintWithLabel('X'), '')).toThrow();
  });
});

describe('citado', () => {
  it('rechaza cualquier identificador que no pase el validador', () => {
    for (const value of ['tabla"; --', 'Tabla', 'tab la', '', 'public.user']) {
      expect(() => ident(value), JSON.stringify(value)).toThrow();
    }
  });

  it('duplica las comillas simples de un literal', () => {
    expect(literal("O'Brien")).toBe("'O''Brien'");
    expect(literal("'; DROP SCHEMA x; --")).toBe("'''; DROP SCHEMA x; --'");
  });

  it('rechaza un literal absurdamente largo o con byte nulo', () => {
    expect(() => literal('a'.repeat(256))).toThrow();
    expect(() => literal('con\u0000nulo')).toThrow();
  });

  /**
   * El byte nulo, construido sin escribirlo.
   *
   * La prueba de arriba y la comprobacion de `literal` usan las dos la misma
   * secuencia de escape. Si alguien la rompiera en los dos sitios a la vez, se
   * seguirian encontrando y la prueba pasaria sin ejercitar nada. Este caso no
   * escribe el caracter de ninguna forma: lo construye.
   */
  it('lo rechaza tambien cuando el byte nulo no se escribio en el codigo', () => {
    const nulo = String.fromCharCode(0);

    expect(nulo).toHaveLength(1);
    expect(nulo.charCodeAt(0)).toBe(0);
    expect(() => literal(`con${nulo}nulo`)).toThrow();
  });
});

describe('estructura del DDL', () => {
  const blueprint: ProposedBlueprint = {
    applicationName: 'Gestion de Viajes',
    entities: [
      {
        name: 'viajes',
        label: 'Viajes',
        origin: 'sheet',
        displayField: 'destino',
        fields: [
          { name: 'destino', label: 'Destino', type: 'text', required: true },
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'relation',
            required: true,
            targetEntity: 'clientes',
          },
          { name: 'valor', label: 'Valor', type: 'decimal', required: false },
        ],
      },
      {
        name: 'clientes',
        label: 'Clientes',
        origin: 'derived',
        displayField: 'nombre',
        dedupeField: 'nombre',
        fields: [{ name: 'nombre', label: 'Nombre', type: 'text', required: true }],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };

  // Sin orden topologico, la clave foranea apuntaria a una tabla inexistente.
  it('crea las tablas referenciadas antes que las que las referencian', () => {
    const sql = sqlFor(blueprint);

    expect(sql.indexOf('CREATE TABLE "proj_ab12cd34ef567890"."clientes"')).toBeLessThan(
      sql.indexOf('CREATE TABLE "proj_ab12cd34ef567890"."viajes"'),
    );
  });

  it('anade las columnas de sistema a toda tabla', () => {
    const sql = sqlFor(blueprint);

    for (const column of [SYSTEM_COLUMNS.id, SYSTEM_COLUMNS.createdAt, SYSTEM_COLUMNS.source]) {
      expect(sql.match(new RegExp(`"${column}"`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  // El indice unico ES la deduplicacion de RF-20.
  it('crea el indice unico de deduplicacion solo donde hace falta', () => {
    const sql = sqlFor(blueprint);

    expect(sql).toContain('CREATE UNIQUE INDEX "clientes_dedupe_idx"');
    expect(sql).not.toContain('"viajes_dedupe_idx"');
  });

  it('declara la clave foranea con RESTRICT', () => {
    const sql = sqlFor(blueprint);

    expect(sql).toContain('REFERENCES "proj_ab12cd34ef567890"."clientes"("id") ON DELETE RESTRICT');
  });

  it('indexa las columnas de relacion y la columna mostrada', () => {
    const sql = sqlFor(blueprint);

    expect(sql).toContain('CREATE INDEX "viajes_cliente_idx"');
    expect(sql).toContain('CREATE INDEX "viajes_display_idx"');
  });

  it('mapea cada tipo del ERS a su tipo de PostgreSQL', () => {
    const types: [string, string][] = [
      ['text', 'TEXT'],
      ['integer', 'BIGINT'],
      ['decimal', 'NUMERIC(18,4)'],
      ['boolean', 'BOOLEAN'],
      ['date', 'DATE'],
      ['datetime', 'TIMESTAMPTZ'],
      ['email', 'TEXT'],
      ['phone', 'TEXT'],
    ];

    for (const [fieldType, sqlType] of types) {
      const single = blueprintWithLabel('Campo');
      single.entities[0]!.fields[0]!.type = fieldType as 'text';

      expect(sqlFor(single), fieldType).toContain(`"campo" ${sqlType}`);
    }
  });

  // Reintentar una construccion fallida no puede chocar con los restos.
  it('empieza soltando el schema anterior', () => {
    expect(sqlFor(blueprint).startsWith('DROP SCHEMA IF EXISTS')).toBe(true);
  });
});
