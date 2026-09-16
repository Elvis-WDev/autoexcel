import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import {
  CLIENTES,
  CON_TITULO,
  createFixtureDir,
  ENCABEZADO_CON_HUECO,
  LEGACY_XLS_BYTES,
  RESUMEN_VACIO,
  SIN_ENCABEZADOS,
  sheetWithRows,
  VIAJES,
  writeRaw,
  writeWorkbook,
} from './helpers/xlsx-fixtures.js';

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
});

afterAll(() => undefined);

/** Crea un proyecto y devuelve su identificador. */
async function newProject(harness: TestHarness, name = 'Gestion de Viajes'): Promise<string> {
  const response = await request(harness.app).post('/api/projects').send({ name });
  return (response.body as { data: { id: string } }).data.id;
}

interface SheetView {
  name: string;
  rowCount: number;
  included: boolean;
  issue: string | null;
  headerRowIndex: number | null;
  columns: { header: string; distinct: number; type: string; samples: string[] }[];
}

describe('POST /api/projects/:id/file', () => {
  it('lee TODAS las hojas, no solo una', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'multi.xlsx', [VIAJES, CLIENTES, RESUMEN_VACIO]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(201);

    const sheets = (response.body as { data: { sheets: SheetView[] } }).data.sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Viajes', 'Clientes', 'Resumen']);
  });

  it('perfila cada columna con lo que pide RF-04', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'viajes.xlsx', [VIAJES]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    const sheet = (response.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;
    expect(sheet.rowCount).toBe(5);

    const cliente = sheet.columns.find((column) => column.header === 'Cliente')!;
    // "Comercial Andes", "comercial andes" y " Cliente Norte " colapsan: 2 valores.
    expect(cliente.distinct).toBe(2);
    expect(cliente.samples).toContain('Comercial Andes');

    expect(sheet.columns.find((column) => column.header === 'Valor')?.type).toBe('integer');
    expect(sheet.columns.find((column) => column.header === 'Fecha')?.type).toBe('date');
  });

  // Decision 2 del plan: una pestana de leyenda no puede tumbar la carga entera.
  it('excluye la hoja vacia y sigue con las utiles', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'con-resumen.xlsx', [VIAJES, RESUMEN_VACIO]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(201);

    const sheets = (response.body as { data: { sheets: SheetView[] } }).data.sheets;
    expect(sheets.find((sheet) => sheet.name === 'Viajes')?.included).toBe(true);

    const resumen = sheets.find((sheet) => sheet.name === 'Resumen')!;
    expect(resumen.included).toBe(false);
    expect(resumen.issue).toContain('no contiene datos');
  });

  it('salta las filas de titulo y encuentra el encabezado real', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'titulo.xlsx', [CON_TITULO]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    const sheet = (response.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;
    expect(sheet.headerRowIndex).toBe(3);
    expect(sheet.columns.map((column) => column.header)).toEqual([
      'Producto',
      'Cantidad',
      'Precio',
    ]);
    expect(sheet.rowCount).toBe(3);
  });

  it('rellena los huecos del encabezado sin desalinear las columnas', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'huecos.xlsx', [ENCABEZADO_CON_HUECO]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    const sheet = (response.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;
    expect(sheet.columns.map((column) => column.header)).toEqual(['Cliente', 'Columna 2', 'Total']);
  });

  // RE-02 y RE-03 a nivel de archivo: si ninguna hoja sirve, no se sigue.
  it('rechaza el archivo cuando ninguna hoja es utilizable', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'inservible.xlsx', [SIN_ENCABEZADOS, RESUMEN_VACIO]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('nombres de las columnas');
  });

  it('deja el proyecto en uploaded tras una carga correcta', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'estado.xlsx', [VIAJES]);

    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);

    expect(harness.projects.rows[0]?.status).toBe('uploaded');
  });
});

