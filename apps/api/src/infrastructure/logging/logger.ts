import type { LogContext, Logger, LogLevel } from '../../application/ports/logger.js';

export type { LogContext, Logger, LogLevel };

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Logger estructurado en JSON, sin dependencias.
 *
 * Escribe a stdout una linea por evento. F8 le anadira correlacion sistematica
 * por `requestId`, `projectId` y `jobId`.
 */
export function createLogger(level: LogLevel = 'info', baseContext: LogContext = {}): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const write = (entryLevel: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_WEIGHT[entryLevel] < threshold) return;

    const line = JSON.stringify({
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...baseContext,
      ...context,
    });

    process.stdout.write(`${line}\n`);
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    child: (context) => createLogger(level, { ...baseContext, ...context }),
  };
}

/** Logger inerte, para tests que no deben ensuciar la salida. */
export function createSilentLogger(): Logger {
  const noop = (): void => undefined;
  const logger: Logger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}
