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
export function singularize(frase: string): string {
  /*
   * "Plan de Cuentas" es UN plan, no UNA cuenta.
   *
   * En espanol el nucleo de un sintagma nominal va delante: "plan de cuentas",
   * "orden de compra", "forma de pago". Si se mira la ultima palabra se acaba
   * escribiendo "una plan de cuenta", que fue justo lo que salio al probar con
   * un libro de contabilidad real. Se singulariza la cabeza y se deja el resto.
   */
  const espacio = frase.indexOf(' ');
  if (espacio > 0) {
    return `${singularizarPalabra(frase.slice(0, espacio))}${frase.slice(espacio)}`;
  }
  return singularizarPalabra(frase);
}

function singularizarPalabra(word: string): string {
  if (/ces$/i.test(word)) return `${word.slice(0, -3)}z`;

  // Solo estas consonantes admiten el plural en "es" en la practica.
  if (/[rnldz]es$/i.test(word)) {
    const sinLasDos = word.slice(0, -2);

    /*
     * Pero "responsables" no es el plural de "responsabl".
     *
     * Una palabra espanola no puede terminar en dos consonantes. Si al quitar
     * "es" queda un grupo asi, es que el singular no acababa en consonante sino
     * en "-e", y solo habia que quitar la "s":
     *
     *   responsables -> responsabl?  "bl" es imposible  -> responsable
     *   detalles     -> detall?      "ll" es imposible  -> detalle
     *   hombres      -> hombr?       "br" es imposible  -> hombre
     *   conductores  -> conductor    "or" es posible    -> conductor
     *
     * Se encontro con una propuesta real: el asistente decia "Cada gasto
     * pertenece a un responsabl".
     */
    if (/[^aeiouáéíóúü][^aeiouáéíóúü]$/i.test(sinLasDos)) return word.slice(0, -1);
    return sinLasDos;
  }

  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Genero aproximado, para concordar el articulo.
 *
 * Sin esto el asistente escribe "un ciudad" y "varios facturas". No hay forma
 * de acertar siempre —"el dia", "el problema" y "el mapa" son masculinos y
 * acaban en "a"— pero las etiquetas que llegan aqui son nombres de entidades de
 * negocio, donde la terminacion acierta casi siempre.
 *
 * Las terminaciones de la segunda lista son femeninas sin excepcion practica:
 * "-cion", "-sion", "-dad", "-tad", "-tud" y "-umbre".
 */
export function isFeminine(singular: string): boolean {
  // El genero lo decide la cabeza del sintagma, por lo mismo que el singular.
  const palabra = (singular.split(' ')[0] ?? singular).toLowerCase();

  if (/(cion|sion|dad|tad|tud|umbre)$/.test(palabra)) return true;
  return /a$/.test(palabra);
}

/** `un`/`una`, `varios`/`varias`: el articulo que concuerda con la palabra. */
export function indefiniteArticle(singular: string): 'un' | 'una' {
  return isFeminine(singular) ? 'una' : 'un';
}

export function severalOf(singular: string): 'varios' | 'varias' {
  return isFeminine(singular) ? 'varias' : 'varios';
}
