import { notFound, redirect } from 'next/navigation';
import type { Manifiesto } from '@/lib/api/aplicacion';
import { pedirODesviar } from '@/lib/api/servidor';

/**
 * La aplicacion no tiene portada: tiene modulos.
 *
 * Se entra al primero, que es lo que hace cualquier panel. Anadir un tablero de
 * bienvenida seria justo lo que `interface-design.md` desaconseja: una pantalla
 * que no cambia ninguna decision.
 */
export default async function AplicacionRaiz({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;
  const manifiesto = await pedirODesviar<Manifiesto>(`/api/projects/${id}/app`);

  const primero = manifiesto.navigation[0];
  if (!primero) notFound();

  redirect(`/proyectos/${id}/app/${primero.name}`);
}
