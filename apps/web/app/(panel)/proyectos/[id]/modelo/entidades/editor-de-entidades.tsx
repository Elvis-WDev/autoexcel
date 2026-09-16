'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { AvisosDelValidador } from '@/components/app/asistente/avisos-del-validador';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { ErrorState } from '@/components/app/error-state';
import { FormDialog } from '@/components/app/form-dialog';
import { RowActionButton } from '@/components/app/row-action-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useEdicionDelModelo } from '@/hooks/use-edicion-del-modelo';
import { moverAPaso, type ProyectoDetalle } from '@/lib/api/asistente';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import {
  clavesDelModelo,
  editarEntidad,
  eliminarEntidad,
  obtenerModelo,
  renombrarAplicacion,
  type EntidadDelModelo,
} from '@/lib/api/modelo';

/** Valor centinela del selector: el `Select` de Radix no admite `""`. */
const SIN_DEDUPLICAR = '__ninguno__';

/**
 * V7 — Revisar entidades.
 *
 * Confirmar que "cosas" va a haber en la aplicacion. Lo demas —tipos de campo,
 * relaciones— tiene su propia pantalla.
 *
 * El control que mas decide de todo el asistente es **"Se repiten por"**. No se
 * llama "clave de deduplicacion" porque nadie sabe que es eso: se llama por lo
 * que hace, que es decidir si tres formas de escribir "Comercial Andes" son un
 * cliente o son tres.
 */
