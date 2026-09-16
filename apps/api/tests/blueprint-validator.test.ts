import { describe, expect, it } from 'vitest';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import {
  profileKey,
  validateBlueprint,
  type ValidationContext,
} from '../src/domain/blueprint/validator.js';
import type { ColumnProfile } from '../src/domain/spreadsheet/column-profile.js';

function profile(overrides: Partial<ColumnProfile> = {}): ColumnProfile {
  return {
    total: 400,
    empty: 0,
    distinct: 3,
    cardinalityRatio: 0.0075,
    samples: ['ACME', 'NORTE', 'SUR'],
    inferredType: 'text',
    typeConfidence: 1,
    maxLength: 20,
    repeatsEnoughForEntity: true,
    identifying: false,
    identityCandidate: false,
    ...overrides,
  };
}

function context(profiles: Record<string, ColumnProfile> = {}): ValidationContext {
  const entries = Object.entries(profiles);
  const map = new Map(entries.length > 0 ? entries : [[profileKey(0, 0), profile()]]);

  return {
    profiles: map,
    includedSheetIndexes: new Set([...map.keys()].map((key) => Number(key.split(':')[0]))),
  };
}

/** Propuesta minima valida, base de las variaciones. */
function baseline(): ProposedBlueprint {
  return {
    applicationName: 'Gestion',
    entities: [
      {
        name: 'clientes',
        label: 'Clientes',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'nombre',
        fields: [
          {
            name: 'nombre',
            label: 'Nombre',
            type: 'text',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
        ],
      },
    ],
    relations: [],
  };
}

describe('validador de blueprint', () => {
  it('acepta una propuesta correcta', () => {
    const result = validateBlueprint(baseline(), context());
    expect(result.ok).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  // P-02: "La IA no puede generar componentes arbitrarios."
  it('rechaza un tipo de campo que no existe', () => {
    const candidate = baseline();
    // El modelo podria devolver esto pese al esquema; el validador es la garantia.
    (candidate.entities[0]!.fields[0] as { type: string }).type = 'currency';

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('UNKNOWN_FIELD_TYPE');
  });

  it('rechaza una relacion que apunta a una entidad inexistente', () => {
    const candidate = baseline();
    candidate.entities[0]!.fields.push({
      name: 'proveedor',
      label: 'Proveedor',
      type: 'relation',
      required: false,
      targetEntity: 'proveedores',
    });

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('RELATION_TARGET_MISSING');
  });

  // ERS 16, restriccion 6.
  it('rechaza una entidad relacionada consigo misma', () => {
    const candidate = baseline();
    candidate.entities[0]!.fields.push({
      name: 'padre',
      label: 'Padre',
      type: 'relation',
      required: false,
      targetEntity: 'clientes',
    });
    candidate.relations.push({
      fromEntity: 'clientes',
      toEntity: 'clientes',
      fieldName: 'padre',
      type: 'many_to_one',
    });

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('SELF_RELATION');
  });

  // Un ciclo hace imposible ordenar la creacion de tablas y la importacion.
  it('rechaza un ciclo de relaciones', () => {
    const candidate: ProposedBlueprint = {
      applicationName: 'Ciclo',
      entities: [
        {
          name: 'a',
          label: 'A',
          origin: 'sheet',
          displayField: 'nombre',
          fields: [
            { name: 'nombre', label: 'Nombre', type: 'text', required: false },
            { name: 'haciaB', label: 'B', type: 'relation', required: false, targetEntity: 'b' },
          ],
        },
        {
          name: 'b',
          label: 'B',
          origin: 'sheet',
          displayField: 'nombre',
          fields: [
            { name: 'nombre', label: 'Nombre', type: 'text', required: false },
            { name: 'haciaA', label: 'A', type: 'relation', required: false, targetEntity: 'a' },
          ],
        },
      ],
      relations: [
        { fromEntity: 'a', toEntity: 'b', fieldName: 'haciaB', type: 'many_to_one' },
        { fromEntity: 'b', toEntity: 'a', fieldName: 'haciaA', type: 'many_to_one' },
      ],
    };

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('RELATION_CYCLE');
  });

  // RI-01: una columna que identifica cada fila no agrupa nada.
  it('rechaza una entidad derivada de una columna que identifica cada fila', () => {
    const candidate: ProposedBlueprint = {
      applicationName: 'Facturas',
      entities: [
        {
          name: 'numeros',
          label: 'Numeros',
          origin: 'derived',
          displayField: 'numero',
          dedupeField: 'numero',
          fields: [
            {
              name: 'numero',
              label: 'Numero',
              type: 'text',
              required: true,
              source: { sheetIndex: 0, columnIndex: 0 },
            },
          ],
        },
      ],
      relations: [],
    };

    const result = validateBlueprint(
      candidate,
      context({
        [profileKey(0, 0)]: profile({
          distinct: 500,
          cardinalityRatio: 1,
          identifying: true,
          repeatsEnoughForEntity: false,
        }),
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('ENTITY_FROM_IDENTIFYING_COLUMN');
  });

  it('acepta una entidad derivada de una columna que si se repite', () => {
    const candidate: ProposedBlueprint = {
      applicationName: 'Viajes',
      entities: [
        {
          name: 'clientes',
          label: 'Clientes',
          origin: 'derived',
          displayField: 'nombre',
          dedupeField: 'nombre',
          fields: [
            {
              name: 'nombre',
              label: 'Cliente',
              type: 'text',
              required: true,
              source: { sheetIndex: 0, columnIndex: 0 },
            },
          ],
        },
      ],
      relations: [],
    };

    expect(validateBlueprint(candidate, context()).ok).toBe(true);
  });

  // RNF-02: sin trazabilidad la importacion de F6 no sabe de donde sale cada valor.
  it('rechaza un campo que dice venir de una columna inexistente', () => {
    const candidate = baseline();
    candidate.entities[0]!.fields[0]!.source = { sheetIndex: 9, columnIndex: 9 };

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('SOURCE_COLUMN_UNKNOWN');
  });

  it('rechaza un campo que viene de una hoja excluida', () => {
    const candidate = baseline();
    candidate.entities[0]!.fields[0]!.source = { sheetIndex: 1, columnIndex: 0 };

    const result = validateBlueprint(candidate, {
      profiles: new Map([
        [profileKey(0, 0), profile()],
        [profileKey(1, 0), profile()],
      ]),
      includedSheetIndexes: new Set([0]),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('SOURCE_SHEET_EXCLUDED');
  });

  it('rechaza una entidad sin campos', () => {
    const candidate = baseline();
    candidate.entities[0]!.fields = [];

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('ENTITY_WITHOUT_FIELDS');
  });

  it('rechaza dos entidades con el mismo nombre', () => {
    const candidate = baseline();
    candidate.entities.push(structuredClone(candidate.entities[0]!));

    const result = validateBlueprint(candidate, context());

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('DUPLICATE_ENTITY');
  });

  describe('reparaciones automaticas', () => {
    // RF-17 es imposible sin un campo que represente al registro, asi que en vez
    // de rechazar se elige uno.
    it('elige un campo para representar la entidad cuando falta', () => {
      const candidate = baseline();
      candidate.entities[0]!.displayField = 'no_existe';

      const result = validateBlueprint(candidate, context());

      expect(result.ok).toBe(true);
      expect(result.blueprint.entities[0]!.displayField).toBe('nombre');
      expect(result.issues.map((issue) => issue.code)).toContain('DISPLAY_FIELD_REPLACED');
    });

    it('recupera las opciones de un select desde el perfil de su columna', () => {
      const candidate = baseline();
      candidate.entities[0]!.fields.push({
        name: 'estado',
        label: 'Estado',
        type: 'select',
        required: false,
        source: { sheetIndex: 0, columnIndex: 1 },
      });

      const result = validateBlueprint(
        candidate,
        context({
          [profileKey(0, 0)]: profile(),
          [profileKey(0, 1)]: profile({ distinct: 2, samples: ['Abierto', 'Cerrado'] }),
        }),
      );

      expect(result.ok).toBe(true);
      expect(result.blueprint.entities[0]!.fields[1]!.options).toEqual(['Abierto', 'Cerrado']);
    });

    it('declara la relacion que faltaba cuando el campo ya la describe', () => {
      const candidate = baseline();
      candidate.entities.push({
        name: 'viajes',
        label: 'Viajes',
        origin: 'sheet',
        displayField: 'destino',
        fields: [
          { name: 'destino', label: 'Destino', type: 'text', required: false },
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'relation',
            required: true,
            targetEntity: 'clientes',
          },
        ],
      });
      // Sin entrada en `relations`: el validador la deduce del campo.

      const result = validateBlueprint(candidate, context());

      expect(result.ok).toBe(true);
      expect(result.blueprint.relations).toHaveLength(1);
      expect(result.blueprint.relations[0]).toMatchObject({
        fromEntity: 'viajes',
        toEntity: 'clientes',
        fieldName: 'cliente',
        type: 'many_to_one',
      });
    });

    it('quita las opciones de un campo que no es una seleccion', () => {
      const candidate = baseline();
      candidate.entities[0]!.fields[0]!.options = ['a', 'b'];

      const result = validateBlueprint(candidate, context());

      expect(result.ok).toBe(true);
      expect(result.blueprint.entities[0]!.fields[0]!.options).toBeUndefined();
      expect(result.issues.map((issue) => issue.code)).toContain('OPTIONS_ON_NON_SELECT');
    });

    it('avisa de las columnas que no acabaron en el modelo', () => {
      const result = validateBlueprint(
        baseline(),
        context({
          [profileKey(0, 0)]: profile(),
          [profileKey(0, 1)]: profile(),
          [profileKey(0, 2)]: profile(),
        }),
      );

      expect(result.ok).toBe(true);
      const note = result.issues.find((issue) => issue.code === 'COLUMNS_NOT_MAPPED');
      expect(note?.message).toContain('2 columna');
    });

    it('pone nombre a la aplicacion cuando llega sin el', () => {
      const candidate = baseline();
      candidate.applicationName = '';

      const result = validateBlueprint(candidate, context());

      expect(result.ok).toBe(true);
      expect(result.blueprint.applicationName.length).toBeGreaterThan(0);
    });
  });

  it('no modifica la propuesta original', () => {
    const candidate = baseline();
    candidate.entities[0]!.displayField = 'no_existe';

    validateBlueprint(candidate, context());

    expect(candidate.entities[0]!.displayField).toBe('no_existe');
  });
});
