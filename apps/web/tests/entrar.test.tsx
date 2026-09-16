import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RespuestaDeEntrada {
  error: { code?: string; status: number } | null;
}

// `vi.hoisted` porque las fabricas de `vi.mock` se elevan por encima de las
// declaraciones: sin esto, el doble no existiria todavia cuando se usa.
const { signInEmail, replace, refresh } = vi.hoisted(() => ({
  signInEmail:
    vi.fn<(entrada: { email: string; password: string }) => Promise<RespuestaDeEntrada>>(),
  replace: vi.fn<(ruta: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

let parametros = new URLSearchParams();

vi.mock('@/lib/auth/client', () => ({ signIn: { email: signInEmail } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => parametros,
}));

const { FormularioEntrar } = await import('@/app/(auth)/entrar/formulario-entrar');

async function rellenarYEnviar(correo = 'ana@example.test', contrasena = 'secreta-larga') {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Correo'), correo);
  await usuario.type(screen.getByLabelText('Contrasena'), contrasena);
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
  return usuario;
}

describe('V1 — Entrar', () => {
  beforeEach(() => {
    parametros = new URLSearchParams();
    signInEmail.mockReset();
    replace.mockReset();
  });

  /** El registro publico esta cerrado: ofrecerlo seria mentir. */
  it('no ofrece crear una cuenta', () => {
    render(<FormularioEntrar />);

    expect(screen.queryByText(/crear.*cuenta|registr/i)).toBeNull();
  });

  it('entra y va al destino guardado', async () => {
    parametros = new URLSearchParams('destino=/proyectos/abc');
    signInEmail.mockResolvedValue({ error: null });

    render(<FormularioEntrar />);
    await rellenarYEnviar();

    expect(signInEmail).toHaveBeenCalledWith({
      email: 'ana@example.test',
      password: 'secreta-larga',
    });
    expect(replace).toHaveBeenCalledWith('/proyectos/abc');
  });

  it('ignora un destino que apunta fuera', async () => {
    parametros = new URLSearchParams('destino=https://malicioso.example');
    signInEmail.mockResolvedValue({ error: null });

    render(<FormularioEntrar />);
    await rellenarYEnviar();

    expect(replace).toHaveBeenCalledWith('/proyectos');
  });

  /**
   * El error va en linea y no en un toast: persiste hasta corregirlo. Y el
   * correo escrito se conserva, porque volver a teclearlo es castigo sin motivo.
   */
  it('explica el fallo sin borrar lo escrito', async () => {
    signInEmail.mockResolvedValue({
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 },
    });

    render(<FormularioEntrar />);
    await rellenarYEnviar();

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('El correo o la contrasena no son correctos.');
    expect(screen.getByLabelText('Correo')).toHaveValue('ana@example.test');
    expect(replace).not.toHaveBeenCalled();
  });

  it('impide el doble envio mientras espera', async () => {
    signInEmail.mockReturnValue(new Promise(() => undefined));

    render(<FormularioEntrar />);
    await rellenarYEnviar();

    const boton = screen.getByRole('button', { name: /Entrando/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
  });

  it('la contrasena se puede revelar y volver a ocultar', async () => {
    const usuario = userEvent.setup();
    render(<FormularioEntrar />);

    const campo = screen.getByLabelText('Contrasena');
    expect(campo).toHaveAttribute('type', 'password');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar la contrasena' }));
    expect(campo).toHaveAttribute('type', 'text');

    await usuario.click(screen.getByRole('button', { name: 'Ocultar la contrasena' }));
    expect(campo).toHaveAttribute('type', 'password');
  });
});
