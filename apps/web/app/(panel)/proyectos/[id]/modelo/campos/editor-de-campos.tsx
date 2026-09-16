'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { useEdicionDelModelo } from '@/hooks/use-edicion-del-modelo';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { moverAPaso, type ProyectoDetalle } from '@/lib/api/asistente';
import {
  anadirCampo,
  clavesDelModelo,
  editarCampo,
  eliminarCampo,
  obtenerModelo,
  type CampoDelModelo,
  type EntidadDelModelo,
} from '@/lib/api/modelo';
import { TIPOS_EDITABLES, tieneOpciones } from '@/lib/modelo/tipos';
import { EditorDeOpciones } from './editor-de-opciones';

interface CampoEnEdicion {
  entidad: string;
  campo: CampoDelModelo | null;
  label: string;
  type: string;
  required: boolean;
  options: string[];
}

/**
 * V8 — Revisar la estructura.
 *
 * Es *la* pantalla donde se arregla lo que la inferencia se invento: un importe
 * que se leyo como texto, una fecha que se leyo como numero.
 *
 * El tipo se cambia con un selector **en linea**, dentro de la propia fila. Es
 * el unico caso en que `data-tables.md` lo permite: cambio reversible y con
 * respuesta inmediata.
 *
 * Las relaciones **no se editan aqui**. El backend excluye `relation` de sus
 * tipos editables, asi que se muestran como etiqueta con enlace a la pantalla
 * que si decide sobre ellas. Un selector deshabilitado sin explicacion seria
 * peor que no ponerlo.
 */
