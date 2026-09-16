# Auditoría del frontend — W8

Recorrido de [`frontend-checklist.md`](frontend-checklist.md) punto por punto, con
la evidencia de cada respuesta y **cada excepción declarada con su motivo**.

Fecha: 2026-09-16 · Alcance: las trece vistas del
[plan](../plans/active/frontend-mvp.md), W0 a W7.

Tres estados posibles:

|     |                                                                                  |
| --- | -------------------------------------------------------------------------------- |
| ✅  | Verificado, con la evidencia indicada                                            |
| ⚠️  | Excepción declarada, con su motivo                                               |
| ⬜  | Sin verificar. **Ya no queda ninguno**: los cuatro que dejó W8 se cerraron en W9 |

---

## Tarea y jerarquía

| Punto                                                         | Estado | Evidencia                                                                                         |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Usuario, tarea y acción primaria claros                       | ✅     | Cada vista del plan declara su tarea antes de su disposición                                      |
| La superficie encaja con el flujo                             | ✅     | Asistente a página completa (alto riesgo, ciclo de confirmación); CRUD en modal; listas con tabla |
| Las secciones con registros propios son destinos, no pestañas | ✅     | Cada módulo generado es un destino de la barra lateral; no hay pestañas en todo el panel          |
| Todo lo que ofrece un módulo funciona de punta a punta        | ✅     | W3 y W7 verificados contra el backend real: listar, crear, editar, detalle y eliminar             |
| Sin títulos ni descripciones duplicados                       | ✅     | La cabecera no repite el título de la página (`app-header.tsx`)                                   |
| Filtros y acciones pegados a lo que afectan                   | ✅     | `TableToolbar` vive dentro del marco de la tabla                                                  |
| Ningún elemento decorativo sin beneficio                      | ✅     | Sin tarjetas de métricas, sin banners permanentes, sin panel lateral fijo                         |
| Se entiende sin conocer la implementación                     | ✅     | Ver "Datos y lenguaje"                                                                            |

## Datos y lenguaje

| Punto                                                 | Estado | Evidencia                                                                                                        |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Etiquetas en lenguaje de negocio                      | ✅     | Los doce estados traducidos (`estados.ts`); "Se repiten por" en vez de "clave de deduplicación"                  |
| Sin identificadores, tokens de enum ni rutas técnicas | ✅     | Medido sobre el texto visible en W3, W4 y W7: **ni un solo UUID**, ni `proj_`, ni `tableName`, ni `__dedupe_key` |
| Relaciones con selector, no texto libre               | ✅     | `EntityPickerCombobox` contra `/options`; se envía el id, se muestra la etiqueta                                 |
| No se piden valores que genera el backend             | ✅     | El único texto libre de todo el recorrido es el nombre del proyecto                                              |
| Números, fechas y vacíos con formato consistente      | ✅     | `Intl.NumberFormat('es-EC')`; vacío siempre `—`; 24 tests en `campos-generados`                                  |
| Trato directo, sin narrar el sistema                  | ✅     | Los mensajes vienen del backend, ya redactados así                                                               |

## Tablas

| Punto                                                            | Estado | Evidencia                                                                                 |
| ---------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Tabla y paginación compartidas                                   | ✅     | `AppDataTable` es la única; la usan proyectos y todos los módulos generados               |
| Búsqueda, filtros, orden, columnas y acciones siguen el contrato | ✅     | 17 tests en `app-data-table`                                                              |
| Paginación determinista e igual en todos los módulos             | ✅     | Mismo componente; orden y total los fija el servidor                                      |
| Orden, alineación y espaciado iguales entre módulos              | ✅     | La alineación sale del tipo de campo, no de cada pantalla                                 |
| Los estados usan la insignia compartida, con icono o punto       | ✅     | `StatusBadge`; el color **nunca** va solo                                                 |
| Cargando, vacío, sin coincidencias, parcial y error cubiertos    | ✅     | Los cuatro motivos de `EmptyState`; probados en la tabla                                  |
| Acciones válidas según permiso y estado                          | ✅     | `deshabilitadaPorque` con el motivo visible                                               |
| Iconos con descripción opaca y nombre accesible                  | ✅     | `axe` lo comprueba en cada `verify`                                                       |
| Desbordes y valores largos usables en móvil                      | ✅     | W9: `scrollWidth` medido a 320, 768, 1024 y 1440. **Desbordaba 70px a 320** y se corrigió |

## Formularios y diálogos