export function EditorDeEntidades({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const [renombrando, setRenombrando] = useState<EntidadDelModelo | null>(null);
  const [aEliminar, setAEliminar] = useState<EntidadDelModelo | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');

  const modelo = useQuery({
    queryKey: clavesDelModelo.modelo(proyecto.id),
    queryFn: ({ signal }) => obtenerModelo(proyecto.id, signal),
  });

  const renombrarApp = useEdicionDelModelo(proyecto.id, (nombre: string) =>
    renombrarAplicacion(proyecto.id, nombre),
  );

  const cambiarEntidad = useEdicionDelModelo(
    proyecto.id,
    ({
      entidad,
      ...cambio
    }: {
      entidad: string;
      label?: string;
      displayField?: string;
      dedupeField?: string | null;
    }) => editarEntidad(proyecto.id, entidad, cambio),
  );

  const borrarEntidad = useEdicionDelModelo(
    proyecto.id,
    (entidad: string) => eliminarEntidad(proyecto.id, entidad),
    { success: 'Modulo eliminado.' },
  );

  const continuar = useMutationFeedback({
    mutationFn: () => moverAPaso(proyecto.id, 'reviewing_fields'),
    onSuccess: () => {
      router.replace(`/proyectos/${proyecto.id}/modelo/campos`);
      router.refresh();
    },
  });

  const datos = modelo.data;

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton
          disabled={!datos || datos.entities.length === 0}
          onClick={() => continuar.mutate(undefined)}
          pending={continuar.isPending}
        >
          Continuar
          <ArrowRight aria-hidden className="size-4" />
        </AsyncButton>
      }
      descripcion="Cada uno sera un modulo de tu aplicacion, con su tabla y su formulario."
      proyecto={proyecto}
      titulo="Esto es lo que vamos a crear"
    >
      {modelo.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : modelo.isError || !datos ? (
        <ErrorState error={modelo.error} onReintentar={() => void modelo.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre-aplicacion">Nombre de la aplicacion</Label>
            <Input
              defaultValue={datos.applicationName}
              id="nombre-aplicacion"
              // Al salir del campo, no en cada tecla: una peticion por letra.
              onBlur={(evento) => {
                const valor = evento.target.value.trim();
                if (valor && valor !== datos.applicationName) renombrarApp.mutate(valor);
              }}
            />
          </div>

          {!datos.wasInferred ? (
            <p className="bg-muted rounded-lg px-4 py-3 text-sm">
              No pudimos proponer un modelo con varias entidades, asi que preparamos uno simple: una
              tabla por hoja. Puedes ajustarlo aqui.
            </p>
          ) : null}

          <AvisosDelValidador notas={datos.notes} />

          {datos.entities.map((entidad) => (
            <section className="rounded-lg border p-4" key={entidad.name}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">{entidad.label}</h2>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {entidad.fields.length} {entidad.fields.length === 1 ? 'campo' : 'campos'}
                    {entidad.derived ? ' · extraida de una columna repetida' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <RowActionButton
                    etiqueta={`Renombrar ${entidad.label}`}
                    icono={Pencil}
                    onClick={() => {
                      setNombreNuevo(entidad.label);
                      setRenombrando(entidad);
                    }}
                  />
                  <RowActionButton
                    destructiva
                    deshabilitadaPorque={
                      datos.entities.length === 1
                        ? 'Tu aplicacion necesita al menos un modulo.'
                        : undefined
                    }
                    etiqueta={`Eliminar ${entidad.label}`}
                    icono={Trash2}
                    onClick={() => setAEliminar(entidad)}
                  />
                </div>
              </div>

              <p className="text-muted-foreground mt-3 text-sm">
                {entidad.fields.map((campo) => campo.label).join(' · ')}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-normal" htmlFor={`muestra-${entidad.name}`}>
                    Se reconoce por
                  </Label>
                  <Select
                    onValueChange={(valor) =>
                      cambiarEntidad.mutate({ entidad: entidad.name, displayField: valor })
                    }
                    value={entidad.displayField ?? undefined}
                  >
                    <SelectTrigger className="h-8" id={`muestra-${entidad.name}`} size="sm">
                      <SelectValue placeholder="Elegir" />
                    </SelectTrigger>
                    <SelectContent>
                      {entidad.fields
                        .filter((campo) => campo.type !== 'relation')
                        .map((campo) => (
                          <SelectItem key={campo.name} value={campo.name}>
                            {campo.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-normal" htmlFor={`repite-${entidad.name}`}>
                    Se repiten por
                  </Label>
                  <Select
                    onValueChange={(valor) =>
                      cambiarEntidad.mutate({
                        entidad: entidad.name,
                        dedupeField: valor === SIN_DEDUPLICAR ? null : valor,
                      })
                    }
                    value={entidad.dedupeField ?? SIN_DEDUPLICAR}
                  >
                    <SelectTrigger className="h-8" id={`repite-${entidad.name}`} size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_DEDUPLICAR}>Nada: cada fila es un registro</SelectItem>
                      {entidad.fields
                        .filter((campo) => campo.type !== 'relation')
                        .map((campo) => (
                          <SelectItem key={campo.name} value={campo.name}>
                            {campo.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <FormDialog
        abierto={renombrando !== null}
        guardando={cambiarEntidad.isPending}
        onAbiertoChange={(abierto) => {
          if (!abierto) setRenombrando(null);
        }}
        onSubmit={() => {
          if (!renombrando || !nombreNuevo.trim()) return;
          cambiarEntidad.mutate(
            { entidad: renombrando.name, label: nombreNuevo.trim() },
            { onSuccess: () => setRenombrando(null) },
          );
        }}
        puedeGuardar={nombreNuevo.trim().length > 0}
        titulo={`Renombrar ${renombrando?.label ?? ''}`}
      >
        <div className="space-y-2">
          <Label htmlFor="nombre-entidad">Nombre del modulo</Label>
          <Input
            autoFocus
            id="nombre-entidad"
            onChange={(evento) => setNombreNuevo(evento.target.value)}
            value={nombreNuevo}
          />
          <p className="text-muted-foreground text-xs">
            Es como se llamara en la navegacion de tu aplicacion.
          </p>
        </div>
      </FormDialog>

      <ConfirmDialog
        abierto={aEliminar !== null}
        confirmando={borrarEntidad.isPending}
        consecuencia={
          <>
            <strong>{aEliminar?.label}</strong> dejara de ser un modulo. Los campos que lo apuntaban
            se quedaran como texto: <strong>no se pierde ningun dato</strong>.
          </>
        }
        nivel="reversible"
        onAbiertoChange={(abierto) => {
          if (!abierto) setAEliminar(null);
        }}
        onConfirmar={() => {
          if (aEliminar) {
            borrarEntidad.mutate(aEliminar.name, { onSuccess: () => setAEliminar(null) });
          }
        }}
        textoDeAccion="Eliminar modulo"
        titulo={`Eliminar ${aEliminar?.label ?? ''}`}
      />
    </MarcoDelAsistente>
  );
}
