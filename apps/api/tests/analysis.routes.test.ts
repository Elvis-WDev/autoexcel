import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import { createScriptedProposer, viajesBlueprint } from './helpers/scripted-proposer.js';
import { BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import {
  CLIENTES,
  createFixtureDir,
  RESUMEN_VACIO,
  VIAJES,
  writeWorkbook,
} from './helpers/xlsx-fixtures.js';

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
});

afterAll(() => undefined);

interface BlueprintView {
  applicationName: string;
  wasInferred: boolean;
  notes: string[];
  entities: {
    name: string;
    label: string;
    derived: boolean;
    displayField: string | null;
    dedupeField: string | null;
    fields: { name: string; type: string; relatedTo: string | null; options: string[] | null }[];
  }[];
  relations: { description: string; from: string; to: string }[];
}

/** Proyecto con archivo subido y hojas confirmadas, listo para analizar. */
async function readyToAnalyze(harness: TestHarness, fileName: string): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, [VIAJES, CLIENTES, RESUMEN_VACIO]);
  await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
  await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

  return projectId;
}

describe('POST /api/projects/:id/analyze', () => {
  it('responde 202 con el proceso y no bloquea la peticion', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'analizar.xlsx');

    const response = await request(harness.app).post(`/api/projects/${projectId}/analyze`);

    expect(response.status).toBe(202);
    expect(response.body.data.id).toBeTypeOf('string');
    expect(response.body.data.message).toContain('Analizando');
  });

  it('deja el proyecto listo para revisar entidades al terminar', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'terminar.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    expect(harness.projects.rows[0]?.status).toBe('reviewing_entities');
    expect(harness.jobs.jobs[0]?.status).toBe('completed');
  });

  it('exige haber confirmado las hojas antes', async () => {
    const harness = createTestHarness();
    const created = await request(harness.app).post('/api/projects').send({ name: 'Sin hojas' });
    const projectId = (created.body as { data: { id: string } }).data.id;

    const response = await request(harness.app).post(`/api/projects/${projectId}/analyze`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE');
  });

  it('no deja lanzar dos analisis a la vez', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'doble.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    const second = await request(harness.app).post(`/api/projects/${projectId}/analyze`);

    expect(second.status).toBe(409);
    await harness.settled();
  });

  it('no deja analizar el proyecto de otra persona', async () => {
    const harness = createTestHarness();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'sheet_selected' });

    const response = await request(harness.app).post(`/api/projects/${ajeno.id}/analyze`);

    expect(response.status).toBe(404);
  });
});

describe('senales que recibe el motor de inferencia', () => {
  // Decision 2 del plan: es lo que permite construir UN modelo, no uno por hoja.
  it('detecta que la columna Cliente de dos hojas habla de lo mismo', async () => {
    const proposer = createScriptedProposer({ first: viajesBlueprint() });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'solapamiento.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const overlaps = proposer.lastInput?.overlaps ?? [];
    const clienteMatch = overlaps.find(
      (overlap) => overlap.left.header === 'Cliente' && overlap.right.header === 'Cliente',
    );

    expect(clienteMatch).toBeDefined();
    expect(clienteMatch?.containment).toBe(1);
    expect(clienteMatch?.left.sheetIndex).not.toBe(clienteMatch?.right.sheetIndex);
  });

  // Ni una fila sale del servidor: solo encabezados, estadisticas y ejemplos.
  it('no recibe las filas del archivo', async () => {
    const proposer = createScriptedProposer({ first: viajesBlueprint() });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'sin-filas.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const input = proposer.lastInput!;
    expect(input.sheets.length).toBeGreaterThan(0);

    for (const sheet of input.sheets) {
      for (const column of sheet.columns) {
        expect(column.profile.samples.length).toBeLessThanOrEqual(20);
        expect(column).not.toHaveProperty('rows');
        expect(column).not.toHaveProperty('values');
      }
    }
  });

  it('excluye del analisis las hojas descartadas', async () => {
    const proposer = createScriptedProposer({ first: viajesBlueprint() });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'excluidas.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    // La hoja "Resumen" quedo excluida por estar vacia.
    expect(proposer.lastInput?.sheets.map((sheet) => sheet.name)).toEqual(['Viajes', 'Clientes']);
  });
});

