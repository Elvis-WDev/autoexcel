import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { EditorDeEntidades } from './editor-de-entidades';

export const metadata = { title: 'Tu modelo · excel-to-software' };

/** V7 — ERS 19, pantalla 4. */
export default async function Entidades({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, [
    'reviewing_entities',
    'reviewing_fields',
    'reviewing_relations',
    'reviewing_summary',
  ]);

  return <EditorDeEntidades proyecto={proyecto} />;
}
