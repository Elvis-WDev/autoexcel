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

interface FieldView {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string[] | null;
  relatedTo: string | null;
}

interface EntityView {
  name: string;
  label: string;
  derived: boolean;
  displayField: string | null;
  dedupeField: string | null;
  fields: FieldView[];
}

interface BlueprintView {
  applicationName: string;
  entities: EntityView[];
  relations: { description: string; fromName: string; through: string }[];
}

interface SummaryView {
  applicationName: string;
  totals: { entities: number; fields: number; relations: number };
  entities: { label: string; fields: string[] }[];
  relations: string[];
  confirmed: boolean;
}

/** Proyecto analizado y listo para revisar. */
async function analyzed(harness: TestHarness, fileName: string): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, [VIAJES, CLIENTES, RESUMEN_VACIO]);
  await request(harness.app).post(`/api/projects/${projectId}/file`).attach('file', file);
  await request(harness.app).patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
  await request(harness.app).post(`/api/projects/${projectId}/analyze`);
  await harness.settled();

  return projectId;
}

function withProposal(): TestHarness {
  return createTestHarness({
    proposer: createScriptedProposer({ first: viajesBlueprint() }),
  });
}

function entity(body: unknown, name: string): EntityView {
  return (body as { data: BlueprintView }).data.entities.find((item) => item.name === name)!;
}

describe('PATCH /api/projects/:id/blueprint', () => {
  it('cambia el nombre de la aplicacion', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'nombre.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint`)
      .send({ applicationName: '  Logistica Andes  ' });

    expect(response.status).toBe(200);
    expect((response.body as { data: BlueprintView }).data.applicationName).toBe('Logistica Andes');
  });

  it('rechaza un nombre vacio', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'nombre-vacio.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint`)
      .send({ applicationName: '   ' });

    expect(response.status).toBe(400);
  });
});

describe('revision de entidades (RF-06)', () => {
  it('renombra una entidad sin cambiar su direccion', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'renombrar.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
      .send({ label: 'Empresas' });

    expect(response.status).toBe(200);

    const updated = entity(response.body, 'clientes');
    expect(updated.label).toBe('Empresas');
    // El identificador sigue siendo el mismo: renombrar no rompe las referencias.
    expect(updated.name).toBe('clientes');
  });

  /**
   * RI-06 literal: "si el usuario decide mantener `Producto` dentro de `Ventas`,
   * la decision del usuario prevalece". Eliminar el grupo no puede perder el dato.
   */
  it('al eliminar una entidad, los campos que la referenciaban conservan su valor', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'eliminar.xlsx');

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/clientes`,
    );

    expect(response.status).toBe(200);

    const body = response.body as { data: BlueprintView; meta: { notes: string[] } };
    expect(body.data.entities.map((item) => item.name)).toEqual(['viajes']);

    // El campo "Cliente" de Viajes sigue existiendo, ya no como relacion.
    const cliente = entity(response.body, 'viajes').fields.find(
      (field) => field.name === 'cliente',
    )!;
    expect(cliente).toBeDefined();
    expect(cliente.type).not.toBe('relation');
    expect(cliente.relatedTo).toBeNull();

    expect(body.data.relations).toEqual([]);
    expect(body.meta.notes.join(' ')).toContain('guardar el texto directamente');
  });

  it('no deja quedarse sin ninguna entidad', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'ultima.xlsx');

    await request(harness.app).delete(`/api/projects/${projectId}/blueprint/entities/clientes`);
    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/viajes`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('al menos un grupo');
  });

  it('responde 404 ante una entidad que no existe', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'inexistente.xlsx');

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/inventada`,
    );

    expect(response.status).toBe(404);
  });

  it('elige que campo representa al registro', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'mostrar.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
      .send({ displayField: 'ruc' });

    expect(response.status).toBe(200);
    expect(entity(response.body, 'clientes').displayField).toBe('ruc');
  });

  // RF-17: un selector tiene que mostrar algo reconocible.
  it('no acepta un campo inservible para identificar el registro', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'mostrar-malo.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/viajes`)
      .send({ displayField: 'cliente' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('identificar');
  });
});

