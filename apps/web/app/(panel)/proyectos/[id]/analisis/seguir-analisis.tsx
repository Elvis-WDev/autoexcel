'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { Progress } from '@/components/ui/progress';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { useTrabajo, trabajoEnMarcha } from '@/hooks/use-trabajo';
import { lanzarAnalisis, type ProyectoDetalle } from '@/lib/api/asistente';

/**
 * V6 — Analizando tu archivo.
 *
 * Irse de aqui no cancela nada: el trabajo vive en el backend y al volver se
 * retoma el sondeo. Por eso el identificador viaja en la URL —para poder
 * recargar— y por eso, si falta, se busca igual: el proyecto sigue en
 * `analyzing` y el estado manda.
 *
 * Cuando falla, lo que se ofrece no es "atras" sino **reintentar**, porque el
 * archivo sigue ahi y no hay que volver a subirlo (RNF-05).
 */
export function SeguirAnalisis({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const parametros = useSearchParams();
  const trabajoId = parametros.get('trabajo');

  const trabajo = useTrabajo(proyecto.id, trabajoId);
  const enMarcha = trabajoEnMarcha(trabajo.data);

  // Al terminar, el estado del proyecto ya cambio en el servidor: se recarga
  // la ruta y el despachador lleva al paso siguiente.
  useEffect(() => {
    if (!trabajo.data || enMarcha) return;
    if (trabajo.data.status === 'failed') return;

    router.replace(`/proyectos/${proyecto.id}`);
    router.refresh();
  }, [trabajo.data, enMarcha, proyecto.id, router]);

  const reintentar = useMutationFeedback({
    mutationFn: () => lanzarAnalisis(proyecto.id),
    onSuccess: (nuevo) => {
      router.replace(`/proyectos/${proyecto.id}/analisis?trabajo=${nuevo.id}`);
      router.refresh();
    },
  });

  const fallo = trabajo.data?.status === 'failed';

  return (
    <MarcoDelAsistente
      accion={
        fallo ? (
          <AsyncButton
            onClick={() => reintentar.mutate(undefined)}
            pending={reintentar.isPending}
            pendingLabel="Reintentando..."
          >
            Reintentar analisis
          </AsyncButton>
        ) : undefined
      }
      descripcion={
        fallo
          ? undefined
          : 'Puedes cerrar esta pagina: el trabajo sigue sin ti y lo retomamos al volver.'
      }
      proyecto={proyecto}
      titulo={fallo ? 'El analisis no pudo terminar' : 'Analizando tu archivo'}
    >
      <div className="rounded-lg border px-6 py-10">
        {fallo ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle aria-hidden className="text-muted-foreground/60 size-8" />
            <p className="text-sm">
              {trabajo.data?.failureReason ?? 'No pudimos analizar tu archivo.'}
            </p>
            <p className="text-muted-foreground text-sm">
              Tu archivo sigue cargado: no hace falta volver a subirlo.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 aria-hidden className="text-muted-foreground size-7 animate-spin" />
            <p aria-live="polite" className="text-sm">
              {trabajo.data?.message ?? 'Analizando archivo...'}
            </p>
            {trabajo.data && trabajo.data.progress > 0 ? (
              <Progress
                aria-label="Avance del analisis"
                className="h-1.5 max-w-xs"
                value={trabajo.data.progress}
              />
            ) : null}
          </div>
        )}
      </div>

      {!fallo ? (
        <p className="text-muted-foreground text-center text-xs">
          Estamos mirando los encabezados y los valores de cada columna. No sacamos tus filas del
          servidor.
        </p>
      ) : null}
    </MarcoDelAsistente>
  );
}
