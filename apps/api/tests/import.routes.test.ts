import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SYSTEM_COLUMNS } from '../src/domain/blueprint/physical-plan.js';
import type { ProposedBlueprint } from '../src/domain/blueprint/types.js';
import { createScriptedProposer } from './helpers/scripted-proposer.js';
import { createTestHarness, type TestHarness } from './helpers/test-app.js';
import { createFixtureDir, writeWorkbook, type FixtureSheet } from './helpers/xlsx-fixtures.js';

let fixtures: string;

beforeAll(async () => {
  fixtures = await createFixtureDir();
});

afterAll(() => undefined);

/**
 * El archivo del ERS 13, tal cual.
 *
 * Tres viajes, dos clientes, y "Comercial Andes" repetido. Es el caso que el
 * documento usa para explicar de que va el producto, asi que es el que tiene que
 * salir bien antes que ninguno.
 */
const VIAJES_ERS: FixtureSheet = {
  name: 'Viajes',
  rows: [
    ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
    ['01/09/26', 'Comercial Andes', '123', 'ABC-123', 'Juan Perez', 350, 'Cerrado'],
    ['02/09/26', 'Comercial Andes', '123', 'XYZ-456', 'Ana Ruiz', 420, 'Cerrado'],
    ['03/09/26', 'Cliente Norte', '456', 'ABC-123', 'Juan Perez', 290, 'Abierto'],
  ],
};

/**
 * La propuesta del ERS 13 pasos 2 a 4: Clientes derivado de la columna repetida,
 * y Viajes apuntando a el.
 */
function ersBlueprint(): ProposedBlueprint {
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
            name: 'valor',
            label: 'Valor',
            type: 'decimal',
            required: false,
            source: { sheetIndex: 0, columnIndex: 5 },
          },
          {
            name: 'estado',
            label: 'Estado',
            type: 'select',
            required: false,
            options: ['Abierto', 'Cerrado'],
            source: { sheetIndex: 0, columnIndex: 6 },
          },
        ],
      },
    ],
    relations: [
      { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
    ],
  };
}

/** Sube el archivo, analiza, confirma y construye. */
async function runFullFlow(
  harness: TestHarness,
  fileName: string,
  sheets: FixtureSheet[],
): Promise<string> {
  const created = await request(harness.app).post('/api/projects').send({ name: 'Viajes' });
  const projectId = (created.body as { data: { id: string } }).data.id;

  const file = await writeWorkbook(fixtures, fileName, sheets);
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

  return projectId;
}

function harnessWith(blueprint: ProposedBlueprint): TestHarness {
  return createTestHarness({ proposer: createScriptedProposer({ first: blueprint }) });
}

describe('el caso del ERS 13', () => {
  it('convierte tres filas en dos clientes y tres viajes', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'ers.xlsx', [VIAJES_ERS]);

    const clientes = harness.importer.recordsOf('clientes');
    const viajes = harness.importer.recordsOf('viajes');

    // RF-20: "Comercial Andes" aparece dos veces y produce UN cliente.
    expect(clientes).toHaveLength(2);
    expect(clientes.map((record) => record.values['cliente'])).toEqual([
      'Comercial Andes',
      'Cliente Norte',
    ]);

    expect(viajes).toHaveLength(3);
  });

  /**
   * RF-19, que es la prueba de fuego del producto entero: los tres viajes tienen
   * que apuntar al cliente correcto, y los dos de "Comercial Andes" al MISMO.
   */
  it('conserva el vinculo de cada viaje con su cliente', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'vinculos.xlsx', [VIAJES_ERS]);

    const clientes = harness.importer.recordsOf('clientes');
    const viajes = harness.importer.recordsOf('viajes');

    const andes = clientes.find((record) => record.values['cliente'] === 'Comercial Andes')!;
    const norte = clientes.find((record) => record.values['cliente'] === 'Cliente Norte')!;

    const apuntaA = viajes.map((viaje) => viaje.values['cliente']);

    expect(apuntaA[0]).toBe(andes.id);
    expect(apuntaA[1]).toBe(andes.id);
    expect(apuntaA[2]).toBe(norte.id);
    // Los dos primeros viajes comparten cliente: no se crearon dos "Andes".
    expect(apuntaA[0]).toBe(apuntaA[1]);
  });

  it('informa del resultado en lenguaje de negocio (RF-21)', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'resumen.xlsx', [VIAJES_ERS]);

    const job = harness.jobs.jobs.at(-1)!;

    expect(job.status).toBe('completed');
    expect(job.result).toEqual({ modules: 2, records: 5, relations: 1, failedRows: 0 });
    expect(job.message).toContain('Tu aplicacion esta lista');
  });

  it('deja el proyecto terminado', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'terminado.xlsx', [VIAJES_ERS]);

    expect(harness.projects.rows[0]?.status).toBe('completed');
  });

  // RNF-02: hay que poder decir de donde salio cada registro.
  it('guarda la hoja y la fila de origen de cada registro', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'origen.xlsx', [VIAJES_ERS]);

    const viajes = harness.importer.recordsOf('viajes');

    expect(viajes[0]?.values[SYSTEM_COLUMNS.source]).toEqual({ sheet: 0, row: 2 });
    expect(viajes[2]?.values[SYSTEM_COLUMNS.source]).toEqual({ sheet: 0, row: 4 });
  });
});

