import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from '../src/config/env.js';

const BASE = {
  DATABASE_URL: 'postgres://ets_owner:pw@localhost:5432/ets',
  DATABASE_URL_RUNTIME: 'postgres://app_runtime:pw@localhost:5432/ets',
  AUTH_SECRET: 'a'.repeat(32),
} satisfies NodeJS.ProcessEnv;

describe('parseEnv', () => {
  it('aplica los valores por defecto sobre una configuracion minima', () => {
    const env = parseEnv({ ...BASE });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.STORAGE_DIR).toBe('./storage');
    expect(env.MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it('convierte PORT de cadena a numero', () => {
    expect(parseEnv({ ...BASE, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rechaza el arranque si falta DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...sinUrl } = BASE;
    expect(() => parseEnv(sinUrl)).toThrowError(EnvValidationError);
  });

  it('rechaza una URL que no sea de postgres', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: 'mysql://localhost:3306/ets' })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it('rechaza un puerto fuera de rango', () => {
    expect(() => parseEnv({ ...BASE, PORT: '70000' })).toThrowError(EnvValidationError);
  });

  // ADR 0001: el runtime no puede compartir credenciales con el rol que emite DDL.
  it('rechaza que ambos planos usen la misma conexion', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL_RUNTIME: BASE.DATABASE_URL })).toThrowError(
      /DATABASE_URL_RUNTIME/,
    );
  });

  it('exige ANTHROPIC_API_KEY en produccion', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrowError(/ANTHROPIC_API_KEY/);
  });

  it('acepta produccion cuando la clave esta presente', () => {
    const env = parseEnv({ ...BASE, NODE_ENV: 'production', ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-xxx');
  });

  it('trata una clave vacia como ausente', () => {
    expect(parseEnv({ ...BASE, ANTHROPIC_API_KEY: '' }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('rechaza un secreto de autenticacion corto', () => {
    expect(() => parseEnv({ ...BASE, AUTH_SECRET: 'corto' })).toThrowError(/AUTH_SECRET/);
  });

  it('exige el secreto de autenticacion', () => {
    const { AUTH_SECRET: _omitted, ...sinSecreto } = BASE;
    expect(() => parseEnv(sinSecreto)).toThrowError(/AUTH_SECRET/);
  });

  it('parte la lista de origenes de confianza', () => {
    const env = parseEnv({
      ...BASE,
      AUTH_TRUSTED_ORIGINS: 'http://localhost:3000, https://app.example.com ,',
    });
    expect(env.AUTH_TRUSTED_ORIGINS).toEqual(['http://localhost:3000', 'https://app.example.com']);
  });

  it('enumera todos los problemas encontrados, no solo el primero', () => {
    try {
      parseEnv({
        ...BASE,
        DATABASE_URL: 'no-es-una-url',
        DATABASE_URL_RUNTIME: 'tampoco',
      });
      expect.unreachable('deberia haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toHaveLength(2);
    }
  });
});
