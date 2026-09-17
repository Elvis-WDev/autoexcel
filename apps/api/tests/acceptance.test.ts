import request from 'supertest';
import type { Response } from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { RuntimeApplication } from '../src/domain/runtime/application.js';
import { adoptImportedRecords } from './helpers/adopt-imported.js';
import { demoBlueprint, demoWorkbook } from './helpers/demo-fixture.js';
import { createScriptedProposer } from './helpers/scripted-proposer.js';
import { createTestHarness, type TestHarness } from './helpers/test-app.js';
import { createFixtureDir, writeWorkbook } from './helpers/xlsx-fixtures.js';

/**
 * Los 18 criterios de aceptacion del ERS 17, con el archivo del ERS 18.
 *
 * Este test existe para responder una sola pregunta —"esta terminado el
 * backend?"— sin que nadie tenga que abrir Postman. Recorre el flujo entero por
 * HTTP, de subir el archivo a editar un registro importado, y cada criterio es
 * un caso con su nombre, para que al fallar diga cual se rompio.
 *
 * El recorrido ocurre una sola vez, en `beforeAll`, y los casos afirman sobre lo
 * que devolvio. No es por velocidad: es porque el orden importa. Editar el
 * modelo despues de confirmarlo tiene que fallar —y falla, con 409—, asi que la
 * revision se ejercita cuando toca revisar y no despues.
 *
 * Dos aclaraciones sobre su alcance, porque un test de aceptacion que promete de
 * mas es peor que no tenerlo:
 *
 *   - La propuesta se inyecta con el motor guionizado. Lo que se verifica aqui
 *     es el SISTEMA: que dada una propuesta valida, todo lo demas ocurre. Que la
 *     propuesta que sale del modelo real sea buena es otra pregunta, y se
 *     responde a mano siguiendo `docs/quality/inference-manual-check.md`.
 *   - Corre sobre los dobles del plano de datos, no sobre PostgreSQL. El mismo
 *     recorrido contra la base real esta en `scripts/acceptance-live.mjs`.
 */

interface Flow {
  harness: TestHarness;
  projectId: string;
  sheets: Response;
  blueprint: Response;
  renamed: Response;
  restored: Response;
  accepted: Response[];
  summary: Response;
  confirmed: Response;
  job: Response;
  failures: Response;
  manifest: Response;
  application: RuntimeApplication;
}

let flow: Flow;

