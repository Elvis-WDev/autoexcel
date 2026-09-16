import { defineConfig } from 'prisma/config';

// La CLI de Prisma no carga `.env` por si misma en la version 7.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del entorno.
}

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL no esta definida. Copia apps/api/.env.example a apps/api/.env.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Solo la usa la CLI (migrate, introspect). El cliente se conecta mediante el
  // driver adapter de `pg`, no por esta URL.
  datasource: { url },
});
