import { describe, expect, it } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import {
  allowedTransitionsFrom,
  assertStatusIn,
  assertTransition,
  canTransition,
  isBeforeMaterialization,
  isProjectStatus,
  isTerminal,
  PROJECT_STATUSES,
  type ProjectStatus,
} from '../src/domain/project-status.js';

/** El camino feliz completo del ERS, de principio a fin. */
const HAPPY_PATH: ProjectStatus[] = [
  'draft',
  'uploaded',
  'sheet_selected',
  'analyzing',
  'reviewing_entities',
  'reviewing_fields',
  'reviewing_relations',
  'reviewing_summary',
  'creating',
  'importing',
  'completed',
];

describe('maquina de estados del proyecto', () => {
  it('recorre el flujo completo del ERS sin rechazos', () => {
    for (let i = 0; i < HAPPY_PATH.length - 1; i += 1) {
      const from = HAPPY_PATH[i]!;
      const to = HAPPY_PATH[i + 1]!;
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  // RX-04: "El usuario debera poder volver a pasos anteriores antes de crear".
  it('permite retroceder entre los pasos de revision', () => {
    expect(canTransition('reviewing_fields', 'reviewing_entities')).toBe(true);
    expect(canTransition('reviewing_relations', 'reviewing_fields')).toBe(true);
    expect(canTransition('reviewing_summary', 'reviewing_relations')).toBe(true);
  });

  // A partir de `creating` se emite DDL y se insertan filas: ya no hay vuelta.
  it('no permite retroceder una vez empezada la creacion', () => {
    expect(canTransition('creating', 'reviewing_summary')).toBe(false);
    expect(canTransition('importing', 'creating')).toBe(false);
    expect(canTransition('completed', 'importing')).toBe(false);
  });

  it('no permite saltarse pasos', () => {
    expect(canTransition('draft', 'creating')).toBe(false);
    expect(canTransition('uploaded', 'reviewing_summary')).toBe(false);
    expect(canTransition('analyzing', 'completed')).toBe(false);
  });

  it('deja fallar desde cualquier estado no terminal', () => {
    for (const status of PROJECT_STATUSES) {
      if (status === 'completed' || status === 'failed') continue;
      expect(canTransition(status, 'failed'), `${status} -> failed`).toBe(true);
    }
  });

  // RNF-05: tras un fallo el archivo sigue ahi, se puede reintentar el analisis.
  it('permite reintentar despues de un fallo sin volver a subir el archivo', () => {
    expect(canTransition('failed', 'sheet_selected')).toBe(true);
    expect(canTransition('failed', 'completed')).toBe(false);
  });

  it('reconoce completed como unico estado terminal de exito', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(false);
    expect(isTerminal('draft')).toBe(false);
  });

  it('todo estado alcanzable existe en la lista de estados', () => {
    for (const status of PROJECT_STATUSES) {
      for (const next of allowedTransitionsFrom(status)) {
        expect(PROJECT_STATUSES).toContain(next);
      }
    }
  });

  it('distingue los estados previos a materializar el schema', () => {
    expect(isBeforeMaterialization('reviewing_summary')).toBe(true);
    expect(isBeforeMaterialization('creating')).toBe(false);
    expect(isBeforeMaterialization('completed')).toBe(false);
  });

  describe('assertTransition', () => {
    it('no lanza en una transicion valida', () => {
      expect(() => assertTransition('draft', 'uploaded')).not.toThrow();
    });

    it('lanza INVALID_STATE y adjunta las transiciones posibles', () => {
      try {
        assertTransition('draft', 'creating');
        expect.unreachable('deberia haber lanzado');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('INVALID_STATE');
        expect((error as AppError).details).toMatchObject({
          from: 'draft',
          to: 'creating',
          allowed: ['uploaded', 'failed'],
        });
      }
    });

    // RX-03: el flujo principal no puede exigir vocabulario tecnico.
    it('explica el rechazo sin jerga tecnica', () => {
      try {
        assertTransition('draft', 'creating');
        expect.unreachable('deberia haber lanzado');
      } catch (error) {
        const message = (error as AppError).message.toLowerCase();
        for (const jargon of ['sql', 'schema', 'estado invalido', 'transition', 'enum']) {
          expect(message).not.toContain(jargon);
        }
      }
    });
  });

  describe('assertStatusIn', () => {
    it('acepta un estado esperado', () => {
      expect(() => assertStatusIn('uploaded', ['uploaded', 'sheet_selected'])).not.toThrow();
    });

    it('rechaza un estado que no corresponde', () => {
      expect(() => assertStatusIn('draft', ['completed'])).toThrowError(AppError);
    });
  });

  describe('isProjectStatus', () => {
    it('acepta los estados conocidos y rechaza el resto', () => {
      expect(isProjectStatus('importing')).toBe(true);
      expect(isProjectStatus('inventado')).toBe(false);
      expect(isProjectStatus(42)).toBe(false);
      expect(isProjectStatus(null)).toBe(false);
    });
  });
});
