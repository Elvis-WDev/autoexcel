import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { EditorDeCampos } from './editor-de-campos';

export const metadata = { title: 'Los campos · excel-to-software' };

/** V8 — ERS 19, pantalla 5. */
export default async function Campos({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const proyecto = await cargarPasoDelProyecto(id, ['reviewing_fields']);

  return <EditorDeCampos proyecto={proyecto} />;
}
