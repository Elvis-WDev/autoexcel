/**
 * Que propone el motor REAL para el archivo de la demo.
 *
 * Es la unica pregunta que la suite automatizada no puede responder. Todos los
 * tests inyectan una propuesta conocida a proposito, porque lo que verifican es
 * el sistema: dada una propuesta valida, que ocurra todo lo demas. Si la
 * propuesta que sale del modelo es BUENA es otra cosa, depende de una llamada
 * que cuesta dinero y no es determinista, y no tiene sitio en `pnpm verify`.
 *
 * Este script hace esa llamada, una vez, y puntua el resultado contra lo que el
 * ERS 18 dice que deberia salir. Lo que no puede juzgar —si "Vehiculos" es mejor
 * nombre que "Unidades"— queda para la persona que lo ejecute, que por eso ve la
 * propuesta entera impresa.
 *
 *   ANTHROPIC_API_KEY=sk-... corepack pnpm inference:check
 *
 * Anota el resultado en `docs/quality/inference-manual-check.md`.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { Response } from 'supertest';
import { createApp } from '../src/app.js';
import { compose } from '../src/composition-root.js';
import { parseEnv } from '../src/config/env.js';
import type { AuthenticatedUser } from '../src/application/ports/session.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { demoWorkbook } from '../tests/helpers/demo-fixture.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();

interface EntityView {
  name: string;
  label: string;
  derived: boolean;
  displayField: string | null;
  dedupeField: string | null;
  fields: { name: string; label: string; type: string; relatedTo: string | null }[];
}

interface BlueprintView {
  applicationName: string;
  wasInferred: boolean;
  notes: string[];
  entities: EntityView[];
  relations: { description: string; from: string; to: string; through: string }[];
}

function data<T>(response: Response): T {
  return (response.body as { data: T }).data;
}

/**
 * Lo que el ERS 18 espera. Cada expectativa se evalua sobre la propuesta y se
 * marca; ninguna es un fallo del script si no se cumple, son observaciones sobre
 * el modelo.
 */
const EXPECTATIONS: { id: string; question: string; check: (view: BlueprintView) => boolean }[] = [
  {
    id: 'E1',
    question: 'Propone las cuatro entidades del ERS 18',
    check: (view) => view.entities.length === 4,
  },
  {
    id: 'E2',
    question: 'Extrae Clientes de la columna repetida en vez de dejarla como texto',
    check: (view) => view.entities.some((entity) => /cliente/i.test(entity.label)),
  },
  {
    id: 'E3',
    question: 'Une la hoja Clientes con los clientes de Viajes, sin duplicar la entidad',
    check: (view) => view.entities.filter((entity) => /cliente/i.test(entity.label)).length === 1,
  },
  {
    id: 'E4',
    question: 'Aprovecha los datos que solo estan en la segunda hoja (correo, telefono, ciudad)',
    check: (view) =>
      view.entities.some((entity) =>
        entity.fields.some((field) => field.type === 'email' || field.type === 'phone'),
      ),
  },
  {
    id: 'E5',
    question: 'Extrae Vehiculos y Conductores como entidades propias',
    check: (view) =>
      view.entities.some((entity) => /veh/i.test(entity.label)) &&
      view.entities.some((entity) => /conduct/i.test(entity.label)),
  },
  {
    id: 'E6',
    question: 'Propone las tres relaciones N-1 desde Viajes',
    check: (view) =>
      view.relations.length === 3 && view.relations.every((r) => /viaje/i.test(r.from)),
  },
  {
    id: 'E7',
    question: 'Reconoce Estado como lista cerrada, no como texto libre',
    check: (view) =>
      view.entities.some((entity) =>
        entity.fields.some((field) => /estado/i.test(field.label) && field.type === 'select'),
      ),
  },
  {
    id: 'E8',
    question: 'Elige claves de deduplicacion sensatas para las entidades extraidas',
    check: (view) => view.entities.filter((entity) => entity.dedupeField !== null).length >= 2,
  },
  {
    id: 'E9',
    question: 'Pone nombre al conjunto en lenguaje de negocio',
    check: (view) => view.applicationName.trim().length > 0 && view.applicationName !== 'viajes',
  },
];

