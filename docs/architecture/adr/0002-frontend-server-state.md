# ADR 0002: TanStack Query para el estado del servidor

## Status

Accepted — 2026-09-15

## Context

`docs/architecture/stack.md` fija Next.js, React, Tailwind, shadcn/ui, React Hook Form y Zod,
pero **no nombra ninguna libreria para el estado del servidor**. `docs/architecture/frontend.md`
si describe lo que hace falta: _"typed query/mutation helpers with cancellation and
invalidation"_. Queda por decidir quien lo implementa.

El panel tiene tres exigencias que estrechan mucho la eleccion:

1. **Sondeo de trabajos.** El analisis y la construccion corren en segundo plano y la interfaz
   sigue su avance por `GET /projects/:id/jobs/:jobId`. Hay que consultar cada segundo mientras
   el estado sea `queued` o `running`, y parar en cuanto deje de serlo.
2. **Invalidacion tras cada mutacion.** La aplicacion generada es un CRUD: crear un registro
   tiene que refrescar su lista, y borrar uno que otros usan tiene que reflejar el rechazo.
3. **Cancelacion.** Buscar en una tabla con debounce lanza peticiones que se solapan; la
   respuesta de una busqueda vieja no puede pisar a la nueva.

La alternativa considerada fue **React Server Components con Server Actions**: menos JavaScript
en el cliente y ninguna dependencia nueva. Se descarto por (1): revalidar una ruta entera cada
segundo para mover una barra de progreso es mucho peor que una consulta con sondeo, y el CRUD
optimista de la aplicacion generada queda torpe sin cache de cliente.

## Decision

Usar **TanStack Query v5** para todo el estado del servidor en `apps/web`, con un unico cliente
creado por arbol de React en `app/providers.tsx`.

Politica de reintentos, que es donde una configuracion por defecto haria dano: **no se reintenta
nada por debajo de 500**. Un `409` de cuota, un `404` o un `403` no mejoran repitiendolos, y
reintentar un `401` solo retrasa el momento de volver a pedir la sesion. Las mutaciones no se
reintentan nunca: no todas son idempotentes.

Server Components se siguen usando para lo que son buenos —estructura, metadatos, redirecciones
por estado— pero no para datos que cambian.

## Consequences

- Sondeo, invalidacion y cancelacion resueltos por la libreria y no a mano en cada pantalla.
- Un sitio unico donde vive la politica de reintentos, en vez de un `catch` por componente.
- Una dependencia mas en el cliente, y una desviacion de `stack.md` que este ADR registra.
- El cliente se crea dentro de `useState`, nunca a nivel de modulo: en el servidor, un cliente
  compartido entre peticiones filtraria la cache de una persona a otra.
- Seguimiento: si `stack.md` se actualiza alguna vez, deberia recoger esta eleccion en vez de
  dejar el hueco que la obligo.
