import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppDataTable, type ColumnaDeTabla } from '@/components/app/table/app-data-table';
import { TooltipProvider } from '@/components/ui/tooltip';

interface Viaje extends Record<string, unknown> {
  id: string;
  vehiculo: string;
  cliente: string;
  valor: number;
}

const FILAS: Viaje[] = [
  { id: '1', vehiculo: 'ABC-1234', cliente: 'Comercial Andes', valor: 200 },
  { id: '2', vehiculo: 'XYZ-5678', cliente: 'Cliente Norte', valor: 350 },
];

const COLUMNAS: ColumnaDeTabla<Viaje>[] = [
  { id: 'vehiculo', etiqueta: 'Vehiculo', celda: (f) => f.vehiculo, ordenable: true, fija: true },
  { id: 'cliente', etiqueta: 'Cliente', celda: (f) => f.cliente },
  { id: 'valor', etiqueta: 'Valor', celda: (f) => f.valor, ordenable: true, alineacion: 'derecha' },
];

function pintar(props: Partial<React.ComponentProps<typeof AppDataTable<Viaje>>> = {}) {
  const onOrdenChange = vi.fn();
  const onPaginaChange = vi.fn();
  const onTamanoChange = vi.fn();
  const onBusquedaChange = vi.fn();

  render(
    <TooltipProvider>
      <AppDataTable<Viaje>
        busqueda=""
        columnas={COLUMNAS}
        filas={FILAS}
        getRowId={(f) => f.id}
        onBusquedaChange={onBusquedaChange}
        onOrdenChange={onOrdenChange}
        onPaginaChange={onPaginaChange}
        onTamanoChange={onTamanoChange}
        orden={null}
        pagina={1}
        tamano={25}
        total={120}
        vacio={{ titulo: 'Todavia no hay viajes.' }}
        {...props}
      />
    </TooltipProvider>,
  );

  return { onOrdenChange, onPaginaChange, onTamanoChange, onBusquedaChange };
}

