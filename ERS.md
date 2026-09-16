# ERS — Sistema de Conversión Asistida de Excel a Aplicación de Gestión

**Documento:** Especificación de Requisitos de Software (ERS)  
**Versión:** MVP / Demo  
**Estado:** Propuesta funcional  
**Nombre del archivo:** `ERS.md`

---

## 1. Propósito del documento

Este documento define los requisitos funcionales y no funcionales de un MVP cuyo objetivo es demostrar la siguiente idea:

> Un usuario carga un archivo Excel que representa información operativa de su negocio, el sistema analiza su estructura, propone un modelo simple de datos y, con validación paso a paso del usuario, genera una aplicación básica compuesta por entidades, relaciones, tablas de consulta y formularios de creación/edición.

El MVP no busca construir cualquier tipo de software ni generar código arbitrario. Su objetivo es demostrar que una hoja de cálculo puede transformarse, mediante asistencia de IA y confirmación humana, en una aplicación estructurada y utilizable.

---

## 2. Visión del sistema

### 2.1 Problema

Muchas pequeñas operaciones de negocio comienzan y permanecen durante años en hojas de cálculo.

Estas hojas suelen mezclar en una misma tabla conceptos diferentes, por ejemplo:

- clientes;
- productos;
- viajes;
- proveedores;
- vehículos;
- pedidos;
- facturas;
- responsables;
- estados;
- fechas;
- montos.

Aunque Excel permite registrar esta información, a medida que crece el volumen de datos aparecen problemas:

- información duplicada;
- dificultad para mantener consistencia;
- dificultad para relacionar datos;
- poca trazabilidad;
- errores manuales;
- dificultad para consultar la información;
- dependencia de una estructura tabular poco flexible.

Construir una aplicación tradicional para reemplazar el Excel requiere traducir manualmente la hoja a conceptos de base de datos, relaciones, formularios y tablas.

El sistema propuesto busca realizar esa traducción de forma asistida.

---

## 3. Objetivo del MVP

El MVP debe demostrar de extremo a extremo este flujo:

```text
Excel
  ↓
Análisis
  ↓
Propuesta de entidades
  ↓
Propuesta de campos y relaciones
  ↓
Confirmación del usuario
  ↓
Creación de la estructura
  ↓
Importación de datos
  ↓
Aplicación CRUD utilizable
```

El resultado mínimo esperado será una aplicación que permita:

- navegar entre entidades;
- consultar registros en tablas;
- crear registros;
- editar registros;
- visualizar campos relacionados entre entidades;
- conservar los datos importados desde el archivo original.

---

## 4. Alcance del MVP

### 4.1 Incluido

El MVP incluirá únicamente:

1. Carga de un archivo Excel.
2. Selección de una hoja cuando el archivo contenga varias.
3. Lectura de encabezados y datos.
4. Análisis básico de columnas.
5. Inferencia asistida de:
   - entidades;
   - campos;
   - tipos de campo;
   - relaciones simples.
6. Presentación de la propuesta al usuario.
7. Edición básica de la propuesta.
8. Confirmación explícita antes de crear la aplicación.
9. Generación de la estructura de datos.
10. Generación automática de:
    - una tabla de registros por entidad;
    - un formulario para crear registros;
    - un formulario para editar registros.
11. Importación de los datos del Excel.
12. Navegación entre los módulos generados.
13. Creación y edición manual de registros una vez terminada la importación.

### 4.2 Fuera de alcance

El MVP no incluirá:

- generación de código fuente;
- agente autónomo de programación;
- edición de código;
- dashboards;
- gráficas;
- KPIs;
- reportes avanzados;
- automatizaciones;
- workflows;
- reglas de negocio complejas;
- campos calculados;
- fórmulas arbitrarias;
- scripting;
- plugins;
- integraciones externas;
- permisos avanzados;
- roles complejos;
- personalización visual avanzada;
- aplicaciones móviles;
- generación automática de APIs personalizadas;
- procesamiento de documentos diferentes de Excel;
- interpretación de macros;
- ejecución de macros;
- procesamiento de lógica embebida en Excel;
- reconstrucción de fórmulas de Excel como lógica de aplicación.

