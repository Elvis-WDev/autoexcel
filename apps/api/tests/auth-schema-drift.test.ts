import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAuthTables } from 'better-auth/db';
import { describe, expect, it } from 'vitest';
import { TEST_ENV } from './helpers/test-app.js';

/**
 * Better Auth es duenno de sus tablas, pero quien las declara en
 * `schema.prisma` somos nosotros, a mano. Eso deja una grieta: si una
 * actualizacion de la libreria anade un campo, nada avisa hasta que algo falla
 * en produccion con un error de columna inexistente.
 *
 * Este test cierra la grieta. Le pregunta a Better Auth que forma espera y
 * comprueba que el schema la cubre. No sustituye a `@better-auth/cli generate`,
 * pero corre en cada `pnpm verify` y no arrastra dependencias.
 */

const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));
const schema = readFileSync(schemaPath, 'utf8');

/** Nombres de campo declarados dentro de un `model X { ... }`. */
function fieldsOfModel(model: string): Set<string> {
  const match = new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match?.[1]) return new Set();

  const fields = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/)[0])
    .filter((name): name is string => name !== undefined);

  return new Set(fields);
}

/** `user` -> `User`: Better Auth nombra las tablas en minusculas. */
function toModelName(table: string): string {
  return table.charAt(0).toUpperCase() + table.slice(1);
}

describe('schema de Better Auth', () => {
  const tables = getAuthTables({
    secret: TEST_ENV.AUTH_SECRET,
    emailAndPassword: { enabled: true },
  });

  it('declara una tabla en schema.prisma por cada una que espera Better Auth', () => {
    for (const table of Object.values(tables)) {
      const model = toModelName(table.modelName);
      expect(fieldsOfModel(model).size, `falta el modelo ${model}`).toBeGreaterThan(0);
    }
  });

  it('declara todos los campos que espera Better Auth', () => {
    const missing: string[] = [];

    for (const table of Object.values(tables)) {
      const model = toModelName(table.modelName);
      const declared = fieldsOfModel(model);

      for (const [fieldName, field] of Object.entries(table.fields)) {
        const expected = field.fieldName ?? fieldName;
        if (!declared.has(expected)) missing.push(`${model}.${expected}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('mapea cada modelo al nombre de tabla que usa Better Auth', () => {
    for (const table of Object.values(tables)) {
      const model = toModelName(table.modelName);
      expect(schema, `${model} deberia mapear a "${table.modelName}"`).toContain(
        `@@map("${table.modelName}")`,
      );
    }
  });
});
