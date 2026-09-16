import { Suspense } from 'react';
import { PageSkeleton } from '@/components/app/page-skeleton';
import { TablaDeProyectos } from './tabla-de-proyectos';

export const metadata = { title: 'Proyectos · excel-to-software' };

export default function Proyectos(): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Proyectos</h1>

      {/* El estado de la lista vive en la URL, y leerla obliga a suspender. */}
      <Suspense fallback={<PageSkeleton />}>
        <TablaDeProyectos />
      </Suspense>
    </div>
  );
}