| Punto                                                  | Estado | Evidencia                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| React Hook Form y Zod                                  | ⚠️     | RHF en el diálogo de proyecto. **El formulario generado no lo usa**: sus campos no existen al compilar, así que el esquema se compone en ejecución desde el manifiesto y el estado es un objeto plano. RHF no aporta nada sobre eso y obligaría a registrar campos dinámicamente. Zod sí se usa, derivado del mismo manifiesto |
| Etiquetas, obligatoriedad y errores asociados          | ✅     | `axe` verifica los ocho tipos de control generados                                                                                                                                                                                                                                                                             |
| Campos condicionales                                   | ✅     | Las opciones solo aparecen para listas cerradas                                                                                                                                                                                                                                                                                |
| Valores sensibles enmascarados                         | ✅     | `PasswordField`; la API nunca devuelve contraseñas                                                                                                                                                                                                                                                                             |
| Doble envío impedido                                   | ✅     | `AsyncButton` deshabilita mientras hay petición                                                                                                                                                                                                                                                                                |
| Un fallo conserva lo escrito                           | ✅     | Probado en la pantalla de sesión                                                                                                                                                                                                                                                                                               |
| Foco, Escape, cierre, superposición y scroll del modal | ✅     | 8 tests en `dialogos`; `useFocusRestore` lo garantiza                                                                                                                                                                                                                                                                          |
| Los flujos de riesgo usan página completa              | ✅     | El asistente entero                                                                                                                                                                                                                                                                                                            |
| Crear y editar usan modal                              | ✅     | Proyectos y módulos generados                                                                                                                                                                                                                                                                                                  |
| El borrado irreversible exige escribir el nombre       | ✅     | Escalera de confirmación probada                                                                                                                                                                                                                                                                                               |
| Subida de archivo con estado por archivo               | ✅     | `FileField` con progreso real de subida                                                                                                                                                                                                                                                                                        |

## Respuesta y estado

| Punto                                                       | Estado | Evidencia                                                         |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Toda orden tiene pendiente, éxito y error                   | ✅     | `useMutationFeedback`, por el que pasan **todas** las mutaciones  |
| Cada mutación pasa por el envoltorio compartido             | ✅     | 8 tests; `onError` se suma al aviso, nunca lo sustituye           |
| Ningún camino asíncrono acaba sin desenlace                 | ✅     | Garantizado por el envoltorio                                     |
| Éxito y error por el toast semántico                        | ✅     | Sonner con los tokens del proyecto                                |
| Los avisos persistentes, solo para condiciones persistentes | ✅     | El error de sesión va en línea; los de archivo, en su zona        |
| Los toasts no se recortan y se leen en ambos temas          | ✅     | Usa `--popover`, medido en los dos temas                          |
| Los errores desconocidos se sanean                          | ✅     | `INTERNAL_ERROR` → texto genérico + referencia                    |
| El trabajo en segundo plano sobrevive a navegar             | ✅     | El id viaja en la URL; el sondeo para solo cuando el trabajo para |
| Una respuesta vieja no pisa a la nueva                      | ✅     | `AbortSignal` de TanStack Query en cada consulta                  |

## Navegación y responsive

| Punto                                               | Estado | Evidencia                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Como mucho dos niveles                              | ✅     | Panel: un destino. Aplicación: salida + módulos                                                                                                                                                                                       |
| Navegación reordenable y persistente                | ⚠️     | **No se implementa.** `navigation-responsive.md` la pide "cuando el producto sirve a operadores que vuelven a las mismas pantallas"; con uno a cuatro destinos no hay nada que reordenar. Se revisará si un Excel genera diez módulos |
| Solo el destino seleccionado lleva el estado activo | ✅     | `isActive` exacto por módulo                                                                                                                                                                                                          |
| Los chevrones solo en padres desplegables           | ✅     | No hay padres desplegables                                                                                                                                                                                                            |
| Escritorio y móvil exponen lo mismo                 | ✅     | El mismo componente; el móvil lo abre en cajón                                                                                                                                                                                        |
| Controles de cabecera estables y de 44px            | ✅     | Corregido en W8: eran 36 y 28                                                                                                                                                                                                         |
| Sin solapes a 320, 768, 1024, 1440 ni al 200%       | ✅     | W9: cero desborde horizontal en las cuatro anchuras y al 200%, con la acción primaria visible en todas                                                                                                                                |
| El texto largo se corta de forma predecible         | ✅     | Truncado en celdas y cabeceras; 3 tests de contenido patológico                                                                                                                                                                       |

## Rendimiento

| Punto                                        | Estado | Evidencia                                                       |
| -------------------------------------------- | ------ | --------------------------------------------------------------- |
| Listas paginadas, nada sin límite            | ✅     | Paginación de servidor en las dos tablas                        |
| Imágenes con dimensiones y carga diferida    | ⚠️     | **No hay imágenes** en todo el panel                            |
| Lo pesado y poco usado, en fragmentos aparte | ✅     | El App Router parte por ruta                                    |
| Sin cascadas de peticiones nuevas            | ✅     | Las opciones de una relación solo se piden al abrir el selector |

