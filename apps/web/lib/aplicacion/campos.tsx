'use client';

import { Check, Minus } from 'lucide-react';
import { z } from 'zod';
import { DatePickerField } from '@/components/app/fields/date-picker-field';
import { DateTimePickerField } from '@/components/app/fields/datetime-picker-field';
import { EntityPickerCombobox } from '@/components/app/fields/entity-picker-combobox';
import { StatusBadge } from '@/components/app/status-badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { buscarOpciones, type CampoDelManifiesto } from '@/lib/api/aplicacion';
import { clavesDeLaAplicacion } from '@/lib/api/aplicacion';
import {
  comoDecimal,
  comoEntero,
  comoFecha,
  comoFechaHora,
  comoNumero,
  comoTexto,
} from './formato';

/**
 * El registro de tipos de campo.
 *
 * **La pieza sobre la que se sostiene toda la aplicacion generada.**
 *
 * Sus modulos, sus campos y sus tipos los decide el Excel de otra persona, asi
 * que no se pueden escribir a mano. Lo unico que lo hace tratable es que el
 * vocabulario esta **cerrado** en diez tipos (RF-08, y P-02 en el backend): se
 * escriben diez renderizadores, y la tabla y el formulario se generan solos.
 *
 * Por cada tipo hacen falta cuatro cosas y ni una mas: como se pinta en una
 * celda, con que se rellena en un formulario, como se valida, y hacia que lado
 * se alinea.
 *
 * Si algun dia aparece aqui un `if` por nombre de entidad o de campo, algo se
 * hizo mal: eso significaria que el motor dejo de ser generico.
 */

export interface ContextoDeCelda {
  valor: unknown;
  /** Etiqueta del registro apuntado, cuando el campo es una relacion. */
  etiquetaRelacionada: string | null;
  campo: CampoDelManifiesto;
}

export interface ContextoDeControl {
  campo: CampoDelManifiesto;
  valor: unknown;
  onChange: (valor: unknown) => void;
  error?: string;
  disabled?: boolean;
  /** Necesario para que una relacion sepa a que modulo pedir sus opciones. */
  proyectoId: string;
}

export interface RenderizadorDeCampo {
  alineacion?: 'izquierda' | 'derecha' | 'centro';
  celda: (contexto: ContextoDeCelda) => React.ReactNode;
  control: (contexto: ContextoDeControl) => React.ReactNode;
  /** Fragmento de validacion, derivado del propio campo. */
  esquema: (campo: CampoDelManifiesto) => z.ZodTypeAny;
  /** Con que empieza el formulario de creacion. */
  inicial: (campo: CampoDelManifiesto) => unknown;
  /**
   * Como entra en el formulario un valor que viene del servidor.
   *
   * Existe porque la tabla y el formulario tienen que decir lo mismo: si la
   * celda muestra `350,00`, el control no puede mostrar `350.00`. Aqui, y no en
   * el control, para que la conversion ocurra una vez al abrir y no en cada
   * pulsacion: reformatear a media palabra movería el cursor.
   */
  hidratar?: (valor: unknown) => unknown;
}

/** Texto simple, truncado, con el valor entero al posarse encima. */
function Texto({ valor }: { valor: unknown }): React.ReactElement {
  const texto = comoTexto(valor);
  if (texto === null || texto === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="block max-w-[18rem] truncate" title={texto}>
      {texto}
    </span>
  );
}

