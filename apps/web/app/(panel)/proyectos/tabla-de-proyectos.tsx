'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { RowActionButton } from '@/components/app/row-action-button';
import { StatusBadge } from '@/components/app/status-badge';
import { AppDataTable, type ColumnaDeTabla } from '@/components/app/table/app-data-table';
import { Button } from '@/components/ui/button';
import { useEstadoEnUrl } from '@/hooks/use-estado-en-url';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import {
  clavesDeProyectos,
  eliminarProyecto,
  listarProyectos,
  type MetaDeLista,
  type Proyecto,
} from '@/lib/api/proyectos';
import { fechaCompleta, haceCuanto } from '@/lib/formato/fechas';
import { estaTerminado, vistaDeEstado } from '@/lib/proyectos/estados';
import { DialogoNuevoProyecto } from './dialogo-nuevo-proyecto';

/**
 * V2 — Proyectos.
 *
 * La portada del producto y el primer modulo completo: listar, buscar, paginar,
 * crear y eliminar, todo contra el backend real.
 *
 * Las columnas son tres. Ni `slug`, ni `updatedAt`, ni identificadores: ninguno
 * ayuda a decidir que proyecto abrir, y `data-tables.md` pide esconder por
 * defecto lo que no se usa para escanear.
 *
 * Abrir un proyecto lleva al despachador, que mira su estado y decide en que
 * paso del asistente continua. La tabla no necesita saber nada de eso.
 */
export function TablaDeProyectos(): React.ReactElement {
  const router = useRouter();
  const { estado, setBusqueda, setPagina, setTamano, limpiar } = useEstadoEnUrl();

  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Proyecto | null>(null);

  const consulta = {
    busqueda: estado.busqueda,
    pagina: estado.pagina,
    tamano: estado.tamano,
  };

  const lista = useQuery({
    queryKey: clavesDeProyectos.lista(consulta),
    queryFn: ({ signal }) => listarProyectos(consulta, signal),
    // Al pasar de pagina se mantiene la anterior mientras llega la nueva: sin
    // esto la tabla parpadea a vacio y salta el alto de la pagina.
    placeholderData: keepPreviousData,
  });

  const eliminar = useMutationFeedback({
    mutationFn: (proyecto: Proyecto) => eliminarProyecto(proyecto.id, proyecto.name),
    success: (_datos, proyecto) => `Se elimino ${proyecto.name}.`,
    invalidate: [clavesDeProyectos.todas],
    onSuccess: () => setAEliminar(null),
  });

  const proyectos = lista.data?.data ?? [];
  const meta = (lista.data?.meta ?? {}) as Partial<MetaDeLista>;

  const columnas: ColumnaDeTabla<Proyecto>[] = [
    {
      id: 'name',
      etiqueta: 'Nombre',
      fija: true,
      // El backend admite 120 caracteres; sin truncar, uno largo estira la
      // columna y empuja al resto fuera de la pantalla.
      celda: (proyecto) => (
        <span className="block max-w-[22rem] truncate font-medium" title={proyecto.name}>
          {proyecto.name}
        </span>
      ),
    },
    {
      id: 'status',
      etiqueta: 'Estado',
      celda: (proyecto) => {
        const vista = vistaDeEstado(proyecto.status);
        return (
          <StatusBadge enCurso={vista.enCurso} icono={vista.icono} tono={vista.tono}>
            {vista.etiqueta}
          </StatusBadge>
        );
      },
    },
    {
      id: 'createdAt',
      etiqueta: 'Creado',
      celda: (proyecto) => (
        <span className="text-muted-foreground" title={fechaCompleta(proyecto.createdAt)}>
          {haceCuanto(proyecto.createdAt)}
        </span>
      ),
    },
  ];

  const buscando = estado.busqueda.length > 0;

  return (
    <>
      <AppDataTable<Proyecto>
        acciones={
          <Button onClick={() => setCreando(true)} size="sm">
            <Plus aria-hidden className="size-4" />
            Nuevo proyecto
          </Button>
        }
        accionesDeFila={(proyecto) => (
          <>
            <RowActionButton
              etiqueta={estaTerminado(proyecto.status) ? 'Abrir la aplicacion' : 'Continuar'}
              icono={ArrowRight}
              // Al despachador, igual que pulsar la fila: el decide segun el
              // estado, y asi los dos gestos no pueden separarse.
              onClick={() => router.push(`/proyectos/${proyecto.id}`)}
            />
            <RowActionButton
              destructiva
              etiqueta="Eliminar"
              icono={Trash2}
              onClick={() => setAEliminar(proyecto)}
            />
          </>
        )}
        busqueda={estado.busqueda}
        cargando={lista.isPending}
        columnas={columnas}
        error={lista.error}
        filas={proyectos}
        filtrosActivos={buscando}
        getRowId={(proyecto) => proyecto.id}
        onBusquedaChange={setBusqueda}
        onFilaClick={(proyecto) => router.push(`/proyectos/${proyecto.id}`)}
        onLimpiarFiltros={limpiar}
        onOrdenChange={() => undefined}
        onPaginaChange={setPagina}
        onReintentar={() => void lista.refetch()}
        onTamanoChange={setTamano}
        orden={null}
        pagina={estado.pagina}
        placeholder="Buscar por nombre..."
        tamano={estado.tamano}
        total={meta.total ?? 0}
        vacio={
          buscando
            ? {
                motivo: 'sin-resultados',
                titulo: 'Ningun proyecto coincide con tu busqueda.',
                accion: (
                  <Button onClick={limpiar} size="sm" variant="outline">
                    Limpiar filtros
                  </Button>
                ),
              }
            : {
                motivo: 'sin-datos',
                titulo: 'Todavia no has creado ningun proyecto.',
                descripcion:
                  'Sube un Excel y construimos la aplicacion por ti: tablas, formularios y relaciones.',
                accion: (
                  <Button onClick={() => setCreando(true)} size="sm">
                    <Plus aria-hidden className="size-4" />
                    Nuevo proyecto
                  </Button>
                ),
              }
        }
      />

      <DialogoNuevoProyecto abierto={creando} onAbiertoChange={setCreando} />

      <ConfirmDialog
        abierto={aEliminar !== null}
        confirmando={eliminar.isPending}
        consecuencia={
          <>
            Se eliminaran la aplicacion de <strong>{aEliminar?.name}</strong> y todos sus registros.
            No se puede deshacer.
          </>
        }
        nivel="irreversible"
        nombreParaConfirmar={aEliminar?.name}
        onAbiertoChange={(abierto) => {
          if (!abierto) setAEliminar(null);
        }}
        onConfirmar={() => {
          if (aEliminar) eliminar.mutate(aEliminar);
        }}
        titulo={`Eliminar ${aEliminar?.name ?? ''}`}
      />
    </>
  );
}
