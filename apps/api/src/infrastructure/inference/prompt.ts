import { z } from 'zod';
import type { AnalysisInput } from '../../domain/blueprint/analysis-input.js';
import { FIELD_TYPES } from '../../domain/blueprint/types.js';

/**
 * Esquema de salida.
 *
 * Es lo que hace que el modelo no pueda inventarse un tipo de campo (P-02). No
 * es la garantia final —esa es el validador determinista— pero elimina de raiz
 * la mayoria de las salidas invalidas.
 */
export const proposalSchema = z.object({
  applicationName: z
    .string()
    .describe(
      'Nombre corto para la aplicacion, en el idioma del archivo. Ej: "Gestion de Viajes".',
    ),
  entities: z
    .array(
      z.object({
        name: z
          .string()
          .describe('Identificador en minusculas y guion bajo. Ej: "clientes", "viajes".'),
        label: z.string().describe('Nombre visible, en plural. Ej: "Clientes".'),
        origin: z
          .enum(['sheet', 'derived'])
          .describe(
            '"sheet" si la entidad es una hoja completa; "derived" si sale de los valores repetidos de una columna.',
          ),
        sourceSheetIndex: z.number().int().nullable().describe('Indice de la hoja de origen.'),
        displayField: z
          .string()
          .describe('Nombre del campo que representa al registro en un selector.'),
        dedupeField: z
          .string()
          .nullable()
          .describe(
            'Campo por el que se reconoce un registro: un codigo, un RUC, una cedula. En entidades "derived" decide si dos filas son la misma. En entidades "sheet" sirve ademas para enlazar cuando otra hoja referencia por ese codigo en vez de por el nombre.',
          ),
        fields: z.array(
          z.object({
            name: z.string().describe('Identificador en minusculas y guion bajo.'),
            label: z.string().describe('Nombre visible del campo.'),
            type: z.enum(FIELD_TYPES),
            required: z.boolean(),
            options: z
              .array(z.string())
              .nullable()
              .describe('Solo si type es "select": los valores permitidos.'),
            targetEntity: z
              .string()
              .nullable()
              .describe('Solo si type es "relation": el `name` de la entidad apuntada.'),
            sourceSheetIndex: z
              .number()
              .int()
              .nullable()
              .describe('Hoja de la columna de origen, o null si el campo no viene del archivo.'),
            sourceColumnIndex: z
              .number()
              .int()
              .nullable()
              .describe('Columna de origen dentro de esa hoja.'),
          }),
        ),
      }),
    )
    .describe('Las entidades propuestas.'),
  relations: z
    .array(
      z.object({
        fromEntity: z.string().describe('Entidad del lado "muchos": la que lleva el campo.'),
        toEntity: z.string().describe('Entidad del lado "uno".'),
        fieldName: z.string().describe('Campo de fromEntity, de tipo "relation", que la sostiene.'),
      }),
    )
    .describe('Una entrada por cada campo de tipo "relation".'),
});

export type RawProposal = z.infer<typeof proposalSchema>;

/**
 * Instrucciones del sistema.
 *
 * Se mantienen fijas byte a byte para que el prefijo se pueda cachear: el perfil
 * del archivo, que cambia en cada peticion, va despues.
 */
