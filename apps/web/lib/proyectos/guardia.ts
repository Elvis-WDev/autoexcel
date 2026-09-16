import { redirect } from 'next/navigation';
import type { ProyectoDetalle } from '@/lib/api/asistente';
import { pedirODesviar } from '@/lib/api/servidor';
import { rutaDelEstado } from './pasos';

/**
 * Carga el proyecto y comprueba que esta pantalla es la que le corresponde.
 *
 * El mismo guardia en cada paso. Sin el, la regla del ERS 20 solo se cumpliria
 * llegando por el asistente, y bastaria con pegar una URL para saltarsela.
 *
 * Devuelve el proyecto ya cargado para que la pantalla no lo pida otra vez.
 */
export async function cargarPasoDelProyecto(
  id: string,
  estadosValidos: readonly string[],
): Promise<ProyectoDetalle> {
  const proyecto = await pedirODesviar<ProyectoDetalle>(`/api/projects/${id}`);

  if (!estadosValidos.includes(proyecto.status)) {
    redirect(rutaDelEstado(id, proyecto.status));
  }

  return proyecto;
}
