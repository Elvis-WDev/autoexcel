'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, Download } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  clavesDelAsistente,
  listarFilasFallidas,
  obtenerTrabajo,
  urlDelInformeCsv,
  type ProyectoDetalle,
} from '@/lib/api/asistente';

/**
 * V12 — Tu aplicacion esta lista.
 *
 * Entender que se creo, y entrar.
 *
 * El bloque de filas fallidas aparece **solo** cuando las hay. Es la decision 4
 * del plan de backend hecha pantalla: continuar y reportar. Lo que la persona
 * necesita es encontrar esas filas en su Excel, asi que se le da la hoja, el
 * numero de fila **tal como lo ve en Excel** y el motivo en su idioma. El CSV
 * esta porque tres mil filas no caben aqui.
 */
export function AplicacionLista({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const parametros = useSearchParams();
  const trabajoId = parametros.get('trabajo');

  const trabajo = useQuery({
    queryKey: clavesDelAsistente.trabajo(proyecto.id, trabajoId ?? ''),
    queryFn: ({ signal }) => obtenerTrabajo(proyecto.id, trabajoId!, signal),
    enabled: trabajoId !== null,
  });

  const fallidas = useQuery({
    queryKey: ['proyecto', proyecto.id, 'fallidas', trabajoId],
    queryFn: ({ signal }) => listarFilasFallidas(proyecto.id, trabajoId!, signal),
    // Solo se piden si el trabajo dice que hay alguna.
    enabled: trabajoId !== null && trabajo.data?.status === 'partial',
  });

  const resultado = trabajo.data?.result ?? null;
  const filas = fallidas.data?.data ?? [];

  return (
    <MarcoDelAsistente
      accion={
        <Button asChild>
          <Link href={`/proyectos/${proyecto.id}/app`}>
            Abrir aplicacion
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      }
      proyecto={proyecto}
      titulo="Tu aplicacion esta lista"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border p-5">
          <CircleCheck aria-hidden className="text-success mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 space-y-1">
            {trabajo.isPending ? (
              <Skeleton className="h-5 w-64" />
            ) : (
              <p className="text-sm">
                {resultado
                  ? `${resultado.modules} ${resultado.modules === 1 ? 'modulo' : 'modulos'} · ${resultado.records} registros · ${resultado.relations === 1 ? '1 relacion' : `${resultado.relations} relaciones`}`
                  : (trabajo.data?.message ?? 'Todo listo.')}
              </p>
            )}
            <p className="text-muted-foreground text-sm">
              Ya puedes usarla: crear registros, editarlos y buscarlos.
            </p>
          </div>
        </div>

        {trabajo.data?.status === 'partial' ? (
          <section className="rounded-lg border">
            <header className="border-b px-5 py-4">
              <h2 className="text-sm font-medium">
                {resultado?.failedRows}{' '}
                {resultado?.failedRows === 1 ? 'fila quedo' : 'filas quedaron'} fuera
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                El resto de tus datos se importo. Corrige estas filas en tu Excel si las necesitas.
              </p>
            </header>

            {fallidas.isPending ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b text-left">
                      <th className="px-5 py-2 font-medium">Hoja</th>
                      <th className="px-3 py-2 font-medium">Fila</th>
                      <th className="px-3 py-2 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Se muestran las primeras; el resto, en el CSV. */}
                    {filas.slice(0, 20).map((fila) => (
                      <tr
                        className="border-b last:border-b-0"
                        key={`${fila.sheetName}-${fila.rowNumber}`}
                      >
                        <td className="px-5 py-2">{fila.sheetName}</td>
                        <td className="px-3 py-2 tabular-nums">{fila.rowNumber}</td>
                        <td className="text-muted-foreground px-3 py-2">{fila.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
              <p className="text-muted-foreground text-xs">
                {filas.length > 20
                  ? `Mostrando 20 de ${filas.length}. El informe las trae todas.`
                  : 'El numero de fila es el que ves en Excel.'}
              </p>
              {trabajoId ? (
                <Button asChild size="sm" variant="outline">
                  {/* Un enlace normal: que el navegador gestione la descarga. */}
                  <a download href={urlDelInformeCsv(proyecto.id, trabajoId)}>
                    <Download aria-hidden className="size-4" />
                    Descargar el informe
                  </a>
                </Button>
              ) : null}
            </footer>
          </section>
        ) : null}
      </div>
    </MarcoDelAsistente>
  );
}
