/**
 * Fechas sin zona horaria.
 *
 * Una fecha de calendario —el dia de un viaje— no tiene hora ni zona: es
 * "1 de septiembre de 2026" y punto. En cuanto se mete en un `Date` y se saca
 * con `toISOString()`, JavaScript la convierte a UTC y, al oeste de Greenwich,
 * la retrasa un dia.
 *
 * Eso ya paso una vez en este proyecto: en F6 el backend guardaba `01/09/26`
 * como `2026-08-31` porque `node-postgres` serializaba el `Date` en hora local.
 * Se arreglo alli haciendo que las fechas de calendario viajaran como texto. El
 * cliente tiene que respetar el mismo trato, o lo reintroduce.
 *
 * Por eso estas dos funciones leen y escriben **las partes locales** del `Date`,
 * nunca su instante.
 */

/** `Date` -> `YYYY-MM-DD`, usando el calendario local. */
export function aFechaTexto(fecha: Date): string {
  const anio = String(fecha.getFullYear()).padStart(4, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** `YYYY-MM-DD` -> `Date` a medianoche local. */
export function deFechaTexto(texto: string | null | undefined): Date | undefined {
  if (!texto) return undefined;

  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (!partes) return undefined;

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  // El constructor con tres argumentos construye en local. `new Date(texto)`
  // interpretaria `YYYY-MM-DD` como UTC, que es justo el fallo que se evita.
  const fecha = new Date(anio, mes - 1, dia);

  // `new Date(2026, 12, 45)` no falla: desborda en silencio a febrero de 2027.
  // Una fecha corrupta que se convierte en otra fecha valida es peor que un
  // error, porque nadie la ve. Se comprueba que las partes salgan como
  // entraron.
  const desbordo =
    fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia;

  return desbordo ? undefined : fecha;
}