describe('deduplicacion con datos sucios (RF-20)', () => {
  // La decision 3 del plan hecha realidad: mayusculas, espacios y acentos
  // colapsan al mismo registro.
  it('fusiona variantes del mismo valor', async () => {
    const sucio: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ['01/09/26', 'ACME', '1', 'A-1', 'x', 10, 'Abierto'],
        ['02/09/26', 'acme', '1', 'A-2', 'x', 20, 'Abierto'],
        ['03/09/26', '  ACME  ', '1', 'A-3', 'x', 30, 'Abierto'],
        ['04/09/26', 'Acmé', '1', 'A-4', 'x', 40, 'Abierto'],
        ['05/09/26', 'NORTE', '2', 'A-5', 'x', 50, 'Abierto'],
      ],
    };

    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'sucio.xlsx', [sucio]);

    expect(harness.importer.recordsOf('clientes')).toHaveLength(2);
    // Los cuatro primeros viajes apuntan al mismo cliente.
    const viajes = harness.importer.recordsOf('viajes');
    const ids = new Set(viajes.slice(0, 4).map((viaje) => viaje.values['cliente']));
    expect(ids.size).toBe(1);
  });

  /**
   * La otra cara de la decision 3: con el RUC como clave, dos homonimos NO se
   * fusionan. Es la razon de que la clave se pueda elegir.
   *
   * Hacen falta varias filas por cliente: con dos, el validador rechazaria la
   * entidad por RI-01, porque una columna cuyos valores no se repiten no agrupa
   * nada. Es correcto, y obliga a que el fixture tenga volumen realista.
   */
  it('no fusiona homonimos cuando la clave es un codigo', async () => {
    const homonimos: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ...Array.from({ length: 12 }, (_, i) => [
          `0${(i % 9) + 1}/09/26`,
          'Transportes Lopez',
          i % 2 === 0 ? '111' : '222',
          `A-${i}`,
          'x',
          10 * (i + 1),
          'Abierto',
        ]),
      ],
    };

    const blueprint = ersBlueprint();
    blueprint.entities[0]!.dedupeField = 'ruc';

    const harness = harnessWith(blueprint);
    await runFullFlow(harness, 'homonimos.xlsx', [homonimos]);

    expect(harness.importer.recordsOf('clientes')).toHaveLength(2);
  });

  it('descarta las filas cuya clave viene vacia', async () => {
    const conVacios: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ...Array.from({ length: 10 }, (_, i) => [
          `0${(i % 9) + 1}/09/26`,
          'ACME',
          '1',
          `A-${i}`,
          'x',
          10 * (i + 1),
          'Abierto',
        ]),
        ['09/09/26', '', '', 'A-sin-cliente', 'x', 999, 'Abierto'],
      ],
    };

    const blueprint = ersBlueprint();
    // Sin cliente obligatorio, la fila del viaje si entra, con la relacion vacia.
    blueprint.entities[1]!.fields[1]!.required = false;
    blueprint.entities[0]!.fields[0]!.required = false;

    const harness = harnessWith(blueprint);
    await runFullFlow(harness, 'clave-vacia.xlsx', [conVacios]);

    expect(harness.importer.recordsOf('clientes')).toHaveLength(1);
    expect(harness.importer.recordsOf('viajes')).toHaveLength(11);
    expect(harness.importer.recordsOf('viajes').at(-1)?.values['cliente']).toBeNull();
  });
});