/** Campo de texto envuelto con su etiqueta, error y marca de obligatorio. */
function CampoConEtiqueta({
  campo,
  error,
  children,
}: {
  campo: CampoDelManifiesto;
  error?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor={`campo-${campo.name}`}>
        {campo.label}
        {campo.required ? (
          <span aria-hidden className="text-muted-foreground">
            {' *'}
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-sm" id={`campo-${campo.name}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function entradaSimple(
  tipoHtml: string,
  extra?: Partial<React.ComponentProps<'input'>>,
): RenderizadorDeCampo['control'] {
  return ({ campo, valor, onChange, error, disabled }) => (
    <CampoConEtiqueta campo={campo} error={error} key={campo.name}>
      <Input
        aria-describedby={error ? `campo-${campo.name}-error` : undefined}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        id={`campo-${campo.name}`}
        onChange={(evento) => onChange(evento.target.value === '' ? null : evento.target.value)}
        type={tipoHtml}
        value={comoTexto(valor) ?? ''}
        {...extra}
      />
    </CampoConEtiqueta>
  );
}

/**
 * Un numero escrito como lo escribe una persona.
 *
 * Se envia el valor **canonico**, no el texto: `forms-and-workflows.md` pide
 * formatear para mostrar y mandar valores numericos canonicos, y asi ningun
 * consumidor de la API tiene que conocer la convencion de quien escribio.
 *
 * La API tambien sabe leer la notacion española, asi que esto es comodidad y no
 * garantia: si un texto raro se colara, el servidor lo rechazaria igual.
 */
function numeroEscrito(campo: CampoDelManifiesto, entero: boolean): z.ZodType<number> {
  return z
    .union([z.number(), z.string()], { error: `"${campo.label}" debe ser un numero.` })
    .transform((valor, ctx) => {
      const parsed = typeof valor === 'number' ? valor : comoNumero(valor);

      if (parsed === null) {
        ctx.addIssue({ code: 'custom', message: `"${campo.label}" debe ser un numero.` });
        return z.NEVER;
      }

      if (entero && !Number.isInteger(parsed)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${campo.label}" debe ser un numero entero.`,
        });
        return z.NEVER;
      }

      return parsed;
    });
}

/** Opcional significa que tambien se acepta `null` y la cadena vacia. */
function opcional(esquema: z.ZodTypeAny, requerido: boolean): z.ZodTypeAny {
  return requerido ? esquema : esquema.nullish();
}

const TEXTO: RenderizadorDeCampo = {
  celda: ({ valor }) => <Texto valor={valor} />,
  control: entradaSimple('text'),
  esquema: (campo) =>
    opcional(z.string().max(10_000, `"${campo.label}" es demasiado largo.`), campo.required),
  inicial: () => null,
};

export const RENDERIZADORES: Record<string, RenderizadorDeCampo> = {
  text: TEXTO,

  integer: {
    alineacion: 'derecha',
    celda: ({ valor }) =>
      valor === null || valor === undefined ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        comoEntero(valor)
      ),
    control: entradaSimple('text', { inputMode: 'numeric' }),
    hidratar: (valor) => (valor === null || valor === undefined ? null : comoEntero(valor)),
    esquema: (campo) => opcional(numeroEscrito(campo, true), campo.required),
    inicial: () => null,
  },

  decimal: {
    alineacion: 'derecha',
    celda: ({ valor }) =>
      valor === null || valor === undefined ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        comoDecimal(valor)
      ),
    control: entradaSimple('text', { inputMode: 'decimal' }),
    hidratar: (valor) => (valor === null || valor === undefined ? null : comoDecimal(valor)),
    esquema: (campo) => opcional(numeroEscrito(campo, false), campo.required),
    inicial: () => null,
  },

  boolean: {
    alineacion: 'centro',
    // Icono **y** palabra: el color nunca va solo.
    celda: ({ valor }) =>
      valor === true ? (
        <span className="inline-flex items-center gap-1 text-sm">
          <Check aria-hidden className="size-4" />
          Si
        </span>
      ) : (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <Minus aria-hidden className="size-4" />
          No
        </span>
      ),
    control: ({ campo, valor, onChange, disabled }) => (
      <div className="flex items-center gap-2" key={campo.name}>
        <Switch
          checked={valor === true}
          disabled={disabled}
          id={`campo-${campo.name}`}
          onCheckedChange={(nuevo) => onChange(nuevo)}
        />
        <Label className="font-normal" htmlFor={`campo-${campo.name}`}>
          {campo.label}
        </Label>
      </div>
    ),
    esquema: (campo) => opcional(z.boolean(), campo.required),
    inicial: () => false,
  },

  date: {
    celda: ({ valor }) =>
      valor ? comoFecha(valor) : <span className="text-muted-foreground">—</span>,
    control: ({ campo, valor, onChange, error, disabled }) => (
      <DatePickerField
        disabled={disabled}
        error={error}
        key={campo.name}
        label={campo.label}
        onChange={onChange}
        required={campo.required}
        value={typeof valor === 'string' ? valor : null}
      />
    ),
    // El backend exige exactamente este formato, y por el mismo motivo: una
    // fecha de calendario no tiene zona horaria.
    esquema: (campo) =>
      opcional(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, `"${campo.label}" debe tener el formato AAAA-MM-DD.`),
        campo.required,
      ),
    inicial: () => null,
  },

  datetime: {
    celda: ({ valor }) =>
      valor ? comoFechaHora(valor) : <span className="text-muted-foreground">—</span>,
    control: ({ campo, valor, onChange, error, disabled }) => (
      <DateTimePickerField
        disabled={disabled}
        error={error}
        key={campo.name}
        label={campo.label}
        onChange={onChange}
        required={campo.required}
        value={typeof valor === 'string' ? valor : null}
      />
    ),
    esquema: (campo) =>
      opcional(
        z.string().refine((valor) => !Number.isNaN(new Date(valor).getTime()), {
          error: `"${campo.label}" debe ser una fecha con hora.`,
        }),
        campo.required,
      ),
    inicial: () => null,
  },

  email: {
    celda: ({ valor }) =>
      typeof valor === 'string' && valor ? (
        <a className="hover:underline" href={`mailto:${valor}`}>
          {valor}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    control: entradaSimple('email'),
    esquema: (campo) =>
      opcional(z.email({ error: `"${campo.label}" no parece un correo valido.` }), campo.required),
    inicial: () => null,
  },

  phone: {
    celda: ({ valor }) =>
      typeof valor === 'string' && valor ? (
        <a className="hover:underline" href={`tel:${valor.replace(/\s/g, '')}`}>
          {valor}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    control: entradaSimple('tel'),
    esquema: (campo) => opcional(z.string().max(40), campo.required),
    inicial: () => null,
  },

  select: {
    celda: ({ valor }) => {
      const texto = comoTexto(valor);
      return texto ? (
        <StatusBadge>{texto}</StatusBadge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
    control: ({ campo, valor, onChange, error, disabled }) => (
      <CampoConEtiqueta campo={campo} error={error} key={campo.name}>
        <Select
          disabled={disabled}
          onValueChange={(nuevo) => onChange(nuevo)}
          value={typeof valor === 'string' ? valor : undefined}
        >
          <SelectTrigger id={`campo-${campo.name}`}>
            <SelectValue placeholder="Elegir" />
          </SelectTrigger>
          <SelectContent>
            {(campo.options ?? []).map((opcion) => (
              <SelectItem key={opcion} value={opcion}>
                {opcion}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoConEtiqueta>
    ),
    esquema: (campo) => {
      const opciones = campo.options ?? [];
      if (opciones.length === 0) return opcional(z.string(), campo.required);
      return opcional(
        z.enum(opciones as [string, ...string[]], {
          error: `"${campo.label}" admite: ${opciones.join(', ')}.`,
        }),
        campo.required,
      );
    },
    inicial: () => null,
  },

  relation: {
    /**
     * La etiqueta, **jamas el identificador**.
     *
     * El UUID viaja en `values` porque el formulario lo necesita para guardar;
     * lo que se ve es "Comercial Andes". Es RF-17 y la *Technical Information
     * Boundary*.
     */
    celda: ({ etiquetaRelacionada }) =>
      etiquetaRelacionada ? (
        <Texto valor={etiquetaRelacionada} />
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    control: ({ campo, valor, onChange, error, disabled, proyectoId }) => (
      <EntityPickerCombobox
        buscar={(texto, signal) => buscarOpciones(proyectoId, campo.relatedTo ?? '', texto, signal)}
        claveDeCache={clavesDeLaAplicacion.opciones(proyectoId, campo.relatedTo ?? '')}
        disabled={disabled}
        error={error}
        key={campo.name}
        label={campo.label}
        onChange={onChange}
        required={campo.required}
        value={typeof valor === 'string' ? valor : null}
      />
    ),
    esquema: (campo) =>
      opcional(z.uuid({ error: `Elige un valor para "${campo.label}".` }), campo.required),
    inicial: () => null,
  },
};

/** Un tipo que no conocemos se trata como texto en vez de romper la pantalla. */
export function renderizadorDe(tipo: string): RenderizadorDeCampo {
  return RENDERIZADORES[tipo] ?? TEXTO;
}