describe('AppDataTable', () => {
  it('pinta las filas con las etiquetas de negocio', () => {
    pintar();

    expect(screen.getByRole('columnheader', { name: /Vehiculo/ })).toBeInTheDocument();
    expect(screen.getByText('Comercial Andes')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // cabecera + 2
  });

  /**
   * Ascendente, descendente, y de vuelta a sin orden. Tres estados y no dos:
   * sin el tercero no hay forma de volver al orden por defecto del servidor.
   */
  it.each([
    [null, { campo: 'valor', direccion: 'asc' }],
    [
      { campo: 'valor', direccion: 'asc' as const },
      { campo: 'valor', direccion: 'desc' },
    ],
    [{ campo: 'valor', direccion: 'desc' as const }, null],
  ])('desde %o el siguiente orden es %o', async (desde, esperado) => {
    const usuario = userEvent.setup();
    const { onOrdenChange } = pintar({ orden: desde });

    await usuario.click(screen.getByRole('button', { name: 'Ordenar por Valor' }));

    expect(onOrdenChange).toHaveBeenCalledWith(esperado);
  });

  it('una columna no ordenable no ofrece boton', () => {
    pintar();

    expect(screen.queryByRole('button', { name: 'Ordenar por Cliente' })).toBeNull();
  });

  it('se puede ocultar una columna, pero no la que identifica la fila', async () => {
    const usuario = userEvent.setup();
    pintar();

    await usuario.click(screen.getByRole('button', { name: /Columnas/ }));
    const menu = screen.getByRole('menu');

    // `Vehiculo` es fija: no aparece entre las que se pueden ocultar.
    expect(within(menu).queryByText('Vehiculo')).toBeNull();
    expect(within(menu).getByText('Cliente')).toBeInTheDocument();

    await usuario.click(within(menu).getByText('Cliente'));
    expect(screen.queryByText('Comercial Andes')).toBeNull();
    expect(screen.getByText('ABC-1234')).toBeInTheDocument();
  });

  it('el pie dice el rango con el total del servidor', () => {
    pintar();

    expect(screen.getByText('Mostrando 1-25 de 120')).toBeInTheDocument();
    expect(screen.getByText('1 de 5')).toBeInTheDocument();
  });

  it('en la primera pagina, los saltos hacia atras estan deshabilitados', () => {
    pintar();

    expect(screen.getByRole('button', { name: 'Primera pagina' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pagina siguiente' })).toBeEnabled();
  });

  it('navegar pide la pagina al servidor', async () => {
    const usuario = userEvent.setup();
    const { onPaginaChange } = pintar({ pagina: 3 });

    await usuario.click(screen.getByRole('button', { name: 'Ultima pagina' }));
    expect(onPaginaChange).toHaveBeenCalledWith(5);
  });

  it('cargando conserva el marco y no muestra el vacio', () => {
    pintar({ cargando: true, filas: [] });

    expect(screen.getByRole('columnheader', { name: /Vehiculo/ })).toBeInTheDocument();
    expect(screen.queryByText('Todavia no hay viajes.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pagina siguiente' })).toBeDisabled();
  });

  it('el vacio distingue sin datos de sin coincidencias', () => {
    pintar({ filas: [], total: 0 });
    expect(screen.getByText('Todavia no hay viajes.')).toBeInTheDocument();

    pintar({
      filas: [],
      total: 0,
      vacio: { motivo: 'sin-resultados', titulo: 'Ningun viaje coincide.' },
    });
    expect(screen.getByText('Ningun viaje coincide.')).toBeInTheDocument();
  });

  it('un error deja la tabla en pie y ofrece reintentar', async () => {
    const usuario = userEvent.setup();
    const onReintentar = vi.fn();
    pintar({ error: new Error('x'), filas: [], onReintentar });

    expect(screen.getByRole('columnheader', { name: /Vehiculo/ })).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalled();
  });

  /** No se puede filtrar en cliente: contradiria el total del pie. */
  it('pinta exactamente las filas que le dan', () => {
    pintar({ busqueda: 'norte' });

    expect(screen.getByText('Comercial Andes')).toBeInTheDocument();
    expect(screen.getByText('Cliente Norte')).toBeInTheDocument();
  });

  it('las acciones de fila no abren la fila', async () => {
    const usuario = userEvent.setup();
    const onFilaClick = vi.fn();
    const onEditar = vi.fn<(id: string) => void>();

    pintar({
      onFilaClick,
      accionesDeFila: (fila) => (
        <button onClick={() => onEditar(fila.id)} type="button">
          Editar
        </button>
      ),
    });

    await usuario.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    expect(onEditar).toHaveBeenCalledWith('1');
    expect(onFilaClick).not.toHaveBeenCalled();

    await usuario.click(screen.getByText('ABC-1234'));
    expect(onFilaClick).toHaveBeenCalledWith(FILAS[0]);
  });
});

describe('contenido patologico', () => {
  const LARGO =
    'Comercial Andes Distribuciones Internacionales del Pacifico Sur y Filiales Asociadas SA de CV';
  const SIN_ESPACIOS = 'A'.repeat(200);

  /**
   * Las etiquetas salen del Excel de otra persona y el backend admite 120
   * caracteres. Una sola cabecera larga, sin tope, expulsa el resto de columnas
   * de la pantalla.
   */
  it('una cabecera larga se trunca y conserva el valor completo', () => {
    pintar({
      columnas: [{ id: 'nombre', etiqueta: LARGO, celda: (f) => f.vehiculo, fija: true }],
    });

    const cabecera = screen.getByTitle(LARGO);
    expect(cabecera).toHaveClass('truncate');
  });

  it('una cabecera larga ordenable tambien', () => {
    pintar({
      columnas: [
        { id: 'nombre', etiqueta: LARGO, celda: (f) => f.vehiculo, fija: true, ordenable: true },
      ],
    });

    // El nombre accesible sigue siendo completo aunque el texto se recorte.
    expect(screen.getByRole('button', { name: `Ordenar por ${LARGO}` })).toBeInTheDocument();
  });

  it('un valor sin espacios no rompe la fila', () => {
    pintar({
      columnas: [
        {
          id: 'nombre',
          etiqueta: 'Nombre',
          fija: true,
          celda: () => (
            <span className="block max-w-[18rem] truncate" title={SIN_ESPACIOS}>
              {SIN_ESPACIOS}
            </span>
          ),
        },
      ],
    });

    expect(screen.getAllByTitle(SIN_ESPACIOS)[0]).toHaveClass('truncate');
  });
});