---

## 5. Definiciones

### 5.1 Entidad

Concepto de negocio que agrupa registros del mismo tipo.

Ejemplos:

- Cliente
- Producto
- Pedido
- Vehículo
- Viaje

Una entidad generará, como mínimo:

- una estructura de almacenamiento;
- una tabla de registros;
- un formulario de creación;
- un formulario de edición.

---

### 5.2 Campo

Propiedad perteneciente a una entidad.

Ejemplos:

```text
Cliente
- Nombre
- Correo
- Teléfono
- Ciudad
```

---

### 5.3 Relación

Vínculo entre dos entidades.

Ejemplo:

```text
Cliente 1 ───── N Pedidos
```

Esto significa que un cliente puede estar asociado con varios pedidos.

---

### 5.4 Blueprint de aplicación

Representación estructurada de la aplicación que será creada.

Debe describir al menos:

- entidades;
- campos;
- tipos de campos;
- relaciones.

El Blueprint será la definición funcional de la aplicación antes de su creación.

El usuario no necesita conocer ni editar directamente esta representación.

---

### 5.5 Aplicación generada

Resultado final del proceso.

Está formada por módulos simples de gestión de información.

Cada módulo representa una entidad y contiene como mínimo:

- listado;
- creación;
- edición.

---

## 6. Principios funcionales

El sistema deberá respetar los siguientes principios.

### P-01. La IA propone, el usuario confirma

Ninguna estructura deberá considerarse definitiva antes de que el usuario la confirme.

---

### P-02. El sistema trabaja con un conjunto limitado de conceptos

La IA no puede generar componentes arbitrarios.

Solo podrá proponer elementos soportados por el sistema.

---

### P-03. El resultado debe ser determinista después de la confirmación

Una vez aprobado el modelo, la creación de tablas, campos, formularios y relaciones no dependerá de nuevas decisiones de IA.

---

### P-04. La importación de datos no será realizada por la IA

La IA podrá ayudar a determinar la estructura y el mapeo de columnas, pero la transferencia de registros deberá realizarse mediante un proceso controlado y determinista.

---

### P-05. El usuario debe entender las decisiones

Las relaciones y entidades deben mostrarse con lenguaje comprensible para una persona que utiliza Excel y que no necesariamente conoce bases de datos.

Ejemplo:

En lugar de mostrar:

```text
FOREIGN KEY cliente_id REFERENCES clientes(id)
```

mostrar:

```text
Cada viaje pertenece a un cliente.

Un cliente puede tener varios viajes.
```

---

## 7. Actores

### 7.1 Usuario creador

Persona que desea transformar un archivo Excel en una aplicación.

Puede:

- cargar el archivo;
- revisar la propuesta;
- modificar nombres;
- agregar o eliminar entidades;
- agregar o eliminar campos;
- confirmar relaciones;
- crear la aplicación;
- consultar la aplicación generada.

Para el MVP no se requiere más de un tipo de usuario funcional.

---

## 8. Flujo principal

### 8.1 Flujo general

```text
[Inicio]
   ↓
[Cargar Excel]
   ↓
[Seleccionar hoja]
   ↓
[Analizar archivo]
   ↓
[Proponer estructura]
   ↓
[Revisar entidades]
   ↓
[Revisar campos]
   ↓
[Revisar relaciones]
   ↓
[Resumen]
   ↓
[Crear aplicación]
   ↓
[Importar datos]
   ↓
[Abrir aplicación]
```

---

## 9. Requisitos funcionales

# RF-01. Carga de archivo

El sistema deberá permitir al usuario seleccionar un archivo Excel desde su dispositivo.

### Criterios

