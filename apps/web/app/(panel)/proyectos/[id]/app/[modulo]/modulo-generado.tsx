'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { FormularioGenerado } from '@/components/app/generated/formulario-generado';
import { RowActionButton } from '@/components/app/row-action-button';
import { AppDataTable, type ColumnaDeTabla } from '@/components/app/table/app-data-table';
import { Button } from '@/components/ui/button';
import { useEstadoDeTablaEnUrl } from '@/hooks/use-estado-de-tabla-en-url';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import {
  actualizarRegistro,
  clavesDeLaAplicacion,
  crearRegistro,
  eliminarRegistro,
  listarRegistros,
  type ModuloDelManifiesto,
  type Registro,
} from '@/lib/api/aplicacion';
import { renderizadorDe } from '@/lib/aplicacion/campos';

/**
 * V13 — Un modulo de la aplicacion generada.
 *
 * **Nada de esta pantalla esta escrito para un modulo concreto.** Las columnas
 * salen del manifiesto, el formulario tambien, y cada campo se pinta con el
 * renderizador de su tipo. El mismo archivo sirve para "Viajes" de un Excel de
 * transporte y para "Productos" de uno de inventario.
 *
 * Lo pesado ocurre en el servidor: busca, ordena y pagina la API. La tabla
 * jamas recorta ni reordena en el cliente, porque pintaria algo distinto de lo
 * que dice el pie.
 */
export function ModuloGenerado({
  proyectoId,
  modulo,
}: {
  proyectoId: string;
  modulo: ModuloDelManifiesto;
}): React.ReactElement {
  const { estado, setBusqueda, setOrden, setPagina, setTamano, limpiar } = useEstadoDeTablaEnUrl();

  const [editando, setEditando] = useState<Registro | null>(null);
  const [creando, setCreando] = useState(false);
  const [aEliminar, setAEliminar] = useState<Registro | null>(null);

  const consulta = {
    busqueda: estado.busqueda,
    orden: estado.orden,
    pagina: estado.pagina,
    tamano: estado.tamano,
  };

  const registros = useQuery({
    queryKey: clavesDeLaAplicacion.registros(proyectoId, modulo.name, consulta),
    queryFn: ({ signal }) => listarRegistros(proyectoId, modulo.name, consulta, signal),
    placeholderData: keepPreviousData,
  });

  const invalidar = [clavesDeLaAplicacion.modulo(proyectoId, modulo.name)];
  const singular = modulo.label.replace(/s$/i, '').toLowerCase();

  const crear = useMutationFeedback({
    mutationFn: (valores: Record<string, unknown>) =>
      crearRegistro(proyectoId, modulo.name, valores),
    success: `Se creo el ${singular}.`,
    invalidate: invalidar,
    onSuccess: () => setCreando(false),
  });

  const actualizar = useMutationFeedback({
    mutationFn: ({ id, valores }: { id: string; valores: Record<string, unknown> }) =>
      actualizarRegistro(proyectoId, modulo.name, id, valores),
    success: 'Cambios guardados.',
    invalidate: invalidar,
    onSuccess: () => setEditando(null),
  });

  const borrar = useMutationFeedback({
    mutationFn: (registro: Registro) => eliminarRegistro(proyectoId, modulo.name, registro.id),
    success: `Se elimino el ${singular}.`,
    invalidate: invalidar,
    onSuccess: () => setAEliminar(null),
  });

  /** Las columnas, generadas: primero el campo que reconoce el registro. */
  const ordenados = [
    ...modulo.fields.filter((campo) => campo.name === modulo.displayField),
    ...modulo.fields.filter((campo) => campo.name !== modulo.displayField),
  ];

  const columnas: ColumnaDeTabla<Registro>[] = ordenados.map((campo, indice) => {
    const renderizador = renderizadorDe(campo.type);

    return {
      id: campo.name,
      etiqueta: campo.label,
      alineacion: renderizador.alineacion,
      // La identidad del registro no se puede esconder ni dejar sin ordenar.
      fija: indice === 0,
      // El backend no ordena por relacion: su valor es un identificador.
      ordenable: campo.type !== 'relation',
      celda: (registro) =>
        renderizador.celda({
          campo,
          etiquetaRelacionada: registro.related[campo.name] ?? null,
          valor: registro.values[campo.name],
        }),
    };
  });

  const meta = (registros.data?.meta ?? {}) as { total?: number };
  const buscando = estado.busqueda.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{modulo.label}</h1>

      <AppDataTable<Registro>
        acciones={
          <Button onClick={() => setCreando(true)} size="sm">
            <Plus aria-hidden className="size-4" />
            Nuevo {singular}
          </Button>
        }
        accionesDeFila={(registro) => (
          <>
            <RowActionButton
              etiqueta="Editar"
              icono={Pencil}
              onClick={() => setEditando(registro)}
            />
            <RowActionButton
              destructiva
              etiqueta="Eliminar"
              icono={Trash2}
              onClick={() => setAEliminar(registro)}
            />
          </>
        )}
        busqueda={estado.busqueda}
        cargando={registros.isPending}
        columnas={columnas}
        error={registros.error}
        filas={registros.data?.data ?? []}
        filtrosActivos={buscando}
        getRowId={(registro) => registro.id}
        onBusquedaChange={setBusqueda}
        onFilaClick={(registro) => setEditando(registro)}
        onLimpiarFiltros={limpiar}
        onOrdenChange={setOrden}
        onPaginaChange={setPagina}
        onReintentar={() => void registros.refetch()}
        onTamanoChange={setTamano}
        orden={estado.orden}
        pagina={estado.pagina}
        placeholder={`Buscar en ${modulo.label.toLowerCase()}...`}
        tamano={estado.tamano}
        total={meta.total ?? 0}
        vacio={
          buscando
            ? {
                motivo: 'sin-resultados',
                titulo: `Ningun ${singular} coincide con tu busqueda.`,
                accion: (
                  <Button onClick={limpiar} size="sm" variant="outline">
                    Limpiar filtros
                  </Button>
                ),
              }
            : {
                motivo: 'sin-datos',
                titulo: `Todavia no hay ${modulo.label.toLowerCase()}.`,
                accion: (
                  <Button onClick={() => setCreando(true)} size="sm">
                    <Plus aria-hidden className="size-4" />
                    Nuevo {singular}
                  </Button>
                ),
              }
        }
      />

      <FormularioGenerado
        abierto={creando}
        guardando={crear.isPending}
        modulo={modulo}
        onAbiertoChange={setCreando}
        onGuardar={(valores) => crear.mutate(valores)}
        proyectoId={proyectoId}
        registro={null}
      />

      <FormularioGenerado
        abierto={editando !== null}
        guardando={actualizar.isPending}
        modulo={modulo}
        onAbiertoChange={(abierto) => {
          if (!abierto) setEditando(null);
        }}
        onGuardar={(valores) => {
          if (editando) actualizar.mutate({ id: editando.id, valores });
        }}
        proyectoId={proyectoId}
        registro={editando}
      />

      <ConfirmDialog
        abierto={aEliminar !== null}
        confirmando={borrar.isPending}
        consecuencia={
          <>
            Se eliminara este {singular} de forma permanente. Si otro modulo depende de el, te lo
            diremos y no se borrara.
          </>
        }
        nivel="reversible"
        onAbiertoChange={(abierto) => {
          if (!abierto) setAEliminar(null);
        }}
        onConfirmar={() => {
          if (aEliminar) borrar.mutate(aEliminar);
        }}
        titulo={`Eliminar este ${singular}`}
      />
    </div>
  );
}