beforeAll(async () => {
  const fixtures = await createFixtureDir();
  const file = await writeWorkbook(fixtures, 'viajes.xlsx', demoWorkbook());

  const harness = createTestHarness({
    proposer: createScriptedProposer({ first: demoBlueprint() }),
  });
  const api = request(harness.app);

  // CA-01: cargar el archivo.
  const created = await api.post('/api/projects').send({ name: 'Gestion de Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;
  await api.post(`/api/projects/${projectId}/file`).attach('file', file);

  // CA-02: lo que el sistema entendio del archivo.
  const sheets = await api.get(`/api/projects/${projectId}/sheets`);
  await api.patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

  // CA-03 y CA-04: la propuesta.
  await api.post(`/api/projects/${projectId}/analyze`);
  await harness.settled();

  const blueprint = await api.get(`/api/projects/${projectId}/blueprint`);

  // CA-05: revisar es poder cambiar lo propuesto, y poder deshacerlo.
  await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_fields' });

  const renamed = await api
    .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
    .send({ label: 'Empresas' });
  const restored = await api
    .patch(`/api/projects/${projectId}/blueprint/entities/clientes`)
    .send({ label: 'Clientes' });

  // CA-06: aceptar las relaciones, una por una.
  await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_relations' });

  const accepted: Response[] = [];
  for (const field of ['cliente', 'vehiculo', 'conductor']) {
    accepted.push(
      await api
        .patch(`/api/projects/${projectId}/blueprint/relations/viajes/${field}`)
        .send({ accepted: true }),
    );
  }

  // CA-07: el resumen antes de crear nada.
  await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_summary' });
  const summary = await api.get(`/api/projects/${projectId}/blueprint/summary`);

  // CA-08 en adelante: crear la aplicacion e importar.
  const confirmed = await api.post(`/api/projects/${projectId}/blueprint/confirm`);
  const build = await api.post(`/api/projects/${projectId}/build`);
  const jobId = (build.body as { data: { id: string } }).data.id;
  await harness.settled();

  const job = await api.get(`/api/projects/${projectId}/jobs/${jobId}`);
  const failures = await api.get(`/api/projects/${projectId}/jobs/${jobId}/errors`);
  const manifest = await api.get(`/api/projects/${projectId}/app`);

  // Lo que la importacion escribio es lo que el CRUD tiene que ver.
  const application = adoptImportedRecords(harness, projectId);

  flow = {
    harness,
    projectId,
    sheets,
    blueprint,
    renamed,
    restored,
    accepted,
    summary,
    confirmed,
    job,
    failures,
    manifest,
    application,
  };
});

function api(): request.Agent {
  return request(flow.harness.app);
}

function url(suffix: string): string {
  return `/api/projects/${flow.projectId}${suffix}`;
}

function data<T>(response: Response): T {
  return (response.body as { data: T }).data;
}

interface SheetView {
  name: string;
  included: boolean;
  columns: { header: string; distinct: number; type: string }[];
}

interface BlueprintView {
  entities: {
    name: string;
    label: string;
    fields: { name: string; label: string; type: string; relatedTo: string | null }[];
  }[];
  relations: { description: string; from: string; to: string; fromName: string; through: string }[];
}

interface SummaryView {
  applicationName: string;
  totals: { entities: number; fields: number; relations: number };
  entities: { label: string; fields: string[] }[];
  relations: string[];
  confirmed: boolean;
}

interface ManifestView {
  applicationName: string;
  navigation: { name: string; label: string }[];
  entities: {
    name: string;
    label: string;
    displayField: string;
    fields: {
      name: string;
      label: string;
      type: string;
      required: boolean;
      options: string[] | null;
      relatedTo: string | null;
    }[];
  }[];
}

interface RecordView {
  id: string;
  values: Record<string, unknown>;
  related: Record<string, string | null>;
}

describe('Criterios de aceptacion del MVP (ERS 17)', () => {
  it('CA-01: el usuario carga un Excel tabular valido', () => {
    const sheets = data<{ fileName: string; sheets: SheetView[] }>(flow.sheets);

    expect(flow.sheets.status).toBe(200);
    expect(sheets.fileName).toBe('viajes.xlsx');
    // Las tres pestanas se leen, no solo la primera: es la decision 2 del plan.
    expect(sheets.sheets.map((sheet) => sheet.name)).toEqual(['Viajes', 'Clientes', 'Notas']);
  });

  it('CA-02: el sistema identifica correctamente sus columnas', () => {
    const { sheets } = data<{ sheets: SheetView[] }>(flow.sheets);
    const viajes = sheets.find((sheet) => sheet.name === 'Viajes')!;
    const clientes = sheets.find((sheet) => sheet.name === 'Clientes')!;

    expect(viajes.columns.map((column) => column.header)).toEqual([
      'Fecha',
      'Cliente',
      'RUC',
      'Vehiculo',
      'Conductor',
      'Valor',
      'Estado',
    ]);
    expect(clientes.columns.map((column) => column.header)).toEqual([
      'Cliente',
      'RUC',
      'Correo',
      'Telefono',
      'Ciudad',
    ]);

    // Y los tipos, que es de donde sale la mitad de la propuesta.
    expect(viajes.columns.map((column) => column.type)).toEqual([
      'date',
      'text',
      // El RUC es TEXTO, no un entero. Dos de los cuatro del archivo de demo
      // empiezan por cero —`0990054321001`— y como entero ese cero se pierde
      // para siempre. Esta expectativa decia `integer` hasta que una prueba con
      // un motor real enseno la consecuencia: la cedula de un estudiante se
      // guardaba mutilada. Un identificador no es un numero aunque lo parezca.
      'text',
      'text',
      'text',
      'integer',
      'text',
    ]);
    expect(clientes.columns[2]!.type).toBe('email');
    expect(clientes.columns[3]!.type).toBe('phone');

    // La repeticion se detecta: 122 filas, 4 clientes distintos. Es el numero
    // del que sale la propuesta de extraer la entidad.
    expect(viajes.columns[1]!.distinct).toBe(4);

    // La hoja vacia se descarta sola, sin que nadie la senale.
    expect(sheets.find((sheet) => sheet.name === 'Notas')!.included).toBe(false);
  });

  it('CA-03: el sistema propone al menos una entidad', () => {
    const blueprint = data<BlueprintView>(flow.blueprint);

    expect(flow.blueprint.status).toBe(200);
    expect(blueprint.entities.length).toBeGreaterThanOrEqual(1);
  });

  it('CA-04: propone multiples entidades relacionadas (ERS 18)', () => {
    const blueprint = data<BlueprintView>(flow.blueprint);

    // Las cuatro del ERS 18, ni una mas.
    expect([...blueprint.entities.map((entity) => entity.label)].sort()).toEqual([
      'Clientes',
      'Conductores',
      'Vehiculos',
      'Viajes',
    ]);

    // Y las tres relaciones del ERS 18, todas Viajes N-1 algo.
    expect(
      [...blueprint.relations.map((relation) => `${relation.from} N-1 ${relation.to}`)].sort(),
    ).toEqual(['Viajes N-1 Clientes', 'Viajes N-1 Conductores', 'Viajes N-1 Vehiculos']);

    // Cada relacion dice por que campo va: sin eso no se sabria cual de las tres
    // de Viajes es cual, ni se podria rechazar una sola.
    expect(blueprint.relations.map((relation) => relation.through)).toEqual([
      'cliente',
      'vehiculo',
      'conductor',
    ]);
  });

  it('CA-05: el usuario puede revisar la propuesta', () => {
    const blueprint = data<BlueprintView>(flow.blueprint);
    const viajes = blueprint.entities.find((entity) => entity.name === 'viajes')!;

    // Revisar es, primero, poder leerla en lenguaje de negocio.
    expect(viajes.fields.map((field) => field.label)).toEqual([
      'Fecha',
      'Cliente',
      'Vehiculo',
      'Conductor',
      'Valor',
      'Estado',
    ]);

    // Y despues, poder cambiarla y deshacerlo.
    expect(flow.renamed.status).toBe(200);
    expect(data<BlueprintView>(flow.renamed).entities[0]!.label).toBe('Empresas');
    expect(data<BlueprintView>(flow.restored).entities[0]!.label).toBe('Clientes');
  });

  it('CA-06: el usuario puede confirmar o rechazar relaciones propuestas', async () => {
    // Confirmar: las tres se aceptaron una por una y las tres siguen en pie.
    expect(flow.accepted.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(data<BlueprintView>(flow.accepted.at(-1)!).relations).toHaveLength(3);

    // Rechazar, en un proyecto aparte para no estropear la demo. Lo que importa
    // no es que la relacion desaparezca, sino que el dato NO se pierda: el campo
    // se degrada a texto (RI-06).
    const aparte = await runUpToReview();
    const rejected = await request(aparte.harness.app)
      .patch(`/api/projects/${aparte.projectId}/blueprint/relations/viajes/conductor`)
      .send({ accepted: false });

    const blueprint = data<BlueprintView>(rejected);
    const conductor = blueprint.entities
      .find((entity) => entity.name === 'viajes')!
      .fields.find((field) => field.name === 'conductor')!;

    expect(conductor.type).toBe('text');
    expect(conductor.relatedTo).toBeNull();
    expect(blueprint.relations.map((relation) => relation.through)).toEqual([
      'cliente',
      'vehiculo',
    ]);
  });

  it('CA-07: el sistema muestra un resumen antes de crear', () => {
    const summary = data<SummaryView>(flow.summary);

    expect(summary.applicationName).toBe('Gestion de Viajes');
    expect(summary.totals).toEqual({ entities: 4, fields: 13, relations: 3 });
    expect(summary.confirmed).toBe(false);

    // Escrito para leerse, no para auditarse: etiquetas y frases, no esquemas.
    expect(summary.relations).toContain(
      'Cada viaje pertenece a un cliente. Un cliente puede tener varios viajes.',
    );
    expect(summary.entities).toContainEqual({ label: 'Conductores', fields: ['Conductor'] });
    expect(JSON.stringify(summary)).not.toContain('proj_');
  });

  it('CA-08: al confirmar, se generan los modulos correspondientes', () => {
    expect(data<SummaryView>(flow.confirmed).confirmed).toBe(true);

    // Se emitio DDL para las cuatro tablas, en orden topologico: los destinos de
    // las relaciones antes que quien las lleva.
    const plan = flow.harness.schemas.created.at(-1)!;
    expect(plan.tables.map((table) => table.entityName)).toEqual([
      'clientes',
      'vehiculos',
      'conductores',
      'viajes',
    ]);

    const manifest = data<ManifestView>(flow.manifest);
    expect(manifest.navigation.map((item) => item.label)).toEqual([
      'Clientes',
      'Vehiculos',
      'Conductores',
      'Viajes',
    ]);
  });

  it('CA-09: cada modulo dispone de tabla de registros', async () => {
    const manifest = data<ManifestView>(flow.manifest);

    for (const entity of manifest.entities) {
      const listed = await api().get(url(`/app/${entity.name}/records?limit=5`));
      const meta = (listed.body as { meta: { total: number; entity: string } }).meta;

      expect(listed.status).toBe(200);
      expect(meta.entity).toBe(entity.label);
      expect(meta.total).toBeGreaterThan(0);
      // Paginada y ordenable, que es lo que la hace usable con 120 filas.
      expect(data<RecordView[]>(listed).length).toBeLessThanOrEqual(5);
    }

    const sorted = await api().get(url('/app/clientes/records?sort=ciudad&dir=asc'));
    expect(data<RecordView[]>(sorted).map((record) => record.values['ciudad'])).toEqual([
      'Cuenca',
      'Guayaquil',
      'Manta',
      'Quito',
    ]);
  });

  it('CA-10: cada modulo dispone de formulario de creacion', () => {
    const manifest = data<ManifestView>(flow.manifest);

    // El backend no dibuja formularios; entrega lo que hace falta para dibujar
    // uno sin adivinar nada: por cada campo, su etiqueta, su tipo, si es
    // obligatorio, y sus opciones cuando las tiene.
    for (const entity of manifest.entities) {
      expect(entity.fields.length).toBeGreaterThan(0);

      for (const field of entity.fields) {
        expect(field.label).not.toBe('');
        expect(field.type).not.toBe('');
        expect(typeof field.required).toBe('boolean');
      }
    }

    const viajes = manifest.entities.find((entity) => entity.name === 'viajes')!;

    // Una lista cerrada se dibuja como lista cerrada, no como texto libre.
    const estado = viajes.fields.find((field) => field.name === 'estado')!;
    expect(estado.type).toBe('select');
    expect(estado.options).toEqual(['Abierto', 'Cerrado']);

    // Y una relacion dice a que modulo va, para saber a quien pedir las opciones.
    expect(viajes.fields.find((field) => field.name === 'cliente')!.relatedTo).toBe('clientes');
  });

  it('CA-11: cada registro puede editarse', async () => {
    const listed = await api().get(url('/app/clientes/records?limit=1'));
    const cliente = data<RecordView[]>(listed)[0]!;

    const edited = await api()
      .patch(url(`/app/clientes/records/${cliente.id}`))
      .send({ ciudad: 'Ambato' });

    expect(edited.status).toBe(200);
    expect(data<RecordView>(edited).values['ciudad']).toBe('Ambato');

    // Y persiste: no es solo lo que devolvio la respuesta.
    const reread = await api().get(url(`/app/clientes/records/${cliente.id}`));
    expect(data<RecordView>(reread).values['ciudad']).toBe('Ambato');
  });

  it('CA-12: los campos relacionados se representan como selecciones', async () => {
    const options = await api().get(url('/app/clientes/options?limit=50'));
    const items = data<{ id: string; label: string }[]>(options);

    expect(options.status).toBe(200);
    expect(items).toHaveLength(4);

    // Lo que se elige es un registro —identificador y etiqueta legible—, no un
    // texto libre que habria que volver a deduplicar.
    for (const item of items) {
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.label).not.toBe('');
    }
    expect(items.map((item) => item.label)).toContain('Comercial Andes');

    // El selector busca, porque con mil clientes una lista entera no sirve.
    const searched = await api().get(url('/app/clientes/options?q=norte'));
    expect(data<{ label: string }[]>(searched).map((item) => item.label)).toEqual([
      'Cliente Norte',
    ]);
  });

  it('CA-13: los datos del Excel son importados', () => {
    const job = data<{ status: string; message: string; result: unknown }>(flow.job);

    // "partial", no "completed", y es la respuesta correcta: la decision 4 del
    // plan dice continuar y reportar, asi que un archivo con dos celdas malas
    // termina —importa las otras 120 filas— pero no finge que salio perfecto.
    expect(job.status).toBe('partial');
    expect(job.result).toEqual({ modules: 4, records: 132, relations: 3, failedRows: 2 });
    expect(job.message).toBe(
      'Tu aplicacion esta lista. Importamos 132 registros y 2 fila(s) quedaron fuera.',
    );

    // Y las dos filas se reportan con hoja, numero y motivo, en lenguaje de
    // negocio: lo suficiente para encontrarlas en el Excel y arreglarlas.
    const failures = data<{ rowNumber: number; reason: string; sheetName: string }[]>(
      flow.failures,
    );
    expect(failures).toHaveLength(2);
    expect(failures.map((failure) => failure.rowNumber)).toEqual([122, 123]);
    expect(failures.every((failure) => failure.sheetName === 'Viajes')).toBe(true);
    expect(failures[0]!.reason).toContain('fecha');
    expect(failures[1]!.reason).toContain('numero');
  });

  it('CA-14: los valores repetidos se deduplican correctamente', () => {
    const importer = flow.harness.importer;

    // 122 filas de Excel, cuatro clientes. Y da igual que el Excel escriba
    // "COMERCIAL ANDES", "Comercial Andes" o "  Comercial Andes  ".
    expect(importer.recordsOf('clientes')).toHaveLength(4);
    expect(importer.recordsOf('vehiculos')).toHaveLength(4);
    expect(importer.recordsOf('conductores')).toHaveLength(4);

    // Los viajes NO se deduplican: dos viajes iguales el mismo dia son dos
    // viajes. Deduplicar es para las entidades extraidas, no para los hechos.
    expect(importer.recordsOf('viajes')).toHaveLength(120);
  });

  it('CA-15: las relaciones entre los registros importados se conservan', async () => {
    const first = await api().get(url('/app/viajes/records?limit=100'));
    const second = await api().get(url('/app/viajes/records?limit=100&offset=100'));
    const viajes = [...data<RecordView[]>(first), ...data<RecordView[]>(second)];

    expect((first.body as { meta: { total: number } }).meta.total).toBe(120);
    expect(viajes).toHaveLength(120);

    // Ni un solo viaje sin cliente, vehiculo o conductor.
    for (const viaje of viajes) {
      expect(viaje.related['cliente']).not.toBeNull();
      expect(viaje.related['vehiculo']).not.toBeNull();
      expect(viaje.related['conductor']).not.toBeNull();
    }

    // Y apuntan a los MISMOS cuatro registros, no a 120 copias.
    expect(new Set(viajes.map((viaje) => viaje.values['cliente'])).size).toBe(4);

    // La prueba de fuego: las filas que escribian el nombre en mayusculas
    // apuntan al mismo cliente que las que lo escribian bien.
    const andes = viajes.filter((viaje) => viaje.related['cliente'] === 'Comercial Andes');
    expect(andes.length).toBe(30);
    expect(new Set(andes.map((viaje) => viaje.values['cliente'])).size).toBe(1);
  });

  it('CA-16: se puede crear un registro nuevo despues de la importacion', async () => {
    const options = await api().get(url('/app/clientes/options?q=andes'));
    const clienteId = data<{ id: string }[]>(options)[0]!.id;

    const vehiculos = await api().get(url('/app/vehiculos/options?limit=1'));
    const conductores = await api().get(url('/app/conductores/options?limit=1'));

    const created = await api()
      .post(url('/app/viajes/records'))
      .send({
        fecha: '2026-09-30',
        cliente: clienteId,
        vehiculo: data<{ id: string }[]>(vehiculos)[0]!.id,
        conductor: data<{ id: string }[]>(conductores)[0]!.id,
        valor: 999.5,
        estado: 'Abierto',
      });

    expect(created.status).toBe(201);
    expect(data<RecordView>(created).related['cliente']).toBe('Comercial Andes');

    // El viaje nuevo convive con los importados, en la misma tabla.
    const listed = await api().get(url('/app/viajes/records?limit=1'));
    expect((listed.body as { meta: { total: number } }).meta.total).toBe(121);
  });

  it('CA-17: se puede editar un registro importado', async () => {
    const listed = await api().get(url('/app/viajes/records?limit=1&sort=fecha&dir=asc'));
    const viaje = data<RecordView[]>(listed)[0]!;

    const edited = await api()
      .patch(url(`/app/viajes/records/${viaje.id}`))
      .send({ estado: 'Cerrado', valor: 1234.56 });

    expect(edited.status).toBe(200);
    expect(data<RecordView>(edited).values['estado']).toBe('Cerrado');
    expect(data<RecordView>(edited).values['valor']).toBe(1234.56);

    // Cambiar el cliente de un viaje importado tambien funciona: el registro no
    // queda atado a lo que dijo el Excel.
    const norte = await api().get(url('/app/clientes/options?q=norte'));
    const reassigned = await api()
      .patch(url(`/app/viajes/records/${viaje.id}`))
      .send({ cliente: data<{ id: string }[]>(norte)[0]!.id });

    expect(data<RecordView>(reassigned).related['cliente']).toBe('Cliente Norte');
  });

  it('CA-18: el flujo completo no exige escribir codigo', () => {
    // Este criterio no se prueba con una asercion nueva: se prueba con que los
    // diecisiete anteriores hayan pasado usando SOLO peticiones HTTP con datos
    // de negocio. Lo que si se puede afirmar es lo que nunca se le pidio a nadie
    // que escribiera, que es donde otros generadores fallan.
    const visto = JSON.stringify([
      flow.sheets.body,
      flow.blueprint.body,
      flow.summary.body,
      flow.manifest.body,
    ]);

    // Ni SQL, ni nombres de tabla, ni schema: nada que obligue a saber como
    // funciona la base para usar la aplicacion (RX-03, ADR 0001). En mayusculas
    // a proposito: `select` en minusculas es un tipo de campo legitimo.
    expect(visto).not.toMatch(/\bCREATE TABLE\b|\bINSERT INTO\b|\bSELECT\b|\bALTER\b/);
    expect(visto).not.toContain('proj_');
    expect(visto).not.toContain('tableName');
    expect(visto).not.toContain('columnName');
    expect(visto).not.toContain('__dedupe_key');

    // El unico texto libre que la persona escribio en todo el recorrido fue el
    // nombre del proyecto; el resto fueron elecciones sobre lo propuesto.
    expect(data<ManifestView>(flow.manifest).applicationName).toBe('Gestion de Viajes');
  });
});

/** Un segundo proyecto llevado hasta la revision, para las pruebas destructivas. */
async function runUpToReview(): Promise<{ harness: TestHarness; projectId: string }> {
  const fixtures = await createFixtureDir();
  const file = await writeWorkbook(fixtures, 'aparte.xlsx', demoWorkbook());

  const harness = createTestHarness({
    proposer: createScriptedProposer({ first: demoBlueprint() }),
  });
  const api = request(harness.app);

  const created = await api.post('/api/projects').send({ name: 'Aparte' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  await api.post(`/api/projects/${projectId}/file`).attach('file', file);
  await api.patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });
  await api.post(`/api/projects/${projectId}/analyze`);
  await harness.settled();

  await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_fields' });
  await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_relations' });

  return { harness, projectId };
}
