'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { ApiError } from '@/lib/api/errors';
import { clavesDelModelo, type RespuestaDeEdicion } from '@/lib/api/modelo';

/**
 * Aplica una edicion del modelo.
 *
 * Toda edicion devuelve el modelo **entero**, no el trozo tocado, y por un
 * motivo: una edicion puede tener consecuencias en otra entidad —al eliminar un
 * grupo, los campos que lo apuntaban dejan de ser relaciones—, asi que se
 * escribe la respuesta completa en la cache en vez de invalidar y volver a
 * pedir. Es mas rapido y, sobre todo, no deja un instante en el que la pantalla
 * muestre un estado que ya no existe.
 *
 * Los avisos del validador (`meta.notes`) se anuncian: son RX-06, la persona
 * tiene derecho a saber que se ajusto de lo que pidio.
 */
export function useEdicionDelModelo<TEntrada>(
  proyectoId: string,
  mutationFn: (entrada: TEntrada) => Promise<RespuestaDeEdicion>,
  opciones: { success?: string } = {},
) {
  const cliente = useQueryClient();
  const router = useRouter();

  return useMutationFeedback<RespuestaDeEdicion, TEntrada>({
    mutationFn,
    success: opciones.success,
    onSuccess: (respuesta) => {
      cliente.setQueryData(clavesDelModelo.modelo(proyectoId), respuesta.data);

      const notas = Array.isArray(respuesta.meta.notes) ? (respuesta.meta.notes as string[]) : [];
      for (const nota of notas) {
        toast.info(nota, { id: nota });
      }
    },

    /**
     * `INVALID_STATE` no es culpa de quien edita: significa que el proyecto
     * avanzo por otra pestana, o que se confirmo la estructura desde otro sitio.
     * El mensaje del backend ya lo explica, y ademas se recarga la ruta para que
     * el guardia del servidor reevalue y lleve al paso que ahora corresponde.
     */
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVALID_STATE') router.refresh();
    },
  });
}