async function main(): Promise<number> {
  if (!env.ANTHROPIC_API_KEY) {
    process.stderr.write(
      '\nFalta ANTHROPIC_API_KEY. Sin ella el analisis usa el camino determinista\n' +
        'de RE-04, que no propone relaciones, y este script no tendria nada que medir.\n\n' +
        '  ANTHROPIC_API_KEY=sk-... corepack pnpm inference:check\n\n',
    );
    return 1;
  }

  const scratch = await mkdtemp(join(tmpdir(), 'ets-inference-'));
  const workbook = new ExcelJS.Workbook();
  for (const sheet of demoWorkbook()) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }
  const file = join(scratch, 'viajes.xlsx');
  await workbook.xlsx.writeFile(file);

  const logger = createLogger('warn');
  const bootstrap = compose(env, logger);
  const owner = await bootstrap.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  await bootstrap.close();

  if (!owner) {
    process.stderr.write('\nNo hay ninguna cuenta. Ejecuta antes `corepack pnpm db:seed`.\n\n');
    return 1;
  }

  const user: AuthenticatedUser = { id: owner.id, email: owner.email, name: owner.name };

  // Sin sustituir el proposer: aqui se quiere el motor de verdad.
  const composition = compose(env, logger, {
    sessions: { getUser: () => Promise.resolve(user) },
  });
  await composition.prepare();

  const api = request(createApp(composition.dependencies));
  const name = `Inferencia ${randomUUID().slice(0, 8)}`;
  let projectId = '';

  try {
    projectId = data<{ id: string }>(await api.post('/api/projects').send({ name })).id;

    await api.post(`/api/projects/${projectId}/file`).attach('file', file);
    await api.patch(`/api/projects/${projectId}/sheets`).send({ sheets: [] });

    const started = Date.now();
    const analysis = await api.post(`/api/projects/${projectId}/analyze`);
    const jobId = data<{ id: string }>(analysis).id;

    let status = 'queued';
    for (
      let attempt = 0;
      attempt < 240 && (status === 'queued' || status === 'running');
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const job = await api.get(`/api/projects/${projectId}/jobs/${jobId}`);
      status = data<{ status: string }>(job).status;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const view = data<BlueprintView>(await api.get(`/api/projects/${projectId}/blueprint`));

    // -- La propuesta, entera ------------------------------------------------
    process.stdout.write(`\n  Aplicacion: ${view.applicationName}\n`);
    process.stdout.write(
      `  Origen:     ${view.wasInferred ? 'motor de inferencia' : 'RE-04 (determinista)'}\n`,
    );
    process.stdout.write(`  Tardo:      ${elapsed}s\n\n`);

    for (const entity of view.entities) {
      const kind = entity.derived ? 'extraida de una columna' : 'de una hoja';
      process.stdout.write(`  ${entity.label}  (${kind})\n`);
      process.stdout.write(
        `    muestra: ${entity.displayField ?? '-'}   deduplica por: ${entity.dedupeField ?? '-'}\n`,
      );
      for (const field of entity.fields) {
        const target = field.relatedTo ? ` -> ${field.relatedTo}` : '';
        process.stdout.write(`    - ${field.label.padEnd(14)} ${field.type}${target}\n`);
      }
      process.stdout.write('\n');
    }

    for (const relation of view.relations) {
      process.stdout.write(`  ${relation.description}\n`);
    }

    if (view.notes.length > 0) {
      process.stdout.write('\n  El validador ajusto:\n');
      for (const note of view.notes) process.stdout.write(`    - ${note}\n`);
    }

    // -- La puntuacion -------------------------------------------------------
    process.stdout.write('\n');
    let met = 0;

    for (const expectation of EXPECTATIONS) {
      const ok = expectation.check(view);
      if (ok) met += 1;
      process.stdout.write(`  ${ok ? 'SI ' : 'NO '} ${expectation.id}  ${expectation.question}\n`);
    }

    process.stdout.write(
      `\n  ${met}/${EXPECTATIONS.length} expectativas del ERS 18 cumplidas.\n\n` +
        '  Lo que esto NO mide: si los nombres elegidos son los que usaria el negocio,\n' +
        '  si los campos obligatorios estan bien escogidos, y si la propuesta se lee\n' +
        '  con naturalidad. Eso se juzga leyendo lo de arriba.\n\n' +
        '  Anota el resultado en docs/quality/inference-manual-check.md.\n\n',
    );

    return 0;
  } finally {
    if (projectId) {
      await api.delete(`/api/projects/${projectId}`).send({ confirmName: name });
    }
    await composition.close();
    await rm(scratch, { recursive: true, force: true });
  }
}

process.exit(await main());
