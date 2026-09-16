import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import { createScriptedProposer } from './helpers/scripted-proposer.js';
import { BOB, createTestHarness, type TestHarness } from './helpers/test-app.js';
import { createFixtureDir, writeWorkbook, type FixtureSheet } from './helpers/xlsx-fixtures.js';

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
});

afterAll(() => undefined);

const VIAJES: FixtureSheet = {
  name: 'Viajes',
  rows: [
    ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Estado'],
    ...Array.from({ length: 12 }, (_, i) => [
      `0${(i % 9) + 1}/09/26`,
      i % 3 === 0 ? 'Comercial Andes' : i % 3 === 1 ? 'Cliente Norte' : 'Distribuidora Sur',
      i % 3 === 0 ? '123' : i % 3 === 1 ? '456' : '789',
      `V-${i}`,
      i % 2 ? 'Cerrado' : 'Abierto',
    ]),
  ],
};

function blueprint(): ProposedBlueprint {
  return {
    applicationName: 'Gestion de Viajes',
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
          {
            name: 'ruc',
            label: 'RUC',
            type: 'text',
            required: false,
            source: { sheetIndex: 0, columnIndex: 2 },
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
            source: { sheetIndex: 0, columnIndex: 3 },
          },
          {
            name: 'estado',
            label: 'Estado',
            type: 'select',
            required: false,
            options: ['Abierto', 'Cerrado'],
            source: { sheetIndex: 0, columnIndex: 4 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };
}

/**
 * Deja un proyecto con la aplicacion creada y algunos registros dentro.
 *
 * Los registros se siembran en el repositorio de la aplicacion generada, que es
 * lo que el CRUD consulta. La importacion tiene sus propios tests en F6.
 */
async function readyApp(
  harness: TestHarness,
  fileName: string,
): Promise<{ projectId: string; clienteId: string }> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, [VIAJES]);
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

  const clienteId = harness.records.seed('clientes', {
    nombre: 'Comercial Andes',
    ruc: '123',
  });
  harness.records.seed('clientes', { nombre: 'Cliente Norte', ruc: '456' });

  harness.records.seed('viajes', {
    fecha: '2026-09-01',
    cliente: clienteId,
    vehiculo: 'ABC-123',
    estado: 'Cerrado',
  });

  return { projectId, clienteId };
}

function harnessWith(): TestHarness {
  return createTestHarness({ proposer: createScriptedProposer({ first: blueprint() }) });
}

interface ManifestView {
  applicationName: string;
  navigation: { name: string; label: string }[];
  entities: {
    name: string;
    label: string;
    displayField: string;
    fields: { name: string; label: string; type: string; relatedTo: string | null }[];
  }[];
}

interface RecordView {
  id: string;
  values: Record<string, unknown>;
  related: Record<string, string | null>;
}

describe('GET /api/projects/:id/app (RF-22)', () => {
  it('devuelve la navegacion y la estructura de cada modulo', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'manifiesto.xlsx');

    const response = await request(harness.app).get(`/api/projects/${projectId}/app`);

    expect(response.status).toBe(200);

    const manifest = (response.body as { data: ManifestView }).data;
    expect(manifest.applicationName).toBe('Gestion de Viajes');
    expect(manifest.navigation.map((item) => item.label)).toEqual(['Clientes', 'Viajes']);

    const viajes = manifest.entities.find((entity) => entity.name === 'viajes')!;
    expect(viajes.displayField).toBe('vehiculo');
    expect(viajes.fields.find((field) => field.name === 'cliente')?.relatedTo).toBe('clientes');
  });

  // Technical Information Boundary: los nombres fisicos no salen nunca.
  it('no expone nombres de tabla ni de columna', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'manifiesto-limpio.xlsx');

    const response = await request(harness.app).get(`/api/projects/${projectId}/app`);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('tableName');
    expect(serialized).not.toContain('columnName');
    expect(serialized).not.toContain('proj_');
    expect(serialized).not.toContain('__dedupe_key');
  });

  it('avisa si la aplicacion todavia no se ha creado', async () => {
    const harness = harnessWith();
    const created = await request(harness.app).post('/api/projects').send({ name: 'Nuevo' });
    const projectId = (created.body as { data: { id: string } }).data.id;

    const response = await request(harness.app).get(`/api/projects/${projectId}/app`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('todavia no esta lista');
  });

  it('no deja abrir la aplicacion de otra persona', async () => {
    const harness = harnessWith();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'completed' });

    const response = await request(harness.app).get(`/api/projects/${ajeno.id}/app`);

    expect(response.status).toBe(404);
  });
});