- Solo se aceptarán archivos compatibles con el alcance del MVP.
- El sistema deberá validar que el archivo pueda ser leído.
- Si el archivo no es válido, deberá mostrar un mensaje comprensible.
- El archivo no deberá procesarse como aplicación hasta que sea analizado.

---

# RF-02. Selección de hoja

Si el archivo contiene más de una hoja, el sistema deberá permitir seleccionar cuál se desea convertir.

### Caso simple

```text
Archivo: operaciones.xlsx

Hojas detectadas:
○ Viajes
○ Clientes
○ Resumen
```

Solo una hoja será utilizada como origen principal durante el MVP.

---

# RF-03. Detección de encabezados

El sistema deberá identificar las columnas de la hoja seleccionada.

Ejemplo:

```text
Cliente | Teléfono | Vehículo | Fecha | Valor | Estado
```

El sistema deberá mostrar los encabezados detectados antes de continuar.

---

# RF-04. Perfilado de columnas

El sistema deberá producir información básica de cada columna.

Como mínimo:

- nombre;
- cantidad de registros;
- cantidad de valores vacíos;
- cantidad de valores distintos;
- ejemplos de valores;
- tipo aparente.

Ejemplo conceptual:

```text
Columna: Cliente
Registros: 8.432
Valores únicos: 417
Vacíos: 3

Ejemplos:
- Comercial Andes
- Distribuidora Central
- Cliente Norte
```

Esta información se utilizará para ayudar a inferir la estructura.

---

# RF-05. Inferencia de entidades

El sistema deberá analizar la hoja y proponer uno o más conceptos de negocio.

Ejemplo de entrada:

```text
Cliente
Email Cliente
Producto
Precio
Cantidad
Fecha
Vendedor
```

Ejemplo de propuesta:

```text
Clientes
Productos
Vendedores
Ventas
```

La propuesta no será creada automáticamente.

Se presentará al usuario para revisión.

---

# RF-06. Revisión de entidades

El usuario deberá poder revisar las entidades propuestas.

Por cada entidad podrá:

- aceptar;
- cambiar el nombre;
- eliminarla de la propuesta.

Opcionalmente, si la interfaz del MVP lo permite, podrá agregar una entidad manualmente.

Ejemplo:

```text
Entidades detectadas

✓ Clientes
✓ Viajes
✓ Vehículos
✓ Conductores
```

---

# RF-07. Inferencia de campos

Para cada entidad, el sistema deberá proponer sus campos.

Ejemplo:

```text
Clientes

- Nombre
- RUC
- Teléfono
- Ciudad
```

---

# RF-08. Tipos de campo permitidos

El MVP deberá limitar los campos a un conjunto pequeño y cerrado.

Tipos permitidos:

```text
text
integer
decimal
boolean
date
datetime
email
phone
select
relation
```

El sistema podrá asignar automáticamente uno de estos tipos a cada campo.

---

# RF-09. Revisión de campos

El usuario deberá poder revisar los campos de cada entidad.

Como mínimo podrá:

- cambiar la etiqueta;
- cambiar el tipo;
- eliminar el campo.

El MVP podrá permitir agregar campos manualmente si esto no incrementa significativamente la complejidad de la demo.

---

# RF-10. Detección de relaciones

El sistema deberá poder proponer relaciones simples entre entidades.

Para el MVP se soportarán:

- uno a muchos;
- muchos a uno.

Ejemplo:

```text
Cliente
   │
   └── tiene muchos → Viajes
```

Desde la perspectiva inversa:

```text
Cada viaje pertenece a un cliente.
```

---

# RF-11. Confirmación de relaciones

El sistema deberá presentar las relaciones en lenguaje de negocio.

Ejemplo:

```text
Detectamos esta relación:

Un cliente puede tener varios viajes.
Cada viaje pertenece a un solo cliente.

¿Es correcto?

[No] [Sí]
```

El usuario deberá poder rechazar la relación.

