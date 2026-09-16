'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { alPerderLaSesion } from '@/lib/auth/sesion-caducada';
import { ThemeProvider } from './theme-provider';

/**
 * Cliente de consultas.
 *
 * Se crea dentro de un `useState` y no a nivel de modulo: en el servidor, un
 * cliente compartido entre peticiones filtraria la cache de una persona a otra.
 *
 * La politica de reintentos es la parte con criterio. Un `409` de cuota o un
 * `404` no mejoran repitiendolos, y reintentar un `401` solo retrasa el momento
 * de pedir la sesion otra vez. Se reintenta lo que de verdad puede ser pasajero.
 */
function createQueryClient(): QueryClient {
  /**
   * El interceptor de sesion, en un solo sitio.
   *
   * Cualquier consulta o mutacion que reciba `UNAUTHENTICATED` lleva a la
   * pantalla de sesion conservando el destino. Ponerlo aqui y no en cada
   * pantalla es lo que hace que no se olvide en ninguna.
   */
  const alFallar = (error: unknown): void => {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') alPerderLaSesion();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError: alFallar }),
    mutationCache: new MutationCache({ onError: alFallar }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError) {
            if (error.status < 500 && error.code !== 'SERVICE_UNAVAILABLE') return false;
          }
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      // Una mutacion no se reintenta sola: puede no ser idempotente.
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