describe('GET .../records (RF-14)', () => {
  it('lista los registros con paginacion', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'listar.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records`,
    );

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({ total: 2, limit: 25, offset: 0 });
    expect(response.body.meta.entity).toBe('Clientes');
  });

  /**
   * RF-17 en la lista: "El usuario no debera escribir manualmente
   * identificadores internos". Tampoco deberia tener que leerlos.
   */
  it('muestra la etiqueta del registro relacionado, no su identificador', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'relacion.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/viajes/records`,
    );

    const viaje = (response.body as { data: RecordView[] }).data[0]!;

    expect(viaje.related['cliente']).toBe('Comercial Andes');
    // El identificador sigue disponible para el formulario, pero no es lo que
    // se muestra.
    expect(viaje.values['cliente']).toBe(clienteId);
  });

  it('busca por el campo que representa al registro', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'buscar.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records?q=norte`,
    );

    expect(response.body.meta.total).toBe(1);
    expect((response.body as { data: RecordView[] }).data[0]?.values['nombre']).toBe(
      'Cliente Norte',
    );
  });

  /**
   * Buscar solo en la columna mostrada seria una trampa: en Viajes, cuya
   * etiqueta es el vehiculo, escribir el nombre de un cliente no encontraria
   * nada y la persona concluiria que ese viaje no existe.
   */
  it('busca tambien en las demas columnas de texto', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'buscar-ancho.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records?q=456`,
    );

    // "456" esta en el RUC, no en el nombre.
    expect(response.body.meta.total).toBe(1);
    expect((response.body as { data: RecordView[] }).data[0]?.values['nombre']).toBe(
      'Cliente Norte',
    );
  });

  it('ordena por el campo indicado', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'ordenar.xlsx');

    const ascending = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records?sort=nombre&dir=asc`,
    );
    const descending = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records?sort=nombre&dir=desc`,
    );

    const first = (ascending.body as { data: RecordView[] }).data[0]?.values['nombre'];
    const last = (descending.body as { data: RecordView[] }).data[0]?.values['nombre'];

    expect(first).toBe('Cliente Norte');
    expect(last).toBe('Comercial Andes');
  });

  // ADR 0001: el valor de la URL se RESUELVE, nunca se compone.
  it('responde 404 ante un modulo inventado, incluso hostil', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'hostil.xlsx');

    for (const name of ['inventado', 'x%22;DROP%20SCHEMA%20public;--']) {
      const response = await request(harness.app).get(
        `/api/projects/${projectId}/app/${name}/records`,
      );
      expect(response.status, name).toBe(404);
    }
  });

  it('rechaza una paginacion fuera de rango', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'paginacion.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/records?limit=9999`,
    );

    expect(response.status).toBe(400);
  });
});

describe('GET .../options (RF-17)', () => {
  it('devuelve opciones legibles para el selector', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'opciones.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/options`,
    );

    expect(response.status).toBe(200);

    const options = (response.body as { data: { id: string; label: string }[] }).data;
    expect(options.map((option) => option.label)).toEqual(['Cliente Norte', 'Comercial Andes']);
  });

  // Un selector sobre diez mil clientes no puede cargarse entero.
  it('busca y acota la cantidad', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'opciones-busqueda.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/clientes/options?q=andes&limit=5`,
    );

    const options = (response.body as { data: { label: string }[] }).data;
    expect(options).toHaveLength(1);
    expect(options[0]?.label).toBe('Comercial Andes');
  });
});