---

# RF-12. Vista resumen antes de crear

Antes de realizar cualquier creación definitiva, el sistema deberá mostrar un resumen.

Ejemplo:

```text
Aplicación: Gestión de Viajes

4 entidades

Clientes
- Nombre
- RUC
- Teléfono

Viajes
- Fecha
- Cliente
- Vehículo
- Valor
- Estado

Vehículos
- Placa
- Modelo

Conductores
- Nombre
- Teléfono
```

Y las relaciones:

```text
Cliente 1 ─── N Viajes
Vehículo 1 ── N Viajes
Conductor 1 ─ N Viajes
```

El usuario deberá confirmar mediante una acción explícita:

```text
[Crear aplicación]
```

---

# RF-13. Creación de la aplicación

Después de la confirmación, el sistema deberá crear una aplicación basada en el Blueprint aprobado.

Cada entidad deberá producir un módulo.

Ejemplo:

```text
Clientes
Viajes
Vehículos
Conductores
```

---

# RF-14. Generación automática de tabla

Cada entidad deberá tener una vista de tabla.

Ejemplo:

```text
Clientes

Buscar...

Nombre              RUC          Teléfono
------------------------------------------------
Comercial Andes     123456       099...
Cliente Norte       998877       098...
```

Como mínimo, la tabla deberá permitir:

- mostrar registros;
- abrir un registro;
- iniciar la creación de un registro.

---

# RF-15. Generación automática de formulario

Cada entidad deberá tener un formulario generado automáticamente a partir de sus campos.

Ejemplo:

```text
Nuevo cliente

Nombre
[________________________]

RUC
[________________________]

Teléfono
[________________________]

Ciudad
[________________________]

[Cancelar] [Guardar]
```

---

# RF-16. Formularios de edición

El sistema deberá permitir abrir un registro existente y modificar sus valores.

La estructura del formulario de edición deberá corresponder a la estructura de la entidad.

---

# RF-17. Representación de relaciones en formularios

Cuando un campo corresponda a una relación, el formulario deberá permitir seleccionar un registro existente de la entidad relacionada.

Ejemplo:

```text
Nuevo viaje

Cliente
[ Distribuidora Andes ▼ ]

Vehículo
[ ABC-123 ▼ ]

Fecha
[ 15/09/2026 ]

Valor
[ 350.00 ]
```

El usuario no deberá escribir manualmente identificadores internos.

---

# RF-18. Importación de datos

Una vez creada la estructura, el sistema deberá importar los datos originales del Excel.

El sistema deberá utilizar el mapeo aprobado durante el proceso.

---

# RF-19. Conservación del vínculo entre registros

Si la hoja original contiene datos repetidos que se convierten en entidades independientes, el sistema deberá preservar correctamente sus relaciones.

Ejemplo de Excel:

```text
Cliente A | Viaje 001
Cliente A | Viaje 002
Cliente A | Viaje 003
```

Resultado esperado:

```text
Clientes

Cliente A
```

```text
Viajes

Viaje 001 → Cliente A
Viaje 002 → Cliente A
Viaje 003 → Cliente A
```

No deberán crearse tres clientes idénticos cuando la estructura aprobada determine que se trata del mismo cliente.

---

# RF-20. Manejo de duplicados derivados de normalización

Cuando una entidad sea obtenida a partir de valores repetidos de una columna, el sistema deberá evitar crear registros duplicados según el criterio utilizado durante la inferencia.

Ejemplo:

```text
Excel:

Cliente
------
ACME
ACME
ACME
NORTE
```

Entidad generada:

```text
Clientes

ACME
NORTE
```

---

# RF-21. Finalización del proceso

Al terminar la creación e importación, el sistema deberá informar que la aplicación está lista.

Ejemplo:

```text
Tu aplicación está lista.

Se crearon:

4 módulos
842 registros
3 relaciones

[Abrir aplicación]
```

---

