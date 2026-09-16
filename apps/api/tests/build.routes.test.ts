import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

function withProposal(): TestHarness {
  return createTestHarness({
    proposer: createScriptedProposer({ first: viajesBlueprint() }),
  });
}

/** Proyecto con la estructura confirmada, listo para construir. */
async function confirmed(harness: TestHarness, fileName: string): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, [VIAJES, CLIENTES, RESUMEN_VACIO]);
  await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
  await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
  await request(harness.app).post(`/api/projects/${projectId}/analyze`);
  await harness.settled();

  for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
    await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
  }
  await request(harness.app).post(`/api/projects/${projectId}/blueprint/confirm`);

  return projectId;
}

describe('POST /api/projects/:id/build', () => {
  it('responde 202 y construye la estructura', async () => {
    const harness = withProposal();
    const projectId = await confirmed(harness, 'construir.xlsx');

    const response = await request(harness.app).post(`/api/projects/${projectId}/build`);
    expect(response.status).toBe(202);

    await harness.settled();

    expect(harness.schemas.created).toHaveLength(1);
    const plan = harness.schemas.created[0]!;
    expect(plan.tables.map((table) => table.tableName)).toEqual(['clientes', 'viajes']);
  });

  // RNF-04: no se crea una aplicacion a partir de un blueprint sin confirmar.
  it('exige confirmar la estructura antes', async () => {
    const harness = withProposal();
    const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
    const projectId = (created.body as { data: { id: string } }).data.id;

    const file = await writeWorkbook(fixtures, 'sin-confirmar.xlsx', [VIAJES, CLIENTES]);
    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
    await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
    await request(harness.app).post(`/api/projects/${projectId}/analyze`);
    await harness.settled();

    const response = await request(harness.app).post(`/api/projects/${projectId}/build`);

    expect(response.status).toBe(409);
    expect(harness.schemas.created).toEqual([]);
  });

  it('no deja lanzar dos construcciones a la vez', async () => {
    const harness = withProposal();
    const projectId = await confirmed(harness, 'doble-build.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/build`);
    const second = await request(harness.app).post(`/api/projects/${projectId}/build`);

    expect(second.status).toBe(409);
    await harness.settled();
  });

  // RE-05: "la aplicacion no debera mostrarse como completada".
  it('deja el proyecto en fallido si la creacion no sale', async () => {
    const harness = withProposal();
    const projectId = await confirmed(harness, 'build-falla.xlsx');
    harness.schemas.failCreate = new Error('la base de datos rechazo el DDL');

    await request(harness.app).post(`/api/projects/${projectId}/build`);
    await harness.settled();

    expect(harness.projects.rows[0]?.status).toBe('failed');
    expect(harness.jobs.jobs.at(-1)?.status).toBe('failed');
  });

  it('no deja construir el proyecto de otra persona', async () => {
    const harness = withProposal();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'reviewing_summary' });

    const response = await request(harness.app).post(`/api/projects/${ajeno.id}/build`);

    expect(response.status).toBe(404);
  });

  it('exige sesion', async () => {
    const harness = createTestHarness({ user: null });

    const response = await request(harness.app).post(
      '/api/projects/00000000-0000-4000-8000-000000000000/build',
    );

    expect(response.status).toBe(401);
  });
});

describe('nombres fisicos', () => {
  // F7 necesita saber a que tabla y columna corresponde cada campo, sin volver a
  // derivar nada de texto escrito por una persona.
  it('se guardan en el blueprint al construir', async () => {
    const harness = withProposal();
    const projectId = await confirmed(harness, 'nombres.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/build`);
    await harness.settled();

    const stored = harness.blueprints.stored.get(projectId)!;
    const clientes = stored.entities.find((entity) => entity.name === 'clientes')!;

    expect(clientes.tableName).toBe('clientes');
    expect(clientes.fields.find((field) => field.name === 'ruc')?.columnName).toBe('ruc');
  });

  it('no se exponen al cliente', async () => {
    const harness = withProposal();
    const projectId = await confirmed(harness, 'nombres-ocultos.xlsx');

    await request(harness.app).post(`/api/projects/${projectId}/build`);
    await harness.settled();

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint`);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('tableName');
    expect(serialized).not.toContain('columnName');
    expect(serialized).not.toContain('proj_');
  });
});
