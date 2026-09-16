import { describe, expect, it } from 'vitest';
import {
  addField,
  removeEntity,
  removeField,
  renameEntity,
  rejectRelation,
  setApplicationName,
  setDedupeField,
  setDisplayField,
  updateField,
  type EditContext,
  type EditResult,
} from '../src/domain/blueprint/edits.js';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import { profileKey, validateBlueprint } from '../src/domain/blueprint/validator.js';
import { AppError } from '../src/domain/errors.js';
import type { ColumnProfile } from '../src/domain/spreadsheet/column-profile.js';
import { viajesBlueprint } from './helpers/scripted-proposer.js';

/**
 * Invariantes del blueprint.
 *
 * El plan pide una garantia concreta para F4: "ningun blueprint que pase el
 * validador puede hacer fallar al materializador de F5". El materializador
 * todavia no existe, asi que lo que se comprueba aqui son las precondiciones de
 * las que depende, y que son las mismas que el validador promete:
 *
 *   - toda relacion apunta a una entidad que existe;
 *   - el grafo de relaciones no tiene ciclos, asi que se puede ordenar;
 *   - toda entidad tiene al menos un campo y uno que la representa;
 *   - todo campo tiene un tipo del vocabulario cerrado;
 *   - todo `select` tiene opciones.
 *
 * Se aplica una secuencia larga de ediciones arbitrarias y se afirma que, pase
 * lo que pase, o la edicion se rechaza o el resultado sigue cumpliendo todo.
 */

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

/** Perfiles para todas las columnas que usa la propuesta de referencia. */
function buildContext(): EditContext {
  const profiles = new Map<string, ColumnProfile>();
  for (let sheet = 0; sheet <= 1; sheet += 1) {
    for (let column = 0; column <= 6; column += 1) {
      profiles.set(profileKey(sheet, column), profile());
    }
  }
  return { profiles };
}

const CONTEXT = buildContext();

function validationContext() {
  return {
    profiles: CONTEXT.profiles,
    includedSheetIndexes: new Set([0, 1]),
  };
}

/** Las invariantes que el materializador de F5 dara por hechas. */
function assertMaterializable(blueprint: ProposedBlueprint): void {
  const byName = new Map(blueprint.entities.map((entity) => [entity.name, entity]));

  expect(blueprint.entities.length).toBeGreaterThan(0);
  expect(blueprint.applicationName.length).toBeGreaterThan(0);

  for (const entity of blueprint.entities) {
    expect(entity.fields.length, `${entity.name} sin campos`).toBeGreaterThan(0);

    // Sin campo mostrado, RF-17 es imposible.
    expect(entity.fields.some((field) => field.name === entity.displayField)).toBe(true);

    if (entity.dedupeField !== undefined) {
      expect(entity.fields.some((field) => field.name === entity.dedupeField)).toBe(true);
    }

    const names = entity.fields.map((field) => field.name);
    expect(new Set(names).size, `${entity.name} repite campos`).toBe(names.length);

    for (const field of entity.fields) {
      if (field.type === 'relation') {
        expect(field.targetEntity, `${entity.name}.${field.name} sin destino`).toBeDefined();
        expect(byName.has(field.targetEntity!)).toBe(true);

        // Toda relacion necesita su declaracion, o F5 no sabria que clave crear.
        expect(
          blueprint.relations.some(
            (relation) => relation.fromEntity === entity.name && relation.fieldName === field.name,
          ),
        ).toBe(true);
      }

      if (field.type === 'select') {
        expect(field.options?.length ?? 0).toBeGreaterThan(0);
      }
    }
  }

  // Sin ciclos hay orden topologico, y por tanto orden de creacion de tablas.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const edges = new Map<string, string[]>();

  for (const relation of blueprint.relations) {
    expect(byName.has(relation.fromEntity)).toBe(true);
    expect(byName.has(relation.toEntity)).toBe(true);
    edges.set(relation.fromEntity, [...(edges.get(relation.fromEntity) ?? []), relation.toEntity]);
  }

  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (done.has(node)) return false;
    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    done.add(node);
    return false;
  };

  for (const entity of blueprint.entities) {
    expect(walk(entity.name), 'hay un ciclo de relaciones').toBe(false);
  }
}