export function EditorDeCampos({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const [enEdicion, setEnEdicion] = useState<CampoEnEdicion | null>(null);
  const [aEliminar, setAEliminar] = useState<{
    entidad: EntidadDelModelo;
    campo: CampoDelModelo;
  } | null>(null);

  const modelo = useQuery({
    queryKey: clavesDelModelo.modelo(proyecto.id),
    queryFn: ({ signal }) => obtenerModelo(proyecto.id, signal),
  });

  const cambiarCampo = useEdicionDelModelo(
    proyecto.id,
    ({
      entidad,
      campo,
      ...cambio
    }: {
      entidad: string;
      campo: string;
      type?: string;
      required?: boolean;
      label?: string;
      options?: string[];
    }) => editarCampo(proyecto.id, entidad, campo, cambio),
  );

  const crearCampo = useEdicionDelModelo(
    proyecto.id,
    ({
      entidad,
      ...campo
    }: {
      entidad: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }) => anadirCampo(proyecto.id, entidad, campo),
    { success: 'Campo anadido.' },
  );

  const borrarCampo = useEdicionDelModelo(
    proyecto.id,
    ({ entidad, campo }: { entidad: string; campo: string }) =>
      eliminarCampo(proyecto.id, entidad, campo),
    { success: 'Campo eliminado.' },
  );

  const continuar = useMutationFeedback({
    mutationFn: () => moverAPaso(proyecto.id, 'reviewing_relations'),
    onSuccess: () => {
      router.replace(`/proyectos/${proyecto.id}/modelo/relaciones`);
      router.refresh();
    },
  });

  const datos = modelo.data;
  const editandoNuevo = enEdicion?.campo === null;

  function guardarCampo(): void {
    if (!enEdicion) return;
    const opciones = tieneOpciones(enEdicion.type) ? enEdicion.options : undefined;

    if (enEdicion.campo === null) {
      crearCampo.mutate(
        {
          entidad: enEdicion.entidad,
          label: enEdicion.label.trim(),
          type: enEdicion.type,
          required: enEdicion.required,
          ...(opciones ? { options: opciones } : {}),
        },
        { onSuccess: () => setEnEdicion(null) },
      );
      return;
    }

    cambiarCampo.mutate(
      {
        entidad: enEdicion.entidad,
        campo: enEdicion.campo.name,
        label: enEdicion.label.trim(),
        type: enEdicion.type,
        required: enEdicion.required,
        ...(opciones ? { options: opciones } : {}),
      },
      { onSuccess: () => setEnEdicion(null) },
    );
  }

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton onClick={() => continuar.mutate(undefined)} pending={continuar.isPending}>
          Continuar
          <ArrowRight aria-hidden className="size-4" />
        </AsyncButton>
      }
      descripcion="Si algo se leyo como lo que no es, cambialo aqui."
      proyecto={proyecto}
      titulo="Los campos de cada modulo"
    >
      {modelo.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : modelo.isError || !datos ? (
        <ErrorState error={modelo.error} onReintentar={() => void modelo.refetch()} />
      ) : (
        <div className="space-y-4">
          <AvisosDelValidador notas={datos.notes} />

          {datos.entities.map((entidad) => (
            <section className="rounded-lg border" key={entidad.name}>
              <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <h2 className="text-sm font-medium">{entidad.label}</h2>
                <AsyncButton
                  onClick={() =>
                    setEnEdicion({
                      entidad: entidad.name,
                      campo: null,
                      label: '',
                      type: 'text',
                      required: false,
                      options: [],
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  <Plus aria-hidden className="size-4" />
                  Anadir campo
                </AsyncButton>
              </header>

              <ul className="divide-y">
                {entidad.fields.map((campo) => (
                  <li className="flex flex-wrap items-center gap-3 px-4 py-2.5" key={campo.name}>
                    <span className="min-w-0 flex-1 truncate text-sm">{campo.label}</span>

                    {campo.type === 'relation' ? (
                      <a
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
                        href={`/proyectos/${proyecto.id}/modelo/relaciones`}
                      >
                        <Link2 aria-hidden className="size-3.5" />
                        Relacion con {campo.relatedTo}
                      </a>
                    ) : (
                      <Select
                        onValueChange={(valor) =>
                          cambiarCampo.mutate({
                            entidad: entidad.name,
                            campo: campo.name,
                            type: valor,
                          })
                        }
                        value={campo.type}
                      >
                        <SelectTrigger
                          aria-label={`Tipo de ${campo.label}`}
                          className="h-8 w-[11rem]"
                          size="sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIPOS_EDITABLES.map((tipo) => (
                            <SelectItem key={tipo.valor} value={tipo.valor}>
                              {tipo.etiqueta}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <div className="flex items-center gap-2">
                      <Switch
                        aria-label={`${campo.label} es obligatorio`}
                        checked={campo.required}
                        onCheckedChange={(valor) =>
                          cambiarCampo.mutate({
                            entidad: entidad.name,
                            campo: campo.name,
                            required: valor,
                          })
                        }
                      />
                      <span className="text-muted-foreground text-xs">Obligatorio</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {campo.type !== 'relation' ? (
                        <RowActionButton
                          etiqueta={`Editar ${campo.label}`}
                          icono={Pencil}
                          onClick={() =>
                            setEnEdicion({
                              entidad: entidad.name,
                              campo,
                              label: campo.label,
                              type: campo.type,
                              required: campo.required,
                              options: campo.options ?? [],
                            })
                          }
                        />
                      ) : null}
                      <RowActionButton
                        destructiva
                        deshabilitadaPorque={
                          entidad.fields.length === 1
                            ? 'Un modulo necesita al menos un campo.'
                            : undefined
                        }
                        etiqueta={`Eliminar ${campo.label}`}
                        icono={Trash2}
                        onClick={() => setAEliminar({ entidad, campo })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <FormDialog
        abierto={enEdicion !== null}
        guardando={crearCampo.isPending || cambiarCampo.isPending}
        onAbiertoChange={(abierto) => {
          if (!abierto) setEnEdicion(null);
        }}
        onSubmit={guardarCampo}
        puedeGuardar={(enEdicion?.label.trim().length ?? 0) > 0}
        textoDeAccion={editandoNuevo ? 'Anadir campo' : 'Guardar'}
        titulo={editandoNuevo ? 'Nuevo campo' : `Editar ${enEdicion?.campo?.label ?? ''}`}
      >
        {enEdicion ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="etiqueta-campo">Nombre del campo</Label>
              <Input
                autoFocus
                id="etiqueta-campo"
                onChange={(evento) => setEnEdicion({ ...enEdicion, label: evento.target.value })}
                value={enEdicion.label}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo-campo">Tipo</Label>
              <Select
                onValueChange={(valor) => setEnEdicion({ ...enEdicion, type: valor })}
                value={enEdicion.type}
              >
                <SelectTrigger id="tipo-campo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_EDITABLES.map((tipo) => (
                    <SelectItem key={tipo.valor} value={tipo.valor}>
                      {tipo.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {TIPOS_EDITABLES.find((tipo) => tipo.valor === enEdicion.type)?.ayuda}
              </p>
            </div>

            {tieneOpciones(enEdicion.type) ? (
              <EditorDeOpciones
                onChange={(options) => setEnEdicion({ ...enEdicion, options })}
                valores={enEdicion.options}
              />
            ) : null}

            <div className="flex items-center gap-2">
              <Switch
                checked={enEdicion.required}
                id="obligatorio-campo"
                onCheckedChange={(valor) => setEnEdicion({ ...enEdicion, required: valor })}
              />
              <Label className="font-normal" htmlFor="obligatorio-campo">
                Es obligatorio
              </Label>
            </div>
          </>
        ) : null}
      </FormDialog>

      <ConfirmDialog
        abierto={aEliminar !== null}
        confirmando={borrarCampo.isPending}
        consecuencia={
          <>
            <strong>{aEliminar?.campo.label}</strong> dejara de existir en{' '}
            {aEliminar?.entidad.label}. Los datos de esa columna no se importaran.
          </>
        }
        nivel="reversible"
        onAbiertoChange={(abierto) => {
          if (!abierto) setAEliminar(null);
        }}
        onConfirmar={() => {
          if (aEliminar) {
            borrarCampo.mutate(
              { entidad: aEliminar.entidad.name, campo: aEliminar.campo.name },
              { onSuccess: () => setAEliminar(null) },
            );
          }
        }}
        textoDeAccion="Eliminar campo"
        titulo={`Eliminar ${aEliminar?.campo.label ?? ''}`}
      />
    </MarcoDelAsistente>
  );
}
