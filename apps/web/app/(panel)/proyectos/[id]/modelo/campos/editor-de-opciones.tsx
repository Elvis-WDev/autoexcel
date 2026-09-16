'use client';

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Los valores de una lista cerrada.
 *
 * El backend acepta hasta cincuenta. Se anaden de uno en uno y con Enter,
 * porque escribirlos separados por comas obliga a explicar que pasa con las
 * comas que forman parte de un valor.
 */
export function EditorDeOpciones({
  valores,
  onChange,
}: {
  valores: string[];
  onChange: (valores: string[]) => void;
}): React.ReactElement {
  const [nueva, setNueva] = useState('');

  function anadir(): void {
    const valor = nueva.trim();
    if (!valor || valores.includes(valor) || valores.length >= 50) return;
    onChange([...valores, valor]);
    setNueva('');
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="opcion-nueva">Valores posibles</Label>

      {valores.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {valores.map((valor) => (
            <li
              className="bg-muted flex items-center gap-1 rounded-md py-1 pr-1 pl-2 text-sm"
              key={valor}
            >
              <span className="max-w-[12rem] truncate">{valor}</span>
              <button
                aria-label={`Quitar ${valor}`}
                className="text-muted-foreground hover:text-foreground rounded-sm p-0.5"
                onClick={() => onChange(valores.filter((v) => v !== valor))}
                type="button"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Todavia no hay ninguno.</p>
      )}

      <div className="flex gap-2">
        <Input
          className="h-9"
          id="opcion-nueva"
          onChange={(evento) => setNueva(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key !== 'Enter') return;
            // Enter anade el valor; no envia el formulario entero.
            evento.preventDefault();
            anadir();
          }}
          placeholder="Escribe un valor y pulsa Enter"
          value={nueva}
        />
        <Button
          className="h-9 shrink-0"
          disabled={nueva.trim().length === 0}
          onClick={anadir}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden className="size-4" />
          Anadir
        </Button>
      </div>
    </div>
  );
}