describe('filas que no se pueden importar (RE-06)', () => {
  /**
   * Decision 4 del plan: se continua y se reporta. Es lo que separa una
   * aplicacion utilizable de un mensaje de error con un Excel real.
   */
  it('importa el resto y reporta las filas malas', async () => {
    const conErrores: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ['01/09/26', 'ACME', '1', 'A-1', 'x', 10, 'Abierto'],
        ['no es una fecha', 'ACME', '1', 'A-2', 'x', 20, 'Abierto'],
        ['03/09/26', 'ACME', '1', 'A-3', 'x', 'tampoco', 'Abierto'],
        ['04/09/26', 'ACME', '1', 'A-4', 'x', 40, 'Inventado'],
        ['05/09/26', 'ACME', '1', 'A-5', 'x', 50, 'Cerrado'],
        ...Array.from({ length: 8 }, (_, i) => [
          `0${(i % 9) + 1}/09/26`,
          'ACME',
          '1',
          `B-${i}`,
          'x',
          10 * (i + 1),
          'Abierto',
        ]),
      ],
    };

    const harness = harnessWith(ersBlueprint());
    const projectId = await runFullFlow(harness, 'errores.xlsx', [conErrores]);

    // Tres filas malas; el resto entra.
    expect(harness.importer.recordsOf('viajes')).toHaveLength(10);

    const job = harness.jobs.jobs.at(-1)!;
    expect(job.status).toBe('partial');
    expect(job.result?.failedRows).toBe(3);
    expect(job.message).toContain('quedaron fuera');

    // El proyecto termina igualmente: la aplicacion es utilizable.
    expect(harness.projects.rows[0]?.status).toBe('completed');

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/jobs/${job.id}/errors`,
    );
    expect(response.status).toBe(200);

    const errors = (response.body as { data: { rowNumber: number; reason: string }[] }).data;
    expect(errors).toHaveLength(3);
    expect(errors.map((error) => error.rowNumber)).toEqual([3, 4, 5]);
  });

  // RX-03: la explicacion tiene que servir para arreglar el archivo.
  it('explica cada fallo sin jerga tecnica', async () => {
    const conErrores: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ['no es una fecha', 'ACME', '1', 'A-1', 'x', 10, 'Abierto'],
        ['02/09/26', 'ACME', '1', 'A-2', 'x', 20, 'Inventado'],
        ...Array.from({ length: 10 }, (_, i) => [
          `0${(i % 9) + 1}/09/26`,
          'ACME',
          '1',
          `B-${i}`,
          'x',
          10 * (i + 1),
          'Abierto',
        ]),
      ],
    };

    const harness = harnessWith(ersBlueprint());
    const projectId = await runFullFlow(harness, 'explicaciones.xlsx', [conErrores]);
    const job = harness.jobs.jobs.at(-1)!;

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/jobs/${job.id}/errors`,
    );
    const errors = (response.body as { data: { reason: string }[] }).data;
    const text = errors.map((error) => error.reason).join(' ');

    expect(text).toContain('deberia ser una fecha');
    expect(text).toContain('no admite el valor');

    for (const jargon of ['constraint', 'null', 'foreign key', 'SQL', 'column']) {
      expect(text.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });

  it('entrega el reporte descargable de las filas fallidas', async () => {
    const conErrores: FixtureSheet = {
      name: 'Viajes',
      rows: [
        ['Fecha', 'Cliente', 'RUC', 'Vehiculo', 'Conductor', 'Valor', 'Estado'],
        ['mala', 'ACME', '1', 'A-0', 'x', 10, 'Abierto'],
        ...Array.from({ length: 10 }, (_, i) => [
          `0${(i % 9) + 1}/09/26`,
          'ACME',
          '1',
          `A-${i + 1}`,
          'x',
          10 * (i + 1),
          'Abierto',
        ]),
      ],
    };

    const harness = harnessWith(ersBlueprint());
    const projectId = await runFullFlow(harness, 'descarga.xlsx', [conErrores]);
    const job = harness.jobs.jobs.at(-1)!;

    const response = await request(harness.app).get(
      `/api/projects/${projectId}/jobs/${job.id}/errors?format=csv`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.text).toContain('Hoja,Fila,Modulo,Motivo');
    expect(response.text).toContain('deberia ser una fecha');
  });

  // Simula el rechazo de la base de datos, que dispara el reintento fila a fila.
  it('aisla la fila culpable cuando la base rechaza un lote', async () => {
    const harness = harnessWith(ersBlueprint());
    harness.importer.rejectRow = (tableName, values) =>
      tableName === 'viajes' && values['vehiculo'] === 'XYZ-456'
        ? 'Uno de los valores de esta fila no esta entre los permitidos.'
        : null;

    await runFullFlow(harness, 'rechazo.xlsx', [VIAJES_ERS]);

    // Dos de tres viajes entran; solo se pierde la fila mala.
    expect(harness.importer.recordsOf('viajes')).toHaveLength(2);
    expect(harness.jobs.jobs.at(-1)?.result?.failedRows).toBe(1);
  });
});

describe('avance del proceso (RNF-06)', () => {
  it('reporta progreso mientras importa', async () => {
    const harness = harnessWith(ersBlueprint());
    await runFullFlow(harness, 'progreso.xlsx', [VIAJES_ERS]);

    const job = harness.jobs.jobs.at(-1)!;
    expect(job.progress).toBe(100);
    expect(job.status).toBe('completed');
  });
});