# RF-22. Navegación entre módulos

La aplicación generada deberá disponer de navegación entre las entidades creadas.

Ejemplo:

```text
Clientes
Viajes
Vehículos
Conductores
```

Cada opción deberá abrir la tabla correspondiente.

---

# RF-23. Creación de registros después de importar

El usuario deberá poder crear nuevos registros desde la aplicación generada.

Los nuevos registros deberán respetar:

- campos;
- tipos;
- relaciones;
- obligatoriedad configurada.

---

# RF-24. Edición de registros después de importar

El usuario deberá poder modificar los registros existentes, incluidos aquellos provenientes del Excel.

---

## 10. Requisitos de experiencia de usuario

# RX-01. Flujo guiado

El proceso deberá presentarse como un asistente paso a paso.

El usuario no deberá enfrentarse a todas las decisiones en una sola pantalla.

---

# RX-02. Acción principal clara

Cada paso deberá presentar una acción principal evidente.

Ejemplos:

```text
Continuar
Confirmar
Crear aplicación
Abrir aplicación
```

---

# RX-03. Lenguaje no técnico

La interfaz no deberá exigir conocimientos de bases de datos.

No deberá utilizar términos como requisito para operar:

- DDL;
- foreign key;
- primary key;
- normalización;
- schema;
- SQL.

Podrán existir internamente, pero no serán necesarios en el flujo principal.

---

# RX-04. Corrección antes de creación

El usuario deberá poder volver a pasos anteriores antes de crear definitivamente la aplicación.

---

# RX-05. Mostrar qué fue inferido

El usuario deberá distinguir qué elementos fueron propuestos automáticamente.

Ejemplo:

```text
Detectamos 4 entidades.
```

---

# RX-06. No ocultar decisiones importantes

El sistema no deberá crear relaciones importantes sin mostrarlas al usuario.

---

# RX-07. Confirmación final

La aplicación no se creará hasta que el usuario vea el resumen y confirme.

---

## 11. Reglas de inferencia funcional

Estas reglas describen el comportamiento esperado, no la técnica utilizada para implementarlo.

### RI-01. Una columna no implica automáticamente una entidad

Ejemplo:

```text
Ciudad
```

no necesariamente deberá convertirse en una entidad.

Puede permanecer como campo.

---

### RI-02. Valores repetidos pueden sugerir una entidad

Una columna con valores altamente repetidos puede representar un concepto reutilizado.

Ejemplo:

```text
Cliente
```

con 5.000 filas y 80 valores distintos puede sugerir una entidad `Clientes`.

---

### RI-03. El nombre de la columna influye en la interpretación

Ejemplos:

```text
cliente
cliente_nombre
producto
vendedor
vehiculo
proveedor
```

pueden aportar evidencia para detectar entidades.

---

### RI-04. La estructura inferida debe favorecer simplicidad

Ante varias interpretaciones posibles, el MVP deberá preferir una estructura simple.

No deberá intentar una normalización excesiva.

---

### RI-05. No convertir todo en entidades

El sistema deberá evitar producir estructuras como:

```text
Ciudades
Estados
Tipos
Categorías
Monedas
```

a menos que exista evidencia clara o el usuario lo confirme.

Para el MVP, estos elementos podrán representarse preferentemente como campos simples o selecciones.

---

### RI-06. El usuario tiene la decisión final

Si la inferencia propone:

```text
Productos
Clientes
Ventas
```

y el usuario decide mantener `Producto` dentro de `Ventas`, la decisión del usuario prevalece.

---

## 12. Modelo conceptual mínimo

La aplicación generada se compondrá únicamente de los siguientes objetos:

```text
Application
 └── Entity[]
      ├── Field[]
      └── Relation[]
```

---

### 12.1 Application

Representa la aplicación generada.

Propiedades conceptuales mínimas:

```text
id
name
entities
```

---

### 12.2 Entity

Representa un módulo.

