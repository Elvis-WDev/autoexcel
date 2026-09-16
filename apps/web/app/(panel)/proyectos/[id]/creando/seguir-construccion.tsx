'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { Progress } from '@/components/ui/progress';
import { useTrabajo, trabajoEnMarcha } from '@/hooks/use-trabajo';
import type { ProyectoDetalle } from '@/lib/api/asistente';

/**
 * V11 — Creando tu aplicacion.
 *
 * Dos fases encadenadas que el backend ya narra en `message`: primero crea la
 * estructura, luego importa. No se recomponen aqui.
 *
 * **No hay boton de volver, y no es un olvido**: a partir de `creating` ya se
 * emitio DDL y el backend no declara ninguna transicion hacia atras. `Marco`
 * consulta `nextStatuses` y llega a la misma conclusion sin que haya que
 * decirselo.
 */
export function SeguirConstruccion({
  proyecto,
}: {
  proyecto: ProyectoDetalle;
}): React.ReactElement {
  const router = useRouter();
  const parametros = useSearchParams();
  const trabajoId = parametros.get('trabajo');

  const trabajo = useTrabajo(proyecto.id, trabajoId);
  const enMarcha = trabajoEnMarcha(trabajo.data);
  const fallo = trabajo.data?.status === 'failed';

  useEffect(() => {
    if (!trabajo.data || enMarcha || fallo) return;

    // `completed` y `partial` van los dos a la pantalla de resultado: un archivo
    // con dos celdas malas produce una aplicacion utilizable, no un error.
    router.replace(`/proyectos/${proyecto.id}/listo?trabajo=${trabajo.data.id}`);
    router.refresh();
  }, [trabajo.data, enMarcha, fallo, proyecto.id, router]);

  return (
    <MarcoDelAsistente
      descripcion={
        fallo
          ? undefined
          : 'Puedes cerrar esta pagina: el trabajo sigue sin ti y lo retomamos al volver.'
      }
      proyecto={proyecto}
      titulo={fallo ? 'No pudimos crear tu aplicacion' : 'Creando tu aplicacion'}
    >
      <div className="rounded-lg border px-6 py-10">
        {fallo ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle aria-hidden className="text-muted-foreground/60 size-8" />
            <p className="text-sm">
              {trabajo.data?.failureReason ?? 'Algo salio mal al crear tu aplicacion.'}
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              No se creo nada a medias: si la estructura no se pudo levantar entera, no se levanto
              ninguna parte.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <Loader2 aria-hidden className="text-muted-foreground size-7 animate-spin" />
            <p aria-live="polite" className="text-sm">
              {trabajo.data?.message ?? 'Creando la estructura...'}
            </p>
            <Progress
              aria-label="Avance de la creacion"
              className="h-1.5 max-w-xs"
              value={trabajo.data?.progress ?? 0}
            />
          </div>
        )}
      </div>
    </MarcoDelAsistente>
  );
}
