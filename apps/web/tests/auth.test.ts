import { afterEach, describe, expect, it, vi } from 'vitest';
import { esDestinoSeguro } from '@/lib/auth/destino';
import { mensajeDeAutenticacion } from '@/lib/auth/messages';
import { alPerderLaSesion, reiniciarCerrojoDeSesion } from '@/lib/auth/sesion-caducada';

describe('esDestinoSeguro', () => {
  it('acepta una ruta interna', () => {
    expect(esDestinoSeguro('/proyectos/abc?pagina=2')).toBe('/proyectos/abc?pagina=2');
  });

  /**
   * Sin esta comprobacion la pantalla de sesion seria un redirector abierto: un
   * enlace al dominio legitimo podria acabar echando a la persona en otro sitio.
   */
  it.each([
    ['https://malicioso.example/roba', 'absoluta'],
    ['//malicioso.example/roba', 'protocolo relativo'],
    ['javascript:alert(1)', 'pseudo-protocolo'],
  ])('rechaza %s (%s)', (destino) => {
    expect(esDestinoSeguro(destino)).toBeNull();
  });

  it('rechaza volver a la propia pantalla de sesion', () => {
    expect(esDestinoSeguro('/entrar')).toBeNull();
  });

  it('acepta que no haya destino', () => {
    expect(esDestinoSeguro(null)).toBeNull();
  });
});

describe('mensajeDeAutenticacion', () => {
  /**
   * Las tres causas dan el mismo texto a proposito: distinguirlas confirmaria a
   * quien lo intenta que ese correo existe en el sistema.
   */
  it('no revela si el correo existe', () => {
    const noExiste = mensajeDeAutenticacion('USER_NOT_FOUND', 401);
    const contrasenaMala = mensajeDeAutenticacion('INVALID_PASSWORD', 401);

    expect(noExiste).toBe(contrasenaMala);
    expect(noExiste).toBe('El correo o la contrasena no son correctos.');
  });

  it('traduce el limite de intentos', () => {
    expect(mensajeDeAutenticacion(undefined, 429)).toContain('Demasiados intentos');
  });

  it('da un texto seguro ante un codigo que no conoce', () => {
    expect(mensajeDeAutenticacion('ALGO_NUEVO', 500)).toBe(
      'No pudimos iniciar sesion. Intentalo de nuevo.',
    );
  });
});

describe('alPerderLaSesion', () => {
  afterEach(() => {
    reiniciarCerrojoDeSesion();
    vi.unstubAllGlobals();
  });

  function simularNavegador(pathname: string, search = ''): { assign: ReturnType<typeof vi.fn> } {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { pathname, search, assign } });
    return { assign };
  }

  it('lleva a la pantalla de sesion conservando el destino', () => {
    const { assign } = simularNavegador('/proyectos/abc', '?pagina=2');

    alPerderLaSesion();

    expect(assign).toHaveBeenCalledWith('/entrar?destino=%2Fproyectos%2Fabc%3Fpagina%3D2');
  });

  /** Cinco consultas fallando a la vez no pueden producir cinco redirecciones. */
  it('solo redirige una vez', () => {
    const { assign } = simularNavegador('/proyectos');

    alPerderLaSesion();
    alPerderLaSesion();
    alPerderLaSesion();

    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('no hace nada si ya estamos en la pantalla de sesion', () => {
    const { assign } = simularNavegador('/entrar');

    alPerderLaSesion();

    expect(assign).not.toHaveBeenCalled();
  });
});
