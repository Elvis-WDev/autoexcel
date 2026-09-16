'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { ErrorState } from '@/components/app/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { lanzarConstruccion, type ProyectoDetalle } from '@/lib/api/asistente';
import { confirmarModelo, obtenerResumen } from '@/lib/api/modelo';

/**
 * V10 — El resumen.
 *
 * La ultima lectura antes de que exista algo. Sin tipos, sin claves, sin nombres
 * internos: el backend ya devuelve esa vista recortada a proposito, porque aqui
 * se lee lo que va a existir, no se audita un esquema.
 *
 * Crear son dos llamadas —confirmar y construir— pero **una sola decision**, asi
 * que van juntas detras del mismo boton. Confirmar sin construir dejaria un
 * proyecto congelado y a medias, que no le sirve a nadie.
 */
export function ResumenPrevio({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);

  const resumen = useQuery({
    queryKey: ['proyecto', proyecto.id, 'resumen'],
    queryFn: ({ signal }) => obtenerResumen(proyecto.id, signal),
  });

  const crear = useMutationFeedback({
    mutationFn: async () => {
      await confirmarModelo(proyecto.id);
      return lanzarConstruccion(proyecto.id);
    },
    onSuccess: (trabajo) => {
      router.replace(`/proyectos/${proyecto.id}/creando?trabajo=${trabajo.id}`);
      router.refresh();
    },
  });

  const datos = resumen.data;

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton
          disabled={!datos}
          onClick={() => setConfirmando(true)}
          pending={crear.isPending}
          pendingLabel="Creando..."
        >
          <Sparkles aria-hidden className="size-4" />
          Crear aplicacion
        </AsyncButton>
      }
      proyecto={proyecto}
      titulo={datos?.applicationName ?? 'Resumen'}
    >
      {resumen.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : resumen.isError || !datos ? (
        <ErrorState error={resumen.error} onReintentar={() => void resumen.refetch()} />
      ) : (
        <div className="space-y-6">
          <p className="text-muted-foreground text-sm">
            {datos.totals.entities} {datos.totals.entities === 1 ? 'modulo' : 'modulos'} ·{' '}
            {datos.totals.fields} campos ·{' '}
            {datos.totals.relations === 1 ? '1 relacion' : `${datos.totals.relations} relaciones`}
          </p>

          <dl className="divide-y rounded-lg border">
            {datos.entities.map((entidad) => (
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]" key={entidad.label}>
                <dt className="text-sm font-medium">{entidad.label}</dt>
                <dd className="text-muted-foreground text-sm">{entidad.fields.join(' · ')}</dd>
              </div>
            ))}
          </dl>

          {datos.relations.length > 0 ? (
            <div className="space-y-1.5">
              {datos.relations.map((relacion) => (
                <p className="text-muted-foreground text-sm" key={relacion}>
                  {relacion}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        abierto={confirmando}
        confirmando={crear.isPending}
        consecuencia={
          <>
            Crearemos la estructura e importaremos tus datos. A partir de aqui{' '}
            <strong>el modelo ya no se puede cambiar</strong>.
          </>
        }
        nivel="reversible"
        onAbiertoChange={setConfirmando}
        onConfirmar={() => crear.mutate(undefined)}
        textoDeAccion="Crear aplicacion"
        tono="normal"
        titulo={`Crear ${datos?.applicationName ?? 'la aplicacion'}`}
      />
    </MarcoDelAsistente>
  );
}