Propiedades mínimas:

```text
id
name
label
fields
```

---

### 12.3 Field

Propiedades mínimas:

```text
id
name
label
type
required
```

---

### 12.4 Relation

Propiedades mínimas:

```text
source_entity
target_entity
type
```

Tipos permitidos en el MVP:

```text
one_to_many
many_to_one
```

---

## 13. Ejemplo completo de uso

### Archivo inicial

El usuario carga:

```text
viajes.xlsx
```

Contenido:

```text
Fecha      Cliente             RUC       Vehículo   Conductor     Valor   Estado
01/09/26   Comercial Andes     123       ABC-123    Juan Pérez    350     Cerrado
02/09/26   Comercial Andes     123       XYZ-456    Ana Ruiz      420     Cerrado
03/09/26   Cliente Norte       456       ABC-123    Juan Pérez    290     Abierto
```

---

### Paso 1. Análisis

El sistema indica:

```text
Encontramos 7 columnas y 3 registros.
```

---

### Paso 2. Entidades propuestas

```text
Clientes
Viajes
Vehículos
Conductores
```

---

### Paso 3. Campos propuestos

```text
Clientes
- Nombre
- RUC

Vehículos
- Identificación

Conductores
- Nombre

Viajes
- Fecha
- Cliente
- Vehículo
- Conductor
- Valor
- Estado
```

---

### Paso 4. Relaciones propuestas

```text
Un cliente puede tener varios viajes.

Un vehículo puede tener varios viajes.

Un conductor puede tener varios viajes.
```

El usuario confirma.

---

### Paso 5. Resumen

```text
Se crearán:

4 módulos
9 campos
3 relaciones
```

El usuario pulsa:

```text
Crear aplicación
```

---

### Paso 6. Importación

Resultado:

```text
Clientes
- Comercial Andes
- Cliente Norte
```

```text
Vehículos
- ABC-123
- XYZ-456
```

```text
Conductores
- Juan Pérez
- Ana Ruiz
```

```text
Viajes
- 3 registros
```

---

### Paso 7. Aplicación terminada

Navegación:

```text
Clientes
Viajes
Vehículos
Conductores
```

El usuario puede abrir `Viajes`, crear uno nuevo o editar uno existente.

---

## 14. Manejo de errores

# RE-01. Archivo ilegible

Si el archivo no puede abrirse:

```text
No pudimos leer este archivo.

Comprueba que sea un archivo Excel válido e inténtalo nuevamente.
```

---

# RE-02. Hoja vacía

Si la hoja no contiene datos:

```text
La hoja seleccionada no contiene datos suficientes para crear una aplicación.
```

---

# RE-03. Encabezados inválidos

Si no se pueden determinar encabezados:

```text
No pudimos identificar correctamente los nombres de las columnas.
```

El sistema deberá impedir continuar hasta resolverlo.

---

# RE-04. Inferencia insuficiente

Si el sistema no puede inferir varias entidades con suficiente claridad, deberá poder proponer una estructura simple.

Ejemplo:

```text
No pudimos identificar grupos claros en este archivo.

Podemos comenzar creando una única entidad con las columnas actuales.
```

Esto permite que la demo continúe.

---

# RE-05. Error durante creación

Si falla la creación de la aplicación, el usuario deberá recibir un mensaje y la aplicación no deberá mostrarse como completada.

---

# RE-06. Error de una fila durante importación

El sistema deberá registrar el error.

Para el MVP podrá:

- detener la importación; o
- continuar y reportar filas fallidas.

La estrategia elegida deberá ser consistente durante toda la demo.

---

## 15. Requisitos no funcionales

# RNF-01. Claridad

El flujo completo deberá ser comprensible para una persona que sabe utilizar Excel pero no sabe programar.

---

# RNF-02. Trazabilidad

El sistema deberá conservar la relación entre:

- columna original;
- campo generado;
- entidad destino.

Esto será necesario para realizar correctamente la importación.

