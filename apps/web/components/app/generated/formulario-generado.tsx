'use client';

import { useState } from 'react';
import { z } from 'zod';
import { FormDialog } from '@/components/app/form-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TriangleAlert } from 'lucide-react';
import type { ModuloDelManifiesto, Registro } from '@/lib/api/aplicacion';
import { renderizadorDe } from '@/lib/aplicacion/campos';

/**
 * El formulario de un modulo que no existia al escribir este archivo.
 *
 * Sus campos salen del manifiesto y cada uno se dibuja con el renderizador de su
 * tipo. El esquema de validacion se **compone en tiempo de ejecucion** a partir
 * de los mismos campos, asi que no puede separarse de lo que se pinta.
 *
 * La validacion de aqui es una conveniencia: evita mandar algo que la API va a
 * rechazar. La autoridad sigue siendo el backend, que valida con un esquema
 * derivado del mismo blueprint que creo las tablas.
 */
export interface FormularioGeneradoProps {
  proyectoId: string;
  modulo: ModuloDelManifiesto;
  /** `null` para crear; un registro para editar. */
  registro: Registro | null;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onGuardar: (valores: Record<string, unknown>) => void;
  guardando: boolean;
  /** Errores por campo que devolvio el servidor, si los localizo. */
  erroresDelServidor?: Record<string, string>;
  /**
   * El registro todavia viene en camino.
   *
   * Se dibuja el esqueleto y no los campos vacios: un formulario que se rellena
   * solo delante de quien mira invita a escribir sobre lo que esta a punto de
   * ser sustituido.
   */
  cargando?: boolean;
  /** Por que no se pudo traer el registro. Si llega, no hay nada que guardar. */
  errorAlCargar?: string | null;
}

/** Tantos huecos como campos va a haber: el dialogo no cambia de alto al llegar. */
function Esqueleto({ campos }: { campos: number }): React.ReactElement {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando el registro...</span>
      {Array.from({ length: campos }, (_, indice) => (
        <div className="space-y-2" key={indice}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function valoresIniciales(
  modulo: ModuloDelManifiesto,
  registro: Registro | null,
): Record<string, unknown> {
  const valores: Record<string, unknown> = {};

  for (const campo of modulo.fields) {
    const renderizador = renderizadorDe(campo.type);

    if (!registro) {
      valores[campo.name] = renderizador.inicial(campo);
      continue;
    }

    const guardado = registro.values[campo.name] ?? null;
    valores[campo.name] = renderizador.hidratar ? renderizador.hidratar(guardado) : guardado;
  }

  return valores;
}

export function FormularioGenerado({
  proyectoId,
  modulo,
  registro,
  abierto,
  onAbiertoChange,
  onGuardar,
  guardando,
  erroresDelServidor = {},
  cargando = false,
  errorAlCargar = null,
}: FormularioGeneradoProps): React.ReactElement {
  const [valores, setValores] = useState(() => valoresIniciales(modulo, registro));
  const [errores, setErrores] = useState<Record<string, string>>({});

  /**
   * Al abrir con otro registro, el formulario se rellena de nuevo.
   *
   * Ajustado durante el renderizado y no en un efecto: con un efecto se veria un
   * instante el registro anterior dentro del dialogo del siguiente.
   */
  const identidad = `${abierto ? 'abierto' : 'cerrado'}:${registro?.id ?? 'nuevo'}:${cargando ? 'esperando' : 'listo'}`;
  const [identidadPrevia, setIdentidadPrevia] = useState(identidad);
  if (identidad !== identidadPrevia) {
    setIdentidadPrevia(identidad);
    setValores(valoresIniciales(modulo, registro));
    setErrores({});
  }

  function enviar(): void {
    const forma: Record<string, z.ZodTypeAny> = {};
    for (const campo of modulo.fields) {
      forma[campo.name] = renderizadorDe(campo.type).esquema(campo);
    }

    const resultado = z.object(forma).safeParse(valores);

    if (!resultado.success) {
      const encontrados: Record<string, string> = {};
      for (const problema of resultado.error.issues) {
        const campo = problema.path[0];
        if (typeof campo === 'string' && !encontrados[campo]) encontrados[campo] = problema.message;
      }
      setErrores(encontrados);
      return;
    }

    setErrores({});
    onGuardar(resultado.data);
  }

  const singular = modulo.label.replace(/s$/i, '');

  // Mientras el registro viene en camino no hay `registro`, pero el dialogo ya
  // es el de editar: el titulo no puede decir "Nuevo" y cambiar al llegar.
  const esEdicion = registro !== null || cargando || errorAlCargar !== null;
  const hayFormulario = !cargando && errorAlCargar === null;

  return (
    <FormDialog
      abierto={abierto}
      guardando={guardando}
      onAbiertoChange={onAbiertoChange}
      onSubmit={enviar}
      puedeGuardar={hayFormulario}
      textoDeAccion={esEdicion ? 'Guardar' : `Crear ${singular.toLowerCase()}`}
      titulo={esEdicion ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
    >
      {cargando ? <Esqueleto campos={modulo.fields.length} /> : null}

      {errorAlCargar ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden className="size-4" />
          <AlertTitle>No se pudo abrir</AlertTitle>
          <AlertDescription>{errorAlCargar}</AlertDescription>
        </Alert>
      ) : null}

      {hayFormulario &&
        modulo.fields.map((campo) =>
          renderizadorDe(campo.type).control({
            campo,
            disabled: guardando,
            error: errores[campo.name] ?? erroresDelServidor[campo.name],
            onChange: (valor) => setValores((previo) => ({ ...previo, [campo.name]: valor })),
            proyectoId,
            valor: valores[campo.name],
          }),
        )}
    </FormDialog>
  );
}
