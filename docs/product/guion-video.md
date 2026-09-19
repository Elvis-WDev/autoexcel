# Guion del video · 2 minutos

Guion para grabar, con tiempos, texto hablado y qué se ve en pantalla.

> **Antes de grabar: comprueba la duración en las bases.** Las cinco secciones de
> la tabla oficial suman 160 s y el máximo son 120 s. Las dos últimas están
> marcadas «Builder» y «Founder», así que casi con seguridad se elige **una de
> las dos** según el perfil: 25 + 20 + 35 + 40 = **120 s exactos**. Si resulta
> que hay que meter las cinco, recorta de «El problema» y «Las personas», que
> son las que admiten resumen sin perder fuerza.

| Sección               | Tiempo | Acumulado |
| --------------------- | ------ | --------- |
| El problema           | 25 s   | 0:25      |
| Las personas          | 20 s   | 0:45      |
| La solución           | 35 s   | 1:20      |
| Builder **o** Founder | 40 s   | 2:00      |

Todas las cifras de este guion salen de ejecuciones reales sobre
`contabilidad.xlsx` (6 hojas, 454 filas) contra Gemini Pro. No hay ninguna
estimada: si alguien pregunta, se sostienen.

---

## 0:00 – 0:25 · El problema

**En pantalla:** el Excel abierto en la hoja `Comprobantes`, bajando despacio.
Se resalta la columna `Tercero`, donde el mismo nombre se repite una y otra vez.

**Voz** (~70 palabras):

> Esto es la contabilidad de una empresa pequeña. Seis hojas, cuatrocientas
> cincuenta filas.
>
> Aquí hay ocho clientes y proveedores. Sus nombres están escritos ciento
> ochenta y cuatro veces a lo largo del libro.
>
> Cambiar el nombre de uno son ciento ochenta y cuatro ediciones. Y si fallas
> una sola, tienes dos empresas donde había una.
>
> La información está relacionada. El Excel no sabe expresarlo.

**Por qué esta cifra.** 120 comprobantes más 64 facturas son 184 filas que
repiten el nombre de uno de solo 8 terceros. Es el problema de la duplicidad
dicho con un número, no con un adjetivo.

---

## 0:25 – 0:45 · Las personas

**En pantalla:** el archivo enviado por correo, con nombres tipo
`contabilidad_v3_FINAL_revisado.xlsx`. Vale una captura.

**Voz** (~55 palabras):

> Quien lleva esto es un contador o el administrador de una PYME.
>
> No puede delegar el archivo: una fórmula rota y se pierde el mes. No pueden
> trabajar dos personas a la vez. Y nada impide escribir «por definir» donde
> va un importe.
>
> Lo que necesitan no es otra hoja de cálculo. Es una aplicación.

---

## 0:45 – 1:20 · La solución

**En pantalla:** el arrastre del archivo, y después la pantalla de análisis con
los módulos propuestos.

**Voz** (~100 palabras):

> Subes tu Excel y sale una aplicación con tablas relacionadas.
>
> **Gemini** hace una sola cosa: decidir qué significan tus columnas. En una
> hoja de pedidos, «Producto» con nueve valores distintos y «Estado» con tres
> son estadísticamente idénticos. Ninguna medición los distingue. Pero uno
> merece ser una tabla y el otro no.
>
> Eso solo lo sabe quien entiende las palabras.
>
> Todo lo demás —crear las tablas, importar, validar— es determinista. La
> inteligencia artificial propone el modelo una vez, tú lo revisas, y a partir
> de ahí no vuelve a intervenir.

**Por qué se dice así.** Casi todos dirán «usamos IA para generar tu app»: es
vago y no lo distingue de nadie. Decir exactamente qué decide el modelo —y
sobre todo **qué no toca**— es un argumento de confianza, y cuando hablas de
datos contables la confianza es la venta.

---

## 1:20 – 2:00 · Builder: la demo

Cuatro planos. Cronometrados, sin clics de más.

