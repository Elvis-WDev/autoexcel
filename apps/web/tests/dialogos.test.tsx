import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormDialog } from '@/components/app/form-dialog';
import { Input } from '@/components/ui/input';

describe('FormDialog', () => {
  function Anfitrion({ guardando = false, onSubmit = vi.fn() }) {
    const [abierto, setAbierto] = useState(false);
    return (
      <>
        <button onClick={() => setAbierto(true)} type="button">
          Abrir
        </button>
        <FormDialog
          abierto={abierto}
          guardando={guardando}
          onAbiertoChange={setAbierto}
          onSubmit={onSubmit}
          titulo="Nuevo proyecto"
        >
          <Input aria-label="Nombre" />
        </FormDialog>
      </>
    );
  }

  it('lleva el foco dentro al abrir y lo devuelve al cerrar', async () => {
    const usuario = userEvent.setup();
    render(<Anfitrion />);

    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await usuario.click(abrir);

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Nuevo proyecto');
    expect(dialogo.contains(document.activeElement)).toBe(true);

    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    // El foco vuelve a donde estaba: sin esto, quien navega con teclado se
    // queda al principio de la pagina. La restauracion es asincrona.
    await waitFor(() => expect(document.activeElement).toBe(abrir));
  });

  it('Enter en un campo guarda, igual que el boton', async () => {
    const usuario = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Anfitrion onSubmit={onSubmit} />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await usuario.type(await screen.findByLabelText('Nombre'), 'Viajes{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /**
   * Abandonar a mitad de un guardado deja a la persona sin saber si se guardo,
   * asi que mientras dura no se puede cerrar por ningun camino.
   */
  it('mientras guarda no se cierra ni con Escape', async () => {
    const usuario = userEvent.setup();
    render(<AnfitrionGuardando />);

    await usuario.click(screen.getByRole('button', { name: 'Abrir' }));
    await screen.findByRole('dialog');

    await usuario.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  function AnfitrionGuardando() {
    const [abierto, setAbierto] = useState(false);
    return (
      <>
        <button onClick={() => setAbierto(true)} type="button">
          Abrir
        </button>
        <FormDialog
          abierto={abierto}
          guardando
          onAbiertoChange={setAbierto}
          onSubmit={vi.fn()}
          titulo="Nuevo proyecto"
        >
          <Input aria-label="Nombre" />
        </FormDialog>
      </>
    );
  }
});

describe('ConfirmDialog — la escalera', () => {
  function pintar(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
    const onConfirmar = vi.fn();
    render(
      <ConfirmDialog
        abierto
        consecuencia="Se eliminaran la aplicacion y todos sus registros."
        onAbiertoChange={vi.fn()}
        onConfirmar={onConfirmar}
        titulo="Eliminar Gestion de Viajes"
        {...props}
      />,
    );
    return { onConfirmar };
  }

  it('lo reversible se confirma en un paso, sin escribir', async () => {
    const usuario = userEvent.setup();
    const { onConfirmar } = pintar({ nivel: 'reversible', textoDeAccion: 'Archivar' });

    expect(screen.queryByLabelText(/Escribe/)).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(onConfirmar).toHaveBeenCalled();
  });

  it('lo irreversible exige escribir el nombre exacto', async () => {
    const usuario = userEvent.setup();
    const { onConfirmar } = pintar({
      nivel: 'irreversible',
      nombreParaConfirmar: 'Gestion de Viajes',
    });

    const boton = screen.getByRole('button', { name: 'Eliminar' });
    expect(boton).toBeDisabled();

    const campo = screen.getByRole('textbox');
    await usuario.type(campo, 'Gestion de');
    expect(boton).toBeDisabled();

    await usuario.type(campo, ' Viajes');
    expect(boton).toBeEnabled();

    await usuario.click(boton);
    expect(onConfirmar).toHaveBeenCalled();
  });

  it('nombra el registro y la consecuencia, no "¿estas seguro?"', () => {
    pintar();

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Eliminar Gestion de Viajes');
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Se eliminaran la aplicacion y todos sus registros.',
    );
    expect(screen.queryByText(/seguro/i)).toBeNull();
  });

  it('en lote, dice a cuantos afecta', () => {
    pintar({ nivel: 'irreversible', nombreParaConfirmar: 'x', cantidad: 12 });

    expect(screen.getByText('Se veran afectados 12 registros.')).toBeInTheDocument();
  });

  /** Un Enter de inercia no puede borrar nada. */
  it('el foco inicial es Cancelar, no el boton destructivo', () => {
    pintar({ nivel: 'reversible' });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  });
});