describe('cuando la inferencia no sale bien', () => {
  // RE-04: "Esto permite que la demo continue."
  it('cae a la estructura simple si no hay motor configurado', async () => {
    const harness = createTestHarness({ proposer: null });
    const projectId = await readyToAnalyze(harness, 'sin-motor.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const blueprint = (response.body as { data: BlueprintView }).data;

    expect(response.status).toBe(200);
    expect(blueprint.wasInferred).toBe(false);
    // Una entidad por hoja incluida, sin relaciones (RI-04: preferir lo simple).
    expect(blueprint.entities.map((entity) => entity.label)).toEqual(['Viajes', 'Clientes']);
    expect(blueprint.relations).toEqual([]);
    expect(harness.projects.rows[0]?.status).toBe('reviewing_entities');
  });

  it('cae a la estructura simple si el proveedor falla', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: new Error('proveedor caido') }),
    });
    const projectId = await readyToAnalyze(harness, 'proveedor-caido.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);

    expect(response.status).toBe(200);
    expect((response.body as { data: BlueprintView }).data.wasInferred).toBe(false);
    expect(harness.jobs.jobs[0]?.status).toBe('completed');
  });

  // Una propuesta invalida no se descarta: se le devuelven los problemas.
  it('pide reparacion cuando la propuesta no pasa el validador', async () => {
    const roto: ProposedBlueprint = viajesBlueprint();
    (roto.entities[0]!.fields[0] as { type: string }).type = 'currency';

    const proposer = createScriptedProposer({ first: roto, second: viajesBlueprint() });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'reparacion.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    expect(proposer.proposeCalls).toBe(1);
    expect(proposer.repairCalls).toBe(1);
    expect(proposer.lastRepairProblems.join(' ')).toContain('tipo que el sistema no soporta');

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    expect((response.body as { data: BlueprintView }).data.wasInferred).toBe(true);
  });

  it('cae a la estructura simple si la reparacion tampoco pasa', async () => {
    const roto: ProposedBlueprint = viajesBlueprint();
    (roto.entities[0]!.fields[0] as { type: string }).type = 'currency';

    const proposer = createScriptedProposer({ first: roto, second: roto });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'irreparable.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    expect(proposer.repairCalls).toBe(1);

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const blueprint = (response.body as { data: BlueprintView }).data;

    expect(blueprint.wasInferred).toBe(false);
    expect(blueprint.notes.join(' ')).toContain('estructura simple');
  });

  // P-03: la IA se invoca una vez por analisis y no vuelve a intervenir.
  it('no vuelve a llamar al motor al leer el blueprint', async () => {
    const proposer = createScriptedProposer({ first: viajesBlueprint() });
    const harness = createTestHarness({ proposer });
    const projectId = await readyToAnalyze(harness, 'una-vez.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    await request(harness.app).get(`/api/projects/${projectId}`);

    expect(proposer.proposeCalls).toBe(1);
    expect(proposer.repairCalls).toBe(0);
  });
});

describe('GET /api/projects/:id/blueprint', () => {
  it('describe las relaciones en lenguaje de negocio', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'lenguaje.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const blueprint = (response.body as { data: BlueprintView }).data;

    expect(blueprint.relations).toHaveLength(1);
    expect(blueprint.relations[0]!.description).toBe(
      'Cada viaje pertenece a un cliente. Un cliente puede tener varios viajes.',
    );
  });

  // RX-03: nada de vocabulario de bases de datos en el flujo principal.
  it('no filtra jerga tecnica al cliente', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'sin-jerga.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const serialized = JSON.stringify(response.body).toLowerCase();

    for (const jargon of ['foreign key', 'primary key', 'schema', 'sql', 'proj_']) {
      expect(serialized, jargon).not.toContain(jargon);
    }
  });

  it('avisa si todavia no se ha analizado', async () => {
    const harness = createTestHarness();
    const projectId = await readyToAnalyze(harness, 'sin-analizar.xlsx');

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);

    expect(response.status).toBe(409);
  });

  it('no deja ver el blueprint de otra persona', async () => {
    const harness = createTestHarness();
    const ajeno = harness.projects.seed({ ownerId: BOB.id });

    const response = await request(harness.app).get(`/api/projects/${ajeno.id}/blueprint`);

    expect(response.status).toBe(404);
  });
});

describe('descripcion de relaciones', () => {
  // P-05, literalmente: en vez de "FOREIGN KEY cliente_id REFERENCES clientes(id)".
  it('deshace el plural de las etiquetas mas comunes en espanol', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'plurales.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const description = (response.body as { data: BlueprintView }).data.relations[0]!.description;

    expect(description).toContain('viaje ');
    expect(description).toContain('cliente');
    expect(description).not.toContain('viaj ');
    expect(description).not.toContain('client ');
  });
});

describe('GET /api/projects/:id/jobs/:jobId', () => {
  it('permite seguir el avance del analisis', async () => {
    const harness = createTestHarness({
      proposer: createScriptedProposer({ first: viajesBlueprint() }),
    });
    const projectId = await readyToAnalyze(harness, 'seguimiento.xlsx');

    const started = await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    const jobId = (started.body as { data: { id: string } }).data.id;

    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/jobs/${jobId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('completed');
    expect(response.body.data.message).toContain('grupos de informacion');
  });

  it('responde 404 ante un proceso que no existe', async () => {
    const harness = createTestHarness();
    const projectId = await readyToAnalyze(harness, 'proceso-inexistente.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/jobs/00000000-0000-4000-8000-000000000000`,
    );

    expect(response.status).toBe(404);
  });
});