| Tiempo      | Qué se ve                                                            |
| ----------- | -------------------------------------------------------------------- |
| 0:00 – 0:08 | Arrastrar `contabilidad.xlsx`. Rótulo: **6 hojas · 454 filas**       |
| 0:08 – 0:18 | La propuesta: **5 módulos y 4 relaciones**, con la frase en español  |
| 0:18 – 0:25 | Crear aplicación. **452 filas importadas, 2 rechazadas** y cuáles    |
| 0:25 – 0:40 | Movimientos: 240 filas. Clic en una. El selector ofrece **«Bancos»** |

**Voz** (~105 palabras):

> Arrastro el archivo. Seis hojas, cuatrocientas cincuenta y cuatro filas.
>
> El sistema propone cinco módulos y cuatro relaciones, y las explica en
> español: cada movimiento pertenece a una cuenta.
>
> Creo la aplicación. Cuatrocientas cincuenta y dos filas importadas. Dos
> rechazadas: una fecha que no era una fecha y un importe escrito a mano. Me
> dice exactamente cuáles.
>
> Y esto es lo importante. Doscientos cuarenta movimientos, cada uno con su
> comprobante y su cuenta. Abro uno y elijo la cuenta por su nombre: Bancos.
>
> En el Excel esa celda decía uno punto uno punto cero dos.
>
> El sistema entendió que eran la misma cosa.

**Ese es el mejor segundo del video.** Es visual, es instantáneo, y cualquiera
que haya tocado un plan de cuentas lo siente en el estómago. Si hay que
sacrificar algo, se sacrifica lo anterior, nunca este plano.

**Segundo plano de reserva**, si sobran segundos: el RUC `0990054321001` con su
cero intacto. Guardado como número sería `990054321001` y estaría mal para
siempre. Es un detalle que un contador pilla al vuelo.

---

## 1:20 – 2:00 · Founder: el modelo

**En pantalla:** una cuenta sencilla. El coste de una llamada frente al uso de
la aplicación a lo largo de meses.

**Voz** (~105 palabras):

> El coste de inteligencia artificial es una sola llamada por proyecto. Unos
> cuarenta segundos, una vez.
>
> Después la aplicación funciona para siempre sin volver a llamar al modelo.
> Buscar, crear, editar, relacionar: nada de eso pasa por una IA.
>
> Casi todo producto de inteligencia artificial paga por cada uso. Aquí se paga
> una vez, al crear, y el margen mejora con cada día que el cliente usa su
> aplicación.
>
> Y hay más: cuando el archivo trae una sola hoja, ni siquiera hace falta
> llamar al modelo. El camino determinista da el mismo resultado. Coste cero
> justo donde no aporta.

**Si preguntan por el coste real.** Una llamada a Gemini Pro con el perfil de un
archivo de seis hojas: decenas de segundos y céntimos. El perfil que se envía
son estadísticas y como mucho ocho ejemplos por columna —nunca las filas—, así
que el coste no crece con el tamaño del archivo.

---

## Dos cosas que no hay que hacer

**No enseñar el asistente entero.** Son cinco pantallas y se comen los cuarenta
segundos en clics. Se muestra el archivo entrando y la aplicación funcionando;
el medio se cuenta con una frase.

**No decir «sin código» a secas.** Está gastado y no dice nada. Decir lo que de
verdad pasó: _nadie escribió el esquema de esta base de datos; salió de un Excel
que el sistema no había visto nunca_.

---

## Preparar la grabación

```bash
docker compose -f docker-compose.demo.yml up -d
```

Entrar en <http://localhost:3100> con la cuenta sembrada (está en
`docker-compose.demo.yml`, en `SEED_EMAIL` y `SEED_PASSWORD`).

El archivo de la demo se regenera con:

```bash
corepack pnpm --filter @app/api exec tsx scripts/escenarios/generar.ts /tmp/ets-escenarios
```

Antes de grabar conviene **borrar los proyectos de prueba anteriores** desde la
lista: un panel con seis «Contabilidad 2026» delata que es un ensayo.

Y hacer una pasada completa en seco. El análisis tarda entre diez y cuarenta
segundos según el archivo, y en un video de dos minutos esa espera hay que
saber dónde cae para cortarla en el montaje.
