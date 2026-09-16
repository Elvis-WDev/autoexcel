'use client';

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TAMANOS_DE_PAGINA } from './types';

/**
 * El pie, identico en todos los modulos.
 *
 * `data-tables.md` fija hasta el idioma: `Mostrando A-B de N`, selector de
 * `Filas`, y primera / anterior / posicion / siguiente / ultima. Que sea
 * siempre igual es el punto: alguien que cambia de modulo no deberia notar que
 * la tabla cambio.
 *
 * Los controles de los extremos se deshabilitan en vez de desaparecer, para que
 * el pie no cambie de anchura al llegar al final.
 */
export interface TablePaginationProps {
  pagina: number;
  tamano: number;
  total: number;
  onPaginaChange: (pagina: number) => void;
  onTamanoChange: (tamano: number) => void;
  /** Se deshabilita entero mientras llega una pagina nueva. */
  ocupada?: boolean;
}

export function TablePagination({
  pagina,
  tamano,
  total,
  onPaginaChange,
  onTamanoChange,
  ocupada = false,
}: TablePaginationProps): React.ReactElement {
  const ultima = Math.max(1, Math.ceil(total / tamano));
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const hasta = Math.min(pagina * tamano, total);

  const enPrimera = pagina <= 1 || ocupada;
  const enUltima = pagina >= ultima || ocupada;

  const saltos = [
    { etiqueta: 'Primera pagina', Icono: ChevronFirst, a: 1, off: enPrimera },
    { etiqueta: 'Pagina anterior', Icono: ChevronLeft, a: pagina - 1, off: enPrimera },
    { etiqueta: 'Pagina siguiente', Icono: ChevronRight, a: pagina + 1, off: enUltima },
    { etiqueta: 'Ultima pagina', Icono: ChevronLast, a: ultima, off: enUltima },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t px-4 py-3">
      <p aria-live="polite" className="text-muted-foreground text-sm">
        Mostrando {desde}-{hasta} de {total}
      </p>

      {/*
        Este grupo tambien envuelve, no solo el contenedor de fuera. Sin ello su
        contenido —etiqueta, selector, cuatro saltos y la posicion— suma unos
        330px que **no pueden encoger**, y a 320px la pagina desbordaba 70px
        hacia la derecha. Lo encontro la primera prueba de navegador midiendo
        `scrollWidth`.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground text-sm">
            Filas
          </span>
          <Select
            disabled={ocupada}
            onValueChange={(valor) => onTamanoChange(Number(valor))}
            value={String(tamano)}
          >
            {/*
              La palabra "Filas" de al lado es un hermano, no una etiqueta: un
              lector de pantalla anunciaba este control como un boton sin nombre.
              Lo encontro `axe`, no una revision.
            */}
            <SelectTrigger aria-label="Filas por pagina" className="h-8 w-[4.5rem]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAMANOS_DE_PAGINA.map((valor) => (
                <SelectItem key={valor} value={String(valor)}>
                  {valor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          {saltos.slice(0, 2).map(({ etiqueta, Icono, a, off }) => (
            <Button
              className="size-8"
              disabled={off}
              key={etiqueta}
              onClick={() => onPaginaChange(a)}
              size="icon"
              variant="outline"
            >
              <Icono aria-hidden className="size-4" />
              <span className="sr-only">{etiqueta}</span>
            </Button>
          ))}

          {/* Estrecho en movil: "1 de 5" no necesita cinco caracteres y medio. */}
          <span className="text-muted-foreground min-w-[3.5rem] text-center text-sm tabular-nums sm:min-w-[5.5rem]">
            {pagina} de {ultima}
          </span>

          {saltos.slice(2).map(({ etiqueta, Icono, a, off }) => (
            <Button
              className="size-8"
              disabled={off}
              key={etiqueta}
              onClick={() => onPaginaChange(a)}
              size="icon"
              variant="outline"
            >
              <Icono aria-hidden className="size-4" />
              <span className="sr-only">{etiqueta}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
