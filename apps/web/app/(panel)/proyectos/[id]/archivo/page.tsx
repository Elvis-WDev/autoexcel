import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { SubirArchivo } from './subir-archivo';

export const metadata = { title: 'Sube tu Excel · excel-to-software' };

/** V4 — ERS 19, pantalla 1. */
export default async function Archivo({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // Tambien se admite `uploaded`: volver aqui para reemplazar el archivo es
  // legal, y la transicion `uploaded -> uploaded` existe en el backend.
  const proyecto = await cargarPasoDelProyecto(id, ['draft', 'uploaded']);

  return <SubirArchivo proyecto={proyecto} />;
}
