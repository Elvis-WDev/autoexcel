export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

/**
 * Puerto de registro. Vive en `application` y no en `infrastructure` para que
 * los casos de uso puedan registrar sin importar una implementacion concreta
 * (`docs/architecture/backend.md`: "Application logic depends on ports").
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Deriva un logger que arrastra contexto fijo, p. ej. `{ projectId, jobId }`. */
  child(context: LogContext): Logger;
}
