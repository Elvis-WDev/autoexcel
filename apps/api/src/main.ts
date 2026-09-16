import type { Server } from 'node:http';
import { createApp } from './app.js';
import { compose, type Composition } from './composition-root.js';
import { EnvValidationError, parseEnv, type Env } from './config/env.js';
import { createLogger, type Logger } from './infrastructure/logging/logger.js';
import { APP_VERSION } from './version.js';

/**
 * Carga `.env` si existe. En produccion las variables llegan del entorno del
 * contenedor y el archivo no existe: eso no es un error.
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // Sin archivo .env. Se usan las variables ya presentes en el entorno.
  }
}

function readEnvOrExit(): Env {
  try {
    return parseEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(`\n${error.message}\n\nRevisa apps/api/.env.example.\n`);
      process.exit(1);
    }
    throw error;
  }
}

function installShutdown(server: Server, composition: Composition, logger: Logger): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Apagando', { signal });

    server.close((closeError) => {
      if (closeError) logger.error('Error al cerrar el servidor', { message: closeError.message });

      composition
        .close()
        .then(() => process.exit(closeError ? 1 : 0))
        .catch(() => process.exit(1));
    });

    // Si algo queda colgado, no esperamos indefinidamente.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main(): Promise<void> {
  loadDotEnv();

  const env = readEnvOrExit();
  const logger = createLogger(env.LOG_LEVEL);
  const composition = compose(env, logger);
  await composition.prepare();
  const app = createApp(composition.dependencies);

  if (env.NODE_ENV !== 'production' && !env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY no esta definida. La inferencia (F3) no funcionara.');
  }

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info('API escuchando', {
      host: env.HOST,
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      version: APP_VERSION,
    });
  });

  installShutdown(server, composition, logger);

  process.on('unhandledRejection', (reason) => {
    logger.error('Promesa rechazada sin manejar', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Excepcion no capturada', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

await main();
