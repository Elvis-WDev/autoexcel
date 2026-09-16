'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { EmptyState } from '@/components/app/empty-state';
import { ErrorState } from '@/components/app/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useEdicionDelModelo } from '@/hooks/use-edicion-del-modelo';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { moverAPaso, type ProyectoDetalle } from '@/lib/api/asistente';
import {
  clavesDelModelo,
  decidirRelacion,
  obtenerModelo,
  type RelacionDelModelo,
} from '@/lib/api/modelo';

/**
 * V9 — Revisar relaciones.
 *
 * Una decision por fila y nada mas. La frase en lenguaje natural **la escribe el
 * backend**: componerla aqui seria una segunda copia de la misma regla, y las
 * dos acabarian diciendo cosas distintas.
 *
 * Aceptar no cambia nada —es el estado por defecto— pero se ofrece igual, porque
 * confirmar explicitamente es parte de revisar. Rechazar si cambia: el campo se
 * degrada a texto, y eso se dice **antes** de hacerlo.
 */
export function EditorDeRelaciones({
  proyecto,
}: {
  proyecto: ProyectoDetalle;
}): React.ReactElement {
  const router = useRouter();
  const [aRechazar, setARechazar] = useState<RelacionDelModelo | null>(null);
  const [aceptadas, setAceptadas] = useState<Set<string>>(new Set());

  const modelo = useQuery({
    queryKey: clavesDelModelo.modelo(proyecto.id),
    queryFn: ({ signal }) => obtenerModelo(proyecto.id, signal),
  });

  const decidir = useEdicionDelModelo(
    proyecto.id,
    ({ relacion, accepted }: { relacion: RelacionDelModelo; accepted: boolean }) =>
      decidirRelacion(proyecto.id, relacion.fromName, relacion.through, accepted),
  );

  const continuar = useMutationFeedback({
    mutationFn: () => moverAPaso(proyecto.id, 'reviewing_summary'),
    onSuccess: () => {
      router.replace(`/proyectos/${proyecto.id}/resumen`);
      router.refresh();
    },
  });

  const datos = modelo.data;
  const clave = (relacion: RelacionDelModelo): string => `${relacion.fromName}.${relacion.through}`;

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton onClick={() => continuar.mutate(undefined)} pending={continuar.isPending}>
          Continuar
          <ArrowRight aria-hidden className="size-4" />
        </AsyncButton>
      }
      descripcion="Acepta las que tengan sentido y rechaza las que no."
      proyecto={proyecto}
      titulo="Como se conectan tus datos"
    >
      {modelo.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : modelo.isError || !datos ? (
        <ErrorState error={modelo.error} onReintentar={() => void modelo.refetch()} />
      ) : datos.relations.length === 0 ? (
        /* El vacio honesto: no encontrar relaciones no es un fallo. */
        <div className="rounded-lg border">
          <EmptyState
            descripcion="Tu aplicacion tendra una tabla por hoja, sin vinculos entre ellas. Puedes seguir adelante."
            motivo="sin-datos"
            titulo="No encontramos relaciones entre tus hojas."
          />
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {datos.relations.map((relacion) => {
            const aceptada = aceptadas.has(clave(relacion));

            return (
              <li
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-4"
                key={clave(relacion)}
              >
                <p className="min-w-[14rem] flex-1 text-sm">{relacion.description}</p>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    onClick={() => {
                      setAceptadas((previo) => new Set(previo).add(clave(relacion)));
                      decidir.mutate({ relacion, accepted: true });
                    }}
                    size="sm"
                    variant={aceptada ? 'default' : 'outline'}
                  >
                    <Check aria-hidden className="size-4" />
                    {aceptada ? 'Aceptada' : 'Aceptar'}
                  </Button>
                  <Button onClick={() => setARechazar(relacion)} size="sm" variant="outline">
                    <X aria-hidden className="size-4" />
                    Rechazar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        abierto={aRechazar !== null}
        confirmando={decidir.isPending}
        consecuencia={
          <>
            El campo que las une se quedara como texto dentro de <strong>{aRechazar?.from}</strong>.{' '}
            <strong>No se pierde ningun dato</strong>: los valores se importan igual, solo que sin
            vinculo.
          </>
        }
        nivel="reversible"
        onAbiertoChange={(abierto) => {
          if (!abierto) setARechazar(null);
        }}
        onConfirmar={() => {
          if (aRechazar) {
            decidir.mutate(
              { relacion: aRechazar, accepted: false },
              { onSuccess: () => setARechazar(null) },
            );
          }
        }}
        textoDeAccion="Rechazar relacion"
        titulo="Rechazar esta relacion"
      />
    </MarcoDelAsistente>
  );
}
