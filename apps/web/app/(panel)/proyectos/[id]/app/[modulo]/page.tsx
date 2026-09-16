import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/app/page-skeleton';
import type { Manifiesto } from '@/lib/api/aplicacion';
import { pedirODesviar } from '@/lib/api/servidor';
import { ModuloGenerado } from './modulo-generado';

/**
 * V13 — Un modulo de la aplicacion generada. ERS 19, pantalla 10.
 *
 * El nombre llega por la URL y **se busca** en el manifiesto; nunca se usa para
 * componer nada. Si no esta, no esta: es la misma defensa que el backend aplica
 * al resolver una tabla.
 */
export default async function Modulo({
  params,
}: {
  params: Promise<{ id: string; modulo: string }>;
}): Promise<React.ReactElement> {
  const { id, modulo } = await params;
  const manifiesto = await pedirODesviar<Manifiesto>(`/api/projects/${id}/app`);

  const encontrado = manifiesto.entities.find((entidad) => entidad.name === modulo);
  if (!encontrado) notFound();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <ModuloGenerado modulo={encontrado} proyectoId={id} />
    </Suspense>
  );
}
