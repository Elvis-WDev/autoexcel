import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';

/**
 * La aplicacion generada solo existe cuando el proyecto esta terminado.
 *
 * El guardia es el mismo de los pasos del asistente: entrar aqui con un proyecto
 * a medio construir lleva al paso que le toca, no a una pantalla vacia.
 */
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  await cargarPasoDelProyecto(id, ['completed']);

  return <>{children}</>;
}