---

# RNF-03. Consistencia

Una estructura aprobada deberá producir siempre una aplicación consistente con el Blueprint aprobado.

---

# RNF-04. Validación

No se deberá crear una aplicación a partir de un Blueprint inválido.

---

# RNF-05. Recuperación

Si la creación falla antes de completarse, el sistema no deberá presentar una aplicación parcial como válida.

---

# RNF-06. Tiempo de respuesta percibido

Durante procesos de análisis, creación e importación, la interfaz deberá indicar claramente que existe una operación en curso.

Ejemplo:

```text
Analizando archivo...
```

```text
Creando módulos...
```

```text
Importando registros...
```

---

# RNF-07. Explicabilidad mínima

Cuando el sistema proponga entidades o relaciones, deberá mostrar la conclusión en términos simples.

No es necesario mostrar razonamiento interno detallado.

---

## 16. Restricciones del MVP

Para mantener la demo pequeña y controlable:

1. Solo se procesará una hoja principal por aplicación.
2. La primera fila válida será utilizada como fuente de encabezados.
3. El usuario deberá confirmar la estructura antes de crearla.
4. Solo existirán relaciones uno-a-muchos / muchos-a-uno.
5. No se soportarán relaciones muchos-a-muchos.
6. No se soportarán entidades jerárquicas.
7. No se soportarán fórmulas de negocio.
8. No se generarán dashboards.
9. No se generará código.
10. No habrá ejecución autónoma de acciones fuera del flujo.
11. No habrá lógica personalizada por entidad.
12. Cada entidad tendrá exactamente un listado y formularios estándar de creación/edición.
13. Los componentes visuales se derivarán automáticamente del tipo de campo.
14. Las modificaciones visuales avanzadas quedan fuera del MVP.

---

## 17. Criterios de aceptación del MVP

La demo será considerada exitosa si puede realizar el siguiente escenario completo:

### CA-01

El usuario carga un Excel tabular válido.

### CA-02

El sistema identifica correctamente sus columnas.

### CA-03

El sistema propone al menos una entidad.

### CA-04

Para un Excel preparado para la demo, el sistema propone correctamente múltiples entidades relacionadas.

### CA-05

El usuario puede revisar la propuesta.

### CA-06

El usuario puede confirmar o rechazar relaciones propuestas.

### CA-07

El sistema muestra un resumen antes de crear.

### CA-08

Al confirmar, se generan los módulos correspondientes.

### CA-09

Cada módulo dispone de tabla de registros.

### CA-10

Cada módulo dispone de formulario de creación.

### CA-11

Cada registro puede editarse.

### CA-12

Los campos relacionados se representan como selecciones de registros relacionados.

### CA-13

Los datos del Excel son importados.

### CA-14

Los valores repetidos utilizados para crear entidades se deduplican correctamente.

### CA-15

Las relaciones entre los registros importados se conservan.

### CA-16

El usuario puede crear un nuevo registro después de finalizar la importación.

### CA-17

El usuario puede editar un registro importado.

### CA-18

Todo el flujo puede completarse sin que el usuario escriba código.

---

## 18. Demo recomendada

Para que la demostración sea clara, utilizar un Excel preparado con una estructura similar a:

```text
Fecha
Cliente
RUC
Vehículo
Conductor
Valor
Estado
```

Con suficientes registros repetidos para demostrar que:

```text
Cliente
```

se convierte en una entidad independiente y no en texto duplicado dentro de cada viaje.

Resultado esperado:

```text
Clientes
Vehículos
Conductores
Viajes
```

Relaciones:

```text
Clientes 1 ───── N Viajes

Vehículos 1 ──── N Viajes

Conductores 1 ── N Viajes
```

---

## 19. Pantallas mínimas

El MVP requiere únicamente las siguientes pantallas o estados visuales.

### Pantalla 1 — Cargar Excel

Elementos:

```text
Título
Descripción breve
Selector de archivo
Botón continuar
```

---

### Pantalla 2 — Seleccionar hoja

Solo se mostrará cuando exista más de una hoja.

Elementos:

```text
Lista de hojas
Continuar
```

---

### Pantalla 3 — Analizando

Elementos:

```text
Estado de procesamiento
Indicador de progreso o espera
```

---

### Pantalla 4 — Revisar entidades

Elementos:

```text
Entidades propuestas
Renombrar
Eliminar
Continuar
```

---

### Pantalla 5 — Revisar estructura

Por entidad:

```text
Nombre
Campos
Tipo de campo
Eliminar campo
```

---

### Pantalla 6 — Revisar relaciones

Elementos:

```text
Relaciones propuestas
Descripción en lenguaje natural
Aceptar/rechazar
```

---

### Pantalla 7 — Resumen

Elementos:

```text
Nombre de aplicación
Entidades
Campos
Relaciones
Crear aplicación
```

---

### Pantalla 8 — Creando aplicación

Elementos:

```text
Creando estructura...
Importando datos...
```

---

### Pantalla 9 — Aplicación terminada

Elementos:

```text
Resumen de creación
Abrir aplicación
```

---

### Pantalla 10 — Aplicación generada

Elementos:

```text
Navegación de entidades
Tabla
Crear registro
Editar registro
```

---

## 20. Estado del proceso

El proceso de creación deberá manejar conceptualmente los siguientes estados:

```text
uploaded
sheet_selected
analyzing
reviewing_entities
reviewing_fields
reviewing_relations
reviewing_summary
creating
importing
completed
failed
```

El usuario solo deberá poder acceder a estados válidos según el avance realizado.

---

## 21. Decisiones que pertenecen a la IA

Para el MVP, la IA únicamente deberá ayudar a decidir:

```text
¿Qué conceptos parecen entidades?

¿Qué columnas pertenecen a cada entidad?

¿Qué tipo básico tiene cada campo?

¿Qué relaciones simples existen entre las entidades?
```

---

## 22. Decisiones que NO pertenecen a la IA

La IA no deberá decidir directamente cómo:

- crear físicamente el almacenamiento;
- ejecutar cambios estructurales;
- insertar cada registro;
- renderizar componentes;
- guardar formularios;
- ejecutar consultas;
- importar miles de filas;
- crear código;
- ejecutar código.

Estas operaciones deberán ser responsabilidad del sistema a partir del Blueprint aprobado.

---

## 23. Límite conceptual del producto en el MVP

El sistema no pretende responder:

> “Crea cualquier software a partir de una descripción.”

El sistema pretende responder:

> “Convierte información tabular existente en una aplicación básica de gestión de datos.”

La unidad central del producto no es el código.

Es la estructura de información.

---

## 24. Propuesta de valor demostrada

La demo deberá hacer evidente la transformación:

### Antes

```text
Excel plano

Cliente | Vehículo | Conductor | Fecha | Valor | Estado
```

### Después

```text
Aplicación

Clientes
Vehículos
Conductores
Viajes
```

con:

```text
formularios
tablas
relaciones
datos importados
```

El valor principal demostrado será:

> El usuario puede pasar de una hoja de cálculo a una aplicación estructurada sin diseñar manualmente una base de datos y sin programar.

---

## 25. Resumen final del MVP

El MVP se limita a cinco responsabilidades:

```text
1. Leer Excel
2. Entender su estructura
3. Proponer un modelo
4. Permitir al usuario confirmarlo
5. Convertirlo en una aplicación CRUD
```

La IA actúa únicamente como asistente de interpretación.

El sistema mantiene el control sobre la estructura creada, la importación de datos y la interfaz resultante.

La demostración se considera cumplida cuando un usuario puede cargar un Excel, aceptar una propuesta estructural y terminar utilizando módulos con tablas, formularios y relaciones construidos a partir de sus propios datos.
