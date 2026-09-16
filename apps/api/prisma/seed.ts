/**
 * Crea la primera cuenta.
 *
 * El registro publico esta cerrado (`disableSignUp`), y esa bandera bloquea
 * tambien la llamada desde el servidor. Asi que este script levanta su propia
 * instancia de Better Auth con el registro abierto, solo durante la siembra.
 *
 * Sigue siendo Better Auth quien crea la cuenta: el hash de la contrasena y la
 * forma de las tablas son suyos, aqui no se escribe un INSERT a mano.
 *
 *   SEED_EMAIL=tu@correo SEED_PASSWORD=... corepack pnpm db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createAuth } from '../src/infrastructure/auth/auth.js';
import { parseEnv } from '../src/config/env.js';
import { PrismaClient } from '../src/infrastructure/database/generated/client.js';

try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const env = parseEnv();

const email = process.env.SEED_EMAIL ?? 'admin@example.com';
const password = process.env.SEED_PASSWORD;
const name = process.env.SEED_NAME ?? 'Administrador';

if (!password) {
  console.error(
    '\nFalta SEED_PASSWORD.\n\n' +
      '  SEED_EMAIL=tu@correo SEED_PASSWORD="una contrasena larga" corepack pnpm db:seed\n\n' +
      'Minimo 12 caracteres.\n',
  );
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const auth = createAuth(prisma, env, { allowSignUp: true });

try {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    process.stdout.write(`Ya existe una cuenta con ${email}. No se hizo nada.\n`);
  } else {
    await auth.api.signUpEmail({ body: { email, password, name } });
    process.stdout.write(`Cuenta creada: ${email}\n`);
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
