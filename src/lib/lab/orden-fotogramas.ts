// Reordenar, borrar y duplicar los fotogramas de un sprite ya generado.
//
// EL PROBLEMA. El modelo casi siempre dibuja los cuadros bien, pero no siempre
// EN ORDEN: un ciclo de caminar sale con el paso 3 antes que el 2, o repite dos
// veces la misma pose y se salta otra. Hasta ahora eso obligaba a tirar la
// imagen entera y volver a generarla —a pagarla otra vez— para arreglar algo
// que ya estaba dibujado y solo estaba mal colocado.
//
// LO QUE HAY QUE MOVER SON DOS COSAS A LA VEZ. El fotograma recortado y la
// CELDA de la que salió viajan en dos listas paralelas, y lo que se guarda son
// las dos. Mover una y no la otra deja un sprite que se ve bien en la tira y se
// recorta mal al reabrirlo: el fallo aparece un día después y no hay forma de
// relacionarlo con esto. Por eso aquí no se mueven fotogramas, se mueven PARES.
//
// No sabe nada del canvas ni de React: entra una lista, sale otra.

/** Un fotograma y la celda de la hoja de la que se recortó, juntos. */
export interface ParFotograma<F, C> {
  foto: F;
  celda: C;
}

/** Empareja las dos listas. Sobra lo que no tenga pareja: no se puede guardar. */
export function emparejar<F, C>(fotos: F[], celdas: C[]): ParFotograma<F, C>[] {
  const n = Math.min(fotos.length, celdas.length);
  return Array.from({ length: n }, (_, i) => ({ foto: fotos[i], celda: celdas[i] }));
}

/** Y las separa otra vez, en el mismo orden. */
export function separar<F, C>(pares: ParFotograma<F, C>[]): { fotos: F[]; celdas: C[] } {
  return { fotos: pares.map((p) => p.foto), celdas: pares.map((p) => p.celda) };
}

/**
 * Mueve el fotograma `i` una posición hacia `d`.
 *
 * Fuera de rango devuelve la MISMA lista, no una copia: quien llama compara por
 * identidad para saber si hace falta recomponer la tira, que es una operación
 * cara. Devolver siempre una copia haría que cada clic en un botón apagado
 * volviera a componer la imagen.
 */
export function mover<T>(lista: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return lista;
  const n = [...lista];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

/** Lleva el fotograma `i` hasta la posición `j`, empujando el resto. */
export function llevarA<T>(lista: T[], i: number, j: number): T[] {
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length || i === j) return lista;
  const n = [...lista];
  const [x] = n.splice(i, 1);
  n.splice(j, 0, x);
  return n;
}

/**
 * Quita el fotograma `i`.
 *
 * Nunca deja la lista vacía: un sprite sin fotogramas no es un sprite, y la
 * ruta que guarda lo rechazaría con un error de esquema después de haber
 * llegado hasta aquí.
 */
export function quitar<T>(lista: T[], i: number): T[] {
  if (lista.length <= 1 || i < 0 || i >= lista.length) return lista;
  return lista.filter((_, k) => k !== i);
}

/**
 * Duplica el fotograma `i`, justo detrás.
 *
 * Sirve para alargar una pose —una pausa dentro del ciclo— sin volver a
 * dibujar nada. El tope es el mismo que admite la hoja al guardarse.
 */
export function duplicar<T>(lista: T[], i: number, tope = 24): T[] {
  if (i < 0 || i >= lista.length || lista.length >= tope) return lista;
  const n = [...lista];
  n.splice(i + 1, 0, lista[i]);
  return n;
}

/** Da la vuelta al ciclo entero. Un «vuelve por donde vino» en un clic. */
export function invertir<T>(lista: T[]): T[] {
  return lista.length < 2 ? lista : [...lista].reverse();
}

/**
 * Los índices que se repiten, para poder señalarlos.
 *
 * Se compara por la CLAVE que dé quien llama. Es la comparación EXACTA; para
 * poses que el modelo redibujó parecidas pero no idénticas hace falta
 * `parecidos`, más abajo.
 */
export function repetidos<T>(lista: T[], clave: (x: T) => string): number[] {
  const vistos = new Map<string, number>();
  const fuera: number[] = [];
  lista.forEach((x, i) => {
    const k = clave(x);
    if (vistos.has(k)) fuera.push(i);
    else vistos.set(k, i);
  });
  return fuera;
}

/**
 * Cuántos puntos se diferencian dos firmas visuales.
 *
 * Las firmas son cadenas de «0» y «1» del mismo largo —una miniatura del
 * fotograma reducida a claro/oscuro—. De distinto largo no se pueden comparar
 * y se devuelve el peor caso, que es lo prudente: mejor no señalar nada que
 * señalar como repetido algo que no lo es.
 */
export function distancia(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Los fotogramas que se PARECEN demasiado a uno anterior.
 *
 * Comparar los PNG byte a byte no sirve: cuando el modelo repite una pose casi
 * nunca la dibuja idéntica —cambia un píxel del pelo y ya son dos imágenes
 * distintas—, así que `repetidos` no encontraría ninguna y el aviso no saltaría
 * jamás. Por eso se compara la firma visual con holgura.
 *
 * Se señala el segundo y los siguientes, nunca el primero, porque lo que se
 * ofrece es borrar lo que sobra.
 */
export function parecidos(firmas: string[], umbral = 5): number[] {
  return aQueSeParece(firmas, umbral)
    .map((a, i) => (a === null ? -1 : i))
    .filter((i) => i >= 0);
}

/** Y a cuál se parece cada uno, para poder decir «igual que el 3». */
export function aQueSeParece(firmas: string[], umbral = 5): (number | null)[] {
  const guardados: { firma: string; i: number }[] = [];
  return firmas.map((f, i) => {
    const igual = guardados.find((g) => distancia(g.firma, f) <= umbral);
    if (igual) return igual.i;
    guardados.push({ firma: f, i });
    return null;
  });
}
