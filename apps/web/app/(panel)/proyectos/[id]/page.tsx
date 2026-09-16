import { redirect } from 'next/navigation';
import { pedirODesviar } from '@/lib/api/servidor';
import type { ProyectoDetalle } from '@/lib/api/asistente';
import { rutaDelEstado } from '@/lib/proyectos/pasos';

/**
 * V3 — El despachador.
 *
 * No es una pantalla: lee el estado del proyecto y manda al paso que le toca.
 *
 * Existe por el ERS 20. Un enlace guardado a `/modelo/relaciones` de un proyecto
 * que todavia no se ha analizado tiene que llevar a `/archivo`, no a una
 * pantalla a medio pintar. Y como corre en el servidor, la persona nunca ve la
 * pantalla equivocada ni un instante.
 */
export default async function Despachador({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  const proyecto = await pedirODesviar<ProyectoDetalle>(`/api/projects/${id}`);

  redirect(rutaDelEstado(id, proyecto.status));
}