describe('clave de deduplicacion (decision 3 del plan)', () => {
  it('permite elegirla', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'clave.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
      .send({ dedupeField: 'ruc' });

    expect(response.status).toBe(200);
    expect(entity(response.body, 'clientes').dedupeField).toBe('ruc');
  });

  // RX-06: no ocultar decisiones importantes. Elegir una columna con valores
  // repetidos fusiona registros, y eso hay que decirlo. `Vehiculo` tiene dos
  // valores distintos en cinco filas: agrupar por ahi colapsaria los viajes.
  it('avisa si la clave elegida fusionara registros', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'clave-repetida.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/viajes`)
      .send({ dedupeField: 'vehiculo' });

    expect(response.status).toBe(200);
    expect((response.body as { meta: { notes: string[] } }).meta.notes.join(' ')).toContain(
      'se fusionaran',
    );
  });
});

describe('revision de campos (RF-09)', () => {
  it('cambia la etiqueta y la obligatoriedad', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'campo.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes/fields/ruc`)
      .send({ label: 'Identificacion fiscal', required: true });

    expect(response.status).toBe(200);

    const field = entity(response.body, 'clientes').fields.find((item) => item.name === 'ruc')!;
    expect(field.label).toBe('Identificacion fiscal');
    expect(field.required).toBe(true);
  });

  it('cambia el tipo de un campo', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'tipo.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes/fields/ciudad`)
      .send({ type: 'select' });

    expect(response.status).toBe(200);

    const field = entity(response.body, 'clientes').fields.find((item) => item.name === 'ciudad')!;
    expect(field.type).toBe('select');
    // Las opciones se recuperan del archivo: un select vacio no sirve de nada.
    expect(field.options).toEqual(expect.arrayContaining(['Quito']));
  });

  // Convertir un texto en relacion no es cambiar un tipo: es decidir que existe
  // otra entidad y con que clave se agrupa.
  it('no deja convertir un campo normal en relacion', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'a-relacion.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/clientes/fields/ciudad`)
      .send({ type: 'relation' });

    expect(response.status).toBe(400);
  });

  it('no deja convertir una relacion en campo normal por la via del tipo', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'de-relacion.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/entities/viajes/fields/cliente`)
      .send({ type: 'text' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('rechaza primero esa relacion');
  });

  it('elimina un campo', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'borrar-campo.xlsx');

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/clientes/fields/ciudad`,
    );

    expect(response.status).toBe(200);
    expect(entity(response.body, 'clientes').fields.map((field) => field.name)).not.toContain(
      'ciudad',
    );
  });

  // El validador repone el campo mostrado en vez de rechazar la edicion.
  it('elige otro campo para mostrar si se borra el que lo era', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'borrar-mostrado.xlsx');

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/clientes/fields/nombre`,
    );

    expect(response.status).toBe(200);

    const updated = entity(response.body, 'clientes');
    expect(updated.displayField).not.toBeNull();
    expect(updated.fields.map((field) => field.name)).toContain(updated.displayField!);
  });

  it('no deja una entidad sin campos', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'sin-campos.xlsx');

    for (const field of ['ruc', 'correo', 'telefono', 'ciudad']) {
      await request(harness.app).delete(
        `/api/projects/${projectId}/blueprint/entities/clientes/fields/${field}`,
      );
    }

    const response = await request(harness.app).delete(
      `/api/projects/${projectId}/blueprint/entities/clientes/fields/nombre`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('al menos un campo');
  });

  it('agrega un campo que no venia del archivo', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'agregar.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/blueprint/entities/clientes/fields`)
      .send({ label: 'Notas internas', type: 'text' });

    expect(response.status).toBe(200);

    const field = entity(response.body, 'clientes').fields.find(
      (item) => item.name === 'notas_internas',
    );
    expect(field?.label).toBe('Notas internas');
  });

  // No hay de donde sacar ese dato para las filas que ya existen.
  it('no deja que un campo nuevo sea obligatorio, y lo explica', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'agregar-obligatorio.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/blueprint/entities/clientes/fields`)
      .send({ label: 'Cupo', type: 'integer', required: true });

    expect(response.status).toBe(200);

    const field = entity(response.body, 'clientes').fields.find((item) => item.name === 'cupo')!;
    expect(field.required).toBe(false);
    expect((response.body as { meta: { notes: string[] } }).meta.notes.join(' ')).toContain(
      'no puede ser obligatorio',
    );
  });
});

