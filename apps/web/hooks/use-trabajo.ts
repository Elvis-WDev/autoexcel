'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { clavesDelAsistente, obtenerTrabajo, type Trabajo } from '@/lib/api/asistente';

const EN_MARCHA = new Set(['queued', 'running']);

export function trabajoEnMarcha(trabajo: Trabajo | undefined): boolean {
  return trabajo === undefined || EN_MARCHA.has(trabajo.status);
}

/**
 * Sigue un trabajo de segundo plano hasta que termina.
 *
 * Tres decisiones, y las tres salen de `feedback-and-states.md`:
 *
 *   - **El sondeo para solo cuando el trabajo para.** Un intervalo que siguiera
 *     preguntando despues de `completed` seria trafico por nada.
 *   - **Navegar fuera no cancela nada.** El trabajo vive en el backend; al
 *     volver, se retoma el sondeo donde estaba. Es RNF-06.
 *   - **Con la pestana oculta no se pregunta.** `refetchIntervalInBackground`
 *     queda en falso: nadie esta mirando la barra.
 */
export function useTrabajo(proyectoId: string, trabajoId: string | null): UseQueryResult<Trabajo> {
  return useQuery({
    queryKey: clavesDelAsistente.trabajo(proyectoId, trabajoId ?? ''),
    queryFn: ({ signal }) => obtenerTrabajo(proyectoId, trabajoId!, signal),
    enabled: trabajoId !== null,
    refetchInterval: (consulta) => (trabajoEnMarcha(consulta.state.data) ? 1000 : false),
    refetchIntervalInBackground: false,
    // Un trabajo en marcha nunca esta "fresco": su gracia es que cambia.
    staleTime: 0,
  });
}
