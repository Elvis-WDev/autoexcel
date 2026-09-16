/**
 * Singular aproximado en espanol.
 *
 * El plural se forma anadiendo "s" tras vocal y "es" tras consonante, asi que
 * deshacerlo exige mirar que hay antes de la terminacion:
 *
 *   conductores -> conductor    (quitar "es": la raiz acaba en consonante)
 *   camiones    -> camion
 *   viajes      -> viaje        (quitar solo "s": la raiz acaba en vocal)
 *   clientes    -> cliente
 *   luces       -> luz
 *
 * Es una heuristica, no una gramatica. Basta para las frases del asistente y no
 * justifica ni un diccionario ni una llamada a un modelo: una frase mal generada
 * en el paso donde la persona decide si confia en el sistema cuesta mas de lo
 * que vale.
 *
 * Vive en el dominio porque la usan tanto las explicaciones de las ediciones
 * como la descripcion de las relaciones, y una divergencia entre ambas se
 * notaria enseguida.
 */
export function singularize(word: string): string {
  if (/ces$/i.test(word)) return `${word.slice(0, -3)}z`;
  // Solo estas consonantes admiten el plural en "es" en la practica.
  if (/[rnldz]es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}