describe('confirmacion de relaciones (RF-11)', () => {
  it('rechazar una relacion conserva el campo y la entidad', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'rechazar.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/relations/viajes/cliente`)
      .send({ accepted: false });

    expect(response.status).toBe(200);

    const body = response.body as { data: BlueprintView };
    expect(body.data.relations).toEqual([]);
    // La entidad Clientes sigue existiendo: puede tener sentido por su cuenta.
    expect(body.data.entities.map((item) => item.name)).toContain('clientes');

    const field = entity(response.body, 'viajes').fields.find((item) => item.name === 'cliente')!;
    expect(field.type).not.toBe('relation');
  });

  it('aceptar una relacion la deja como estaba', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'aceptar.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/relations/viajes/cliente`)
      .send({ accepted: true });

    expect(response.status).toBe(200);
    expect((response.body as { data: BlueprintView }).data.relations).toHaveLength(1);
  });

  it('responde 400 si el campo no es una relacion', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'no-relacion.xlsx');

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint/relations/viajes/valor`)
      .send({ accepted: false });

    expect(response.status).toBe(400);
  });
});

describe('resumen y confirmacion (RF-12, RX-07)', () => {
  it('el resumen cuenta lo que se va a crear', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'resumen.xlsx');

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint/summary`);

    expect(response.status).toBe(200);

    const summary = (response.body as { data: SummaryView }).data;
    expect(summary.totals).toEqual({ entities: 2, fields: 11, relations: 1 });
    expect(summary.entities.map((item) => item.label)).toEqual(['Clientes', 'Viajes']);
    expect(summary.relations[0]).toContain('pertenece a un cliente');
    expect(summary.confirmed).toBe(false);
  });

  // En el ultimo paso antes de crear se lee lo que va a existir, no un esquema.
  it('el resumen no expone tipos ni nombres internos', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'resumen-limpio.xlsx');

    const response = await request(harness.app).get(`/api/projects/${projectId}/blueprint/summary`);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('"type"');
    expect(serialized).not.toContain('sourceColumnIndex');
    expect(serialized).not.toContain('proj_');
  });

  it('exige llegar al paso de resumen antes de confirmar', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'confirmar-pronto.xlsx');

    const response = await request(harness.app).post(
      `/api/projects/${projectId}/blueprint/confirm`,
    );

    expect(response.status).toBe(409);
  });

  it('confirma y congela la estructura', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'confirmar.xlsx');

    for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
      await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
    }

    const response = await request(harness.app).post(
      `/api/projects/${projectId}/blueprint/confirm`,
    );

    expect(response.status).toBe(200);
    expect((response.body as { data: SummaryView }).data.confirmed).toBe(true);
  });

  it('una vez confirmada, la estructura ya no se edita', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'congelada.xlsx');

    for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
      await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
    }
    await request(harness.app).post(`/api/projects/${projectId}/blueprint/confirm`);

    const response = await request(harness.app)
      .patch(`/api/projects/${projectId}/blueprint`)
      .send({ applicationName: 'Otro nombre' });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('Ya confirmaste');
  });
});

describe('navegacion entre pasos (RX-04)', () => {
  it('permite avanzar y volver atras', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'navegar.xlsx');

    const forward = await request(harness.app)
      .post(`/api/projects/${projectId}/step`)
      .send({ to: 'reviewing_fields' });
    expect(forward.body.data.status).toBe('reviewing_fields');

    const back = await request(harness.app)
      .post(`/api/projects/${projectId}/step`)
      .send({ to: 'reviewing_entities' });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe('reviewing_entities');
  });

  it('no deja saltarse pasos', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'saltar.xlsx');

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/step`)
      .send({ to: 'reviewing_summary' });

    expect(response.status).toBe(409);
  });

  // Se llega ejecutando el trabajo de construccion, no pulsando "siguiente".
  it('no deja alcanzar la creacion desde el asistente', async () => {
    const harness = withProposal();
    const projectId = await analyzed(harness, 'crear-a-mano.xlsx');

    for (const step of ['reviewing_fields', 'reviewing_relations', 'reviewing_summary']) {
      await request(harness.app).post(`/api/projects/${projectId}/step`).send({ to: step });
    }

    const response = await request(harness.app)
      .post(`/api/projects/${projectId}/step`)
      .send({ to: 'creating' });

    expect(response.status).toBe(409);
  });
});

describe('aislamiento', () => {
  it('no deja editar el blueprint de otra persona', async () => {
    const harness = withProposal();
    const ajeno = harness.projects.seed({ ownerId: BOB.id, status: 'reviewing_entities' });

    const response = await request(harness.app)
      .patch(`/api/projects/${ajeno.id}/blueprint`)
      .send({ applicationName: 'Secuestrado' });

    expect(response.status).toBe(404);
  });

  it('exige sesion', async () => {
    const harness = createTestHarness({ user: null });

    const response = await request(harness.app)
      .patch('/api/projects/00000000-0000-4000-8000-000000000000/blueprint')
      .send({ applicationName: 'X' });

    expect(response.status).toBe(401);
  });
});
