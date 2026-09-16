import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import { createScriptedProposer } from './helpers/scripted-proposer.js';
import { createTestHarness } from './helpers/test-app.js';
import { createFixtureDir, writeWorkbook, type FixtureSheet } from './helpers/xlsx-fixtures.js';

/**
 * Prueba de volumen.
 *
 * El plan la pide explicitamente: 50.000 filas dentro de un presupuesto de
 * tiempo acordado. Lo que se comprueba no es la velocidad exacta —depende de la
 * maquina— sino que la deduplicacion y la resolucion de relaciones siguen siendo
 * correctas con volumen, y que el coste crece de forma razonable.
 *
 * El cuello de botella real esta en la insercion, que aqui es en memoria. La
 * medicion contra PostgreSQL queda para F8, donde el plan situa el trabajo de
 * rendimiento con numeros de antes y despues.
 */

const ROWS = 50_000;
const CLIENTS = 400;
/** Presupuesto holgado: interesa detectar un coste cuadratico, no afinar. */
const BUDGET_MS = 90_000;

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
}, 60_000);

afterAll(() => undefined);

function bigSheet(): FixtureSheet {
  const rows: FixtureSheet['rows'] = [['Fecha', 'Cliente', 'Vehiculo', 'Valor']];

  for (let i = 0; i < ROWS; i += 1) {
    rows.push([
      `${String((i % 28) + 1).padStart(2, '0')}/09/26`,
      // Mayusculas alternas: la deduplicacion tiene que colapsarlas igual.
      i % 3 === 0 ? `CLIENTE ${i % CLIENTS}` : `Cliente ${i % CLIENTS}`,
      `V-${i % 50}`,
      (i % 100) * 10,
    ]);
  }

  return { name: 'Viajes', rows };
}

function blueprint(): ProposedBlueprint {
  return {
    applicationName: 'Volumen',
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
            source: { sheetIndex: 0, columnIndex: 1 },
          },
        ],
      },
      {
        name: 'viajes',
        label: 'Viajes',
        origin: 'sheet',
        sourceSheetIndex: 0,
        displayField: 'vehiculo',
        fields: [
          {
            name: 'fecha',
            label: 'Fecha',
            type: 'date',
            required: true,
            source: { sheetIndex: 0, columnIndex: 0 },
          },
          {
            name: 'cliente',
            label: 'Cliente',
            type: 'relation',
            required: true,
            targetEntity: 'clientes',
            source: { sheetIndex: 0, columnIndex: 1 },
          },
          {
            name: 'vehiculo',
            label: 'Vehiculo',
            type: 'text',
            required: false,
            source: { sheetIndex: 0, columnIndex: 2 },
          },
          {
            name: 'valor',
            label: 'Valor',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 3 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };
}

describe('importacion con volumen', () => {
  it(
    `importa ${ROWS.toLocaleString('es')} filas deduplicando y enlazando correctamente`,
    async () => {
      const harness = createTestHarness({
        proposer: createScriptedProposer({ first: blueprint() }),
      });

      const file = await writeWorkbook(fixtures, 'volumen.xlsx', [bigSheet()]);

      const started = Date.now();

      const created = await request(harness.app).post('/api/projects').send({ name: 'Volumen' });
      const projectId = (created.body as { data: { id: string } }).data.id;

      await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
      await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
      await request(harness.app).post(`/api/projects/${projectId}/analyze`);
      await harness.settled();

      for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
        await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
      }
      await request(harness.app).post(`/api/projects/${projectId}/blueprint/confirm`);
      await request(harness.app).post(`/api/projects/${projectId}/build`);
      await harness.settled();

      const elapsed = Date.now() - started;

      // RF-20 con volumen: 50.000 filas, 400 clientes.
      expect(harness.importer.recordsOf('clientes')).toHaveLength(CLIENTS);
      expect(harness.importer.recordsOf('viajes')).toHaveLength(ROWS);

      // RF-19 con volumen: ninguna fila se quedo sin resolver su cliente.
      const viajes = harness.importer.recordsOf('viajes');
      const sinCliente = viajes.filter((viaje) => viaje.values['cliente'] === null);
      expect(sinCliente).toHaveLength(0);

      // Y apuntan a clientes que existen de verdad.
      const clienteIds = new Set(harness.importer.recordsOf('clientes').map((c) => c.id));
      expect(clienteIds.has(String(viajes[0]!.values['cliente']))).toBe(true);
      expect(clienteIds.has(String(viajes.at(-1)!.values['cliente']))).toBe(true);

      expect(harness.jobs.jobs.at(-1)?.result?.failedRows).toBe(0);
      expect(elapsed, `tardo ${elapsed} ms`).toBeLessThan(BUDGET_MS);
    },
    BUDGET_MS + 30_000,
  );
});