describe('validacion del archivo subido', () => {
  it('rechaza un archivo que no es un xlsx aunque se llame .xlsx', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeRaw(fixtures, 'mentira.xlsx', Buffer.from('esto no es un excel'));

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_FILE');
  });

  // Distinguir el .xls antiguo permite decir algo accionable.
  it('reconoce el formato .xls antiguo y explica que hacer', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeRaw(fixtures, 'antiguo.xlsx', LEGACY_XLS_BYTES);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(415);
    expect(response.body.error.message).toContain('.xls');
    expect(response.body.error.message).toContain('guardalo como .xlsx');
  });

  it('rechaza una extension distinta de .xlsx', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeRaw(fixtures, 'datos.csv', Buffer.from('a,b,c'));

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(415);
  });

  it('rechaza un archivo que supera el limite de tamano', async () => {
    const harness = createTestHarness({ maxUploadBytes: 1024 });
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'grande.xlsx', [sheetWithRows('Datos', 2000)]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('exige que venga un archivo', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);

    const response = await request(harness.app).post(`/api/projects/${projectId}/file`);

    expect(response.status).toBe(400);
  });

  it('exige sesion', async () => {
    const harness = createTestHarness({ user: null });
    const file = await writeWorkbook(fixtures, 'sin-sesion.xlsx', [VIAJES]);

    const response = await request(harness.app)
      .post('/api/projects/00000000-0000-4000-8000-000000000000/file')
      .attach('file', file);

    expect(response.status).toBe(401);
  });

  it('no deja subir al proyecto de otra persona', async () => {
    const harness = createTestHarness();
    const ajeno = harness.projects.seed({ ownerId: BOB.id });
    const file = await writeWorkbook(fixtures, 'ajeno.xlsx', [VIAJES]);

    const response = await request(harness.app)
      .post(`/api/projects/${ajeno.id}/file`)
      .attach('file', file);

    expect(response.status).toBe(404);
  });
});

describe('limpieza de archivos', () => {
  // Un archivo rechazado que se queda en disco es una fuga silenciosa.
  it('no deja el archivo en disco cuando la ingesta falla', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'a-borrar.xlsx', [SIN_ENCABEZADOS]);

    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);

    const stored = await readdir(join(harness.storageDir, 'uploads'));
    expect(stored).toEqual([]);
  });

  it('conserva el archivo cuando la ingesta va bien', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'a-conservar.xlsx', [VIAJES]);

    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);

    const stored = await readdir(join(harness.storageDir, 'uploads'));
    expect(stored).toHaveLength(1);
  });

  // Volver a subir deja el proyecto como si fuera la primera vez.
  it('sustituye el archivo anterior al volver a subir', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);

    const primero = await writeWorkbook(fixtures, 'primero.xlsx', [VIAJES]);
    await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', primero);

    const segundo = await writeWorkbook(fixtures, 'segundo.xlsx', [CLIENTES]);
    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', segundo);

    expect(response.status).toBe(201);

    const stored = await readdir(join(harness.storageDir, 'uploads'));
    expect(stored).toHaveLength(1);

    const sheets = (response.body as { data: { sheets: SheetView[] } }).data.sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Clientes']);
  });

  it('no guarda el nombre original como ruta en disco', async () => {
    const harness = createTestHarness();
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'normal.xlsx', [VIAJES]);

    await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file, { filename: '../../../etc/passwd.xlsx' });

    const stored = await readdir(join(harness.storageDir, 'uploads'));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^[0-9a-f]{32}\.xlsx$/);

    // El nombre que trajo el archivo se conserva, pero solo como etiqueta.
    expect(harness.sourceFiles.files[0]?.originalName).toContain('passwd');
  });
});

describe('topes de lectura', () => {
  // Un xlsx es un ZIP: unos kilobytes pueden expandirse a millones de celdas.
  it('corta la lectura al llegar al tope de filas y lo avisa', async () => {
    const harness = createTestHarness({ limits: { maxRowsPerSheet: 50 } });
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'tope.xlsx', [sheetWithRows('Datos', 500)]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(201);

    const sheet = (response.body as { data: { sheets: SheetView[] } }).data.sheets[0]!;
    expect(sheet.rowCount).toBeLessThanOrEqual(50);
    expect(sheet.issue).toContain('primeras filas');
    // Truncada pero utilizable: el aviso es para la persona, no un descarte.
    expect(sheet.included).toBe(true);
  });

  // La defensa real contra el zip bomb: el ZIP declara cuanto ocupa una vez
  // abierto, y eso se comprueba ANTES de parsear nada.
  it('rechaza un archivo que se expandiria por encima del techo', async () => {
    const harness = createTestHarness({ maxUncompressedBytes: 4096 });
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'expansivo.xlsx', [sheetWithRows('Datos', 3000)]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status).toBe(413);
    expect(response.body.error.message).toContain('una vez abierto');
  });

  it('corta al llegar al tope de hojas', async () => {
    const harness = createTestHarness({ limits: { maxSheets: 2 } });
    const projectId = await newProject(harness);
    const file = await writeWorkbook(fixtures, 'muchas.xlsx', [
      { ...VIAJES, name: 'A' },
      { ...VIAJES, name: 'B' },
      { ...VIAJES, name: 'C' },
      { ...VIAJES, name: 'D' },
    ]);

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/file`)
      .attach('file', file);

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const sheets = (response.body as { data: { sheets: SheetView[] } }).data.sheets;
    expect(sheets).toHaveLength(2);
  });
});
