# Plan de frontend — MVP

## Goal

Poner en pantalla lo que el backend ya sabe hacer: que una persona suba un Excel, corrija
lo que el sistema propuso, confirme, y acabe usando una aplicación de gestión real —tablas,
formularios, selectores de relación— sin escribir una línea de código ni ver un identificador
en su vida.

Estado de partida: backend completo (F0–F9), 362 tests en verde, los 18 criterios del ERS
§17 verificados también contra PostgreSQL real. La API expone 18 rutas de negocio y no le
falta nada para esto. Ver [`backend-mvp.md`](backend-mvp.md).

---

## Aquí hay dos productos, no uno

Es la decisión estructural de la que cuelga todo lo demás.

|                   | **El constructor**                         | **La aplicación generada**                                  |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Qué es            | Un asistente lineal de 9 pasos             | Un panel de gestión con N módulos                           |
| Quién lo usa      | Una vez por proyecto                       | Todos los días                                              |
| Su estructura     | **Fija.** La conozco al escribir el código | **Desconocida.** Sale del manifiesto en tiempo de ejecución |
| Cómo se construye | Pantallas escritas a mano                  | Un renderizador por tipo de campo                           |
| Pantallas del ERS | §19 P1–P9                                  | §19 P10                                                     |

El constructor es trabajo normal de frontend. La aplicación generada **no se puede escribir
a mano**: sus módulos, campos y tipos los decide el Excel de otra persona. Lo único que la
hace tratable es que el vocabulario está cerrado —diez tipos de campo y una clase de
relación, P-02— así que se escriben **diez renderizadores**, no infinitos formularios.

Esa asimetría gobierna el reparto de fases: W3–W6 construyen el constructor, W7 construye
el motor genérico.

---

## Decisiones tomadas

- **2026-09-15** — El navegador habla con un solo origen. Next reescribe `/api/*` hacia
  Express, así que la cookie de sesión es _same-site_ y el backend no se toca. Es además el
  despliegue que ya describe `deployment.md`: un dominio, `/` y `/api`. La alternativa
  —CORS en la API— obligaba a cookies `SameSite=None; Secure` y por tanto a HTTPS en
  desarrollo.
- **2026-09-15** — El estado del servidor lo gestiona **TanStack Query**. `frontend.md` pide
  "typed query/mutation helpers with cancellation and invalidation", que es su descripción
  literal. No está nombrado en `stack.md`, así que W0 abre un ADR.
- **2026-09-15** — Se construye **todo el editor del modelo**, no el mínimo del ERS §19. El
  backend ya expone renombrar y borrar entidades, añadir/editar/borrar campos, elegir campo
  mostrado y clave de deduplicación, y aceptar o rechazar relaciones. Dejar la mitad sin
  superficie sería tirar trabajo probado, y es justo donde la inferencia se equivoca.
- **2026-09-15** — La interfaz está en español. El backend ya devuelve todos sus mensajes
  en lenguaje de negocio y en español; traducirlos en el cliente sería mantener dos copias.

---

## Versiones

Comprobadas contra el registro el 2026-09-15, no recordadas:

| Paquete               | Versión |
| --------------------- | ------- |
| next                  | 16.3.5  |
| react                 | 19.3.0  |
| tailwindcss           | 4.3.3   |
| shadcn (CLI)          | 4.21.0  |
| @tanstack/react-query | 5.102.8 |
| @tanstack/react-table | 9.2.4   |
| react-hook-form       | 7.88.0  |
| @hookform/resolvers   | 5.9.1   |
| zod                   | 4.6.5   |
| sonner                | 2.0.8   |
| lucide-react          | 1.46.0  |
| better-auth           | 1.7.5   |
| @playwright/test      | 1.63.0  |

Dos cosas que no son las que uno esperaría y conviene mirar en W0: **Next 16**, no 15, y
**TanStack Table 9**, no 8. La API usa Vitest 3 y aquí toca Vitest 5; conviven porque son
paquetes distintos del workspace, pero `pnpm -r test` ejecutará dos mayores a la vez.

---

## De dónde salen los componentes

`stack.md` fija shadcn/ui y lucide. shadcn no es una dependencia: es un CLI que copia código
fuente al repositorio, así que cada componente instalado **es código nuestro** desde el
momento en que entra.

Los bloques de 21st.dev se instalan por el mismo CLI, apuntando a su URL de registro:

```bash
pnpm dlx shadcn@latest add button table dialog        # registro oficial
pnpm dlx shadcn@latest add "https://21st.dev/r/<...>"  # bloque de la comunidad
```

> **El MCP de 21st.dev.** Está declarado a nivel de usuario y conectado
> (`claude mcp list` → `21stdev … Connected`). La cabecera `x-api-key` referencia
> `${API_KEY_21ST}`, que vive en `~/.claude/settings.json`, así que la clave no se duplica en
> un tercer archivo ni se acerca al repositorio.
>
> Lo que aporta es buscar y previsualizar el catálogo sin salir del editor. Lo que **no**
> cambia es el peaje de abajo: un bloque llegado por MCP entra al repositorio igual que uno
> llegado por CLI, y pasa por los mismos siete pasos.

Todo lo que venga de fuera del registro oficial pasa **sin excepción** por el peaje de
`component-system.md` → _External Component Intake_, que es no negociable y son siete pasos:
inspeccionar el código y lo que arrastra; quitar datos de demo, marca y estilos globales;
sustituir colores, radios, sombras y espaciados por los tokens del proyecto; sustituir SVG
sueltos por lucide; alinear props y estados con el contrato compartido; verificar teclado,
foco, lector de pantalla, movimiento reducido, temas y móvil; y **eliminar el duplicado** que
venga a reemplazar.

La regla que más se incumple y la que más cuesta después: _no acumular dos sistemas de tabla,
dos de toasts ni dos de paginación._

### Candidatos ya localizados

Buscados y, en el segundo caso, leídos:

| Para                 | Candidato                      | Qué trae                                                                                                      |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `AppDataTable` (W2)  | `felipemenezes098/table-20`    | TanStack Table con orden, filtros, paginación, selección, visibilidad de columnas y menú de acciones por fila |
| Zona de archivo (V4) | `ephraimduncan/file-upload-04` | Arrastrar y soltar para CSV/XLSX/XLS, validación de tipo, barra de progreso y cancelar                        |

El segundo se recuperó entero para medir cuánto cuesta realmente el peaje, y la respuesta es
**aproximadamente la mitad del componente**:

- su barra de progreso es **falsa** —un `setInterval` que suma 5 cada 200 ms—, y V4 necesita
  el progreso real de la subida;
- trae una tarjeta de demostración incrustada con `Revenue_Q1_2024.xlsx · 3,1 MB · 45%`;
- anuncia un límite de 10 MB; el nuestro es 20;
- acepta CSV y XLS, que **nuestra API rechaza**: ofrecerlos es provocar un `415` seguro;
- importa sus propias copias de `button`, `card` y `progress` desde un directorio
  `file-upload-04-utils`, que es exactamente el duplicado que el peaje obliga a eliminar;
- valida por `file.type`, poco fiable; la autoridad es la firma del archivo, que ya comprueba
  el backend;
- informa del error con un toast, y este error va **en línea**, porque se corrige ahí mismo.

Lo que sí se aprovecha: la disposición, la mecánica de arrastrar y soltar, y el formateo del
tamaño. Sigue mereciendo la pena partir de él, pero conviene entrar sabiendo que se adapta,
no se adopta.

Los comandos de instalación referencian `$API_KEY_21ST`, que está disponible en el entorno,
así que `pnpm dlx shadcn@latest add "https://21st.dev/r/…?api_key=$API_KEY_21ST"` funciona sin
escribir la clave en ningún sitio.

---

## Arquitectura

### Ubicación

```
apps/web/
  app/
    (auth)/entrar/                     sesión
    (panel)/
      layout.tsx                       AppShell: sidebar + header + toaster
      proyectos/
        page.tsx                       lista de proyectos
        [id]/
          page.tsx                     despachador: redirige al paso según el estado
          archivo/  hojas/  analisis/
          modelo/entidades|campos|relaciones/
          resumen/  creando/  listo/
          app/[modulo]/                la aplicación generada
  components/
    ui/                                shadcn, sin tocar salvo tokens
    app/                               el inventario compartido (W2)
    generated/                         el motor genérico (W7)
  lib/
    api/                               cliente tipado, un archivo por recurso
    fields/                            el registro de tipos de campo
```

### Propiedad del estado

Un dueño por cosa, que es lo que `frontend.md` exige y lo que más se incumple:

| Estado                             | Dueño                                                            |
| ---------------------------------- | ---------------------------------------------------------------- |
| Datos del servidor                 | TanStack Query. Nada se copia a `useState`                       |
| Paso del asistente                 | **El backend.** `project.status`, nunca una variable del cliente |
| Transiciones válidas               | **El backend.** `nextStatuses` del detalle del proyecto          |
| Formularios                        | React Hook Form                                                  |
| Búsqueda, orden, página            | La URL, para que un enlace se pueda compartir                    |
| Diálogo abierto, fila seleccionada | Estado local, y solo mientras dure                               |
| Progreso de un trabajo             | El backend. Sobrevive a recargar y a navegar                     |

El asistente **no tiene una máquina de estados propia**. El backend ya publica la suya en
`GET /api/projects/:id` (`status` + `nextStatuses`); duplicarla en el cliente garantizaría
que las dos se separen. El cliente solo traduce estado → ruta.

### El cliente de la API

Un módulo por recurso sobre un `request()` compartido que:

- añade `credentials: 'include'` y `Accept: application/json`;
- desenvuelve `{ data, meta }` y lanza un `ApiError` tipado con `{ code, message, details }`
  a partir de `{ error: {...} }`;
- **no traduce mensajes**: el backend ya escribe en lenguaje de negocio y en español;
- propaga el `AbortSignal` de TanStack Query, para que un filtro nuevo cancele el anterior.

---

## El registro de tipos de campo

La pieza central de W7, y la razón de que la aplicación generada quepa en una fase.

RF-08 cierra el vocabulario en diez tipos. Por cada uno hace falta saber cuatro cosas, y con
eso la tabla y el formulario se generan solos:

| Tipo       | Celda de tabla                                   | Control de formulario                 | Validación              | Alineación |
| ---------- | ------------------------------------------------ | ------------------------------------- | ----------------------- | ---------- |
| `text`     | Texto, truncado con el valor completo en `title` | `Input`                               | `string`                | izquierda  |
| `integer`  | Formato `es-EC`                                  | `Input` numérico                      | `coerce.number().int()` | derecha    |
| `decimal`  | Formato `es-EC`, 2 decimales                     | `Input` decimal                       | `coerce.number()`       | derecha    |
| `boolean`  | Icono + palabra (`Sí`/`No`), nunca solo color    | `Switch`                              | `boolean`               | centro     |
| `date`     | `dd/MM/yyyy`                                     | `DatePickerField`                     | `YYYY-MM-DD`            | izquierda  |
| `datetime` | `dd/MM/yyyy HH:mm`                               | `DateTimePickerField`                 | ISO 8601                | izquierda  |
| `email`    | Texto con enlace `mailto:`                       | `Input type=email`                    | `string().email()`      | izquierda  |
| `phone`    | Texto con enlace `tel:`                          | `Input type=tel`                      | `string`                | izquierda  |
| `select`   | `StatusBadge`                                    | `Select` con `options` del manifiesto | `enum(options)`         | izquierda  |
| `relation` | **`related[campo]`**, la etiqueta, jamás el id   | `EntityPickerCombobox`                | `uuid`                  | izquierda  |

Dos reglas que salen de aquí y valen para toda la aplicación generada:

1. **La columna de una relación pinta `related[campo]`, no `values[campo]`.** El identificador
   viaja en `values` porque el formulario lo necesita para guardar; la tabla muestra
   "Comercial Andes". Es RF-17 y es la _Technical Information Boundary_.
2. **`required` del manifiesto es una conveniencia, no la autoridad.** Se refleja como
   validación para que la persona no envíe algo que la API va a rechazar, y aun así se
   maneja el rechazo cuando llega.

---

## Mapa de consumo de la API

Las 18 rutas de negocio, y dónde se consume cada una. Si al terminar queda alguna sin vista,
o sobra en el backend o falta una pantalla:

| Endpoint                                                  | Vista                                          |
| --------------------------------------------------------- | ---------------------------------------------- |
| `POST /api/auth/sign-in/email`                            | V1                                             |
| `POST /api/auth/sign-out`                                 | Menú de cuenta                                 |
| `GET /api/projects`                                       | V2                                             |
| `POST /api/projects`                                      | V2, diálogo                                    |
| `GET /api/projects/:id`                                   | V3 (despachador) y el encabezado del asistente |
| `DELETE /api/projects/:id`                                | V2, confirmación tipeada                       |
| `POST /api/projects/:id/file`                             | V4                                             |
| `GET /api/projects/:id/sheets`                            | V5                                             |
| `PATCH /api/projects/:id/sheets`                          | V5                                             |
| `POST /api/projects/:id/analyze`                          | V5 → V6                                        |
| `GET /api/projects/:id/jobs/:jobId`                       | V6 y V11 (sondeo)                              |
| `GET /api/projects/:id/jobs/:jobId/errors`                | V12, con descarga CSV                          |
| `GET /api/projects/:id/blueprint`                         | V7, V8, V9                                     |
| `PATCH .../blueprint`                                     | V7, nombre de la aplicación                    |
| `PATCH/DELETE .../blueprint/entities/:e`                  | V7                                             |
| `POST/PATCH/DELETE .../blueprint/entities/:e/fields[/:c]` | V8                                             |
| `PATCH .../blueprint/relations/:e/:c`                     | V9                                             |
| `GET .../blueprint/summary`                               | V10                                            |
| `POST .../blueprint/confirm`                              | V10                                            |
| `POST /api/projects/:id/step`                             | Botón "Atrás" del asistente                    |
| `POST /api/projects/:id/build`                            | V10 → V11                                      |
| `GET /api/projects/:id/app`                               | V13, navegación y columnas                     |
| `GET .../app/:modulo/records`                             | V13, tabla                                     |
| `POST/PATCH/DELETE .../app/:modulo/records[/:r]`          | V13, CRUD                                      |
| `GET .../app/:modulo/options`                             | V13, selectores de relación                    |
| `GET /health`                                             | W0, comprobación del proxy                     |

---

## Traducción de errores

El backend ya emite el mensaje en lenguaje de negocio. El cliente decide **dónde ponerlo**,
no qué dice:

| Código                | HTTP | Superficie                                                                                       |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------ |
| `VALIDATION_FAILED`   | 400  | Error de campo cuando `details` lo localiza; si no, error de operación dentro del diálogo        |
| `UNAUTHENTICATED`     | 401  | Redirige a `/entrar` conservando la ruta de destino                                              |
| `FORBIDDEN`           | 403  | Aviso de página                                                                                  |
| `NOT_FOUND`           | 404  | Página "No encontramos ese proyecto"                                                             |
| `CONFLICT`            | 409  | Toast con el mensaje del backend (cuota alcanzada, registro del que otros dependen)              |
| `INVALID_STATE`       | 409  | **Vuelve a leer el proyecto y reencamina el asistente.** Significa que el cliente iba por detrás |
| `PAYLOAD_TOO_LARGE`   | 413  | En línea, en la zona de archivo                                                                  |
| `UNSUPPORTED_FILE`    | 415  | En línea, en la zona de archivo                                                                  |
| `RATE_LIMITED`        | 429  | Toast y botón deshabilitado hasta la cabecera `retry-after`                                      |
| `INTERNAL_ERROR`      | 500  | Mensaje genérico seguro y `requestId`, solo porque soporte puede usarlo                          |
| `SERVICE_UNAVAILABLE` | 503  | Aviso de página con reintento                                                                    |

`INVALID_STATE` merece atención: no es un fallo del usuario. Es que el proyecto avanzó por
otra pestaña, o que se abrió un enlace viejo. La respuesta correcta no es un toast rojo, es
resincronizar y llevar a la persona al paso en el que realmente está.

---

# Las vistas

Trece vistas. Las diez del ERS §19, más la lista de proyectos (que el ERS no tiene porque
asumía una sola aplicación), el despachador y la sesión.

---

## V1 — Entrar · `/entrar`

**Tarea.** Entrar. Nada más: el registro público está cerrado (`disableSignUp`), así que no
hay enlace a "crear cuenta" — ofrecerlo sería mentir.

```
                  ┌──────────────────────────────┐
                  │  excel-to-software           │
                  │  Entra para abrir tus        │
                  │  proyectos.                  │
                  │                              │
                  │  Correo                      │
                  │  [___________________]       │
                  │  Contraseña                  │
                  │  [_____________] [ojo]       │
                  │                              │
                  │  [      Entrar      ]        │
                  └──────────────────────────────┘
```

**Componentes.** `Card` centrada (`max-w-sm`), `Input`, `PasswordField`, `AsyncButton`.

**Estados.** Credenciales incorrectas → mensaje **en línea sobre el formulario**, no toast:
es una condición que persiste hasta corregirla, y `feedback-and-states.md` reserva el toast
para lo transitorio. La contraseña se conserva. Botón deshabilitado mientras hay petición en
vuelo.

**API.** `POST /api/auth/sign-in/email`.

---

## V2 — Proyectos · `/proyectos`

**Tarea.** Abrir un proyecto que ya existe, o empezar otro. Es la portada del producto.

```
Proyectos                                        [ + Nuevo proyecto ]
┌──────────────────────────────────────────────────────────────────┐
│ [ Buscar…                    ]                                   │
├──────────────────────────────────────────────────────────────────┤
│ Nombre              │ Estado        │ Creado      │              │
│ Gestión de Viajes   │ ● Lista       │ hace 2 días │  [↗] [🗑]    │
│ Control de Stock    │ ◐ En revisión │ hace 1 hora │  [↗] [🗑]    │
│ Nóminas             │ ○ Sin archivo │ hace 5 min  │  [↗] [🗑]    │
├──────────────────────────────────────────────────────────────────┤
│ Mostrando 1-3 de 3        Filas [25 ▾]      |‹  ‹  1  ›  ›|      │
└──────────────────────────────────────────────────────────────────┘
```

**Columnas.** Nombre (identidad, toda la fila es enlace), Estado, Creado (relativo, con la
fecha exacta en el tooltip). Nada más: `slug`, `updatedAt` y los identificadores no aportan
a la decisión de abrir o no abrir.

**Los doce estados, en lenguaje de negocio.** Nunca el token del enum:

| `status`         | Etiqueta         | Tono        |
| ---------------- | ---------------- | ----------- |
| `draft`          | Sin archivo      | neutro      |
| `uploaded`       | Archivo cargado  | neutro      |
| `sheet_selected` | Hojas elegidas   | neutro      |
| `analyzing`      | Analizando       | en curso    |
| `reviewing_*`    | En revisión      | en curso    |
| `creating`       | Creando          | en curso    |
| `importing`      | Importando datos | en curso    |
| `completed`      | Lista            | éxito       |
| `failed`         | Falló            | destructivo |

