# Plan de correcciones — revisión de 2026-09-16

## Goal

Cerrar los hallazgos de la revisión profunda de bugs, arquitectura y seguridad. Son cinco, y
**ninguno es un problema de arquitectura**: las decisiones estructurales —dos planos, puertos,
vocabulario cerrado— aguantaron la revisión. Son cuatro correcciones acotadas y una de
legibilidad.

Estado de partida: backend F0–F9 y panel W0–W9 completos, `verify` en verde con 366 tests de
la API y 182 del panel, y los 18 criterios del ERS §17 verificados por HTTP, contra PostgreSQL
y en un navegador real.

---

## Lo que encontró la revisión

|     | Hallazgo                                                  | Dónde                         |
| --- | --------------------------------------------------------- | ----------------------------- |
| 🔴  | El límite de intentos de login es evitable por completo   | `auth.ts` y `app.ts`          |
| 🟠  | Sin cuota de filas en las aplicaciones generadas          | `records.ts`                  |
| 🟠  | La tabla muestra un número que el formulario rechaza      | `record-schema.ts` y el panel |
| 🟠  | El formulario de edición no lee de la fuente autoritativa | `modulo-generado.tsx`         |
| 🟡  | Bytes nulos crudos en tres fuentes                        | `builder.ts` y dos tests      |

El contrato entre panel y API se cruzó entero: **ninguna llamada apunta a una ruta que no
existe**, y los métodos y las formas coinciden en las 30 rutas.

---

## Decisiones tomadas

- **2026-09-16** — La cuota de filas **no se implementa**. Es una demo: el registro público
  está cerrado y las cuentas se siembran a mano, así que no hay nadie de quien defenderse. Se
  anota como deuda aceptada en vez de dejarla sin rastro.
- **2026-09-16** — La notación decimal española se acepta **también en la API**, no solo en el
  panel. El importador ya la acepta, así que hoy el producto se contradice consigo mismo:
  importas `1.234,56`, lo ves bien en la tabla, y no puedes volver a escribirlo.

  **Consecuencia que hay que conocer.** El analizador resuelve la ambigüedad con "gana el
  último separador", así que `1.234` se lee como **1,234** y no como mil doscientos treinta y
  cuatro. Es lo que ya hace el importador; reutilizarlo hace coherente al producto, pero no
  elimina la ambigüedad: la fija.

---

# Fases

## C0 — El límite de intentos de login ✅ completada (2026-09-16)

**Objetivo.** Que la protección contra fuerza bruta funcione de verdad.

**El problema, medido.** Better Auth trae una regla estricta para `/sign-in` —3 intentos cada
10 segundos— pero la aplica por IP, y esa IP la resuelve leyendo `x-forwarded-for`. Lo que
llega de verdad a la API detrás del proxy:

| Petición                       | Cabecera que recibe la API |
| ------------------------------ | -------------------------- |
| Limpia, por el proxy           | **ninguna**                |
| Con `X-Forwarded-For: 1.2.3.4` | **`1.2.3.4`**, intacta     |

Next no añade la cabecera ni corrige la que le llega. Eso produce dos fallos opuestos, y los
dos son reales:

- **Sin cabecera**, Better Auth cae a un único cubo compartido por ruta: 3 intentos cada 10 s
  **para toda la aplicación**. Tres personas entrando a la vez y la tercera queda fuera.
  Denegación de servicio trivial sobre el login.
- **Con cabecera falsificada**, un solo valor pasa su filtro y se acepta como dirección del
  cliente. Cambiándolo en cada petición se obtiene un cubo nuevo cada vez: **fuerza bruta sin
  límite**.

**Entregables.**

- Un middleware delante del manejador de auth que **sobrescriba** `x-forwarded-for` con la
  dirección real del socket. Sobrescribir y no añadir: lo que llega del cliente no es
  información, es una afirmación suya.
- `advanced.ipAddress.trustedProxies` en la configuración de Better Auth, para que resuelva la
  dirección cuando sí haya un proxy de confianza delante.
- Documentar en `.env.example` qué hay que ajustar al desplegar tras un balanceador real, que
  es cuando esto vuelve a importar.

**Verificación.** Una prueba que dispare cuatro intentos de login seguidos y afirme que el
cuarto recibe `429`. Y otra que repita lo mismo **cambiando `X-Forwarded-For` en cada
intento** y afirme que el límite sigue aplicándose: si la cabecera falsificada volviera a
funcionar, esa prueba es la que lo diría.

**Resultado.**

`verify` en verde con **377** tests de la API —once nuevos— y 182 del panel. La suite de
navegador pasa entera, con tres pruebas nuevas:

