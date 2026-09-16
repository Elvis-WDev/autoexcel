/**
 * Medicion del listado con 100.000 registros (F8).
 *
 * La Definition of Done exige numeros de antes y despues para un cambio
 * sensible al rendimiento. Los indices se crean en F5, asi que "antes" es sin
 * ellos y "despues" con ellos, sobre exactamente los mismos datos.
 *
 * Usa el SQL de produccion, no consultas escritas para la ocasion.
 */
import pg from 'pg';
import { buildPhysicalPlan } from '../dist/domain/blueprint/physical-plan.js';
import { createMaterializer } from '../dist/infrastructure/database/materializer.js';
import { createLogger } from '../dist/infrastructure/logging/logger.js';
import {
  buildCountStatement,
  buildListStatement,
  relationJoins,
  searchableColumns,
} from '../dist/infrastructure/database/sql/query.js';

const SCHEMA = 'proj_bench_listado';
const URL = 'postgres://ets_owner:ets_local_password@localhost:5432/ets';
const ROWS = 100_000;
const CLIENTS = 500;

const blueprint = {
  applicationName: 'Bench',
  entities: [
    {
      name: 'clientes',
      label: 'Clientes',
      origin: 'derived',
      displayField: 'nombre',
      dedupeField: 'nombre',
      fields: [{ name: 'nombre', label: 'Cliente', type: 'text', required: true }],
    },
    {
      name: 'viajes',
      label: 'Viajes',
      origin: 'sheet',
      displayField: 'vehiculo',
      fields: [
        { name: 'vehiculo', label: 'Vehiculo', type: 'text', required: false },
        {
          name: 'cliente',
          label: 'Cliente',
          type: 'relation',
          required: true,
          targetEntity: 'clientes',
        },
        { name: 'valor', label: 'Valor', type: 'decimal', required: false },
      ],
    },
  ],
  relations: [
    { fromEntity: 'viajes', toEntity: 'clientes', fieldName: 'cliente', type: 'many_to_one' },
  ],
};

const logger = createLogger('error');
const pool = new pg.Pool({ connectionString: URL });
const plan = buildPhysicalPlan(SCHEMA, blueprint);

await createMaterializer(pool, { runtimeRole: 'app_runtime', logger }).createSchema(plan);

// Datos: 500 clientes, 100.000 viajes repartidos entre ellos.
await pool.query(`
  INSERT INTO "${SCHEMA}"."clientes" ("cliente", "__dedupe_key")
  SELECT 'Cliente ' || i, 'cliente ' || i FROM generate_series(0, ${CLIENTS - 1}) i
`);

await pool.query(`
  INSERT INTO "${SCHEMA}"."viajes" ("vehiculo", "cliente", "valor")
  SELECT 'V-' || (i % 5000), c.id, (i % 900)::numeric
  FROM generate_series(1, ${ROWS}) i
  JOIN LATERAL (
    SELECT id FROM "${SCHEMA}"."clientes" OFFSET (i % ${CLIENTS}) LIMIT 1
  ) c ON true
`);

await pool.query(`ANALYZE "${SCHEMA}"."viajes"`);
await pool.query(`ANALYZE "${SCHEMA}"."clientes"`);

const entity = {
  name: 'viajes',
  label: 'Viajes',
  tableName: 'viajes',
  displayField: 'vehiculo',
  fields: [
    {
      name: 'vehiculo',
      label: 'Vehiculo',
      type: 'text',
      required: false,
      options: null,
      columnName: 'vehiculo',
      relatedEntity: null,
    },
    {
      name: 'cliente',
      label: 'Cliente',
      type: 'relation',
      required: true,
      options: null,
      columnName: 'cliente',
      relatedEntity: 'clientes',
    },
    {
      name: 'valor',
      label: 'Valor',
      type: 'decimal',
      required: false,
      options: null,
      columnName: 'valor',
      relatedEntity: null,
    },
  ],
};

const joins = relationJoins(entity, () => ({
  tableName: 'clientes',
  displayColumn: 'cliente',
}));

