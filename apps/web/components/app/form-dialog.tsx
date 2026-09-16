'use client';

import { useFocusRestore } from '@/hooks/use-focus-restore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AsyncButton } from './async-button';

/**
 * El contenedor de crear y editar.
 *
 * Se ocupa del foco, del cierre, de la geometria responsiva y de donde van los
 * botones. El formulario que va dentro se ocupa de sus campos y de sus reglas:
 * `component-system.md` separa asi las dos responsabilidades a proposito.
 *
 * Tres decisiones que estan aqui y no en cada formulario:
 *
 *   - **El cuerpo hace scroll, la cabecera y el pie no.** Con quince campos,
 *     perder de vista el boton de guardar es perder el hilo.
 *   - **Mientras se guarda no se puede cerrar** ni con Escape ni pinchando
 *     fuera: abandonar a mitad de una peticion deja a la persona sin saber si
 *     se guardo.
 *   - **El envio va por `form`**, no por `onClick` del boton, para que pulsar
 *     Enter en un campo haga lo mismo que pulsar el boton.
 */
export interface FormDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  /** Una linea. Solo si evita una duda real. */
  descripcion?: string;
  children: React.ReactNode;
  onSubmit: () => void;
  guardando?: boolean;
  textoDeAccion?: string;
  /** Deshabilita el envio por una razon del formulario, no del dialogo. */
  puedeGuardar?: boolean;
}

export function FormDialog({
  abierto,
  onAbiertoChange,
  titulo,
  descripcion,
  children,
  onSubmit,
  guardando = false,
  textoDeAccion = 'Guardar',
  puedeGuardar = true,
}: FormDialogProps): React.ReactElement {
  const restaurarFoco = useFocusRestore(abierto);

  return (
    <Dialog onOpenChange={guardando ? undefined : onAbiertoChange} open={abierto}>
      <DialogContent
        className="flex max-h-[min(90dvh,42rem)] flex-col gap-0 p-0 sm:max-w-lg"
        onEscapeKeyDown={guardando ? (e) => e.preventDefault() : undefined}
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          restaurarFoco();
        }}
        onInteractOutside={guardando ? (e) => e.preventDefault() : undefined}
        showCloseButton={!guardando}
      >
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle>{titulo}</DialogTitle>
          {descripcion ? <DialogDescription>{descripcion}</DialogDescription> : null}
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault();
            onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>

          <DialogFooter className="border-t px-6 py-4">
            <Button
              disabled={guardando}
              onClick={() => onAbiertoChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <AsyncButton
              disabled={!puedeGuardar}
              pending={guardando}
              pendingLabel="Guardando..."
              type="submit"
            >
              {textoDeAccion}
            </AsyncButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
