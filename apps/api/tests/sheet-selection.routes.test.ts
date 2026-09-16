import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import {
  CLIENTES,
  CON_TITULO,
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

interface SheetView {
  id: string;
  name: string;
  included: boolean;
  headerRowIndex: number | null;
  rowCount: number;
  columns: { header: string }[];
}

/** Proyecto con archivo ya subido y analizado. */
async function projectWithFile(
  harness: TestHarness,
  fileName: string,
  sheets: Parameters<typeof writeWorkbook>[2],
): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Proyecto' });
  const projectId = (created.body as { data: { id: string } }).data.id;
  const file = await writeWorkbook(fixtures, fileName, sheets);

  await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
  return projectId;
}

describe('GET /api/projects/:id/sheets', () => {
  it('devuelve las hojas analizadas con su perfil', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'listar.xlsx', [VIAJES, CLIENTES]);

    const response = await request(harness.app).get(`/api/projects/${projectId}/sheets`);

    expect(response.status).toBe(200);

    const body = response.body as { data: { fileName: string; sheets: SheetView[] } };
    expect(body.data.fileName).toBe('listar.xlsx');
    expect(body.data.sheets.map((sheet) => sheet.name)).toEqual(['Viajes', 'Clientes']);
    expect(body.data.sheets[0]?.columns.length).toBe(7);
  });

  it('avisa si todavia no se subio ningun archivo', async () => {
    const harness = createTestHarness();
    const created = await request(harness.app).post('/api/projects').send({ name: 'Vacio' });
    const projectId = (created.body as { data: { id: string } }).data.id;

    const response = await request(harness.app).get(`/api/projects/${projectId}/sheets`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE');
  });

  it('no deja ver las hojas de otra persona', async () => {
    const harness = createTestHarness();
    const ajeno = harness.projects.seed({ ownerId: BOB.id });

    const response = await request(harness.app).get(`/api/projects/${ajeno.id}/sheets`);

    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id/sheets', () => {
  // RF-02 redefinido: no se elige una hoja, se descartan las que sobran.
  it('descarta una hoja y avanza el proyecto', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'descartar.xlsx', [VIAJES, CLIENTES]);

    const before = await request(harness.app).get(`/api/projects/${projectId}/sheets`);
    const clientes = (before.body as { data: { sheets: SheetView[] } }).data.sheets.find(
      (sheet) => sheet.name === 'Clientes',
    )!;

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({ sheets: [{ sheetId: clientes.id, included: false }] });

    expect(response.status).toBe(200);

    const sheets = response.body.data as SheetView[];
    expect(sheets.find((sheet) => sheet.name === 'Viajes')?.included).toBe(true);
    expect(sheets.find((sheet) => sheet.name === 'Clientes')?.included).toBe(false);
    expect(harness.projects.rows[0]?.status).toBe('sheet_selected');
  });

  it('no deja quedarse sin ninguna hoja', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'ninguna.xlsx', [VIAJES]);

    const before = await request(harness.app).get(`/api/projects/${projectId}/sheets`);
    const viajes = (before.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({ sheets: [{ sheetId: viajes.id, included: false }] });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('al menos una hoja');
  });

  // El otro remedio de RE-03: si la deteccion automatica fallo, se corrige.
  it('reanaliza la hoja al corregir la fila de encabezados', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'corregir.xlsx', [CON_TITULO]);

    const before = await request(harness.app).get(`/api/projects/${projectId}/sheets`);
    const sheet = (before.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;
    expect(sheet.headerRowIndex).toBe(3);

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({ sheets: [{ sheetId: sheet.id, headerRowIndex: 0 }] });

    expect(response.status).toBe(200);

    const updated = (response.body.data as SheetView[])[0]!;
    expect(updated.headerRowIndex).toBe(0);
    // Con el titulo como encabezado, la hoja pasa a tener una sola columna.
    expect(updated.columns.map((column) => column.header)).toEqual([
      'REPORTE MENSUAL DE OPERACIONES',
    ]);
  });

  it('rechaza una fila de encabezado que no existe', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'fuera-de-rango.xlsx', [VIAJES]);

    const before = await request(harness.app).get(`/api/projects/${projectId}/sheets`);
    const sheet = (before.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({ sheets: [{ sheetId: sheet.id, headerRowIndex: 900 }] });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('no existe');
  });

  it('rechaza una hoja que no pertenece al proyecto', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'ajena.xlsx', [VIAJES]);

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({
        sheets: [{ sheetId: '00000000-0000-4000-8000-000000000000', included: false }],
      });

    expect(response.status).toBe(404);
  });

  it('deja intacta la hoja excluida por estar vacia', async () => {
    const harness = createTestHarness();
    const projectId = await projectWithFile(harness, 'con-vacia.xlsx', [VIAJES, RESUMEN_VACIO]);

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/sheets`)
      .send({ sheets: [] });

    expect(response.status).toBe(200);

    const sheets = response.body.data as SheetView[];
    expect(sheets.find((sheet) => sheet.name === 'Resumen')?.included).toBe(false);
  });

  it('exige sesion', async () => {
    const harness = createTestHarness({ user: null });

    const response = await request(harness.app)
      .patch('/api/projects/00000000-0000-4000-8000-000000000000/sheets')
      .send({ sheets: [] });

    expect(response.status).toBe(401);
  });
});