function listStatement(search) {
  return buildListStatement({
    schemaName: SCHEMA,
    entity,
    joins,
    sortColumn: 'vehiculo',
    direction: 'ASC',
    searchColumns: searchableColumns(entity),
    search,
    limit: 25,
    offset: 0,
  });
}

function countStatement(search) {
  return buildCountStatement({
    schemaName: SCHEMA,
    entity,
    searchColumns: searchableColumns(entity),
    search,
  });
}

/** Mediana de varias ejecuciones: una sola medicion no dice nada. */
async function measure(statement, runs = 7) {
  const times = [];

  for (let i = 0; i < runs; i += 1) {
    const started = process.hrtime.bigint();
    await pool.query(statement.text, statement.values);
    times.push(Number(process.hrtime.bigint() - started) / 1_000_000);
  }

  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

async function explain(statement) {
  const result = await pool.query(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.text}`,
    statement.values,
  );
  const plan = result.rows[0]['QUERY PLAN'][0];
  return {
    ms: plan['Execution Time'],
    node: plan.Plan['Node Type'],
    scan: JSON.stringify(plan.Plan).includes('"Seq Scan"') ? 'Seq Scan presente' : 'sin Seq Scan',
  };
}

/**
 * Borrar un cliente SIN viajes.
 *
 * Es el caso que justifica el indice sobre la columna de relacion. Con viajes,
 * la comprobacion RESTRICT encuentra la primera coincidencia enseguida y no
 * necesita el indice; sin viajes hay que demostrar que no existe ninguno, y eso
 * obliga a recorrer la tabla entera si no hay por donde buscar.
 */
async function measureDeleteWithoutChildren(runs = 5) {
  await pool.query(
    `INSERT INTO "${SCHEMA}"."clientes" ("cliente", "__dedupe_key")
     VALUES ('Cliente sin viajes', 'cliente sin viajes')
     ON CONFLICT DO NOTHING`,
  );

  const { rows } = await pool.query(
    `SELECT id FROM "${SCHEMA}"."clientes" WHERE "cliente" = 'Cliente sin viajes'`,
  );
  const id = rows[0].id;
  const times = [];

  for (let i = 0; i < runs; i += 1) {
    const client = await pool.connect();
    const started = process.hrtime.bigint();

    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "${SCHEMA}"."clientes" WHERE id = $1`, [id]);
      await client.query('ROLLBACK');
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
    } finally {
      times.push(Number(process.hrtime.bigint() - started) / 1_000_000);
      client.release();
    }
  }

  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

async function report(label) {
  const primera = await measure(listStatement(null));
  const busqueda = await measure(listStatement('V-4999'));
  const total = await measure(countStatement(null));
  const borrado = await measureDeleteWithoutChildren();
  const detalle = await explain(listStatement(null));

  console.log(
    `${label.padEnd(5)} primera pagina ${primera.toFixed(1).padStart(6)} ms |` +
      ` busqueda ${busqueda.toFixed(1).padStart(6)} ms |` +
      ` recuento ${total.toFixed(1).padStart(6)} ms |` +
      ` borrado sin hijos ${borrado.toFixed(1).padStart(6)} ms |` +
      ` ${detalle.scan}`,
  );

  return { primera, busqueda, total, borrado };
}

console.log(`\n${ROWS.toLocaleString('es')} viajes, ${CLIENTS} clientes\n`);

const conIndices = await report('CON');

// "Antes": los mismos datos sin los indices que crea F5.
for (const table of plan.tables) {
  for (const index of table.indexes) {
    await pool.query(`DROP INDEX "${SCHEMA}"."${index.name}"`);
  }
}
await pool.query(`ANALYZE "${SCHEMA}"."viajes"`);

const sinIndices = await report('SIN');

console.log(
  `\nmejora con indices: primera pagina x${(sinIndices.primera / conIndices.primera).toFixed(1)}` +
    ` | busqueda x${(sinIndices.busqueda / conIndices.busqueda).toFixed(1)}` +
    ` | recuento x${(sinIndices.total / conIndices.total).toFixed(1)}` +
    ` | borrado x${(sinIndices.borrado / conIndices.borrado).toFixed(1)}\n`,
);

await pool.query(`DROP SCHEMA "${SCHEMA}" CASCADE`);
await pool.end();