export const SYSTEM_PROMPT = `Eres un analista que convierte hojas de calculo de negocio en un modelo de datos simple.

Recibes el PERFIL de un archivo Excel: sus hojas, sus columnas, estadisticas de cada columna y que columnas de hojas distintas contienen los mismos valores. No recibes las filas.

Tu unica tarea es proponer entidades, campos y relaciones simples. No decides como se almacenan, ni como se importan los datos, ni como se dibuja la interfaz.

REGLAS QUE NO PUEDES ROMPER

1. Usa solo los tipos de campo disponibles. No inventes ninguno.
2. Las relaciones son siempre de uno a muchos. Declaralas desde el lado "muchos". Nunca muchos-a-muchos, nunca una entidad consigo misma, nunca ciclos.
3. Cada campo que venga de una columna del archivo debe indicar su hoja y su columna de origen. Es lo que permite importar los datos despues.
4. Cada campo de tipo "relation" necesita su entrada correspondiente en "relations".
5. Cada entidad necesita un displayField que sirva para reconocer el registro en una lista: un nombre, una razon social, una placa. Nunca un importe, una fecha ni un booleano.
6. Si otra hoja referencia a una entidad por un CODIGO y no por su nombre, declara ese codigo como dedupeField de la entidad referenciada. Es lo que permite enlazar las filas: sin eso, "5.2.02" en la hoja de movimientos no encuentra la cuenta que se llama "Arriendo" y el enlace se queda vacio. Pasa constantemente con planes de cuentas, codigos de producto y numeros de documento.

COMO DECIDIR QUE ES UNA ENTIDAD

- Una columna que se repite mucho (pocos valores distintos sobre muchas filas) sugiere un concepto reutilizado: "Comercial Andes" apareciendo en 400 viajes es un Cliente.
- Una columna cuyos valores casi no se repiten NO puede ser una entidad: no agrupa nada. Dejala como campo.
- El nombre de la columna es evidencia, no prueba. "cliente", "proveedor", "vehiculo" apuntan a entidades; "observaciones" o "total" no.
- Cuando dos hojas comparten valores en una columna (te lo indicamos en "coincidencias"), son la misma entidad. Crea UNA entidad y relaciona ambas hojas con ella. No dupliques.

QUE NO CONVERTIR EN ENTIDAD

Ciudades, estados, categorias, tipos, monedas y similares se quedan como campo simple o como "select" con sus valores. Solo conviertelos en entidad si tienen columnas propias que los describan en alguna hoja.

COMO ELEGIR EL TIPO DE CADA CAMPO

Te damos un "tipo=" por columna: es lo que dedujimos mirando los valores, no una orden. Los "ejemplos" son la evidencia y pesan mas que nuestra deduccion.

- Un IDENTIFICADOR es texto, aunque sean todos digitos: cedula, RUC, NIF, codigo de producto, numero de factura, placa, codigo postal. La prueba es esta: si sumarlos o promediarlos no significa nada, no es un numero. Cuando marcamos una columna como PARECE_CODIGO_IDENTIFICADOR o IDENTIFICA_CADA_FILA, es casi siempre texto.
- Un cero a la izquierda en los ejemplos lo confirma. "0923456789" guardado como numero se convierte en 923456789, y ese cero no vuelve nunca. Ante la duda con un identificador elige texto: como texto no se pierde nada, como numero si.
- Usa "integer" y "decimal" solo para cantidades con las que se hace aritmetica: importes, unidades, horas, porcentajes.
- Usa "select" cuando la columna tiene pocos valores distintos que se repiten y forman un conjunto cerrado: estados, modalidades, prioridades. Pon en "options" todos los valores que veas.
- "email" y "phone" solo si el contenido lo es de verdad, no porque el encabezado lo insinue.
- No dejes fuera ninguna columna del archivo. Si una no encaja en nada mejor, hazla "text".

Ante varias interpretaciones posibles, elige siempre la mas simple. Es preferible quedarse corto: la persona usuaria revisara la propuesta y puede anadir lo que falte.

El texto visible (applicationName, label) va en el idioma del archivo. Los identificadores (name) siempre en minusculas, sin acentos y con guion bajo.`;

/**
 * Serializa el perfil para el modelo.
 *
 * Formato compacto y estable: cada byte cuenta para el cache, y un JSON con
 * saltos de linea gastaria el triple sin decir nada mas.
 */
export function renderAnalysisInput(input: AnalysisInput): string {
  const lines: string[] = [`ARCHIVO: ${input.fileName}`, ''];

  for (const sheet of input.sheets) {
    lines.push(`HOJA ${sheet.index}: "${sheet.name}" (${sheet.rowCount} filas de datos)`);

    for (const column of sheet.columns) {
      const profile = column.profile;
      const parts = [
        `tipo=${profile.inferredType}`,
        `distintos=${profile.distinct}`,
        `vacios=${profile.empty}`,
        `cardinalidad=${profile.cardinalityRatio.toFixed(3)}`,
      ];

      if (profile.repeatsEnoughForEntity) parts.push('SE_REPITE_MUCHO');
      if (profile.identifying) parts.push('IDENTIFICA_CADA_FILA');
      if (profile.identityCandidate) parts.push('PARECE_CODIGO_IDENTIFICADOR');

      const samples = profile.samples.slice(0, 8).join(' | ');

      lines.push(`  col ${column.index}: "${column.header}"  ${parts.join(' ')}`);
      if (samples.length > 0) lines.push(`    ejemplos: ${samples}`);
    }

    lines.push('');
  }

  if (input.overlaps.length > 0) {
    lines.push('COINCIDENCIAS ENTRE HOJAS (mismas columnas, valores compartidos):');
    for (const overlap of input.overlaps.slice(0, 40)) {
      lines.push(
        `  hoja ${overlap.left.sheetIndex} col ${overlap.left.columnIndex} "${overlap.left.header}"` +
          ` <-> hoja ${overlap.right.sheetIndex} col ${overlap.right.columnIndex} "${overlap.right.header}"` +
          `  comparten ${overlap.shared} valores (contencion ${overlap.containment.toFixed(2)})`,
      );
    }
    lines.push('');
  } else {
    lines.push('COINCIDENCIAS ENTRE HOJAS: ninguna.', '');
  }

  return lines.join('\n');
}

export function renderRepairRequest(problems: readonly string[]): string {
  return [
    'Tu propuesta anterior no paso la validacion. Problemas encontrados:',
    ...problems.map((problem) => `  - ${problem}`),
    '',
    'Corrigelos y devuelve la propuesta completa de nuevo. No expliques nada.',
  ].join('\n');
}