/** Todas las ediciones posibles, con objetivos validos e invalidos. */
function everyEdit(): { name: string; apply: (bp: ProposedBlueprint) => EditResult }[] {
  const entityNames = ['clientes', 'viajes', 'inventada'];
  const fieldNames = ['nombre', 'ruc', 'cliente', 'estado', 'valor', 'inventado'];
  const types = ['text', 'integer', 'decimal', 'boolean', 'date', 'email', 'select'] as const;

  const edits: { name: string; apply: (bp: ProposedBlueprint) => EditResult }[] = [
    { name: 'nombre de aplicacion', apply: (bp) => setApplicationName(bp, 'Otra cosa') },
  ];

  for (const entityName of entityNames) {
    edits.push({
      name: `renombrar ${entityName}`,
      apply: (bp) => renameEntity(bp, entityName, 'Renombrada'),
    });
    edits.push({
      name: `eliminar ${entityName}`,
      apply: (bp) => removeEntity(bp, entityName, CONTEXT),
    });
    edits.push({
      name: `agregar campo a ${entityName}`,
      apply: (bp) => addField(bp, entityName, { label: 'Nuevo', type: 'text', required: false }),
    });

    for (const fieldName of fieldNames) {
      edits.push({
        name: `eliminar ${entityName}.${fieldName}`,
        apply: (bp) => removeField(bp, entityName, fieldName),
      });
      edits.push({
        name: `mostrar ${entityName}.${fieldName}`,
        apply: (bp) => setDisplayField(bp, entityName, fieldName),
      });
      edits.push({
        name: `clave ${entityName}.${fieldName}`,
        apply: (bp) => setDedupeField(bp, entityName, fieldName, CONTEXT),
      });
      edits.push({
        name: `rechazar relacion ${entityName}.${fieldName}`,
        apply: (bp) => rejectRelation(bp, entityName, fieldName, CONTEXT),
      });

      for (const type of types) {
        edits.push({
          name: `tipo ${entityName}.${fieldName} -> ${type}`,
          apply: (bp) => updateField(bp, entityName, fieldName, { type }, CONTEXT),
        });
      }
    }
  }

  return edits;
}

describe('invariantes del blueprint bajo edicion', () => {
  const edits = everyEdit();

  it('cubre una cantidad significativa de ediciones', () => {
    expect(edits.length).toBeGreaterThan(200);
  });

  it('ninguna edicion aislada produce un blueprint no materializable', () => {
    const base = viajesBlueprint();
    let accepted = 0;
    let rejected = 0;

    for (const edit of edits) {
      let candidate: ProposedBlueprint;

      try {
        candidate = edit.apply(structuredClone(base)).blueprint;
      } catch (error) {
        // Rechazar la edicion es una respuesta correcta, siempre que sea un
        // error de negocio y no una excepcion inesperada.
        expect(error, edit.name).toBeInstanceOf(AppError);
        rejected += 1;
        continue;
      }

      const result = validateBlueprint(candidate, validationContext());
      if (!result.ok) {
        rejected += 1;
        continue;
      }

      // Si el validador lo acepta, tiene que ser construible.
      assertMaterializable(result.blueprint);
      accepted += 1;
    }

    // Sin esto el test pasaria en vacio si todo se rechazara: hay que comprobar
    // que las invariantes se ejercitan de verdad, y que la puerta no esta
    // cerrada para todo el mundo.
    expect(accepted, 'ninguna edicion llego a comprobarse').toBeGreaterThan(40);
    expect(rejected, 'ninguna edicion invalida se rechazo').toBeGreaterThan(100);
  });

  /**
   * Una sola edicion es facil de mantener coherente. Lo que rompe los modelos es
   * la acumulacion: borrar un campo, luego su entidad, luego rechazar una
   * relacion que ya no existe.
   */
  it('ninguna secuencia larga de ediciones lo consigue tampoco', () => {
    let applied = 0;

    // Recorrido determinista pero entrelazado, para no depender del azar.
    for (let seed = 0; seed < 40; seed += 1) {
      let current = viajesBlueprint();
      let step = seed;

      for (let depth = 0; depth < 12; depth += 1) {
        step = (step * 31 + 17) % edits.length;
        const edit = edits[step]!;

        let candidate: ProposedBlueprint;
        try {
          candidate = edit.apply(structuredClone(current)).blueprint;
        } catch (error) {
          expect(error, `semilla ${seed}: ${edit.name}`).toBeInstanceOf(AppError);
          continue;
        }

        const result = validateBlueprint(candidate, validationContext());
        if (!result.ok) continue;

        assertMaterializable(result.blueprint);
        current = result.blueprint;
        applied += 1;
      }
    }

    expect(applied, 'ninguna secuencia avanzo').toBeGreaterThan(100);
  });
});
