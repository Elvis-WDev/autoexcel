/**
 * Los tres escenarios contra el motor de inferencia de VERDAD.
 *
 * A diferencia de `acceptance-live.ts`, aqui **no se sustituye la propuesta**:
 * la pide el proveedor configurado en `.env`. Lo unico sustituido es la sesion,
 * porque autenticarse por HTTP no aporta nada a lo que se quiere saber.
 *
 * La pregunta no es si pasa o falla, sino **que modelo propone para cada
 * archivo**: cuantas entidades, cuantas relaciones, que tipos. Por eso imprime
 * la propuesta ademas de comprobar que todo lo que viene despues funciona.
 *
 *   corepack pnpm --filter @app/api tsx scripts/escenarios/probar.ts
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { Response } from 'supertest';
import type { AuthenticatedUser } from '../../src/application/ports/session.js';
import { createApp } from '../../src/app.js';
import { compose } from '../../src/composition-root.js';
import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { writeWorkbook } from '../../tests/helpers/xlsx-fixtures.js';
import { libroAcademia, libroGastos, libroPedidos } from './fixtures.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();
const logger = createLogger('error');

/** Los guiones de este repo escriben en stdout: su salida ES el resultado. */
function escribir(linea = ''): void {
  process.stdout.write(`${linea}\n`);
}

function data<T>(response: Response): T {
  return (response.body as { data: T }).data;
}

async function esperarTrabajo(
  api: ReturnType<typeof request>,
  projectId: string,
  jobId: string,
): Promise<{ status: string; error: string | null }> {
  for (let intento = 0; intento < 240; intento += 1) {
    const response = await api.get(`/api/projects/${projectId}/jobs/${jobId}`);
    const job = data<{ status: string; error: string | null }>(response);
    if (job.status !== 'queued' && job.status !== 'running') return job;
    await new Promise((listo) => setTimeout(listo, 500));
  }
  throw new Error('el trabajo no termino');
}

interface VistaDelPlano {
  applicationName: string;
  /** `false` significa que hablo el camino determinista, no el modelo. */
  wasInferred: boolean;
  /** Mensajes de reparacion: el validador rechazo la primera propuesta. */
  notes: string[];
  entities: {
    name: string;
    label: string;
    derived: boolean;
    displayField: string;
    dedupeField: string | null;
    fields: {
      name: string;
      label: string;
      type: string;
      required: boolean;
      options: string[] | null;
      relatedTo: string | null;
    }[];
  }[];
  relations: { from: string; to: string; fromName: string; through: string; description: string }[];
}

const ESCENARIOS = [
  { id: 'E1', archivo: 'gastos.xlsx', hojas: libroGastos() },
  { id: 'E2', archivo: 'pedidos.xlsx', hojas: libroPedidos() },
  { id: 'E3', archivo: 'academia.xlsx', hojas: libroAcademia() },
] as const;

