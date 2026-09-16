# Technical Debt

## Active Debt

| Item                                                       | Impact                                                                                                                                                                                                                           | Owner    | Target                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ |
| Calidad de la propuesta del motor de inferencia sin medir  | El contrato está verificado; la calidad no. Una propuesta mala produce una aplicación mala sin que ningún test lo note.                                                                                                          | Backend  | Cuando haya credenciales: `pnpm inference:check` |
| Los trabajos en segundo plano viven en el proceso          | Un reinicio del servidor mata un análisis o una importación en curso. `failOrphaned` los marca fallidos al arrancar, así que nadie se queda mirando una barra parada, pero hay que repetirlos.                                   | Backend  | Una cola real necesita un ADR                    |
| Cuotas y limitación de tasa en memoria                     | Con varias instancias cada una lleva su propio contador, así que los límites se multiplican por el número de réplicas.                                                                                                           | Backend  | Antes de desplegar más de una instancia          |
| Borrar una cuenta deja su schema huérfano                  | `Project` cae en cascada con `User`, pero el schema `proj_*` no: solo lo elimina `DELETE /api/projects/:id`, que pasa por el materializador. Hoy no hay forma de borrar una cuenta desde el producto, así que es latente.        | Backend  | Cuando exista administración de cuentas          |
| Un archivo mayor que el límite da `500` a través del proxy | La API responde `413` correctamente cuando se le habla directo; la reescritura de Next convierte en `500` una respuesta temprana del upstream. El cliente valida el tamaño antes de enviar, así que por la interfaz no se llega. | Frontend | Solo si aparece por otra vía                     |

## Rules

- Debt must describe impact, not just discomfort.
- Debt discovered during implementation should be linked to the relevant plan.
- Critical debt should become an active plan.
