import { Suspense } from 'react';
import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { SeguirConstruccion } from './seguir-construccion';

export const metadata = { title: 'Creando tu aplicacion · excel-to-software' };

/** V11 — ERS 19, pantalla 8. */
export default async function Creando({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['creating', 'importing']);

  return (
    <Suspense>
      <SeguirConstruccion proyecto={proyecto} />
    </Suspense>
  );
}