## Tema y accesibilidad

| Punto                                                                  | Estado | Evidencia                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Los dos temas en página, modal, popover, tooltip, toast, campo y tabla | ✅     | **40 mediciones** en `tests/contraste.test.ts`                                                                                                                                                                                                                               |
| Teclado y foco visible                                                 | ✅     | Probado en acciones de fila y diálogos; `:focus-visible` global                                                                                                                                                                                                              |
| Jerarquía de encabezados y puntos de referencia                        | ✅     | Un `h1` por vista; `main` en el armazón                                                                                                                                                                                                                                      |
| El estado no se transmite solo con color                               | ✅     | `StatusBadge` siempre con icono o punto; `Sí`/`No` con palabra                                                                                                                                                                                                               |
| Contraste 4.5:1 y 3:1                                                  | ✅     | Medido, no estimado. Dos fallos encontrados y corregidos                                                                                                                                                                                                                     |
| Objetivos táctiles de 44px                                             | ⚠️     | Cabecera y navegación, sí. **Las acciones de fila miden 32px**: a 44 la fila crecería un 40% y una tabla de veinticinco dejaría de caber, que es lo que `interface-design.md` pide evitar. La regla habla de acciones _sueltas_; la fila entera, mucho más alta, es pulsable |
| Movimiento reducido respetado                                          | ⚠️     | Solo hay dos animaciones —el giro de espera y el latido de "en curso"— y ninguna es decorativa: ambas comunican que algo ocurre. `prefers-reduced-motion` se revisará si entra alguna transición de adorno                                                                   |

## Evidencia de verificación

| Punto                                                          | Estado | Evidencia                                                           |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| Tests de unidad y componente                                   | ✅     | 181 en el panel, 366 en la API                                      |
| El flujo crítico con una prueba de integración                 | ✅     | CA-01…CA-18 en Chromium, contra la API y PostgreSQL reales          |
| Capturas de escritorio y móvil                                 | ✅     | Cinco, en `apps/web/e2e/capturas/`, una por anchura más la del 200% |
| Sin errores nuevos en consola ni avisos de hidratación         | ✅     | Vigilado durante todo el recorrido; la prueba falla si aparece uno  |
| Lint, tipos, test y build                                      | ✅     | `corepack pnpm verify` en verde                                     |
| Crear, editar, detalle y eliminar contra el backend real       | ✅     | W3, W5, W6 y W7, no contra dobles                                   |
| Cada criterio pedido, reportado como cumplido o como excepción | ✅     | Este documento                                                      |

---

## Los cuatro puntos que W8 no pudo cerrar

Quedaron pendientes por no tener navegador: el comportamiento visual a 320/768/1024/1440 y
al 200%, los desbordes en móvil, las capturas y la consola limpia. **Los cuatro se cerraron
en W9**, y la sospecha de W8 resultó fundada: poner la clase correcta y verla funcionar son
dos cosas distintas.

"Sin solapes" se convirtió en algo comprobable: **el documento no puede desbordar
horizontalmente**. Si `scrollWidth` supera el ancho de la ventana hay contenido fuera de la
pantalla, y en un móvil eso es contenido inalcanzable.

A 320px desbordaba **70px**, por dos causas que se sumaban:

1. `SidebarInset` y su contenedor no llevaban `min-w-0`, y un hijo flexible no encoge por
   debajo del ancho de su contenido a menos que se le diga. La tabla empujaba el panel
   entero aunque ya tuviera su propio scroll horizontal.
2. El grupo derecho del pie de paginación no envolvía: etiqueta, selector, cuatro saltos y
   la posición suman unos 330px que no pueden encoger, dentro de 256px disponibles.

## Hallazgos de esta auditoría

1. **Dos pares de color por debajo del umbral**, encontrados midiendo. El borde de los
   campos estaba en 1,31:1 cuando WCAG 1.4.11 le exige 3:1 —es el límite del control, no
   un adorno— y el texto del botón destructivo en tema oscuro, en 3,58:1.
2. **El rojo destructivo tenía dos trabajos opuestos** en tema oscuro: fondo de botón y
   color de texto de error. Un rojo oscuro para llevar texto blanco es ilegible como
   texto; uno claro no contrasta con el blanco. Se resolvió invirtiendo el texto del botón
   —rojo claro, texto oscuro— en vez de partir el token.
3. **Un botón sin nombre accesible**, de impacto crítico: el selector de "Filas" del pie.
   La palabra visible era un hermano, no su etiqueta. Lo encontró `axe`, no una revisión.
4. **Objetivos táctiles por debajo de 44px** en cabecera y navegación.
5. **Sin truncado** en el nombre del proyecto ni en las cabeceras de columna, y el backend
   admite 120 caracteres en ambos.