| Comprobación                                              | Resultado                                             |
| --------------------------------------------------------- | ----------------------------------------------------- |
| Cinco intentos con una cuenta                             | `401` los cinco                                       |
| El sexto                                                  | `429` · `TOO_MANY_REQUESTS` con su mensaje de negocio |
| Seis intentos **cambiando la IP falsificada en cada uno** | `429` igualmente al sexto                             |
| Agotar una cuenta y probar con otra                       | `401`: la otra no queda afectada                      |
| Aviso de Better Auth "no pude determinar la IP"           | Ya no aparece                                         |

**El plan estaba incompleto, y se vio al medir.**

Decía "sobrescribir `x-forwarded-for` con la dirección real del socket". Eso cierra la
falsificación, pero **detrás del proxy ese socket es siempre Next**, así que todo el mundo
caería en el mismo contador y el problema de denegación de servicio quedaría intacto. Se
midió antes de escribir nada, enviando una petición desde una dirección de red real:

```
socket.remoteAddress:  127.0.0.1
x-forwarded-host:      192.168.1.15:3100
x-forwarded-for:       (no llega)
```

Next reenvía el host pero no la dirección. **La API no puede conocer la IP de la persona**, y
ninguna configuración lo arregla desde este lado.

Por eso el límite se cuenta **por cuenta** y no por dirección. Resuelve las dos caras a la
vez: quien ataca una cuenta se topa con el límite venga de donde venga, y nadie puede dejar
fuera a los demás. Y es la defensa que de verdad importa, porque la fuerza bruta se dirige a
una cuenta concreta.

**Cómo quedó.**

- `client-address.ts` sustituye la cabecera por la dirección del socket mientras no haya
  proxies declarados, y la respeta cuando los hay. Montado **solo** para `/api/auth`, no para
  toda la API.
- `login-throttle.ts` cuenta por correo normalizado. **Devuelve** el resultado en vez de
  lanzar, para no saber nada de Better Auth ni de HTTP: quien lo llama decide cómo rechazar, y
  así se puede probar sin levantar nada.
- El hook `before` de Better Auth traduce ese resultado. Tuvo que lanzar el `APIError` de la
  propia librería: con un `AppError` del dominio, su manejador lo captura y responde `500`.
  Eso **se descubrió probándolo**, no leyendo la documentación.
- `AUTH_TRUSTED_PROXIES`, `AUTH_LOGIN_ATTEMPTS` y `AUTH_LOGIN_WINDOW_MINUTES`, documentadas en
  `.env.example` con el motivo de cada una.

**Decisiones que conviene conocer.**

- **El límite no distingue si la cuenta existe.** Uno que solo se aplicara a correos reales
  confirmaría cuáles lo son.
- **Bloquea también a quien acierta la contraseña** dentro de la ventana. Es lo que se busca:
  un bloqueo que la contraseña correcta esquivara no sería un bloqueo.
- **Los contadores viven en el proceso**, como los del resto de la API. Al reiniciar se
  pierden, y con varias instancias cada una llevaría los suyos. Anotado ya en
  `technical-debt.md` como parte de la misma deuda.

## C1 — Los decimales, en la API y en el panel ✅ completada (2026-09-16)

**Objetivo.** Que el producto acepte que le escriban el mismo número que muestra.

**Entregables.**

- `parseDecimalText` sale de `domain/import/coercion.ts` —donde hoy es privada— a un módulo de
  dominio propio. La van a usar el importador y el esquema de registros, así que no puede
  vivir dentro de uno de los dos.
- `record-schema.ts` usa ese analizador para `integer` y `decimal`, en vez de
  `z.coerce.number()`.
- En el panel, el control numérico del registro de tipos envía el valor canónico y muestra el
  formateado, que es lo que pide `forms-and-workflows.md`. La API lo aceptaría igual, pero un
  cliente que manda `1.234,56` por la red obliga a cada consumidor a conocer la convención.

**Verificación.** Una tabla de casos sobre el esquema de registros: `1234.56`, `1.234,56`,
`1,234.56`, `1234`, `-5,5` y `abc`. Y **el caso que motiva todo esto**: importar el archivo de
demo, abrir un viaje en el panel y volver a escribir el valor tal como la tabla lo muestra.

**Cerrada.** El analizador vive en `apps/api/src/domain/numbers.ts` y lo usan el importador y
`record-schema.ts`; en el panel, `comoNumero` es su copia documentada y las dos suites comparten
la misma tabla de casos, asi que no pueden separarse en silencio.

Apareció algo que el plan no preveía: `pg` devuelve `numeric` **como texto**, de modo que un valor
guardado llega al formulario como `'350.00'`. Aceptar `350,00` no bastaba —el control seguía
abriéndose con `350.00` mientras la celda decía `350,00`, dos verdades para el mismo dato en la
misma pantalla—. Se añadió `hidratar` al registro de tipos: convierte una vez, al abrir, y no en
cada pulsación, porque reformatear a media palabra movería el cursor.

Comprobado en navegador dentro de la aceptación: se reabre el registro recién guardado, se afirma
que el control trae `1.234,56` y se vuelve a enviar ese texto tal cual.