async function main(): Promise<number> {
  const bootstrap = compose(env, logger);
  const owner = await bootstrap.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  await bootstrap.close();

  if (!owner) {
    process.stderr.write('No hay ninguna cuenta. Ejecuta `corepack pnpm db:seed`.\n');
    return 1;
  }

  const user: AuthenticatedUser = { id: owner.id, email: owner.email, name: owner.name };

  // El motor de inferencia NO se sustituye: es lo que se esta probando.
  const composition = compose(env, logger, { sessions: { getUser: () => Promise.resolve(user) } });
  await composition.prepare();

  const api = request(createApp(composition.dependencies));
  const control = composition.pools.control;
  const scratch = await mkdtemp(join(tmpdir(), 'ets-escenarios-'));

  escribir(`\nMotor: ${env.INFERENCE_PROVIDER} · ${env.GEMINI_MODEL}\n`);

  let fallos = 0;

  try {
    for (const escenario of ESCENARIOS) {
      const ruta = await writeWorkbook(scratch, escenario.archivo, [...escenario.hojas]);
      const filas = escenario.hojas.reduce((t, h) => t + Math.max(0, h.rows.length - 1), 0);

      escribir('='.repeat(78));
      escribir(
        `${escenario.id}  ${escenario.archivo}  ·  ${escenario.hojas.length} hoja(s), ${filas} filas`,
      );
      escribir('='.repeat(78));

      const creado = await api
        .post('/api/projects')
        .send({ name: `${escenario.id} ${randomUUID().slice(0, 6)}` });
      const projectId = data<{ id: string }>(creado).id;

      const subido = await api.post(`/api/projects/${projectId}/file`).attach('file', ruta);
      if (subido.status !== 201) {
        escribir(`  ✗ la subida respondio ${subido.status}`);
        fallos += 1;
        continue;
      }

      await api.patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

      // --- El analisis: aqui habla el modelo -------------------------------
      const comienzo = Date.now();
      const analisis = await api.post(`/api/projects/${projectId}/analyze`);
      const trabajo = await esperarTrabajo(api, projectId, data<{ id: string }>(analisis).id);
      const segundos = ((Date.now() - comienzo) / 1000).toFixed(1);

      if (trabajo.status === 'failed') {
        escribir(`  ✗ el analisis fallo: ${trabajo.error ?? 'sin motivo'}`);
        fallos += 1;
        continue;
      }

      const plano = data<VistaDelPlano>(await api.get(`/api/projects/${projectId}/blueprint`));

      escribir(
        `\n  Propuesta en ${segundos}s  ${plano.wasInferred ? 'por el modelo' : '*** CAMINO DETERMINISTA ***'}`,
      );
      escribir(`  Aplicacion: "${plano.applicationName}"`);

      // Si el validador rechazo la primera propuesta, quedo dicho aqui.
      for (const nota of plano.notes) escribir(`  ! reparacion: ${nota}`);

      for (const entidad of plano.entities) {
        const campos = entidad.fields
          .map((c) => {
            const extra = c.relatedTo
              ? `->${c.relatedTo}`
              : c.options
                ? `(${c.options.length} opciones)`
                : '';
            return `${c.label}:${c.type}${extra}${c.required ? '!' : ''}`;
          })
          .join(', ');
        const marca = entidad.derived ? ' [derivada]' : '';
        const dedupe = entidad.dedupeField ? ` dedup=${entidad.dedupeField}` : '';
        escribir(`    · ${entidad.label}${marca}${dedupe} -> ${campos}`);
      }

      if (plano.relations.length === 0) {
        escribir('    (sin relaciones)');
      } else {
        for (const relacion of plano.relations) {
          escribir(`    ~ ${relacion.description}`);
        }
      }

      // --- Aceptar todo y construir ----------------------------------------
      for (const to of ['reviewing_fields', 'reviewing_relations']) {
        await api.post(`/api/projects/${projectId}/step`).send({ to });
      }
      for (const relacion of plano.relations) {
        const aceptada = await api
          .patch(
            `/api/projects/${projectId}/blueprint/relations/${relacion.fromName}/${relacion.through}`,
          )
          .send({ accepted: true });
        if (aceptada.status !== 200) {
          escribir(`  ✗ aceptar "${relacion.through}" respondio ${aceptada.status}`);
          fallos += 1;
        }
      }
      await api.post(`/api/projects/${projectId}/step`).send({ to: 'reviewing_summary' });
      await api.post(`/api/projects/${projectId}/blueprint/confirm`);

      const construccion = await api.post(`/api/projects/${projectId}/build`);
      const obra = await esperarTrabajo(api, projectId, data<{ id: string }>(construccion).id);

      if (obra.status === 'failed') {
        escribir(`\n  ✗ la construccion fallo: ${obra.error ?? 'sin motivo'}`);
        fallos += 1;
        continue;
      }

      const proyecto = await control.query<{ schemaName: string }>(
        'select "schemaName" from project where id = $1',
        [projectId],
      );
      const schemaName = proyecto.rows[0]!.schemaName;

      const tablas = await control.query<{ table_name: string }>(
        'select table_name from information_schema.tables where table_schema = $1 order by table_name',
        [schemaName],
      );

      const claves = await control.query<{ n: string }>(
        "select count(*)::text as n from information_schema.table_constraints where table_schema = $1 and constraint_type = 'FOREIGN KEY'",
        [schemaName],
      );

      escribir(
        `\n  Construido (${obra.status}): ${tablas.rows.length} tablas, ${claves.rows[0]!.n} claves foraneas`,
      );

      // --- Lo que quedo dentro --------------------------------------------
      const manifiesto = data<{ entities: { name: string; label: string }[] }>(
        await api.get(`/api/projects/${projectId}/app`),
      );

      for (const modulo of manifiesto.entities) {
        const registros = await api.get(
          `/api/projects/${projectId}/app/${modulo.name}/records?limit=1`,
        );
        const total = (registros.body as { meta?: { total?: number } }).meta?.total ?? 0;

        // Con una fila basta para ver si las etiquetas de relacion se resuelven.
        const primera = data<{ related: Record<string, string | null> }[]>(registros)[0];
        const enlaces = Object.entries(primera?.related ?? {})
          .filter(([, etiqueta]) => etiqueta !== null)
          .map(([campo, etiqueta]) => `${campo}="${etiqueta}"`)
          .join(', ');

        escribir(
          `    ${modulo.label.padEnd(16)} ${String(total).padStart(5)} filas${enlaces ? `  enlaza ${enlaces}` : ''}`,
        );
      }

      escribir('');
    }
  } finally {
    await composition.close();
  }

  return fallos === 0 ? 0 : 1;
}

process.exit(await main());
