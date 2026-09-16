# Comprobación manual del motor de inferencia

## Por qué existe este documento

La suite automatizada nunca llama al modelo. Todos sus tests inyectan una
propuesta conocida, a propósito: lo que verifican es el **sistema** —dada una
propuesta válida, que ocurra todo lo demás— y eso tiene que poder comprobarse sin
red, sin clave de API y sin gastar dinero en cada `pnpm verify`.

Queda una pregunta fuera: **¿es buena la propuesta que sale del modelo?** No es
determinista, cuesta dinero y depende de un servicio externo, así que no puede
vivir en la suite. Vive aquí.

Mientras esta comprobación no se haya ejecutado, el estado honesto del motor de
inferencia es: _su contrato está verificado, su calidad no_. Lo que sí está
cubierto automáticamente en `tests/claude-proposer.test.ts` es la forma de la
petición, la traducción de la respuesta, el reintento de reparación y los tres
caminos de fallo, todo con un `fetch` inyectado.

## Cómo se ejecuta

Requiere el contenedor de PostgreSQL levantado, las migraciones aplicadas y una
cuenta creada (`corepack pnpm db:seed`).

```bash
cd apps/api
ANTHROPIC_API_KEY=sk-... corepack pnpm inference:check
```

El script sube el archivo de demo del ERS §18 —el mismo que usa
`tests/acceptance.test.ts`, generado por `tests/helpers/demo-fixture.ts`—, lanza
el análisis con el motor real, imprime la propuesta entera y la puntúa contra las
nueve expectativas de abajo. Al terminar borra el proyecto que creó.

Cuesta una llamada al modelo. La entrada son encabezados, estadísticas y hasta
veinte ejemplos por columna: **ninguna fila del archivo sale del servidor**, ni
con 120 filas ni con 50.000.

## Qué se mide automáticamente

| Id  | Expectativa                                                                      |
| --- | -------------------------------------------------------------------------------- |
| E1  | Propone las cuatro entidades del ERS §18                                         |
| E2  | Extrae Clientes de la columna repetida en vez de dejarla como texto              |
| E3  | Une la hoja `Clientes` con los clientes de `Viajes`, sin duplicar la entidad     |
| E4  | Aprovecha los datos que solo están en la segunda hoja (correo, teléfono, ciudad) |
| E5  | Extrae Vehículos y Conductores como entidades propias                            |
| E6  | Propone las tres relaciones N-1 desde Viajes                                     |
| E7  | Reconoce Estado como lista cerrada, no como texto libre                          |
| E8  | Elige claves de deduplicación sensatas para las entidades extraídas              |
| E9  | Pone nombre al conjunto en lenguaje de negocio                                   |

**E3 es la que más importa.** Es el caso que justifica la decisión 2 del plan
—leer todas las hojas y construir un modelo unificado— y el único que no puede
salir bien por casualidad: exige cruzar dos hojas por el solapamiento de sus
valores, no por el nombre de sus columnas.

## Qué hay que juzgar leyendo

Lo que ninguna aserción puede decidir:

1. **Los nombres.** ¿Diría el negocio «Vehículos» o «Unidades»? Un nombre que no
   es el del negocio obliga a traducir mentalmente en cada pantalla.
2. **Los campos obligatorios.** Marcar de más rechaza filas válidas al importar;
   marcar de menos deja crear registros inútiles. Se ve rápido comparando con el
   recuento de vacíos que trae `GET /api/projects/:id/sheets`.
3. **Si la propuesta se lee con naturalidad.** El resumen del ERS §12 lo tiene
   que entender alguien que no sabe lo que es una clave foránea. Si hay que
   explicárselo, la propuesta falló aunque las nueve expectativas den que sí.
4. **Lo que el validador tuvo que ajustar.** El script imprime las notas. Que el
   validador corrija algo no es un fallo —para eso está—, pero si corrige lo
   mismo siempre, el prompt tiene un problema y hay que arreglarlo ahí.

## Cuándo hay que volver a ejecutarla

- Al cambiar `src/infrastructure/inference/prompt.ts`.
- Al cambiar de modelo o de parámetros en `claude-proposer.ts`.
- Al cambiar las reglas del validador que recortan la propuesta.
- Antes de enseñar la demo a alguien.

## Registro de ejecuciones

Una fila por ejecución. Sin fila, no se ejecutó.

| Fecha | Modelo | Expectativas | Observaciones                                                                                                                                                                   |
| ----- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —     | —      | —            | **Pendiente.** No hay credenciales de Anthropic en la máquina de desarrollo, así que esta comprobación no se ha ejecutado nunca. La calidad de la propuesta está sin verificar. |
