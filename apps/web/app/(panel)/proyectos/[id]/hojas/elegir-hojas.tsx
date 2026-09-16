'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { ErrorState } from '@/components/app/error-state';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import {
  actualizarHojas,
  clavesDelAsistente,
  lanzarAnalisis,
  listarHojas,
  type CambioDeHoja,
  type Hoja,
  type ProyectoDetalle,
} from '@/lib/api/asistente';
import { cn } from '@/lib/utils';

/**
 * V5 — Esto encontramos en tu archivo.
 *
 * El ERS decia que esta pantalla solo apareciera con mas de una hoja, pero eso
 * venia de leer una sola. Aqui se leen todas —decision 2 del plan de backend—,
 * asi que **siempre** se muestra: es donde se ve que el sistema entendio el
 * archivo, y donde se arregla si no.
 *
 * El numero de valores distintos por columna esta a proposito: es lo que
 * explica, dos pantallas mas adelante, por que se propuso extraer "Cliente"
 * como entidad propia. Sin verlo, la propuesta parece magia.
 */
export function ElegirHojas({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const [cambios, setCambios] = useState<Record<string, CambioDeHoja>>({});

  const hojas = useQuery({
    queryKey: clavesDelAsistente.hojas(proyecto.id),
    queryFn: ({ signal }) => listarHojas(proyecto.id, signal),
  });

  const analizar = useMutationFeedback({
    mutationFn: async () => {
      /**
       * Se guarda **siempre**, aunque no se haya tocado nada.
       *
       * El PATCH no es solo "guardar cambios": es lo que confirma la eleccion
       * de hojas y mueve el proyecto de `uploaded` a `sheet_selected`. Sin el,
       * analizar es una transicion ilegal y el backend contesta `409`, que es
       * exactamente lo que ocurrio la primera vez que se probo esto.
       */
      await actualizarHojas(proyecto.id, Object.values(cambios));
      return lanzarAnalisis(proyecto.id);
    },
    onSuccess: (trabajo) => {
      router.replace(`/proyectos/${proyecto.id}/analisis?trabajo=${trabajo.id}`);
      router.refresh();
    },
  });

  /** Lo elegido aqui gana sobre lo que dijo el servidor, hasta guardar. */
  function estadoDe(hoja: Hoja): { incluida: boolean; filaDeEncabezado: number | null } {
    const cambio = hoja.id ? cambios[hoja.id] : undefined;
    return {
      incluida: cambio?.included ?? hoja.included,
      filaDeEncabezado:
        cambio?.headerRowIndex !== undefined ? cambio.headerRowIndex : hoja.headerRowIndex,
    };
  }

  function cambiar(hoja: Hoja, parcial: Omit<CambioDeHoja, 'sheetId'>): void {
    if (!hoja.id) return;
    const id = hoja.id;
    setCambios((previo) => ({ ...previo, [id]: { ...previo[id], sheetId: id, ...parcial } }));
  }

  const lista = hojas.data?.data.sheets ?? [];
  const algunaIncluida = lista.some((hoja) => estadoDe(hoja).incluida);

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton
          disabled={!algunaIncluida}
          onClick={() => analizar.mutate(undefined)}
          pending={analizar.isPending}
          pendingLabel="Empezando..."
        >
          Analizar
        </AsyncButton>
      }
      descripcion="Desmarca lo que no quieras usar."
      proyecto={proyecto}
      titulo="Esto encontramos en tu archivo"
    >
      {hojas.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : hojas.isError ? (
        <ErrorState error={hojas.error} onReintentar={() => void hojas.refetch()} />
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Archivo: <span className="text-foreground font-medium">{hojas.data.data.fileName}</span>
          </p>

          {lista.map((hoja) => {
            const { incluida, filaDeEncabezado } = estadoDe(hoja);
            const vacia = hoja.columns.length === 0;

            return (
              <section
                className={cn(
                  'rounded-lg border p-4 transition-opacity',
                  !incluida && 'opacity-60',
                )}
                key={hoja.id ?? hoja.index}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    aria-label={`Usar la hoja ${hoja.name}`}
                    checked={incluida}
                    className="mt-0.5"
                    disabled={vacia}
                    id={`hoja-${hoja.index}`}
                    onCheckedChange={(valor) => cambiar(hoja, { included: valor === true })}
                  />

                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <Label className="text-sm font-medium" htmlFor={`hoja-${hoja.index}`}>
                        {hoja.name}
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        {hoja.rowCount === 0
                          ? 'Sin filas'
                          : `${hoja.rowCount} ${hoja.rowCount === 1 ? 'fila' : 'filas'}`}
                      </p>
                    </div>

                    {hoja.issue ? (
                      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                        <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        {hoja.issue}
                      </p>
                    ) : null}

                    {!vacia ? (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left">
                                {hoja.columns.map((columna) => (
                                  <th className="pr-4 pb-1 font-medium" key={columna.index}>
                                    {columna.header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="text-muted-foreground">
                              <tr>
                                {hoja.columns.map((columna) => (
                                  <td className="pr-4" key={columna.index}>
                                    {columna.type}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                {hoja.columns.map((columna) => (
                                  <td className="pr-4" key={columna.index}>
                                    {columna.distinct} distintos
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                {hoja.columns.map((columna) => (
                                  <td className="max-w-[10rem] truncate pr-4" key={columna.index}>
                                    {columna.samples[0] ?? '—'}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {incluida ? (
                          <div className="flex items-center gap-2">
                            <Label
                              className="text-muted-foreground text-xs font-normal"
                              htmlFor={`encabezado-${hoja.index}`}
                            >
                              Los nombres de las columnas estan en la fila
                            </Label>
                            <Input
                              className="h-7 w-16 text-xs"
                              id={`encabezado-${hoja.index}`}
                              min={1}
                              onChange={(evento) => {
                                const valor = Number(evento.target.value);
                                cambiar(hoja, {
                                  headerRowIndex:
                                    Number.isInteger(valor) && valor > 0 ? valor - 1 : null,
                                });
                              }}
                              type="number"
                              value={filaDeEncabezado === null ? '' : filaDeEncabezado + 1}
                            />
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </MarcoDelAsistente>
  );
}
