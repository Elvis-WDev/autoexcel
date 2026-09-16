import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { ApiError } from '@/lib/api/errors';

const { exito, fallo } = vi.hoisted(() => ({
  exito: vi.fn<(mensaje: string, opciones?: unknown) => void>(),
  fallo: vi.fn<(mensaje: string, opciones?: unknown) => void>(),
}));

vi.mock('sonner', () => ({ toast: { success: exito, error: fallo } }));

function envoltorio(cliente: QueryClient) {
  return function Envoltorio({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
  };
}

function nuevoCliente(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('useMutationFeedback', () => {
  beforeEach(() => {
    exito.mockReset();
    fallo.mockReset();
  });

  it('anuncia el exito e invalida lo que dejo de ser cierto', async () => {
    const cliente = nuevoCliente();
    const invalidar = vi.spyOn(cliente, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () => Promise.resolve({ id: 'p1' }),
          success: 'Proyecto creado.',
          invalidate: [['proyectos']],
        }),
      { wrapper: envoltorio(cliente) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(exito).toHaveBeenCalled());
    expect(exito).toHaveBeenCalledWith('Proyecto creado.', { id: 'Proyecto creado.' });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['proyectos'] });
  });

  /**
   * El backend ya escribe en lenguaje de negocio y en español. Reescribir sus
   * mensajes aqui seria mantener dos copias, y acabarian diciendo cosas
   * distintas.
   */
  it('muestra el mensaje del backend tal cual', async () => {
    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () =>
            Promise.reject(
              new ApiError({
                code: 'CONFLICT',
                message: 'Has alcanzado el limite de 3 proyectos.',
                status: 409,
              }),
            ),
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(fallo).toHaveBeenCalled());
    expect(fallo.mock.calls[0]![0]).toBe('Has alcanzado el limite de 3 proyectos.');
  });

  /** Un fallo interno no se le cuenta a nadie: solo su referencia, para soporte. */
  it('oculta el detalle de un error interno pero deja la referencia', async () => {
    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () =>
            Promise.reject(
              new ApiError({
                code: 'INTERNAL_ERROR',
                message: 'TypeError: cannot read property of undefined',
                status: 500,
                requestId: 'abc-123',
              }),
            ),
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(fallo).toHaveBeenCalled());
    const [mensaje, opciones] = fallo.mock.calls[0]!;
    expect(mensaje).toBe('Algo salio mal. Intentalo de nuevo.');
    expect(mensaje).not.toContain('TypeError');
    expect(opciones).toMatchObject({ description: 'Referencia: abc-123' });
  });

  /** El interceptor ya esta redirigiendo: un aviso rojo encima solo estorba. */
  it('calla ante un 401, porque la sesion ya se esta resolviendo', async () => {
    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () =>
            Promise.reject(
              new ApiError({
                code: 'UNAUTHENTICATED',
                message: 'Necesitas iniciar sesion.',
                status: 401,
              }),
            ),
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fallo).not.toHaveBeenCalled();
  });

  it('explica una caida de red, que no trae mensaje', async () => {
    const { result } = renderHook(
      () =>
        useMutationFeedback({ mutationFn: () => Promise.reject(new TypeError('Failed to fetch')) }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(fallo).toHaveBeenCalled());
    expect(fallo.mock.calls[0]![0]).toContain('No pudimos conectar');
  });

  it('un texto propio gana al del backend cuando se pide', async () => {
    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () =>
            Promise.reject(new ApiError({ code: 'CONFLICT', message: 'generico', status: 409 })),
          errors: { CONFLICT: 'Ese proyecto tiene registros que dependen de el.' },
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(fallo).toHaveBeenCalled());
    expect(fallo.mock.calls[0]![0]).toBe('Ese proyecto tiene registros que dependen de el.');
  });
});

describe('reaccion propia al fallo', () => {
  /**
   * `onError` se anade al aviso, no lo sustituye: quien lo usa resincroniza una
   * ruta o devuelve el foco, pero el camino de respuesta lo sigue garantizando
   * el envoltorio. Si lo reemplazara, bastaria un `onError` olvidadizo para que
   * una mutacion fallara en silencio.
   */
  it('se ejecuta ademas del aviso, no en su lugar', async () => {
    const reaccion = vi.fn();

    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () =>
            Promise.reject(
              new ApiError({
                code: 'INVALID_STATE',
                message: 'Ya confirmaste esta estructura.',
                status: 409,
              }),
            ),
          onError: reaccion,
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(reaccion).toHaveBeenCalled());
    expect(fallo).toHaveBeenCalledWith('Ya confirmaste esta estructura.', expect.anything());
  });

  it('se ejecuta tambien cuando el aviso esta silenciado', async () => {
    const reaccion = vi.fn();

    const { result } = renderHook(
      () =>
        useMutationFeedback({
          mutationFn: () => Promise.reject(new Error('x')),
          onError: reaccion,
          silenciarError: true,
        }),
      { wrapper: envoltorio(nuevoCliente()) },
    );

    result.current.mutate(undefined);

    await waitFor(() => expect(reaccion).toHaveBeenCalled());
    expect(fallo).not.toHaveBeenCalled();
  });
});
