import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { EditorDeRelaciones } from './editor-de-relaciones';

export const metadata = { title: 'Las relaciones · excel-to-software' };

/** V9 — ERS 19, pantalla 6. */
export default async function Relaciones({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['reviewing_relations']);

  return <EditorDeRelaciones proyecto={proyecto} />;
}
