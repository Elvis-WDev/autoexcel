'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AsyncButton } from '@/components/app/async-button';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { moverAPaso, type ProyectoDetalle } from '@/lib/api/asistente';
import { pasoAnterior, rutaDelEstado } from '@/lib/proyectos/pasos';
import { IndicadorDePasos } from './indicador-de-pasos';

/**
 * El marco comun de los pasos del asistente.
 *
 * Titulo, indicador de progreso y el boton de volver. El paso aporta su
 * contenido y su accion de avanzar.
 *
 * "Atras" no es el historial del navegador: es `POST /step`, una transicion que
 * el backend valida. Si no hay ninguna legal —y a partir de `creating` no la
 * hay, porque ya se emitio DDL— el boton no se pinta. Prometer una vuelta que
 * el servidor va a rechazar es peor que no ofrecerla.
 */
export interface MarcoDelAsistenteProps {
  proyecto: ProyectoDetalle;
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  /** La accion de avanzar, a la derecha del pie. */
  accion?: React.ReactNode;
}

export function MarcoDelAsistente({
  proyecto,
  titulo,
  descripcion,
  children,
  accion,
}: MarcoDelAsistenteProps): React.ReactElement {
  const router = useRouter();
  const anterior = pasoAnterior(proyecto.status, proyecto.nextStatuses);

  const volver = useMutationFeedback({
    mutationFn: (destino: string) => moverAPaso(proyecto.id, destino),
    onSuccess: (resultado) => {
      router.replace(rutaDelEstado(proyecto.id, resultado.status));
      router.refresh();
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-4">
        <IndicadorDePasos status={proyecto.status} />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          {descripcion ? <p className="text-muted-foreground text-sm">{descripcion}</p> : null}
        </div>
      </div>

      {children}

      {anterior || accion ? (
        <div className="flex items-center justify-between gap-3 border-t pt-5">
          {anterior ? (
            <AsyncButton
              onClick={() => volver.mutate(anterior)}
              pending={volver.isPending}
              pendingLabel="Volviendo..."
              variant="ghost"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Atras
            </AsyncButton>
          ) : (
            <span />
          )}
          {accion}
        </div>
      ) : null}
    </div>
  );
}
