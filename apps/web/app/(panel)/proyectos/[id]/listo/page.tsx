import { Suspense } from 'react';
import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { AplicacionLista } from './aplicacion-lista';

export const metadata = { title: 'Tu aplicacion esta lista · excel-to-software' };

/** V12 — ERS 19, pantalla 9. */
export default async function Listo({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['completed']);

  return (
    <Suspense>
      <AplicacionLista proyecto={proyecto} />
    </Suspense>
  );
}
