# Diapositivas · contenido

Alternativa al video. Mismas cinco secciones, en imágenes.

> **Comprueba las bases antes de montar.** No conozco el límite de diapositivas
> de la Opción 2. Este guion trae **9**, marcando cuáles se pueden cortar si el
> tope es menor. Y una pregunta que cambia la redacción entera: **¿se presentan
> o se leen solas?** Si nadie las va a narrar, el texto de cada una tiene que
> sostenerse por sí mismo y hay que subir a la diapositiva parte de lo que aquí
> va en «lo que dices».

Todas las cifras salen de ejecuciones reales sobre `contabilidad.xlsx` (6 hojas,
454 filas) contra Gemini Pro.

## La regla de oro

**Un número por diapositiva.** El número hace el trabajo; el texto solo lo
enmarca. Si una diapositiva necesita dos frases para entenderse, son dos
diapositivas.

---

## 1 · Portada

**Imagen:** el logo, o el icono de un archivo `.xlsx` con una flecha hacia el
icono de una aplicación.

**En la diapositiva:**

> # De un Excel a una aplicación
>
> Sin escribir el esquema de la base de datos

**Lo que dices:** nada. Es el rótulo.

---

## 2 · El problema

**Imagen:** captura del Excel en la hoja `Comprobantes`, con la columna
`Tercero` resaltada en amarillo. Que se vea el mismo nombre repetido muchas
veces. Recorta para que quepan unas 15 filas: más se lee como ruido.

**En la diapositiva:**

> # 8 clientes. 184 veces escritos.
>
> Cambiar el nombre de uno son 184 ediciones.
> Si fallas una, tienes dos empresas donde había una.

**Lo que dices:** la información está relacionada; el Excel no sabe expresarlo.

---

## 3 · Las personas

**Imagen:** una bandeja de correo con adjuntos tipo
`contabilidad_v3_FINAL_revisado.xlsx`. Si no la tienes, vale una foto de
escritorio con el archivo abierto.

**En la diapositiva:**

> # Quien lleva esto no puede delegarlo
>
> - Una fórmula rota y se pierde el mes
> - No pueden trabajar dos personas a la vez
> - Nada impide escribir «por definir» donde va un importe

**Lo que dices:** contadores y administradores de PYME. Lo que necesitan no es
otra hoja de cálculo.

---

## 4 · La solución

**Imagen:** tres cajas en fila — `Excel` → `Modelo` → `Aplicación` — con el
logo de Gemini **solo sobre la flecha del medio**. Que se vea de un vistazo que
la IA toca un paso, no los tres.

**En la diapositiva:**

> # Gemini decide una sola cosa: qué significan tus columnas
>
> Todo lo demás —crear las tablas, importar, validar— es determinista.

**Lo que dices:** la IA propone el modelo una vez, tú lo revisas, y a partir de
ahí no vuelve a intervenir.

---

## 5 · Por qué hace falta un modelo _(la diapositiva que os diferencia)_

**Imagen:** una tabla de dos filas, hecha a mano, grande y legible.

| Columna    | Valores distintos | Filas | Qué debe ser       |
| ---------- | ----------------- | ----- | ------------------ |
| `Producto` | 9                 | 60    | **una tabla**      |
| `Estado`   | 3                 | 60    | **un desplegable** |

**En la diapositiva:**

> # Estadísticamente idénticas. Estructuralmente opuestas.
>
> Ninguna medición las distingue.
> Solo lo sabe quien entiende las palabras.

**Lo que dices:** esto es exactamente lo que un sistema de reglas no puede
resolver, y por lo que hace falta un modelo de lenguaje.

> **Si hay que recortar, esta NO se corta.** Es la única que explica por qué el
> producto necesita IA, y es lo que os separa de un conversor de Excel a CRUD.

---

## 6 · La demo, en una imagen

**Imagen:** captura de la pantalla de relaciones, con las cuatro frases en
español visibles:

```
Cada comprobante pertenece a un tercero.
Cada movimiento pertenece a un comprobante.
Cada movimiento pertenece a una cuenta.
Cada factura pertenece a un tercero.
```

**En la diapositiva:**

> # 6 hojas → 5 módulos y 4 relaciones
>
> El sistema las explica en español, no en SQL.

**Lo que dices:** nadie escribió esto. Salió de un Excel que el sistema no había
visto nunca.

---

## 7 · El plano que lo vende todo

**Imagen:** dos capturas juntas, una encima de otra o lado a lado.

- **Arriba:** la celda del Excel que dice `1.1.02`
- **Abajo:** el formulario de la aplicación con el desplegable abierto y
  **«Bancos»** resaltado

**En la diapositiva:**

> # En el Excel decía `1.1.02`
>
> El sistema entendió que era la misma cosa.

**Lo que dices:** 240 movimientos enlazados a sus cuentas, con integridad
referencial de verdad. No puedes borrar una cuenta que está en uso.

> Si solo pudieras enseñar **una** diapositiva, sería esta. Cualquiera que haya
> tocado un plan de cuentas la entiende sin explicación.

---

## 8 · Lo que no se ve pero importa _(opcional)_

**Imagen:** captura del informe de importación.

**En la diapositiva:**

> # 452 filas importadas. 2 rechazadas.
>
> Una fecha que no era una fecha. Un importe escrito a mano.
> Y te dice cuáles.

**Lo que dices:** un RUC que empieza por cero —`0990054321001`— se guarda como
texto. Como número perdería el cero y estaría mal para siempre.

> Esta diapositiva vende **confianza**, no funcionalidad. Es la que convence a un
> contador de que el sistema respeta sus datos.

---

## 9 · El modelo de negocio _(sustituye a la 8 si eres Founder)_

**Imagen:** dos barras. Una alta y repetida («por cada uso») contra una sola
barra pequeña al principio («una vez, al crear»).

**En la diapositiva:**

> # Una llamada por proyecto. Una sola vez.
>
> Después la aplicación funciona para siempre sin volver a llamar al modelo.

**Lo que dices:** casi todo producto de IA paga por cada uso; aquí se paga una
vez al crear, y el margen mejora con cada día que el cliente usa su aplicación.
Con archivos de una sola hoja ni siquiera hace falta llamar al modelo.

---

## Si el tope es de 5 diapositivas

Este es el recorte, en este orden:

1. El problema (la 2)
2. La solución (la 4)
3. **Estadísticamente idénticas** (la 5)
4. **En el Excel decía `1.1.02`** (la 7)
5. Builder → la 6 · Founder → la 9

Se cae la portada, «Las personas» y el informe de importación. Duele perder «Las
personas», pero el problema ya dice quién lo sufre.

---

## Cómo capturar las imágenes

La pila tiene que estar levantada:

```bash
docker compose -f docker-compose.demo.yml up -d
```

Entrar en <http://localhost:3100> con la cuenta de `docker-compose.demo.yml`,
subir `~/Desktop/contabilidad.xlsx` y recorrer el asistente parando en cada
pantalla.

Tres cosas antes de disparar:

- **Modo claro u oscuro, pero el mismo en todas.** El panel tiene los dos y
  mezclarlos se nota mucho en una diapositiva.
- **Ventana ancha.** A menos de 1280 px la tabla empieza a esconder columnas y
  la captura pierde justo lo que quieres enseñar.
- **Borrar los proyectos de prueba** antes de capturar la lista: un panel con
  seis «Contabilidad 2026» delata el ensayo.
