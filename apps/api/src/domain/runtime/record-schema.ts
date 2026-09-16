import { z } from 'zod';
import type { RuntimeEntity, RuntimeField } from './application.js';

/**
 * Validacion de un registro, construida a partir del blueprint.
 *
 * Es RF-23 hecho codigo: "Los nuevos registros deberan respetar campos, tipos,
 * relaciones y obligatoriedad configurada". El esquema no esta escrito a mano en
 * ningun sitio; se deriva de la misma definicion que produjo las tablas, asi que
 * no pueden divergir.
 *
 * Los mensajes van en lenguaje de negocio y nombran el campo por su etiqueta:
 * quien rellena el formulario ve "Fecha", no `fecha` ni `viajes.fecha`.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function schemaForField(field: RuntimeField): z.ZodTypeAny {
  const label = field.label;

  switch (field.type) {
    case 'text':
      return z.string({ error: `"${label}" debe ser texto.` }).max(10_000);

    case 'email':
      return z.email({ error: `"${label}" no parece un correo valido.` });

    case 'phone':
      return z.string({ error: `"${label}" debe ser texto.` }).max(40);

    case 'integer':
      return z.coerce
        .number({ error: `"${label}" debe ser un numero.` })
        .int(`"${label}" debe ser un numero entero.`);

    case 'decimal':
      return z.coerce.number({ error: `"${label}" debe ser un numero.` });

    case 'boolean':
      return z.boolean({ error: `"${label}" debe ser si o no.` });

    case 'date':
      // Una fecha de negocio viaja como texto, sin zona horaria de por medio.
      // Es la misma decision que en la importacion, por el mismo motivo.
      return z
        .string({ error: `"${label}" debe ser una fecha.` })
        .regex(DATE_ONLY, `"${label}" debe tener el formato AAAA-MM-DD.`);

    case 'datetime':
      return z.iso.datetime({
        offset: true,
        error: `"${label}" debe ser una fecha con hora.`,
      });

    case 'select': {
      const options = field.options ?? [];
      if (options.length === 0) return z.string();

      return z.enum(options as [string, ...string[]], {
        error: `"${label}" admite: ${options.join(', ')}.`,
      });
    }

    case 'relation':
      return z.uuid({ error: `Elige un valor para "${label}".` });
  }
}

/**
 * Esquema para crear un registro.
 *
 * Los campos opcionales aceptan ausencia y `null`; los obligatorios no. Es la
 * unica diferencia entre crear y editar, y por eso `forUpdate` la relaja: en una
 * edicion parcial, que un campo no venga significa "no lo toques", no "borralo".
 */
export function buildRecordSchema(
  entity: RuntimeEntity,
  options: { partial?: boolean } = {},
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of entity.fields) {
    const base = schemaForField(field);

    if (options.partial === true) {
      shape[field.name] = field.required ? base.optional() : base.nullish();
      continue;
    }

    shape[field.name] = field.required ? base : base.nullish().transform((value) => value ?? null);
  }

  // `strict` a proposito: un campo que no existe es casi siempre una llamada
  // desactualizada, y aceptarlo en silencio haria creer que se guardo algo.
  return z.strictObject(shape);
}
