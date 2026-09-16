'use client';

import { useState } from 'react';
import { useFocusRestore } from '@/hooks/use-focus-restore';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AsyncButton } from './async-button';

/**
 * La escalera de confirmacion de `forms-and-workflows.md`.
 *
 * El coste se ajusta a lo dificil que sea deshacer, y ni un escalon mas:
 *
 * | Accion                        | Friccion                          |
 * | ----------------------------- | --------------------------------- |
 * | Reversible (archivar, ocultar)| Un paso, sin escribir             |
 * | Irreversible                  | Escribir el nombre exacto         |
 * | Irreversible y en lote        | Escribir el nombre y ver cuantos  |
 *
 * Dos reglas que no se negocian:
 *
 *   - **Nunca "¿Estas seguro?" a secas.** El dialogo nombra el registro y dice
 *     que va a pasar.
 *   - **Se escribe la etiqueta que la persona ya ve en la lista**, jamas un
 *     identificador interno.
 *
 * El boton destructivo no recibe el foco inicial: se lo queda `Cancelar`, para
 * que un Enter de inercia no borre nada.
 */
export type NivelDeConfirmacion = 'reversible' | 'irreversible';

export interface ConfirmDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  titulo: string;
  /** Que va a pasar, en una o dos frases. No "¿Estas seguro?". */
  consecuencia: React.ReactNode;
  nivel?: NivelDeConfirmacion;
  /** La etiqueta a escribir. Obligatoria cuando el nivel es irreversible. */
  nombreParaConfirmar?: string;
  /** Cuantos registros se ven afectados, cuando son varios. */
  cantidad?: number;
  textoDeAccion?: string;
  /**
   * `destructiva` por defecto, que es el caso comun.
   *
   * No todo lo que merece una confirmacion destruye algo: crear la aplicacion
   * es irreversible en el sentido de que congela el modelo, pero pintarlo en
   * rojo diria que se va a perder algo, y no es verdad.
   */
  tono?: 'destructiva' | 'normal';
  onConfirmar: () => void;
  confirmando?: boolean;
}

export function ConfirmDialog({
  abierto,
  onAbiertoChange,
  titulo,
  consecuencia,
  nivel = 'reversible',
  nombreParaConfirmar,
  cantidad,
  textoDeAccion = 'Eliminar',
  tono = 'destructiva',
  onConfirmar,
  confirmando = false,
}: ConfirmDialogProps): React.ReactElement {
  const [escrito, setEscrito] = useState('');
  const restaurarFoco = useFocusRestore(abierto);

  /**
   * Cada apertura empieza en blanco: heredar lo tecleado la vez anterior
   * saltaria la proteccion entera.
   *
   * Se ajusta **durante el renderizado** y no en un efecto. Es el patron que
   * React documenta para derivar estado de props: un efecto pintaria primero
   * con el texto viejo y volveria a pintar, y ademas encadena un renderizado
   * extra que la regla `set-state-in-effect` rechaza.
   */
  const [abiertoPrevio, setAbiertoPrevio] = useState(abierto);
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto);
    if (abierto) setEscrito('');
  }

  const exigeEscribir = nivel === 'irreversible' && Boolean(nombreParaConfirmar);
  const coincide = !exigeEscribir || escrito.trim() === nombreParaConfirmar;

  return (
    <AlertDialog onOpenChange={confirmando ? undefined : onAbiertoChange} open={abierto}>
      <AlertDialogContent
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          restaurarFoco();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{consecuencia}</p>
              {cantidad !== undefined && cantidad > 1 ? (
                <p className="font-medium">Se veran afectados {cantidad} registros.</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {exigeEscribir ? (
          <div className="space-y-2">
            <Label htmlFor="confirmacion">
              Escribe <span className="font-semibold">{nombreParaConfirmar}</span> para confirmar
            </Label>
            <Input
              autoComplete="off"
              id="confirmacion"
              onChange={(e) => setEscrito(e.target.value)}
              value={escrito}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          {/* Cancelar se queda el foco inicial a proposito. */}
          <AlertDialogCancel disabled={confirmando}>Cancelar</AlertDialogCancel>
          <AsyncButton
            disabled={!coincide}
            onClick={onConfirmar}
            pending={confirmando}
            pendingLabel={tono === 'destructiva' ? 'Eliminando...' : 'Un momento...'}
            variant={tono === 'destructiva' ? 'destructive' : 'default'}
          >
            {textoDeAccion}
          </AsyncButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
