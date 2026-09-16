import type { LogContext, Logger } from '../../src/infrastructure/logging/logger.js';

export interface CapturedEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context: LogContext | undefined;
}

export interface CapturingLogger extends Logger {
  entries: CapturedEntry[];
}

/** Logger que guarda lo que recibe, para poder afirmar sobre el log. */
export function createCapturingLogger(): CapturingLogger {
  const entries: CapturedEntry[] = [];

  const record =
    (level: CapturedEntry['level']) =>
    (message: string, context?: LogContext): void => {
      entries.push({ level, message, context });
    };

  const logger: CapturingLogger = {
    entries,
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    child: () => logger,
  };

  return logger;
}