## C2 — La edición desde la fuente autoritativa ✅ completada (2026-09-16)

**Objetivo.** Que editar no sobrescriba con datos viejos.

`obtenerRegistro` (`GET .../records/:id`) existe, está exportado y **no lo llama nadie**. El
diálogo se precarga con la fila cacheada de la lista, que puede tener treinta segundos. Con
`PATCH` parcial, editar sobre datos viejos pisa lo que otra persona acabe de cambiar.

**Entregables.**

- Al abrir el diálogo de edición se pide el registro por su identificador.
- Mientras llega, el diálogo muestra su esqueleto, en vez de campos vacíos que se rellenan
  solos delante de quien mira.
- Si el registro ya no existe —lo borró otra persona— se dice y se cierra, en vez de guardar
  contra algo que no está.

**Verificación.** Abrir la edición y comprobar que se pide al servidor. Simular que el
registro desapareció y comprobar el mensaje.

**Cerrada.** El diálogo ya no recibe la fila cacheada: guarda solo el identificador y pide el
registro con `obtenerRegistro`, con `staleTime` y `gcTime` a cero, porque el sentido de esa
consulta es precisamente no servir una copia.

**Se cambió una decisión del plan.** Decía "se dice y se cierra"; el mensaje se muestra **dentro
del diálogo** y no como aviso flotante. Dos razones. La primera es de la persona: un aviso que
aparece mientras el diálogo se desvanece es fácil de no ver, y esto hay que verlo. La segunda la
encontró el linter —`react-hooks/set-state-in-effect`—, y tenía razón: cerrar desde un efecto
obligaba a un `setState` que el resto del panel evita; aquí todo queda derivado del estado de la
consulta. Lo que el plan de verdad pedía —que no se pueda guardar contra algo que no está— se
cumple igual: el botón de guardar queda inhabilitado y no hay campos que enviar.

Verificado en los dos niveles. Siete pruebas de componente sobre los tres estados del diálogo
—esqueleto, registro cargado, registro desaparecido— y dos pasos en el navegador: uno espera la
petición `GET .../records/:id` al abrir, y el otro intercepta esa ruta con un 404 y comprueba el
mensaje y el botón inhabilitado.

## C3 — Los bytes nulos y la limpieza

**Objetivo.** Que el código se lea como lo que hace.

`sql/builder.ts`, `tests/identifiers.test.ts` y `tests/ddl-adversary.test.ts` llevan bytes
nulos crudos. **El código es correcto** —`literal()` escapa comillas, acepta espacios y
rechaza el byte nulo, verificado— pero el carácter se pinta invisible, así que quien revisa lee
una comprobación contra una cadena vacía, que se leería como "siempre verdadero".

Quien hizo esta revisión lo leyó mal y creyó haber encontrado un fallo grave. **Un carácter
que engaña a quien revisa es un problema aunque el programa funcione.**

**Entregables.** Sustituir los bytes crudos por su secuencia de escape. Y una comprobación en
`verify` que falle si vuelve a colarse uno: se cuelan solos, por herramientas que normalizan
el texto al guardarlo.

**Verificación.** Los tests de identificadores y de adversario siguen en verde —son los que de
verdad ejercitan el byte nulo— y no queda ningún byte de control en el árbol.

---

## Lo que se descarta, y por qué

**La cuota de filas.** `POST .../records` no tiene límite: una cuenta puede llenar el disco de
su propio schema en un bucle. Se descarta a propósito mientras esto sea una demo, porque el
registro público está cerrado y las cuentas se siembran a mano: no hay de quién defenderse.

Queda anotado en `technical-debt.md` **con su condición de reapertura** —abrir el registro—
para que la decisión tenga fecha y motivo en vez de desaparecer.

---

## Riesgos

| Riesgo                                                                          | Fase | Mitigación                                                                             |
| ------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------- |
| Sobrescribir `x-forwarded-for` rompe el registro de accesos o un proxy legítimo | C0   | Se sobrescribe solo para el manejador de auth, no para toda la API                     |
| El límite bloquea a quien se equivoca dos veces al teclear                      | C0   | 3 cada 10 s es la regla de la propia librería; lo que se corrige es a quién se aplica  |
| Aceptar la coma decimal vuelve ambiguo `1.234`                                  | C1   | La ambigüedad ya existe en el importador; esto la fija en un solo sitio y la documenta |
| Pedir el registro al abrir el diálogo añade una espera                          | C2   | Esqueleto en vez de campos vacíos, y la lista sigue en caché para el resto             |

## Verification

- `corepack pnpm verify` en verde con los dos paquetes.
- `corepack pnpm e2e` en verde: una corrección no puede romper los 18 criterios.
- Una prueba por hallazgo, y **en dos de los cuatro la prueba es el entregable**: sin la de la
  cabecera falsificada, C0 no se puede dar por cerrado mirando el código.
