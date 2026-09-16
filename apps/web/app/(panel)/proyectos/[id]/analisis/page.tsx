import { Suspense } from 'react';
import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { SeguirAnalisis } from './seguir-analisis';

export const metadata = { title: 'Analizando · excel-to-software' };

/** V6 — ERS 19, pantalla 3. */
export default async function Analisis({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['analyzing']);

  return (
    <Suspense>
      <SeguirAnalisis proyecto={proyecto} />
    </Suspense>
  );
}