**Acciones de fila.** Abrir y Eliminar. Eliminar es irreversible y se lleva el schema entero
por delante, así que le toca el escalón alto de la escalera de confirmación: **escribir el
nombre exacto del proyecto**. El diálogo nombra la consecuencia ("Se eliminarán la aplicación
y todos sus registros. No se puede deshacer.") y el botón queda inhabilitado hasta que el
texto coincide.

**Estados.** Vacío → "Todavía no has creado ningún proyecto. Sube un Excel y construimos la
aplicación por ti." con la acción primaria dentro. Sin resultados de búsqueda → distinto del
anterior, con "Limpiar filtros". Cuota alcanzada al crear → `409`, toast con el mensaje del
backend.

**API.** `GET/POST /api/projects`, `DELETE /api/projects/:id`.

---

## V3 — Despachador · `/proyectos/[id]`

**No es una pantalla.** Lee `status` y redirige al paso que toca. Existe por el ERS §20: _"El
usuario solo deberá poder acceder a estados válidos según el avance realizado."_ Un enlace
guardado a `/modelo/relaciones` de un proyecto que todavía no se ha analizado tiene que
llevar a `/archivo`, no a una pantalla rota.

El mismo guardia protege cada paso: si el estado no corresponde, redirige. Es la única forma
de que la regla del ERS se cumpla también al pegar una URL.

---

## V4 — Cargar Excel · `/proyectos/[id]/archivo` — ERS P1

**Tarea.** Poner el archivo dentro.

```
 ①Archivo ─ ②Hojas ─ ③Análisis ─ ④Modelo ─ ⑤Resumen ─ ⑥Listo

 Sube tu Excel
 Leeremos todas sus hojas y te propondremos cómo organizarlas.

 ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
 │              [icono]                            │
 │     Arrastra tu archivo o elígelo               │
 │     Formato .xlsx · hasta 20 MB                 │
 └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
                                        [ Continuar ]
```

El límite y el formato se dicen **antes** de elegir, no después de un rechazo.

Elegido el archivo: nombre, tamaño, botón para quitarlo, y barra de progreso real durante la
subida. Si el proyecto ya tenía un archivo, un aviso claro: "Esto reemplazará el análisis
anterior."

**Estados.** `413` y `415` se muestran **en la propia zona**, no en un toast: el error está
en el archivo elegido y se corrige ahí mismo. El `.xls` antiguo tiene su propio mensaje,
porque es el error más probable de todos.

**API.** `POST /api/projects/:id/file` (multipart).

---

## V5 — Hojas · `/proyectos/[id]/hojas` — ERS P2

**Tarea.** Descartar lo que no son datos y corregir dónde empieza la tabla.

El ERS dice que esta pantalla solo aparece con más de una hoja, pero eso venía de leer una
sola. Aquí se leen todas (decisión 2 del plan de backend), así que la pantalla **siempre** se
muestra: es donde se ve que el sistema entendió el archivo, y donde se arregla si no.

```
 Esto encontramos en tu archivo
 Desmarca lo que no quieras usar.

 ┌─ [✓] Viajes ································ 122 filas ─┐
 │  Fecha      Cliente    RUC       Vehículo   …          │
 │  fecha      texto      entero    texto                 │
 │  30 dist.   4 dist.    4 dist.   4 dist.               │
 │  01/09/26   COMERCIAL… 179001…   ABC-1234              │
 └────────────────────────────────────────────────────────┘
 ┌─ [✓] Clientes ································ 4 filas ─┐ …
 ┌─ [ ] Notas ···································· vacía ─┐
 │  Esta hoja no contiene datos.                          │
 └────────────────────────────────────────────────────────┘
                                          [Atrás]  [Analizar]
```

Aquí **sí** es correcto usar tarjetas: son entidades repetidas, que es justo el caso que
`interface-design.md` permite.

Por hoja: incluir o no, nombre, nº de filas, y una previsualización con el encabezado
detectado, el tipo inferido de cada columna y cuántos valores distintos tiene. Ese número de
distintos es lo que explica, más tarde, por qué el sistema propuso extraer "Cliente" como
entidad propia: verlo aquí hace que la propuesta no parezca magia.

Cuando el backend no encontró encabezados, su mensaje y un control para decir en qué fila
están.

**API.** `GET/PATCH /api/projects/:id/sheets`, luego `POST /api/projects/:id/analyze`.

---

## V6 — Analizando · `/proyectos/[id]/analisis` — ERS P3

**Tarea.** Esperar sin ansiedad.

Centrado: indicador, el `message` del trabajo tal cual lo manda el backend ("Analizando
archivo…"), y barra de progreso cuando `total > 0`. Sondeo cada segundo mientras el estado
sea `queued` o `running`.

**Navegar fuera no cancela nada.** El trabajo vive en el backend; al volver, se retoma el
sondeo donde estaba. Es RNF-06, y `feedback-and-states.md` lo exige explícitamente.

Si falla: el `failureReason` en lenguaje de negocio y **"Reintentar análisis"**, que funciona
sin volver a subir el archivo porque la transición `failed → sheet_selected` existe (RNF-05).

**Cuando no hubo IA.** Si el modelo vuelve con `wasInferred: false`, la siguiente pantalla
abre con un aviso honesto: _"No pudimos proponer un modelo con varias entidades, así que
preparamos uno simple: una tabla por hoja. Puedes ajustarlo."_ Es RX-05, y es la diferencia
entre un producto que funciona sin IA y uno que finge.

**API.** `GET /api/projects/:id/jobs/:jobId`.

---

## V7 — Entidades · `/proyectos/[id]/modelo/entidades` — ERS P4

**Tarea.** Confirmar qué "cosas" va a haber en la aplicación.

```
 Nombre de la aplicación  [ Gestión de Viajes            ]

 ⚠ Ajustamos 2 cosas de la propuesta          [ Ver detalle ▾ ]

 ┌─ Clientes ────────────────────────────────── [✎] [🗑] ─┐
 │  5 campos · Cliente, RUC, Correo, Teléfono, Ciudad     │
 │  Se muestra como  [ Cliente ▾ ]                        │
 │  Se repiten por   [ RUC     ▾ ]                        │
 └────────────────────────────────────────────────────────┘
 ┌─ Vehículos ·· extraída de una columna ────── [✎] [🗑] ─┐ …
                                          [Atrás]  [Continuar]
```

Los avisos del validador arriba, plegados. Son RX-06: la persona tiene derecho a saber qué se
corrigió de la propuesta, pero no a tragárselo si no le interesa.

**"Se repiten por"** es la clave de deduplicación, y es el control más importante de toda esta
pantalla — decide si tres formas de escribir "Comercial Andes" son un cliente o tres. Por eso
no se llama "clave de deduplicación": se llama por lo que hace.

**Eliminar una entidad** no borra datos: degrada a texto los campos que la apuntaban (RI-06).
El diálogo lo dice con esas palabras, porque si no parece que se pierde algo.

**API.** `PATCH .../blueprint`, `PATCH/DELETE .../blueprint/entities/:nombre`.

---

## V8 — Estructura · `/proyectos/[id]/modelo/campos` — ERS P5

**Tarea.** Corregir un tipo mal inferido. Es _la_ pantalla donde la persona arregla lo que la
IA se inventó.

```
 ▾ Viajes                                        [ + Añadir campo ]
 ┌────────────────────────────────────────────────────────────────┐
 │ Campo      │ Tipo            │ Obligatorio │ Origen       │    │
 │ Fecha      │ [Fecha      ▾]  │  [ on  ]    │ Viajes · A   │[🗑]│
 │ Cliente    │ → Clientes      │  [ on  ]    │ Viajes · B   │    │
 │ Valor      │ [Decimal    ▾]  │  [ off ]    │ Viajes · F   │[🗑]│
 │ Estado     │ [Lista ▾] 2 op. │  [ off ]    │ Viajes · G   │[🗑]│
 └────────────────────────────────────────────────────────────────┘
 ▸ Clientes    ▸ Vehículos    ▸ Conductores
```

El tipo es un `Select` **en línea**: el cambio es reversible y la respuesta es inmediata, que
es la única condición bajo la que `data-tables.md` permite un control dentro de una celda.

**Las relaciones no se editan aquí.** El backend no lo permite (su lista de tipos editables
excluye `relation`), así que se muestran como etiqueta con enlace a V9. Un `Select`
deshabilitado sin explicación sería peor que no ponerlo.

`Lista` abre el editor de opciones. `Origen` dice de qué hoja y columna salió el campo —es
RNF-02, trazabilidad— en texto tenue, porque se consulta una vez cada mil.

**API.** `POST/PATCH/DELETE .../blueprint/entities/:e/fields[/:c]`.

---

## V9 — Relaciones · `/proyectos/[id]/modelo/relaciones` — ERS P6

**Tarea.** Aceptar o rechazar cada vínculo. Una decisión por fila, y nada más.

```
 Cómo se conectan tus datos

 ┌────────────────────────────────────────────────────────────────┐
 │ Cada viaje pertenece a un cliente.                             │
 │ Un cliente puede tener varios viajes.      [ Aceptar |Rechazar]│
 ├────────────────────────────────────────────────────────────────┤
 │ Cada viaje pertenece a un vehículo.                            │
 │ Un vehículo puede tener varios viajes.     [ Aceptar |Rechazar]│
 └────────────────────────────────────────────────────────────────┘
```

La frase en lenguaje natural **ya la escribe el backend** (`relation.description`). El cliente
no la compone: sería una segunda copia de la misma regla, y acabarían diciendo cosas distintas.

Al rechazar, se dice qué pasa antes de que pase: _"El campo Conductor se quedará como texto.
No se pierde ningún dato."_

**Sin relaciones** —el caso del camino determinista— el vacío es honesto y no un error: _"No
encontramos relaciones entre tus hojas. Tu aplicación tendrá una tabla por hoja."_

**API.** `PATCH .../blueprint/relations/:entidad/:campo`.

---

## V10 — Resumen · `/proyectos/[id]/resumen` — ERS P7

**Tarea.** La última lectura antes de que algo exista de verdad.

```
 Gestión de Viajes
 4 módulos · 13 campos · 3 relaciones

 Clientes      Cliente · RUC · Correo · Teléfono · Ciudad
 Vehículos     Vehículo
 Conductores   Conductor
 Viajes        Fecha · Cliente · Vehículo · Conductor · Valor · Estado

 Cada viaje pertenece a un cliente. Un cliente puede tener varios viajes.
 …
                                     [Atrás]  [ Crear aplicación ]
```

Sin tipos, sin claves, sin nombres internos. El backend ya devuelve esa vista recortada a
propósito: en el último paso se lee lo que va a existir, no se audita un esquema.

**"Crear aplicación"** pide una confirmación de un paso que nombra la consecuencia real:
_"Crearemos la estructura e importaremos tus datos. A partir de aquí el modelo ya no se puede
cambiar."_ No lleva escritura del nombre —no se pierde nada, se crea— pero tampoco pasa
desapercibida.

**API.** `GET .../blueprint/summary`, `POST .../blueprint/confirm`, `POST /build`.

---

## V11 — Creando · `/proyectos/[id]/creando` — ERS P8

Como V6, con dos fases encadenadas que el backend ya narra en `message`: "Creando
estructura…", luego "Importando viajes…". Barra real con `progress`/`total`.

Sin vuelta atrás, y la interfaz no finge que la hay: no hay botón "Atrás" en este paso,
porque a partir de aquí se emite DDL.

**API.** `GET .../jobs/:jobId`.

---

## V12 — Lista · `/proyectos/[id]/listo` — ERS P9

**Tarea.** Entender qué se creó, y entrar.

```
 ✓ Tu aplicación está lista
 4 módulos · 132 registros · 3 relaciones

 ┌─ 2 filas quedaron fuera ───────────────────────────────────────┐
 │ El resto de tus datos se importó. Corrige estas filas en tu    │
 │ Excel si las necesitas.                                        │
 │                                                                │
 │ Hoja    │ Fila │ Motivo                                        │
 │ Viajes  │ 122  │ "Fecha" debería ser una fecha, y trae…        │
 │ Viajes  │ 123  │ "Valor" debería ser un número, y trae…        │
 │                                    [ Descargar el informe ]    │
 └────────────────────────────────────────────────────────────────┘

                                        [ Abrir aplicación ]
```

El bloque de fallos aparece **solo** cuando el trabajo terminó en `partial`. Es la decisión 4
del plan de backend hecha pantalla: continuar y reportar. Lo que la persona necesita es
encontrar esas filas en su Excel, así que se le da la hoja, el número de fila tal como lo ve
en Excel, el motivo en su idioma, y el CSV para las tres mil filas que no caben en pantalla.

**API.** `GET .../jobs/:jobId`, `GET .../jobs/:jobId/errors` (y `?format=csv`).

---

## V13 — La aplicación generada · `/proyectos/[id]/app/[modulo]` — ERS P10

**Tarea.** Usarla. Todos los días.

Aquí la barra lateral cambia: deja de mostrar el panel y muestra **los módulos de esta
aplicación**, leídos del manifiesto, más una salida a Proyectos. Siguen siendo dos niveles.

```
┌────────────┬───────────────────────────────────────────────────────┐
│ ← Proyectos│  Viajes                              [ + Nuevo viaje ]│
│            │ ┌───────────────────────────────────────────────────┐ │
│ Gestión de │ │ [ Buscar…        ]  [Estado ▾]        [Columnas ▾]│ │
│ Viajes     │ ├───────────────────────────────────────────────────┤ │
│            │ │ Vehículo │ Fecha    │ Cliente      │ Valor │Estado│ │
│ ▸ Clientes │ │ ABC-1234 │ 01/09/26 │ Comercial A. │ 200,00│●Abier│ │
│ ▸ Vehículos│ │ XYZ-5678 │ 02/09/26 │ Cliente Nor. │ 210,00│●Cerra│ │
│ ▸ Conduct. │ ├───────────────────────────────────────────────────┤ │
│ ▪ Viajes   │ │ Mostrando 1-25 de 120   Filas[25▾]  |‹ ‹ 1 › ›|  │ │
└────────────┴─┴───────────────────────────────────────────────────┴─┘
```

**Nada de esto está escrito a mano.** Las columnas salen del manifiesto: primero el
`displayField`, después el resto, cada una renderizada por su tipo según el registro. El
filtro de la derecha existe porque hay un campo `select`; si no lo hubiera, no estaría.

**Crear y editar** comparten un `FormDialog` cuyo contenido genera el mismo registro. El
esquema Zod se compone en tiempo de ejecución a partir de los campos del módulo. Editar
precarga desde `GET .../records/:id`, nunca desde la fila que ya estaba en la tabla.

**Los campos de relación** son un combobox con búsqueda contra `.../options?q=`, con debounce.
Se elige "Comercial Andes"; se envía su identificador. La persona no ve un UUID en ningún
momento.

**Eliminar** confirma en un paso. Si el backend responde `409` porque otro módulo depende del
registro, el mensaje dice **cuál**: "No se puede eliminar este registro porque Viajes depende
de él." Esa frase ya viene escrita del backend.

**Estados.** Cargando → esqueletos dentro del marco de la tabla, sin saltos. Vacío → "Todavía
no hay registros en Viajes." con la acción. Sin resultados → distinto, con "Limpiar filtros".
Error → el marco se queda y aparece el reintento.

**API.** `GET .../app`, `GET/POST/PATCH/DELETE .../app/:modulo/records[/:r]`,
`GET .../app/:modulo/options`.

---

# Fases

## W0 — Fundaciones ✅ completada (2026-09-15)

**Objetivo.** Que exista `apps/web`, que hable con la API y que `pnpm verify` la incluya.

**Entregables.**

- `apps/web` con Next 16, React 19, TypeScript estricto y Tailwind 4.
- `shadcn init` con los tokens del proyecto. **La paleta no es violeta ni índigo**, que es el
  primer delator de una interfaz generada (`interface-design.md`).
- Reescritura `/api/*` → `http://localhost:4000/api/*`, con `AUTH_BASE_URL` apuntando al
  origen público para que Better Auth y el navegador coincidan.
- ESLint y Prettier extendidos al paquete nuevo; `verify` corriendo los dos paquetes.
- Vitest 5 + Testing Library; Playwright instalado para W9.
- ADR sobre TanStack Query, por no estar en `stack.md`.

**Verificación.** Una página que pinta el resultado de `/health` a través del proxy.
`corepack pnpm verify` en verde con los dos paquetes.

**Riesgo concreto.** Es el primer contacto de Better Auth con un origen distinto al suyo. Si
la cookie no viaja, se descubre aquí y no en W1 con media pantalla escrita.

**Resultado.**

`apps/web` existe, `corepack pnpm verify` corre los dos paquetes en verde —362 tests de la API
más 7 del panel— y las dos construcciones pasan. El riesgo de arriba está retirado con una
prueba real contra la API y PostgreSQL:

| Comprobación, por el proxy (`:3100`) | Resultado                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /health`                        | `200` · control `up` · runtime `up`                                          |
| `GET /api/projects` sin sesión       | `401 UNAUTHENTICATED`, sobre de error intacto con su `requestId`             |
| `POST /api/auth/sign-in/email`       | `200` y cookie `better-auth.session_token`, **HttpOnly**, en el mismo origen |
| `GET /api/projects` con esa cookie   | `200` con el sobre real                                                      |

La decisión del proxy queda validada: la cookie no necesitó `SameSite=None`, ni HTTPS, ni una
línea de CORS en el backend. La cuenta desechable que se usó para la prueba se borró al
terminar.

**Desviaciones y añadidos respecto a lo planificado.**

- **Vitest 3.2.7, no 5.** Al instalar salió que **5.0.1 se publicó el mismo día** y 5.0.0 doce
  días antes. Un parche del mismo día de un mayor recién salido, para el motor de tests, es mal
  negocio. Alinearlo con la API además resuelve gratis la pega que este mismo plan señalaba
  —"`pnpm -r test` ejecutará dos mayores a la vez"— y deshace un conflicto de _peers_:
  `@vitejs/plugin-react@6` exige Vite 8 y Vitest 5 trae Vite 7.
- **Puerto 3100, no 3000.** El 3000 lo ocupa el contenedor de otro proyecto en esta máquina. Es
  la misma colisión que en F0 empujó la API al 4000.
- **Dos reglas de reescritura, no una.** `/health` no cuelga de `/api` en la API, así que
  necesitaba la suya. Sin ella, la sonda no sería alcanzable desde el dominio público.
- **El cliente de la API y el proveedor de TanStack Query entran en W0**, no en W1. La pantalla
  de comprobación tenía que ejercitar algo, y ejercitar el cliente real en vez de un `fetch`
  suelto es lo que convierte la comprobación en una prueba del contrato: sobre de éxito,
  sobre de error y cookie.
- **Los plugins de ESLint viven en la raíz**, no en `apps/web`: `eslint.config.mjs` está en la
  raíz y es desde ahí desde donde se resuelven.
- **Next 16 escribe `AGENTS.md` y `CLAUDE.md` dentro de `apps/web`**, y los vuelve a crear en
  cada `next dev`. Su contenido avisa de que Next 16 se aparta de lo que un modelo de lenguaje
  tiene aprendido, cosa que resultó ser cierta —el registro dice 16.3.5, no 15— así que se
  quedan y se versionan, que es lo que la propia herramienta recomienda. Se desactivan con
  `agentRules: false` si algún día estorban.
- **Tres avisos de ESLint corregidos**, uno de ellos real: `'error' in body` ya estrecha el
  tipo, así que la aserción que venía detrás sobraba.
- **Playwright queda instalado como paquete, sin navegadores.** La descarga son cientos de
  megas para algo que se usa en W9; `playwright install` va allí.
- **La paleta es de neutros cálidos con un acento verde azulado**, y el radio máximo es 8px con
  jerarquía. Ninguna de las dos es una preferencia estética: son las dos primeras entradas de
  _Generated Defaults To Avoid_.

---

## W1 — Sesión y armazón ✅ completada (2026-09-15)

**Objetivo.** Entrar, salir, y tener dónde colgar todo lo demás.

**Entregables.** V1. Guardia de rutas. `AppShell` con barra lateral, cabecera, tema claro/oscuro
persistido y `Toaster`. Menú de cuenta con cierre de sesión. El interceptor de `401` que
redirige conservando el destino.

**Verificación.** Login contra el backend real con la cuenta sembrada. Cerrar sesión invalida
la sesión en el servidor. Una ruta protegida abierta sin sesión lleva a `/entrar` y, tras
entrar, al destino original. Sin destellos de tema equivocado al cargar.

**Resultado.**

`corepack pnpm verify` en verde: 362 tests de la API más **25** del panel. El ciclo completo,
comprobado contra el backend real **enviando cabecera `Origin`**, que es lo que hace un
navegador:

| Comprobación            | Resultado                                                        |
| ----------------------- | ---------------------------------------------------------------- |
| `/proyectos` sin sesión | `307` → `/entrar?destino=%2Fproyectos`                           |
| `/api/*` sin sesión     | `401` con el sobre del backend, **no** un redirect               |
| Entrar                  | `200` y cookie de sesión                                         |
| `/proyectos` con sesión | `200`                                                            |
| Cerrar sesión           | `200`, y la sesión deja de valer en el servidor                  |
| Destello de tema        | Ninguno: el script de `next-themes` es el primer nodo del cuerpo |

**Desviaciones y hallazgos.**

- **`AUTH_BASE_URL` y `AUTH_TRUSTED_ORIGINS` apuntaban al sitio equivocado**, y cerrar sesión
  respondía `403 MISSING_OR_NULL_ORIGIN`. Better Auth exige una cabecera `Origin` de confianza
  en las peticiones que cambian estado —es su protección contra CSRF—, y la configuración
  heredada confiaba en `localhost:3000`, que aquí no es nadie. Ahora la URL base es el **origen
  público** y los orígenes de confianza lo incluyen. Queda explicado en `.env.example`, porque
  es la clase de cosa que cuesta media tarde la segunda vez.
- **La verificación de W0 tenía un hueco, y este fallo lo destapó.** Mis pruebas con `curl` no
  mandaban `Origin`, y sin esa cabecera Better Auth ni siquiera llega a comprobar el origen. O
  sea: W0 demostró que el proxy funciona, pero lo demostró de una forma que un navegador no
  reproduce. La conclusión de W0 seguía siendo correcta; la prueba era más débil de lo que
  parecía.
- **El guardia de rutas interceptaba `/api/*`, y eso habría roto el interceptor de `401`.** Una
  llamada sin sesión recibía un `307` a HTML; `fetch` lo habría seguido sin rechistar y el
  interceptor no habría visto nunca un `UNAUTHENTICATED`. El `matcher` excluye ahora la API
  entera. Se descubrió porque el paso 6 de la verificación devolvió `307` donde tenía que haber
  un `401`.
- **shadcn instaló dos incumplimientos de las reglas de React**, y al ser código copiado al
  repositorio son nuestros:
  - `hooks/use-mobile.ts` leía el ancho con un `setState` dentro de un efecto, que encadena un
    renderizado con el valor equivocado. Reescrito con `useSyncExternalStore`, que además
    resuelve el renderizado en servidor sin inventarse un valor.
  - `SidebarMenuSkeleton` sorteaba el ancho de sus barras con `Math.random()` **durante el
    renderizado**. Es impuro: servidor y cliente sortean distinto, así que la hidratación no
    cuadra. Sustituido por una lista fija recorrida por índice, que da la misma variedad visual
    y no se mueve.
- **Mi propio `ThemeToggle` caía en el mismo patrón** que acababa de corregir en shadcn. De ahí
  sale `useHydrated`, que es el idioma correcto para "esto solo se sabe en el navegador".
- **shadcn inyectó ocho variables `--sidebar-*` en HSL y sobre un azul** que no es la paleta de
  este proyecto. Mapeadas a OKLCH y al verde azulado. Es el paso 3 del peaje de intake, y
  ocurrió exactamente como el plan anticipaba.
- **`AsyncButton` y `PasswordField` se adelantan de W2.** La pantalla de sesión los necesitaba,
  y escribirlos bien ahora es mejor que escribir una versión desechable. W2 ya no los rehace.
- **`window.location.assign` con la regla de Next desactivada y el motivo escrito.** Perder la
  sesión es justo cuando interesa recargar entero: una navegación del router conservaría la
  caché de consultas y los formularios a medias de quien acaba de quedarse fuera.
- **`/proyectos` es una lista provisional de diez líneas.** W3 la sustituye entera. Existe para
  que la navegación no lleve a una pantalla vacía y para demostrar la cadena completa: cookie,
  proxy, sobre y caché.

---

## W2 — Los componentes compartidos ✅ completada (2026-09-15)

**Objetivo.** Construir una vez el inventario de `component-system.md`. Va antes que cualquier
pantalla a propósito: si se hace después, aparecen tres tablas distintas.

**Entregables.** `AppDataTable<T>`, `TableToolbar`, `TablePagination`, `ColumnVisibilityMenu`,
`RowActionButton`, `FormDialog`, `ConfirmDialog` con escalera de confirmación,
`EntityPickerCombobox`, `AsyncButton`, `StatusBadge`, `EmptyState` (que distingue _sin datos_,
_sin coincidencias_, _sin permiso_ y _falta un requisito_), `ErrorState`, `PageSkeleton`,
`DatePickerField`, `DateTimePickerField`, `PasswordField`, `FileField`, y `useMutationFeedback`.

`useMutationFeedback` es el que más importa: es el que hace que **ninguna** mutación pueda
quedarse sin respuesta. Dueño del estado pendiente, del toast, de la invalidación y de la
traducción de códigos de error. El que lo llama solo aporta la petición y el texto.

**Verificación.** Tests de componente de la tabla (orden, página, columnas, vacío, error), del
diálogo (foco, Escape, superposición, restauración del foco) y de la escalera de confirmación.

**Resultado.**

Los dieciocho del inventario, más seis piezas de apoyo que salieron por el camino
(`useDebouncedCallback`, `useFocusRestore`, `useHydrated`, `lib/fechas/calendario`,
`lib/formato/tamano`, `lib/api/mensajes`). `verify` en verde con **63 tests** del panel.

**Hallazgos y desviaciones.**

- **TanStack Table 9 no se parece a la 8.** No existen `useReactTable`, `getCoreRowModel` ni
  ninguno de los `get*RowModel`: la v9 es modular por _features_ (`tableFeatures({...})`) y el
  modelo de filas por defecto ya viene puesto. La API real se averiguó con un tanteo compilado
  contra el paquete, no asumiendo. Hay un `useLegacyTable` con la forma de la v8, y se descartó:
  escribir código nuevo sobre un compatibilizador heredado es empezar debiendo.
- **El contrato de columna es nuestro, no el de TanStack.** Su `ColumnDef<TFeatures, TData>`
  arrastra el tipo de las _features_ a cada módulo que declare una columna, lo que ataría todas
  las pantallas a la versión de la librería. `ColumnaDeTabla<T>` es plano y TanStack queda
  **detrás** del componente, que es literalmente lo que pide `frontend.md`.
- **Conviene saber cuánto carga TanStack aquí, que es menos de lo que parece.** La API busca,
  ordena y pagina, así que sus modelos de filtrado, orden y paginación están todos puenteados.
  Lo que aporta de verdad es el modelo de filas y el estado de visibilidad de columnas. Se
  mantiene porque `frontend.md` lo fija y porque W7 tendrá columnas dinámicas, pero no está
  haciendo el trabajo pesado: lo hace el backend.
- **El test de fechas encontró un fallo real en mi propio código.** `new Date(2026, 12, 45)` no
  falla: desborda en silencio a febrero de 2027. Una fecha corrupta convertida en otra fecha
  **válida** es peor que un error, porque nadie la ve. `deFechaTexto` comprueba ahora que las
  partes salgan como entraron. Es exactamente la clase de bug que ese módulo existe para
  evitar, y estaba dentro de él.
- **El foco no volvía al cerrar un diálogo.** Radix lo restaura solo cuando la capa se abre
  desde su propio `Trigger`, y los nuestros son controlados: se abren desde una acción de fila.
  Con ratón no se nota; con teclado significa volver al principio de la página cada vez. De ahí
  `useFocusRestore`, enganchado a `onCloseAutoFocus` en los dos diálogos. **Lo encontró el test,
  no una revisión**, y al principio pareció un artefacto de jsdom.
- **Dos componentes míos repetían el `setState` dentro de un efecto** que corregí en shadcn una
  fase antes: el reinicio del texto de confirmación y la sincronización de la caja de búsqueda.
  Los dos son "derivar estado de props", y React documenta ajustarlo **durante el renderizado**.
  Además de cumplir la regla, evita pintar un instante con el valor viejo.
- **jsdom no trae `ResizeObserver` ni las APIs de puntero** que Radix usa para medir y colocar
  sus capas. Sin los dobles del `setup.ts`, cualquier test que abra un menú falla con un error
  que no dice nada sobre el componente que se está probando.
- **`FileField` parte del bloque `ephraimduncan/file-upload-04` de 21st.dev.** Se conservan la
  disposición, la mecánica de arrastrar y el formateo del tamaño; se reescribió el resto, tal y
  como se había estimado al evaluarlo: progreso real en vez del `setInterval` falso, sin la
  tarjeta de demostración, límite y formatos por prop, **sin CSV ni XLS** —que nuestra API
  rechaza—, con nuestros primitivos, y el error en línea en vez de un toast. El motivo de cada
  cambio quedó escrito en la cabecera del archivo.

---

## W3 — Proyectos ✅ completada (2026-09-16)

**Objetivo.** El primer módulo completo de punta a punta, que además valida el inventario de W2.

**Entregables.** V2 entera: lista con búsqueda y paginación de servidor, crear, eliminar con
nombre escrito, los doce estados traducidos, y el `409` de cuota.

**Verificación.** Crear, listar, buscar, paginar y eliminar contra el backend real. Superar el
límite de proyectos y comprobar que el mensaje que sale es el del backend. Con 0 proyectos, el
vacío correcto.

**Resultado.**

`verify` en verde: **366** tests de la API —cuatro nuevos, de la búsqueda— y **72** del panel.
Verificado contra el backend real, por el proxy y con la cuota bajada a 3 a propósito:

| Comprobación                     | Resultado                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Lista vacía                      | `{"data":[],"meta":{"total":0}}` → el vacío de _sin datos_                               |
| Crear tres                       | `201` cada uno                                                                           |
| Crear el cuarto                  | `409` · _"Has alcanzado el limite de 3 proyectos. Elimina alguno para crear uno nuevo."_ |
| Buscar `viajes`                  | 2 de 3, sin distinguir mayúsculas, con el total corregido                                |
| Paginar `limit=1&offset=2`       | La tercera página, de 4                                                                  |
| Borrar con el nombre mal escrito | `400` · _"Para eliminar el proyecto escribe su nombre exactamente como aparece."_        |
| Borrar con el nombre exacto      | `204`                                                                                    |
| Fugas en el HTML                 | Ni `proj_`, ni `schemaName`, ni `ownerId`, ni tokens de estado                           |

**Desviaciones y hallazgos.**

- **`GET /api/projects` no tenía búsqueda, y el plan la daba por hecha.** Solo aceptaba `limit`
  y `offset`. Las tres salidas posibles eran añadirla al backend, quitarla del plan, o filtrar
  en el cliente; la tercera queda descartada de raíz, porque una búsqueda que solo mire la
  página cargada **contradice el total que muestra el pie**. Se añadió `?q=` recorriendo el
  puerto, el repositorio de Prisma, el caso de uso, la ruta y el doble de pruebas, con cuatro
  tests nuevos. Es trabajo de backend dentro de una fase de frontend, y por eso queda anotado.
- **El mismo `where` para las filas y para el recuento.** Si difirieran, el pie prometería
  páginas que no existen. El doble en memoria replica además el `mode: 'insensitive'` de
  Prisma: sin eso diría que la búsqueda distingue mayúsculas y la base diría lo contrario.
- **W3 no navega al asistente.** `/proyectos/[id]` es el despachador de W4 y todavía no existe,
  así que la fila no es un enlace y no hay acción de abrir. Una acción que da `404` es peor que
  una acción que aún no está.
- **La búsqueda, la página y el tamaño viven en la URL**, con `replace` y no `push`: teclear en
  la caja no debe apilar una entrada de historial por letra. Solo se escribe lo que se aparta
  de lo normal, para que una lista sin filtrar tenga una dirección limpia.
- **Los cuatro estados de revisión colapsan en "En revisión".** Desde la lista da igual cuál de
  los cuatro sea, y el detalle está dentro del asistente. Un estado que el backend añada en el
  futuro se pinta en gris con su nombre crudo en vez de tumbar la pantalla.
- **Error de método, no de código: en fish, `(...)` es sustitución de comandos, no una
  subshell.** Arrancar la API con `(VAR=valor pnpm dev &)` perdió la variable por el camino, así
  que la primera prueba de cuota **pasó cuando debía fallar** — el cuarto proyecto se creó con
  `201`. Se detectó leyendo `/proc/<pid>/environ` en vez de fiarse del resultado. A partir de
  aquí, `nohup env VAR=valor …`, que se comporta igual en los dos intérpretes.

---

## W4 — El asistente: archivo, hojas, análisis ✅ completada (2026-09-16)

**Entregables.** El armazón del asistente (indicador de pasos, botón Atrás sobre `POST /step`,
guardia por estado), el despachador V3, y V4, V5 y V6.

**Verificación.** Subir `viajes.xlsx` —el mismo archivo de demo que usa la aceptación del
backend— y llegar a `reviewing_entities`. Un `.xls` antiguo y un archivo de 25 MB dan el
mensaje correcto en el sitio correcto. Recargar durante el análisis retoma el sondeo. Un
enlace a un paso que no corresponde redirige.

**Resultado.**

`verify` en verde: **366** de la API y **84** del panel. Recorrido completo contra el backend
real, con el archivo de demo del ERS §18:

| Comprobación                           | Resultado                                                      |
| -------------------------------------- | -------------------------------------------------------------- |
| Despachador sobre un proyecto vacío    | `307` → `/archivo`                                             |
| `/hojas` y `/analisis` antes de tiempo | `307` → `/archivo`, los dos                                    |
| `.xls` antiguo                         | `415` · _"Solo aceptamos archivos Excel con extension .xlsx."_ |
| Subir `viajes.xlsx`                    | Las tres hojas leídas: `Viajes`, `Clientes`, `Notas`           |
| Confirmar hojas y analizar             | El proyecto llega a `reviewing_entities`                       |
| Despachador tras el análisis           | `307` → `/modelo/entidades`                                    |
| Token del enum en el texto visible     | No aparece                                                     |

**Hallazgos.**

- **Un fallo real en mi código, encontrado en la verificación.** La pantalla de hojas solo
  guardaba si se había tocado algo, y entonces analizar devolvía `409 INVALID_STATE`. El PATCH
  a `/sheets` no es "guardar cambios": **es lo que confirma la elección** y mueve el proyecto de
  `uploaded` a `sheet_selected`. Ahora se envía siempre, aunque la lista de cambios vaya vacía,
  con el motivo escrito al lado para que nadie lo "optimice" de vuelta.
- **Un archivo de 25 MB da `500` a través del proxy, y `413` correcto contra la API.** No es un
  fallo del backend: hablándole directo responde `413 PAYLOAD_TOO_LARGE` con su mensaje. Lo que
  ocurre es que multer corta a los 20 MB **mientras el cliente sigue subiendo**, el upstream
  cierra antes de tiempo, y la reescritura de Next convierte eso en un `500` genérico. Mitigado
  de hecho, porque `FileField` rechaza por tamaño antes de enviar un solo byte y el límite del
  cliente es el mismo del servidor, así que por la interfaz no se llega ahí. Queda como
  limitación conocida del proxy, no como deuda del producto.
- **El token del enum sí aparece en la carga serializada de React, y está bien que aparezca.**
  El asistente necesita `status` y `nextStatuses` en el cliente: de ahí salen el indicador de
  pasos y el botón de volver. Lo que la _Technical Information Boundary_ prohíbe es
  **mostrarlo**, y no se muestra: el indicador dice "Modelo". Se comprobó sobre el texto visible
  con las etiquetas y los scripts quitados, no sobre el HTML crudo.
- **Sin botón "Atrás" en `reviewing_entities`, y es correcto.** El backend declara
  `nextStatuses: ['reviewing_fields', 'failed']`: no hay transición hacia atrás. La pantalla no
  se lo inventa. Duplicar la máquina de estados en el cliente para "mejorar" esto es exactamente
  lo que el plan prohíbe.
- **El indicador tiene seis hitos, no doce.** "Revisando campos" y "revisando relaciones" son el
  mismo hito para quien mira una barra de progreso. Doce casillas no informan, abruman.
- **`/modelo/entidades` existe pero es de solo lectura**, igual que la lista provisional de W1.
  W5 la sustituye por el editor. Muestra datos reales —lo propuesto, con sus campos y sus
  relaciones— así que no es un relleno: es lo que permite comprobar que el análisis funcionó.
- **Sin clave de API, el análisis toma el camino determinista de RE-04**, como estaba previsto:
  dos entidades (una por hoja) y ninguna relación, con el aviso de RX-05 en pantalla.

**Lo que no se pudo comprobar.** Recargar **durante** el análisis. El camino determinista termina
en milisegundos, así que no hay ventana que atrapar; lo que sí se verificó es que al terminar
redirige al paso siguiente, y que el identificador del trabajo viaja en la URL para poder
recargar. Con una clave real el análisis tarda segundos y la ventana sería observable.

---

## W5 — El asistente: el editor del modelo ✅ completada (2026-09-16)

**Entregables.** V7, V8 y V9, con **todos** los endpoints de edición.

**Verificación.** Ejercitar cada uno contra el backend: renombrar entidad, eliminarla y ver
que los campos que la apuntaban quedan en texto, añadir un campo, cambiar un tipo, editar las
opciones de una lista, cambiar el campo mostrado y la clave de deduplicación, rechazar una
relación. Después de confirmar, toda edición devuelve `409` y la interfaz lo explica sin
parecer rota.

**Resultado.**

`verify` en verde: **366** de la API y **86** del panel. Los siete endpoints de edición,
ejercitados uno a uno contra el backend real:

| Edición                           | Resultado                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Renombrar la aplicación           | `Viajes` → `Gestion de Viajes`                                                                     |
| Renombrar una entidad             | `Clientes` → `Empresas`                                                                            |
| Cambiar la clave de deduplicación | `repite por: ruc`                                                                                  |
| Añadir un campo                   | Aparece en la entidad                                                                              |
| Cambiar el tipo                   | `Valor` → `decimal`                                                                                |
| Lista cerrada con opciones        | `Estado` → `select ['Abierto','Cerrado']`                                                          |
| Eliminar un campo                 | Desaparece                                                                                         |
| Aceptar una relación              | `200`                                                                                              |
| Rechazar una relación             | `Conductor` pasa a `text`, `relatedTo: null`                                                       |
| Eliminar una entidad              | `Vehiculos` fuera; `Vehiculo` en Viajes pasa a `text`                                              |
| Cualquier edición tras confirmar  | `409 INVALID_STATE` · _"Ya confirmaste esta estructura. Si quieres cambiarla, vuelve al resumen."_ |

Los avisos del validador llegan con la respuesta y la interfaz los anuncia. Al rechazar la
relación de conductor, el backend devolvió: _"«Conductor» de Viajes deja de vincularse a
conductores y pasa a guardar el texto directamente."_ Eso es RI-06 y RX-06 funcionando juntos.

**Hallazgos y añadidos.**

- **Sin clave de API no hay relaciones que revisar, así que media fase no era verificable.** El
  camino determinista de RE-04 propone una tabla por hoja y **nunca** una relación. De ahí sale
  `scripts/dev-with-demo-proposal.ts` y `pnpm dev:demo`: el servidor real —PostgreSQL, DDL,
  importación, sesiones— con una sola pieza sustituida, el motor de inferencia, fijado a la
  propuesta del ERS §18. No es un doble de pruebas ni entra en `verify`; es la única forma de
  ejercitar relaciones contra un backend de verdad, y W6 y W7 la van a necesitar igual.
- **`useMutationFeedback` no aceptaba una reacción propia al fallo, y hacía falta.** Se añadió
  `onError`, que se ejecuta **además** del aviso y nunca en su lugar: si lo sustituyera, bastaría
  un `onError` olvidadizo para que una mutación fallara en silencio, que es justo lo que este
  envoltorio existe para impedir. Cubierto con dos tests.
- **`INVALID_STATE` ahora resincroniza.** El plan lo pedía y se había quedado suelto: no es culpa
  de quien edita, significa que el proyecto avanzó por otra pestaña. Además del mensaje del
  backend, se recarga la ruta para que el guardia del servidor reevalúe.
- **Las ediciones escriben la respuesta en la caché en vez de invalidar.** Toda edición devuelve
  el modelo **entero**, y por un motivo: borrar una entidad cambia los campos de otra. Escribir
  la respuesta completa evita el instante en que la pantalla mostraría un estado que ya no
  existe.
- **El control que más decide se llama "Se repiten por"**, no "clave de deduplicación". Nadie
  sabe qué es lo segundo; lo primero dice lo que hace, que es decidir si tres formas de escribir
  "Comercial Andes" son un cliente o son tres.
- **Las relaciones no se editan en la pantalla de campos.** El backend excluye `relation` de sus
  tipos editables, así que se muestran como etiqueta con enlace a la pantalla que sí decide
  sobre ellas. Un selector deshabilitado sin explicación sería peor que no ponerlo.
- **Un `409` en mi verificación resultó ser error mío, no del sistema.** Intenté confirmar
  saltando de `reviewing_entities` a `reviewing_summary`, y la máquina de estados lo rechazó con
  razón. Los botones "Continuar" recorren los pasos uno a uno, que es lo correcto; era el `curl`
  el que hacía trampa.

---

## W6 — El asistente: resumen, creación y resultado ✅ completada (2026-09-16)

**Entregables.** V10, V11 y V12, con el informe de filas fallidas y su descarga.

**Verificación.** Del resumen a `completed` con el archivo de demo. Con el archivo sucio, el
trabajo acaba en `partial` y se ven las dos filas con su motivo; el CSV se descarga y abre.
Cerrar la pestaña durante la importación y volver: el progreso sigue ahí.

**Resultado.**

`verify` en verde: **366** de la API y **98** del panel. El asistente recorre ahora las nueve
pantallas del ERS §19 de punta a punta. Con el archivo de demo, contra el backend real:

| Comprobación              | Resultado                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| El resumen previo         | `Gestion de Viajes` · 4 módulos · 13 campos · 3 relaciones                                                 |
| Confirmar y construir     | `200` + trabajo en marcha                                                                                  |
| Resultado del trabajo     | `partial` · _"Importamos 132 registros y 2 fila(s) quedaron fuera."_                                       |
| Filas rechazadas          | `Viajes` filas **122** y **123**, con su motivo en lenguaje de negocio                                     |
| El CSV                    | `text/csv`, `attachment; filename="filas-no-importadas.csv"`, comillas escapadas                           |
| Despachador tras terminar | `307` → `/listo`                                                                                           |
| **En PostgreSQL**         | 4 clientes · 4 vehículos · 4 conductores · **120 viajes**, 0 huérfanos, 4 clientes distintos referenciados |

Esa última fila es la que importa: el asistente construyó, desde el navegador, una aplicación
real con sus datos dentro, deduplicados y enlazados por claves foráneas de verdad.

**Hallazgos.**

- **Una sustitución de W5 había fallado en silencio, y lo descubrí aquí.** El mapa de pasos
  tenía una lista de pantallas "todavía sin construir" que desviaba a la última existente. Al
  intentar quitarla salió que mi edición de W5 nunca se aplicó: Prettier había reformateado la
  constante a varias líneas y el reemplazo por texto exacto no encontró nada, sin avisar. El
  despachador llevaba mal `reviewing_fields` y `reviewing_relations` durante toda W5, y **no lo
  vi porque verifiqué contra la API, no contra las rutas**. Ahora hay doce afirmaciones, una por
  estado, que fijan cada destino y no dejan que vuelva a colarse.
- **`ConfirmDialog` pintaba siempre el botón en rojo.** Crear la aplicación merece confirmación
  —congela el modelo— pero no destruye nada, y el rojo decía lo contrario. Se añadió `tono`, que
  es la segunda vez que dos pantallas necesitan lo mismo, que es justo el umbral que
  `component-system.md` fija para extender un componente compartido.
- **Confirmar y construir son dos llamadas pero una sola decisión**, así que van juntas detrás
  del mismo botón. Confirmar sin construir dejaría un proyecto congelado y a medias.
- **`completed` y `partial` van los dos a la pantalla de resultado.** Un archivo con dos celdas
  malas produce una aplicación utilizable, no un error: es la decisión 4 del plan de backend
  hecha pantalla.
- **El CSV se enlaza, no se descarga con `fetch`.** Un enlace normal deja que el navegador
  gestione la descarga, muestre su progreso y la guarde donde la persona tenga configurado.
- **Borrar una cuenta deja su schema huérfano.** `Project` cae en cascada con `User`, pero el
  schema `proj_*` no: solo lo elimina `DELETE /api/projects/:id`, que pasa por el materializador.
  Hoy no hay forma de borrar una cuenta desde el producto, así que es latente. Anotado en
  `technical-debt.md`, que de paso dejó de ser la plantilla vacía.
- **La acción final lleva a Proyectos, no a la aplicación.** `/proyectos/[id]/app` es W7 y daría
  `404`. Se cambia en la fase siguiente.

**Lo que no se pudo comprobar.** Cerrar la pestaña **durante** la importación. Con 122 filas el
trabajo entero dura menos de un segundo, así que no hay ventana. Lo que sí se verificó es el
mecanismo: el identificador del trabajo viaja en la URL, el sondeo para solo cuando el trabajo
para, y al terminar el despachador lleva al resultado.

---

## W7 — La aplicación generada ✅ completada (2026-09-16)

**Objetivo.** El motor genérico. Es la fase con más riesgo y la que justifica el producto.

**Entregables.** El registro de los diez tipos. La navegación construida desde el manifiesto.
`GeneratedTable` y `GeneratedForm`, dirigidas por el manifiesto. El combobox de relaciones
contra `options`. CRUD completo. Búsqueda, orden y página en la URL.

**Verificación.** Desde el navegador, sobre la aplicación creada en W6: los criterios CA-09 a
CA-17 del ERS. Y la prueba de que el motor es genérico de verdad: **crear un segundo proyecto
con un Excel distinto** —inventario, no viajes— y comprobar que sale una aplicación distinta
sin tocar una línea de código.

**Resultado.**

`verify` en verde: **366** de la API y **122** del panel. Los criterios, contra el backend real:

| Criterio                                      | Resultado                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| CA-09 · cada módulo tiene tabla               | 4 módulos, sus 4 rutas responden `200`                                                   |
| CA-10 · formulario de creación                | Generado del manifiesto, un control por tipo                                             |
| CA-12 · relaciones como selección             | `options?q=andes` → `Comercial Andes`, sin UUID en pantalla                              |
| CA-13/14/15 · datos, deduplicados y enlazados | 120 viajes con `related` resuelto a etiquetas                                            |
| CA-16 · crear tras importar                   | `201`, con las etiquetas de sus tres relaciones                                          |
| CA-17 · editar un importado                   | `Cerrado` · `1234.56`                                                                    |
| CA-11 · borrar con dependientes               | `409` · _"No se puede eliminar este registro porque Viajes depende de el."_              |
| Fugas en el texto visible                     | Ni `proj_`, ni `tableName`, ni `columnName`, ni columnas de sistema, **ni un solo UUID** |

**Y la prueba que importa.** El mismo código, un Excel de inventario:

```
Gestion de Viajes      Clientes · Vehiculos · Conductores · Viajes      120 viajes
Control de Inventario  Proveedores · Categorias · Productos             60 productos
```

Dos aplicaciones distintas, con módulos distintos y tipos distintos, **sin tocar una línea**.
Pedir `/app/viajes` dentro del proyecto de inventario da `404`: el nombre del módulo llega por
la URL y se **busca** en el manifiesto, nunca se usa para componer nada.

**Hallazgos.**

- **El registro de tipos hizo lo que prometía.** Diez entradas —celda, control, validación y
  alineación por tipo— y la tabla y el formulario se generan solos. No hay un solo `if` por
  nombre de entidad o de campo en todo el motor; si algún día aparece uno, será la señal de que
  dejó de ser genérico. Hay 24 tests que lo fijan, incluido uno que falla si el registro deja de
  cubrir los diez tipos.
- **El linter encontró el mismo fallo que el backend ya había sufrido.** `String(valor)` sobre
  un valor de tipo desconocido imprime `[object Object]` en la pantalla de alguien. Se resolvió
  igual que allí: `comoTexto` descarta lo que no tiene representación útil en vez de ensuciarse.
- **La fecha no se desplaza, y está fijado con un test.** La celda lee el texto `YYYY-MM-DD` con
  `deFechaTexto`, que construye en calendario local. El test afirma el día y el año pero **no la
  abreviatura del mes**: eso es un detalle del idioma que puede cambiar con la librería, y
  pinarlo habría producido un fallo falso —de hecho lo produjo: `date-fns` escribe `sep`, no
  `sept`.
- **Las relaciones no se ordenan.** El backend ordena por columna, y el valor de una relación es
  un identificador: ordenar por él daría un orden sin sentido para quien mira. La cabecera no
  ofrece el control.
- **La barra lateral tiene dos contextos.** Dentro de una aplicación muestra sus módulos leídos
  del manifiesto, con `staleTime: Infinity` porque la estructura de una aplicación ya creada no
  cambia. Siguen siendo dos niveles.
- **El servidor de demo ahora despacha por nombre de archivo.** Devolvía siempre la propuesta de
  viajes, lo que hacía imposible montar el segundo proyecto. Es el cambio que permitió la prueba
  del párrafo anterior.
- **Tres de mis comprobaciones del HTML fallaron, y las tres estaban mal escritas.** Buscaba
  "Clientes" donde la columna se llama "Cliente" —etiqueta del campo, no del módulo—, y
  `Mostrando 1-25 de` en el render del servidor, cuando las filas las trae el cliente. React
  inserta `<!-- -->` entre trozos de texto, así que al quitar etiquetas quedan dobles espacios:
  normalizar espacios antes de afirmar no es opcional.

---

## W8 — Endurecimiento, accesibilidad y temas ✅ completada (2026-09-16)

**Entregables.** Repaso de estados en las trece vistas: cargando, vacío, sin coincidencias,
error, parcial, sin permiso. Los dos temas en página, diálogo, popover, tooltip, toast, tabla
y badge. Teclado completo con foco visible. Contraste 4.5:1 y 3:1. 320, 768, 1024, 1440 y
zoom al 200%. Etiquetas largas y valores sin espacios.

**Verificación.** `docs/quality/frontend-checklist.md` entero, punto por punto, y cada
excepción declarada con su motivo.

**Resultado.**

El recorrido completo está en [`docs/quality/frontend-audit.md`](../../quality/frontend-audit.md):
los ~60 puntos del checklist, cada uno con su evidencia, y las excepciones con su motivo.
`verify` en verde con **181** tests del panel —eran 122— y 366 de la API.

Lo importante de esta fase es que dejó de ser una lista de buenas intenciones:

| Antes                                | Ahora                                                             |
| ------------------------------------ | ----------------------------------------------------------------- |
| "El contraste cumple AA"             | **40 mediciones** en `tests/contraste.test.ts`, en cada `verify`  |
| "Los iconos tienen nombre accesible" | `axe-core` sobre 16 casos, incluidos los ocho controles generados |
| "El texto largo se corta"            | Tres tests con contenido patológico                               |

**Cinco hallazgos, todos reales.**

1. **Dos pares de color por debajo del umbral**, encontrados midiendo. El borde de los
   campos estaba en 1,31:1 cuando WCAG 1.4.11 le exige 3:1 —es el límite del control, no un
   adorno— y el texto del botón destructivo en tema oscuro, en 3,58:1.
2. **El rojo destructivo tenía dos trabajos opuestos** en tema oscuro: fondo de botón y color
   de texto de error. Un rojo oscuro para llevar texto blanco resulta ilegible como texto;
   uno claro no contrasta con el blanco. Se resolvió invirtiendo el texto del botón —rojo
   claro con texto oscuro— en vez de partir el token, y hay un test que avisa si alguien
   "mejora" un lado y rompe el otro.
3. **Un botón sin nombre accesible, de impacto crítico**: el selector de "Filas" del pie de
   la tabla. La palabra visible era un hermano, no su etiqueta, así que un lector de pantalla
   anunciaba un botón mudo. Lo encontró `axe`, no una revisión.
4. **Objetivos táctiles de 36 y 28px** en cabecera y navegación, donde el checklist pide 44.
5. **Sin truncado** en el nombre del proyecto ni en las cabeceras de columna, y el backend
   admite 120 caracteres en ambos sitios.

**Excepciones declaradas.**

- **El formulario generado no usa React Hook Form.** Sus campos no existen al compilar: se
  componen en ejecución desde el manifiesto. RHF no aporta nada sobre un objeto plano y
  obligaría a registrar campos dinámicamente. Zod sí se usa, derivado del mismo manifiesto.
- **Las acciones de fila miden 32px, no 44.** A 44 la fila crecería un 40% y una tabla de
  veinticinco filas dejaría de caber en una pantalla. La regla habla de acciones _sueltas_;
  la fila entera, mucho más alta, es pulsable.
- **`--border` no llega a 3:1, y no le aplica.** Separa y agrupa —filas, bordes de tarjeta—
  pero no es lo único que identifica un componente: la tabla se lee sin sus líneas. Se mide
  igual, con umbral cero, para que la excepción sea visible y no un descuido.
- **Sin navegación reordenable** (uno a cuatro destinos), **sin imágenes** que optimizar, y
  `prefers-reduced-motion` sin tratar porque las dos únicas animaciones comunican que algo
  está ocurriendo y no son adorno.

**Lo que no se puede verificar sin navegador.** Cuatro puntos: el comportamiento visual a
320/768/1024/1440 y al 200%, los desbordes en móvil, las capturas y la consola limpia. Las
clases responsivas están puestas y **no hay ningún ancho fijo por encima de 320px** —eso sí
se comprobó—, pero poner la clase correcta y verla funcionar son dos cosas distintas.
Afirmar la segunda sin haberla mirado sería mentir. W9 trae Playwright y los cierra allí.

---

## W9 — Aceptación end-to-end ✅ completada (2026-09-16)

**Entregables.** Una prueba de Playwright que recorre CA-01 a CA-18 **en un navegador real**,
contra la API y PostgreSQL de verdad, con el archivo de demo del ERS §18.

Es el complemento que faltaba: `tests/acceptance.test.ts` demuestra los 18 criterios por HTTP
y `scripts/acceptance-live.ts` los demuestra contra la base real, pero ninguno demuestra que
**una persona** pueda completarlos. CA-18 —"sin escribir código"— solo se puede afirmar de
verdad desde aquí.

**Verificación.** Verde, y ejecutable con un comando.

**Resultado.**

```
corepack pnpm e2e

  ✓ CA-01 a CA-18: de un Excel a una aplicacion en uso              (13,5 s)
  ✓ Responsive: sin desbordes de 320 a 1440 ni al 200%               (5,8 s)
  2 passed
```

Los dieciocho criterios, conducidos en Chromium contra la API y PostgreSQL reales. Todo se
localiza **por rol y nombre accesible** —lo que usa un lector de pantalla—, nunca por clase
CSS: si algo deja de tener nombre, la prueba falla antes de que lo note nadie.

`verify` sigue en verde: 366 de la API y **182** del panel.

**Nueve hallazgos. Uno es de seguridad.**

1. **La contraseña acababa en la URL.** Antes de que React hidrate, `onSubmit` no existe y
   el navegador envía el formulario de forma nativa: un `GET` a la misma ruta con los campos
   en la barra de direcciones. Quedaría en el historial, en los registros del servidor y en
   la cabecera `Referer`. Pasó de verdad, la primera vez que la prueba rellenó el formulario
   más rápido de lo que tardó la página en hidratarse —que es lo que le ocurre a alguien con
   una conexión lenta—. Sin JavaScript no hay forma de impedir el envío nativo; la única
   defensa es no ofrecer el botón hasta poder atenderlo. La prueba vigila que la URL nunca
   contenga la contraseña.
2. **En desarrollo la página no llega a hidratar en este navegador.** Turbopack depende de
   un WebSocket de recarga en caliente cuyo apretón de manos falla aquí, y sin él React no
   toma el control: HTML muerto, sin un solo error en consola. Las pruebas corren contra la
   **construcción de producción**, que además es lo que se despliega.
3. **El guardia de rutas interceptaba `/_next/*`.** Excluía `static` e `image` pero dejaba
   dentro el resto de rutas internas de Next, que se piden sin cookie y recibían un redirect
   a HTML.
4. **70px de desborde horizontal a 320px**, por dos causas que se sumaban: `SidebarInset` y
   su contenedor sin `min-w-0` —un hijo flexible no encoge por debajo de su contenido a
   menos que se le diga—, y el grupo derecho del pie de paginación, que no envolvía.
5. **Pulsar la fila y pulsar su flecha llevaban a sitios distintos** para un proyecto
   terminado: `/listo` y `/app`. Ahora los dos pasan por el despachador, y un proyecto
   terminado va a su aplicación: no se continúa, se usa.
6. **La barra lateral no era un punto de referencia de navegación.** shadcn la monta con
   `div`, así que quien usa lector de pantalla no podía saltar a los destinos.
7. **"Toggle Sidebar", en inglés**, en una interfaz en español.
8. **Las iniciales del avatar se colaban en el nombre accesible** del botón de cuenta: se
   anunciaba como "AD Abrir el menu de tu cuenta".
9. **`e2e/` estaba excluido del tsconfig**, así que ni se typechequeaba ni se lintaba.
   Al incluirlo aparecieron dos errores de tipo que llevaban ahí desde el principio.

**Añadidos.**

- `corepack pnpm demo:files` en la API, que escribe los dos Excel de demo. Se habían
  regenerado a mano tres veces; ahora lo usan la preparación de las pruebas y cualquier
  verificación manual.
- `global-setup` siembra la cuenta y los archivos; `global-teardown` borra la cuenta **y
  sus schemas**, porque los proyectos caen en cascada pero los `proj_*` no. Comprobado: cero
  huérfanos al terminar.
- Cinco capturas en `apps/web/e2e/capturas/`, una por anchura más la del 200%.

**Por qué no entra en `verify`.** Necesita Docker, la base migrada y una construcción de
producción, y tarda medio minuto. `verify` tiene que poder correrse cada pocos minutos sin
pensárselo.

---

## Orden de dependencias

```
W0 ─ W1 ─ W2 ─┬─ W3 ─┬─ W4 ─ W5 ─ W6 ─┬─ W7 ─ W8 ─ W9
              │      │                │
              └──────┴── W3 y W4 pueden solaparse tras W2
```

W7 depende de W6 solo para tener una aplicación real que abrir. Se puede empezar antes contra
un proyecto creado con `scripts/acceptance-live.ts`.

---

## Riesgos

| Riesgo                                            | Fase   | Mitigación                                                                                                   |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| La cookie de Better Auth no sobrevive al proxy    | W0     | Es lo primero que se prueba; `AUTH_BASE_URL` al origen público                                               |
| El motor genérico se llena de casos particulares  | W7     | El vocabulario está cerrado en diez tipos. Un `if` por nombre de entidad es la señal de que algo se hizo mal |
| El cliente acaba con su propia máquina de estados | W4     | El paso lo dicta `status`; las transiciones, `nextStatuses`. Nunca una constante local                       |
| Dos sistemas de tabla o de toasts                 | W2, W7 | El inventario se construye antes que las pantallas, y el peaje de intake obliga a eliminar el duplicado      |
| Sondeo de trabajos disparando peticiones de más   | W4, W6 | Solo mientras el estado sea `queued` o `running`, y parando al ocultarse la pestaña                          |
| Fechas desplazadas un día, otra vez               | W7     | El backend ya devuelve `date` como texto `YYYY-MM-DD`; el cliente no debe construir un `Date` para pintarlas |
| Interfaz de plantilla                             | W0, W8 | La tabla de _Generated Defaults To Avoid_ se revisa en W8 como criterio de aceptación, no como opinión       |

---

## Pendiente de decidir

- ¿Necesita el panel una portada con métricas, o `/` redirige siempre a Proyectos? El MVP
  asume lo segundo: `interface-design.md` pide no añadir un tablero que no cambie ninguna
  decisión.
- ¿Se puede renombrar un proyecto después de creado? El backend no expone `PATCH /projects/:id`.
  Si se quiere, es trabajo de backend.
- Exportar a CSV lo que hay en un módulo de la aplicación generada. No está en el ERS y el
  backend no lo ofrece; aparecerá pedido en cuanto alguien use esto en serio.
- Idioma. Hoy es español fijo. Internacionalizar obliga a mover al cliente los mensajes que
  hoy escribe el backend, y eso es un ADR.

---

## Verification

Global, con el frontend terminado (2026-09-16):

| Comprobación                                    | Estado                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `corepack pnpm verify` con los dos paquetes     | ✅ 366 tests de la API, 182 del panel                                          |
| CA-01…CA-18 en un navegador real                | ✅ `corepack pnpm e2e`, 2 pruebas en 30 s                                      |
| El checklist de frontend, punto por punto       | ✅ [`frontend-audit.md`](../../quality/frontend-audit.md), con sus excepciones |
| Las 26 rutas del mapa de consumo, con vista     | ✅                                                                             |
| CRUD contra el backend real, no contra dobles   | ✅ W3, W5, W6 y W7                                                             |
| Sin errores ni avisos de hidratación en consola | ✅ Vigilado durante todo el recorrido                                          |

### La lista original

- `corepack pnpm verify` en verde con los dos paquetes.
- CA-01…CA-18 recorridos en un navegador real por Playwright.
- `docs/quality/frontend-checklist.md` completo, con las excepciones declaradas.
- Las 26 rutas del mapa de consumo, todas con vista. Si sobra alguna, se justifica.
- Crear, editar, ver y eliminar ejercitados contra el backend real, no contra dobles.
- Sin errores nuevos ni avisos de hidratación en la consola.
