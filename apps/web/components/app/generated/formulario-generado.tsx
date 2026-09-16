'use client';

import { useState } from 'react';
import { z } from 'zod';
import { FormDialog } from '@/components/app/form-dialog';
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
}: FormularioGeneradoProps): React.ReactElement {
  const [valores, setValores] = useState(() => valoresIniciales(modulo, registro));
  const [errores, setErrores] = useState<Record<string, string>>({});

  /**
   * Al abrir con otro registro, el formulario se rellena de nuevo.
   *
   * Ajustado durante el renderizado y no en un efecto: con un efecto se veria un
   * instante el registro anterior dentro del dialogo del siguiente.
   */
  const identidad = `${abierto ? 'abierto' : 'cerrado'}:${registro?.id ?? 'nuevo'}`;
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

  return (
    <FormDialog
      abierto={abierto}
      guardando={guardando}
      onAbiertoChange={onAbiertoChange}
      onSubmit={enviar}
      textoDeAccion={registro ? 'Guardar' : `Crear ${singular.toLowerCase()}`}
      titulo={registro ? `Editar ${singular.toLowerCase()}` : `Nuevo ${singular.toLowerCase()}`}
    >
      {modulo.fields.map((campo) =>
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
