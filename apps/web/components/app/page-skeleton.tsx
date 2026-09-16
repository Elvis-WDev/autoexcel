import { Skeleton } from '@/components/ui/skeleton';

/**
 * Carga inicial que conserva la geometria.
 *
 * El objetivo no es entretener: es que cuando lleguen los datos nada se mueva.
 * Por eso las medidas son las de la pantalla real y no barras genericas.
 */
export function PageSkeleton({ filas = 6 }: { filas?: number }): React.ReactElement {
  return (
    <div className="space-y-6" aria-busy aria-label="Cargando">
      <Skeleton className="h-7 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-sm" />
        <div className="rounded-lg border">
          {Array.from({ length: filas }, (_, i) => (
            <div className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0" key={i}>
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
