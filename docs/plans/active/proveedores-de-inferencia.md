# Tres proveedores de inferencia

## Por qué

Hoy la inferencia solo sabe hablar con Anthropic. No es un problema de arquitectura —el puerto
`BlueprintProposer` ya aísla la IA del resto del sistema— sino de que solo existe una
implementación. La consecuencia práctica: quien despliegue esto necesita una cuenta de Anthropic
o se queda sin relaciones ni `select`, porque el camino determinista no los propone.

## Qué se decidió, y qué no

| Decisión              | Elegido                                                             |
| --------------------- | ------------------------------------------------------------------- |
| Quién elige           | **El operador, por entorno.** `INFERENCE_PROVIDER`                  |
| Si el proveedor falla | **Se intenta con los demás que tengan clave**, y luego determinista |
| Elección por proyecto | Descartado. No hay columna nueva en la base ni control en el panel  |
| Elección de modelo    | Por entorno, con un valor por defecto por proveedor                 |

La segunda decisión merece una nota. Hoy un fallo del proveedor cae directo al camino
determinista de RE-04; a partir de aquí, antes de rendirse se prueban los otros proveedores
configurados. Eso **gasta dinero en un proveedor que nadie eligió**, y es exactamente lo que se
pidió: mientras haya una clave puesta, se usa antes de degradar la propuesta.

## Lo que ya es agnóstico, y por eso esto es barato

Conviene decirlo porque cambia el tamaño del trabajo. De `claude-proposer.ts` solo unas 40 líneas
están atadas a Anthropic: el cliente, la llamada `messages.parse` y `translate()`. Todo lo demás
ya sirve para los tres:

- `proposalSchema` — un esquema Zod. Los tres proveedores aceptan salida estructurada.
- `SYSTEM_PROMPT`, `renderAnalysisInput`, `renderRepairRequest` — cadenas de texto.
- `toDomain()` — traduce `RawProposal` al dominio. No sabe de dónde vino.
- El validador determinista del dominio, que es la garantía real: **un proveedor peor produce
  propuestas peores, pero ninguno puede romper el sistema.** Solo los diez tipos de `FIELD_TYPES`
  llegan a persistirse, venga el JSON de donde venga.

## Cómo se hace la salida estructurada en cada uno

Verificado leyendo los tipos de cada SDK instalado, no de memoria:

| Proveedor | SDK                 | Mecanismo                                                     |
| --------- | ------------------- | ------------------------------------------------------------- |
| Anthropic | `@anthropic-ai/sdk` | `messages.parse` + `zodOutputFormat(esquema)`                 |
| OpenAI    | `openai`            | `responses.parse` + `zodTextFormat(esquema, nombre)`          |
| Gemini    | `@google/genai`     | `generateContent` + `responseJsonSchema` + `responseMimeType` |

Gemini es el distinto: no acepta Zod, sino JSON Schema. Se convierte con `z.toJSONSchema()`, que
Zod 4 ya trae. Su lista de propiedades soportadas es acotada, así que **hay que comprobar que el
esquema convertido sobrevive al viaje** y no darlo por hecho.

## Fases

### P0 — La costura

**Objetivo.** Que añadir un proveedor sea escribir un archivo, no tocar el motor.

**Entregables.**

- `inference/to-domain.ts`: `toDomain` sale de `claude-proposer.ts`. La usarán los tres.
- `inference/providers/tipos.ts`: el contrato mínimo de un proveedor. No es el puerto del
  dominio —ese sigue siendo `BlueprintProposer`— sino algo más pequeño: _dado un sistema y un
  mensaje, devuelve un `RawProposal` y su consumo_. Un proveedor no sabe qué es una propuesta ni
  qué es reparar.
- `inference/providers/anthropic.ts`: lo de hoy, recortado a ese contrato.
- `inference/proposer.ts`: construye el `BlueprintProposer` a partir de una lista ordenada de
  proveedores. Aquí viven `propose`, `repair` y **el encadenado**: se prueba el primero, y si
  falla se sigue con el siguiente. Si se acaban, lanza y el caso de uso cae al determinista,
  igual que hoy.
- `config/env.ts`: `INFERENCE_PROVIDER`, `OPENAI_API_KEY`, `GEMINI_API_KEY` y los tres
  `*_MODEL` con su valor por defecto.
- `composition-root.ts`: ordena la lista —el elegido primero, después los que tengan clave— y la
  pasa a `createProposer`. Si no hay ninguna clave, `proposer` sigue siendo `null` y no cambia
  nada de lo que ya funciona.

**Verificación.** `tests/claude-proposer.test.ts` sigue verde sin tocarlo: es la prueba de que la
costura no cambió el comportamiento. Y una prueba nueva del encadenado con proveedores de
mentira: que el segundo se usa cuando el primero lanza, que se respeta el orden, y que si todos
fallan el error deja caer al camino determinista.

### P1 — OpenAI

**Entregables.** `providers/openai.ts` y su entrada en el registro.

**Verificación.** Una prueba con `fetch` sustituido que afirme la forma exacta de la petición
—modelo, el esquema en `text.format`, las instrucciones como mensaje de sistema— y que la
respuesta se traduce al dominio. Igual que la que ya existe para Anthropic, porque lo que hay que
demostrar es lo mismo.

### P2 — Gemini

**Entregables.** `providers/gemini.ts` y su entrada en el registro.

**Verificación.** Lo mismo que P1, **más una prueba propia**: que `z.toJSONSchema(proposalSchema)`
produce un esquema que Gemini admite. Es el único punto donde los tres no son intercambiables, así
que es el único que necesita una prueba que los otros no tienen.

### P3 — La prueba de verdad

**Objetivo.** Saber si funciona, no si compila.

**Entregables.** `.env.example` con las tres claves y la variable de elección; `docs/` con la
tabla de proveedores y modelos; y el cambio en `stack.md` si procede.

**Verificación.** Con claves reales, los tres escenarios de Excel ya generados
(`gastos`, `pedidos`, `academia`) contra cada proveedor. Lo que se compara no es si pasa o falla,
sino **qué modelo propone cada uno para el mismo archivo**: cuántas entidades, cuántas relaciones,
qué tipos. Esa tabla es el entregable de esta fase.

## Riesgos

| Riesgo                                                             | Fase   | Mitigación                                                                       |
| ------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------- |
| El esquema convertido a JSON Schema no le sirve a Gemini           | P2     | Prueba propia de la conversión, antes de la primera llamada real                 |
| El encadenado gasta en un proveedor que nadie eligió               | P0     | Es la decisión tomada; se registra cada intento con su proveedor y su consumo    |
| Los nombres de modelo caducan                                      | P0     | Salen de las uniones de tipos del propio SDK, y son sobreescribibles por entorno |
| El prefijo cacheado de Anthropic no tiene equivalente en los otros | P1, P2 | Se acepta: el coste sube en los otros dos y se dice, en vez de fingir paridad    |

## Verification

- `corepack pnpm verify` en verde tras cada fase.
- La suite entera sigue corriendo **sin ninguna clave de API**: es un requisito del puerto y no
  puede perderse al triplicar los proveedores.
