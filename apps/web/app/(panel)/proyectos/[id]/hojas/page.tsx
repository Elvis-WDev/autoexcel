import { cargarPasoDelProyecto } from '@/lib/proyectos/guardia';
import { ElegirHojas } from './elegir-hojas';

export const metadata = { title: 'Tus hojas · excel-to-software' };

/** V5 — ERS 19, pantalla 2. */
export default async function Hojas({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  // `failed` entra aqui: tras un fallo el archivo sigue estando, asi que se
  // puede reintentar el analisis sin volver a subirlo (RNF-05).
  const proyecto = await cargarPasoDelProyecto(id, ['uploaded', 'sheet_selected', 'failed']);

  return <ElegirHojas proyecto={proyecto} />;
}
