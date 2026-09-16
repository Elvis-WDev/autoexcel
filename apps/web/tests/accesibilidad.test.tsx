import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { EmptyState } from '@/components/app/empty-state';
import { ErrorState } from '@/components/app/error-state';
import { PasswordField } from '@/components/app/password-field';
import { RowActionButton } from '@/components/app/row-action-button';
import { StatusBadge } from '@/components/app/status-badge';
import { AppDataTable, type ColumnaDeTabla } from '@/components/app/table/app-data-table';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CampoDelManifiesto } from '@/lib/api/aplicacion';
import { renderizadorDe } from '@/lib/aplicacion/campos';
import { esperarSinProblemasDeAccesibilidad } from './helpers/accesibilidad';
import { Trash2 } from 'lucide-react';

interface Fila extends Record<string, unknown> {
  id: string;
  nombre: string;
  valor: number;
}

const COLUMNAS: ColumnaDeTabla<Fila>[] = [
  { id: 'nombre', etiqueta: 'Nombre', celda: (f) => f.nombre, fija: true, ordenable: true },
  { id: 'valor', etiqueta: 'Valor', celda: (f) => f.valor, alineacion: 'derecha' },
];

function Envoltura({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('accesibilidad de los componentes compartidos', () => {
  it('la tabla con datos', async () => {
    const { container } = render(
      <Envoltura>
        <AppDataTable<Fila>
          busqueda=""
          columnas={COLUMNAS}
          filas={[{ id: '1', nombre: 'Comercial Andes', valor: 200 }]}
          getRowId={(f) => f.id}
          onBusquedaChange={vi.fn()}
          onOrdenChange={vi.fn()}
          onPaginaChange={vi.fn()}
          onTamanoChange={vi.fn()}
          orden={null}
          pagina={1}
          tamano={25}
          total={1}
          vacio={{ titulo: 'Nada todavia.' }}
          accionesDeFila={() => (
            <RowActionButton destructiva etiqueta="Eliminar" icono={Trash2} onClick={vi.fn()} />
          )}
        />
      </Envoltura>,
    );

    await esperarSinProblemasDeAccesibilidad(container);
  });

  it('la tabla vacia y la tabla cargando', async () => {
    const { container, rerender } = render(
      <Envoltura>
        <AppDataTable<Fila>
          busqueda=""
          columnas={COLUMNAS}
          filas={[]}
          getRowId={(f) => f.id}
          onBusquedaChange={vi.fn()}
          onOrdenChange={vi.fn()}
          onPaginaChange={vi.fn()}
          onTamanoChange={vi.fn()}
          orden={null}
          pagina={1}
          tamano={25}
          total={0}
          vacio={{ titulo: 'Nada todavia.' }}
        />
      </Envoltura>,
    );
    await esperarSinProblemasDeAccesibilidad(container);

    rerender(
      <Envoltura>
        <AppDataTable<Fila>
          busqueda=""
          cargando
          columnas={COLUMNAS}
          filas={[]}
          getRowId={(f) => f.id}
          onBusquedaChange={vi.fn()}
          onOrdenChange={vi.fn()}
          onPaginaChange={vi.fn()}
          onTamanoChange={vi.fn()}
          orden={null}
          pagina={1}
          tamano={25}
          total={0}
          vacio={{ titulo: 'Nada todavia.' }}
        />
      </Envoltura>,
    );
    await esperarSinProblemasDeAccesibilidad(container);
  });

  it('el dialogo de confirmacion con nombre escrito', async () => {
    render(
      <ConfirmDialog
        abierto
        consecuencia="Se eliminara todo."
        nivel="irreversible"
        nombreParaConfirmar="Gestion de Viajes"
        onAbiertoChange={vi.fn()}
        onConfirmar={vi.fn()}
        titulo="Eliminar Gestion de Viajes"
      />,
    );

    // El dialogo se monta en un portal, fuera del contenedor del render.
    await esperarSinProblemasDeAccesibilidad(document.body);
  });

  it('los estados vacio y de error', async () => {
    const { container } = render(
      <>
        <EmptyState motivo="sin-datos" titulo="Todavia no hay proyectos." />
        <ErrorState error={new Error('x')} onReintentar={vi.fn()} />
      </>,
    );

    await esperarSinProblemasDeAccesibilidad(container);
  });

  it('el campo de contrasena', async () => {
    const { container } = render(<PasswordField label="Contrasena" />);
    await esperarSinProblemasDeAccesibilidad(container);
  });

  it('las etiquetas de estado', async () => {
    const { container } = render(
      <>
        <StatusBadge tono="exito">Lista</StatusBadge>
        <StatusBadge enCurso tono="progreso">
          Analizando
        </StatusBadge>
      </>,
    );
    await esperarSinProblemasDeAccesibilidad(container);
  });
});

describe('accesibilidad de los controles generados', () => {
  function campo(parcial: Partial<CampoDelManifiesto> = {}): CampoDelManifiesto {
    return {
      name: 'campo',
      label: 'Campo',
      type: 'text',
      required: false,
      options: null,
      relatedTo: null,
      ...parcial,
    };
  }

  /**
   * Los controles se generan en tiempo de ejecucion, asi que nadie los revisa
   * uno a uno antes de que alguien los use. Si a un tipo se le olvida la
   * etiqueta, aqui se ve.
   */
  it.each([
    ['text', {}],
    ['integer', {}],
    ['decimal', {}],
    ['email', {}],
    ['phone', {}],
    ['boolean', {}],
    ['date', {}],
    ['select', { options: ['Abierto', 'Cerrado'] }],
  ])('el control de %s tiene etiqueta asociada', async (tipo, extra) => {
    const definicion = campo({ type: tipo, label: 'Mi campo', ...extra });

    const { container } = render(
      <>
        {renderizadorDe(tipo).control({
          campo: definicion,
          onChange: vi.fn(),
          proyectoId: 'p1',
          valor: null,
        })}
      </>,
    );

    expect(screen.getByLabelText(/Mi campo/)).toBeInTheDocument();
    await esperarSinProblemasDeAccesibilidad(container);
  });
});

describe('teclado', () => {
  /** Un icono sin nombre es invisible para un lector de pantalla. */
  it('las acciones de fila tienen nombre y se alcanzan con tabulador', async () => {
    const usuario = userEvent.setup();
    const alPulsar = vi.fn();

    render(
      <Envoltura>
        <RowActionButton etiqueta="Eliminar el proyecto" icono={Trash2} onClick={alPulsar} />
      </Envoltura>,
    );

    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Eliminar el proyecto' })).toHaveFocus();

    await usuario.keyboard('{Enter}');
    expect(alPulsar).toHaveBeenCalled();
  });

  /** Deshabilitado con motivo: el motivo tiene que poder leerse. */
  it('una accion deshabilitada explica por que', async () => {
    const usuario = userEvent.setup();

    render(
      <Envoltura>
        <RowActionButton
          deshabilitadaPorque="Tu aplicacion necesita al menos un modulo."
          etiqueta="Eliminar"
          icono={Trash2}
        />
      </Envoltura>,
    );

    await usuario.hover(screen.getByRole('button', { name: 'Eliminar' }));
    expect(
      await screen.findByText('Tu aplicacion necesita al menos un modulo.'),
    ).toBeInTheDocument();
  });
});
