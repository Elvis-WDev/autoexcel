'use client';

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, type ErrorCode } from '@/lib/api/errors';
import { mensajeDeError, referenciaDeSoporte } from '@/lib/api/mensajes';

/**
 * El envoltorio por el que pasa **toda** mutacion del panel.
 *
 * Existe por una razon concreta: que si la persona reciba respuesta no dependa
 * de que quien escribio la pantalla se acordara de anadirla. Aqui viven el
 * estado pendiente, el aviso de exito, la invalidacion que lo sigue, la
 * traduccion de los codigos de error conocidos y el texto seguro para los que
 * no. Quien lo llama aporta la peticion y el texto, nada mas.
 *
 * `feedback-and-states.md` lo dice sin rodeos: una mutacion sin camino de
 * respuesta es una implementacion incompleta, no una omision menor.
 */
export interface MutationFeedbackOptions<TDatos, TEntrada> {
  mutationFn: (entrada: TEntrada) => Promise<TDatos>;
  /** Lo que se anuncia al terminar bien. Omitir solo si otra cosa ya lo dice. */
  success?: string | ((datos: TDatos, entrada: TEntrada) => string);
  /** Consultas que dejan de ser ciertas cuando esto funciona. */
  invalidate?: QueryKey[];
  /** Textos propios para codigos concretos, cuando el del backend no encaja. */
  errors?: Partial<Record<ErrorCode, string>>;
  onSuccess?: (datos: TDatos, entrada: TEntrada) => void | Promise<void>;
  /**
   * Reaccion propia al fallo, **ademas** del aviso.
   *
   * No lo sustituye: quien lo usa anade algo —resincronizar una ruta, devolver
   * el foco— pero el camino de respuesta lo sigue garantizando este envoltorio.
   */
  onError?: (error: unknown, entrada: TEntrada) => void;
  /** `true` si la pantalla muestra el fallo por su cuenta, en linea. */
  silenciarError?: boolean;
}

export function useMutationFeedback<TDatos, TEntrada = void>(
  options: MutationFeedbackOptions<TDatos, TEntrada>,
): UseMutationResult<TDatos, unknown, TEntrada> {
  const cliente = useQueryClient();

  return useMutation<TDatos, unknown, TEntrada>({
    mutationFn: options.mutationFn,

    onSuccess: async (datos, entrada) => {
      if (options.success) {
        const texto =
          typeof options.success === 'function' ? options.success(datos, entrada) : options.success;
        // `id` estable: dos guardados seguidos no apilan dos avisos identicos.
        toast.success(texto, { id: texto });
      }

      await Promise.all(
        (options.invalidate ?? []).map((queryKey) => cliente.invalidateQueries({ queryKey })),
      );

      await options.onSuccess?.(datos, entrada);
    },

    onError: (error, entrada) => {
      options.onError?.(error, entrada);

      if (options.silenciarError) return;

      // El interceptor de sesion ya esta redirigiendo a la pantalla de entrada:
      // un aviso rojo encima, en una pagina que esta a punto de desaparecer,
      // solo estorba.
      if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return;

      const texto = mensajeDeError(error, options.errors);
      const referencia = referenciaDeSoporte(error);

      toast.error(texto, {
        id: texto,
        description: referencia ? `Referencia: ${referencia}` : undefined,
      });
    },
  });
}
