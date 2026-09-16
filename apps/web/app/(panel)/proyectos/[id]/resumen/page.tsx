import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { ResumenPrevio } from './resumen-previo';

export const metadata = { title: 'Resumen · excel-to-software' };

/** V10 — ERS 19, pantalla 7. */
export default async function Resumen({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['reviewing_summary']);

  return <ResumenPrevio proyecto={proyecto} />;
}