describe('POST .../records (RF-15, RF-23)', () => {
  it('crea un registro despues de importar', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'crear.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({
        fecha: '2026-10-01',
        cliente: clienteId,
        vehiculo: 'NUEVO-1',
        estado: 'Abierto',
      });

    expect(response.status).toBe(201);

    const created = (response.body as { data: RecordView }).data;
    expect(created.values['vehiculo']).toBe('NUEVO-1');
    expect(created.related['cliente']).toBe('Comercial Andes');
  });

  // RF-23: los nuevos registros respetan la obligatoriedad configurada.
  it('exige los campos obligatorios', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'obligatorio.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({ cliente: clienteId, vehiculo: 'SIN-FECHA' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Fecha');
  });

  it('exige que el tipo del valor corresponda al campo', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'tipo.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({ fecha: 'el martes', cliente: clienteId, vehiculo: 'X' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('AAAA-MM-DD');
  });

  it('solo admite los valores de una seleccion', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'seleccion.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({
        fecha: '2026-10-01',
        cliente: clienteId,
        vehiculo: 'X',
        estado: 'Inventado',
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('Abierto, Cerrado');
  });

  // La clave foranea: no se puede apuntar a un cliente que no existe.
  it('rechaza una relacion que apunta a la nada', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'relacion-rota.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({
        fecha: '2026-10-01',
        cliente: '00000000-0000-4000-8000-000000000000',
        vehiculo: 'X',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('Elige uno de la lista');
  });

  it('rechaza un campo que no existe', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'campo-extra.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/app/viajes/records`)
      .send({ fecha: '2026-10-01', cliente: clienteId, inventado: 'x' });

    expect(response.status).toBe(400);
  });
});

describe('GET y PATCH de un registro (RF-16, RF-24)', () => {
  it('abre un registro importado y lo modifica', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'editar.xlsx');

    const list = await request(harness.app).get(`/api/projects/${projectId}/app/viajes/records`);
    const recordId = (list.body as { data: RecordView[] }).data[0]!.id;

    const opened = await request(harness.app).get(
      `/api/projects/${projectId}/app/viajes/records/${recordId}`,
    );
    expect(opened.status).toBe(200);
    expect((opened.body as { data: RecordView }).data.values['vehiculo']).toBe('ABC-123');

    const updated = await request(harness.app)
      .patch(`/api/projects/${projectId}/app/viajes/records/${recordId}`)
      .send({ vehiculo: 'ABC-999' });

    expect(updated.status).toBe(200);
    expect((updated.body as { data: RecordView }).data.values['vehiculo']).toBe('ABC-999');
  });

  // Una edicion parcial no puede borrar lo que no se envio.
  it('conserva los campos que no vienen en la edicion', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'parcial.xlsx');

    const list = await request(harness.app).get(`/api/projects/${projectId}/app/viajes/records`);
    const recordId = (list.body as { data: RecordView[] }).data[0]!.id;

    const updated = await request(harness.app)
      .patch(`/api/projects/${projectId}/app/viajes/records/${recordId}`)
      .send({ vehiculo: 'SOLO-ESTE' });

    const values = (updated.body as { data: RecordView }).data.values;
    expect(values['vehiculo']).toBe('SOLO-ESTE');
    expect(values['fecha']).toBe('2026-09-01');
    expect(values['estado']).toBe('Cerrado');
  });

  it('responde 404 ante un registro que no existe', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'registro-inexistente.xlsx');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/app/viajes/records/00000000-0000-4000-8000-000000000000`,
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE de un registro', () => {
  it('elimina un registro sin dependencias', async () => {
    const harness = harnessWith();
    const { projectId } = await readyApp(harness, 'borrar.xlsx');

    const list = await request(harness.app).get(`/api/projects/${projectId}/app/viajes/records`);
    const recordId = (list.body as { data: RecordView[] }).data[0]!.id;

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/app/viajes/records/${recordId}`,
    );

    expect(response.status).toBe(204);
  });

  /**
   * `ON DELETE RESTRICT` traducido: quien borra un cliente con viajes necesita
   * entender por que no se puede y con que modulo choca. RX-03.
   */
  it('explica por que no se puede borrar un registro del que otros dependen', async () => {
    const harness = harnessWith();
    const { projectId, clienteId } = await readyApp(harness, 'borrar-dependiente.xlsx');

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/app/clientes/records/${clienteId}`,
    );

    expect(response.status).toBe(409);
    const message = (response.body as { error: { message: string } }).error.message;

    expect(message).toBe('No se puede eliminar este registro porque Viajes depende de el.');

    for (const jargon of ['foreign key', 'constraint', 'violates', 'SQL']) {
      expect(message.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });
});

describe('aislamiento', () => {
  it('no deja tocar los registros de otra persona', async () => {
    const harness = harnessWith();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'completed' });

    const response = await request(harness.app).get(
      `/api/projects/${ajeno.id}/app/clientes/records`,
    );

    expect(response.status).toBe(404);
  });

  it('exige sesion', async () => {
    const harness = createTestHarness({ user: null });

    const response = await request(harness.app).get(
      '/api/projects/00000000-0000-4000-8000-000000000000/app',
    );

    expect(response.status).toBe(401);
  });
});
