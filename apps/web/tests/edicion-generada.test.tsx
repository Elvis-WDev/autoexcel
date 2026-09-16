import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormularioGenerado } from '@/components/app/generated/formulario-generado';
import type { ModuloDelManifiesto, Registro } from '@/lib/api/aplicacion';

/**
 * Los tres estados con los que se abre el dialogo de edicion.
 *
 * El registro ya no sale de la fila cacheada de la lista: se pide al servidor
 * por su identificador, y eso significa que hay un rato en el que todavia no
 * esta, y un caso en el que no va a llegar nunca.
 */
const MODULO: ModuloDelManifiesto = {
  name: 'viajes',
  label: 'Viajes',
  displayField: 'cliente',
  fields: [
    {
      name: 'cliente',
      label: 'Cliente',
      type: 'text',
      required: true,
      options: null,
      relatedTo: null,
    },
    {
      name: 'valor',
      label: 'Valor',
      type: 'decimal',
      required: false,
      options: null,
      relatedTo: null,
    },
  ],
};

const REGISTRO: Registro = {
  id: 'r1',
  values: { cliente: 'Comercial Andes', valor: '350.00' },
  related: {},
};

function pintar(extra: Partial<React.ComponentProps<typeof FormularioGenerado>> = {}) {
  return render(
    <FormularioGenerado
      abierto
      guardando={false}
      modulo={MODULO}
      onAbiertoChange={vi.fn()}
      onGuardar={vi.fn()}
      proyectoId="p1"
      registro={null}
      {...extra}
    />,
  );
}

describe('el dialogo de edicion mientras el registro viene en camino', () => {
  it('muestra su esqueleto, no campos vacios que se rellenan solos', () => {
    pintar({ cargando: true });

    expect(screen.getByText('Cargando el registro...')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cliente/)).not.toBeInTheDocument();
  });

  /** El titulo no puede decir "Nuevo viaje" y cambiar cuando llegue el dato. */
  it('ya se llama "Editar", aunque el registro no haya llegado', () => {
    pintar({ cargando: true });

    expect(screen.getByRole('heading', { name: /Editar viaje/i })).toBeInTheDocument();
  });

  it('no deja guardar lo que todavia no se ha leido', () => {
    pintar({ cargando: true });

    expect(screen.getByRole('button', { name: /Guardar/ })).toBeDisabled();
  });

  it('al llegar, los campos traen el valor del servidor', () => {
    pintar({ registro: REGISTRO });

    expect(screen.getByLabelText(/Cliente/)).toHaveValue('Comercial Andes');
    // Hidratado: lo mismo que muestra la tabla.
    expect(screen.getByLabelText(/Valor/)).toHaveValue('350,00');
    expect(screen.getByRole('button', { name: /Guardar/ })).toBeEnabled();
  });
});

describe('el dialogo de edicion cuando el registro ya no esta', () => {
  const MENSAJE = 'Este viaje ya no existe: alguien lo elimino mientras lo abrias.';

  it('lo dice donde la persona esta mirando', () => {
    pintar({ errorAlCargar: MENSAJE });

    expect(screen.getByText(MENSAJE)).toBeInTheDocument();
  });

  it('y no ofrece guardar contra algo que no esta', () => {
    pintar({ errorAlCargar: MENSAJE });

    expect(screen.getByRole('button', { name: /Guardar/ })).toBeDisabled();
    expect(screen.queryByLabelText(/Cliente/)).not.toBeInTheDocument();
  });

  it('se puede cerrar: el boton de cancelar sigue vivo', () => {
    pintar({ errorAlCargar: MENSAJE });

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });
});
