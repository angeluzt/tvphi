// Seguir donde se quedó, en vez de repintarlo todo.
//
// LO QUE PASABA. Al darle a «generar y montar» se vaciaba la lista de capas
// hechas y se recorrían TODAS otra vez. Si la tercera de cinco fallaba —un
// tiempo agotado, un magenta que se coló, la plataforma cortando en calidad
// alta— la única salida era volver a empezar: se pagaban de nuevo las dos que
// ya habían salido bien y se perdían las que estaban. Con cinco capas en
// calidad alta eso es tirar la mitad del dinero cada vez que algo falla, y en
// calidad alta algo falla a menudo.
//
// LA IDEA es tonta pero hay que escribirla en algún sitio: una capa dibujada es
// un resultado que ya se pagó, y lo que se pagó no se tira. La lista de hechas
// deja de vaciarse y pasa a ser el registro de lo que ya hay; el bucle solo
// recorre lo que falta.
//
// POR QUÉ SE COMPARA POR `id` Y NO POR POSICIÓN. Entre un intento y otro se
// puede haber tocado el mapa —añadir una capa, borrar otra, reordenarlas—. Con
// el índice, insertar una capa al principio haría que todas las siguientes se
// dieran por hechas con el dibujo de la de al lado. El id del mapa es lo único
// que sigue significando lo mismo.

/** Lo mínimo que hace falta saber de una capa para decidir si toca dibujarla. */
export interface CapaPendiente {
  id: string;
  name: string;
}

/** Y de una ya dibujada. */
export interface CapaHecha {
  id: string;
}

/** Las que todavía no están, en su orden original. */
export function pendientesDe<T extends CapaPendiente>(
  visibles: T[],
  hechas: CapaHecha[],
): T[] {
  const ya = new Set(hechas.map((h) => h.id));
  return visibles.filter((c) => !ya.has(c.id));
}

/**
 * Las hechas que siguen sirviendo.
 *
 * Si una capa desapareció del mapa, su dibujo ya no vale para nada: dejarlo
 * colado haría que el montaje llevara una capa que el mapa no conoce, y peor,
 * que `pendientesDe` la contara como hecha para siempre.
 */
export function hechasVigentes<H extends CapaHecha>(
  hechas: H[],
  visibles: CapaPendiente[],
): H[] {
  const existen = new Set(visibles.map((c) => c.id));
  return hechas.filter((h) => existen.has(h.id));
}

/** Quita una del registro, para poder rehacer solo esa. */
export function paraRehacer<H extends CapaHecha>(hechas: H[], id: string): H[] {
  return hechas.filter((h) => h.id !== id);
}

/**
 * Qué decirle al usuario en el botón.
 *
 * Importa que diga CUÁNTAS faltan y no «reintentar»: lo que hay que responder
 * antes de pulsar es «¿esto me va a cobrar cinco imágenes o una?».
 */
export function textoDelBoton(pendientes: number, total: number): string {
  if (!total) return "2 · Generar y montar todo";
  if (!pendientes) return "2 · Montar (ya están todas dibujadas)";
  if (pendientes === total) return `2 · Generar y montar todo · ${total} imágenes`;
  return `2 · Continuar: faltan ${pendientes} de ${total}`;
}

/** Y el aviso de lo que se conserva, que es lo que quita el miedo a pulsar. */
export function avisoDeReanudar(pendientes: number, total: number): string | null {
  const hechas = total - pendientes;
  if (!hechas || !pendientes) return null;
  return `${hechas} ${hechas === 1 ? "capa ya dibujada se conserva" : "capas ya dibujadas se conservan"}`
    + ` y no se vuelven a pagar. Solo se ${pendientes === 1 ? "genera la que falta" : `generan las ${pendientes} que faltan`}.`;
}
