import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registrarIntentoDeAcceso,
  reiniciarIntentosDeAcceso,
  type LimiteDeAcceso,
} from '../src/infrastructure/auth/login-throttle.js';

const LIMITE: LimiteDeAcceso = { intentos: 3, ventanaMs: 60_000 };

function intentar(correo: string, veces: number): boolean[] {
  return Array.from({ length: veces }, () => registrarIntentoDeAcceso(correo, LIMITE).permitido);
}

describe('limite de intentos de acceso', () => {
  beforeEach(() => {
    reiniciarIntentosDeAcceso();
    vi.useRealTimers();
  });

  it('permite los primeros y corta el siguiente', () => {
    expect(intentar('ana@example.test', 5)).toEqual([true, true, true, false, false]);
  });

  /**
   * La razon de contar por cuenta y no por direccion: quien ataca cambia de
   * salida las veces que quiera, pero la cuenta a la que apunta es la misma.
   */
  it('una cuenta agotada no afecta a las demas', () => {
    intentar('ana@example.test', 4);

    expect(registrarIntentoDeAcceso('ana@example.test', LIMITE).permitido).toBe(false);
    expect(registrarIntentoDeAcceso('luis@example.test', LIMITE).permitido).toBe(true);
  });

  /** Sin normalizar, bastaria alternar mayusculas para estrenar contador. */
  it('el correo se normaliza antes de contar', () => {
    intentar('ana@example.test', 3);

    for (const variante of ['ANA@example.test', '  Ana@Example.Test  ']) {
      expect(registrarIntentoDeAcceso(variante, LIMITE).permitido, variante).toBe(false);
    }
  });

  /**
   * No distingue si la cuenta existe, y es deliberado: un limite que solo se
   * aplicara a correos reales confirmaria cuales lo son.
   */
  it('cuenta igual una cuenta que no existe', () => {
    expect(intentar('no-existe@example.test', 4).at(-1)).toBe(false);
  });

  it('dice cuanto falta para poder reintentar', () => {
    intentar('ana@example.test', 3);
    const resultado = registrarIntentoDeAcceso('ana@example.test', LIMITE);

    expect(resultado.permitido).toBe(false);
    if (!resultado.permitido) {
      expect(resultado.reintentarEn).toBeGreaterThan(0);
      expect(resultado.reintentarEn).toBeLessThanOrEqual(60);
    }
  });

  it('la ventana caduca y se vuelve a permitir', () => {
    vi.useFakeTimers();
    intentar('ana@example.test', 4);
    expect(registrarIntentoDeAcceso('ana@example.test', LIMITE).permitido).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(registrarIntentoDeAcceso('ana@example.test', LIMITE).permitido).toBe(true);
  });

  it('un limite de uno deja pasar solo el primero', () => {
    const estricto: LimiteDeAcceso = { intentos: 1, ventanaMs: 60_000 };

    expect(registrarIntentoDeAcceso('ana@example.test', estricto).permitido).toBe(true);
    expect(registrarIntentoDeAcceso('ana@example.test', estricto).permitido).toBe(false);
  });
});
