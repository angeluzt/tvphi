// Igualar el brillo entre fotogramas de una foto viva.
//
// EL PROBLEMA QUE RESUELVE. Al pedir N variaciones de la misma foto, el modelo
// no devuelve la misma exposición: una sale medio paso más clara, la siguiente
// un poco más fría. Cada una por separado está bien. Puestas a 6 por segundo,
// eso NO se lee como «el agua se mueve», se lee como que la imagen ENTERA
// parpadea, que es mucho más molesto que la animación que se buscaba —y tapa
// por completo el movimiento pequeño que sí hay.
//
// Y con los fotogramas encadenados —cada uno dibujado a partir del anterior—
// el problema se agrava: la deriva se acumula, así que el último cuadro puede
// estar bastante más claro que el primero y el salto al cerrar el bucle es el
// mayor de todo el ciclo.
//
// EL PATRÓN ES SIEMPRE EL PRIMER FOTOGRAMA, que es la foto de la escena: la que
// la persona miró y aprobó. Así la animación no deriva hacia otra iluminación
// distinta de la imagen que se eligió.

/** Hasta dónde se corrige. Por encima, el cambio de luz probablemente es real. */
export const GANANCIA_MIN = 0.8;
export const GANANCIA_MAX = 1.25;

/**
 * El brillo medio de un fotograma, 0–255.
 *
 * Se muestrea uno de cada `salto` píxeles: para saber si una imagen entera está
 * medio paso más clara no hacen falta los dos millones, y recorrerlos todos por
 * cada fotograma congela la pestaña justo mientras la persona está esperando.
 */
export function mediaDeLuma(datos: ArrayLike<number>, salto = 16): number {
  const paso = Math.max(1, Math.floor(salto)) * 4;
  let suma = 0;
  let n = 0;
  for (let i = 0; i + 2 < datos.length; i += paso) {
    // Luma de la tele: el ojo pesa mucho más el verde que el azul, y una media
    // plana de RGB llamaría «igual de claras» a dos imágenes que no lo parecen.
    suma += 0.2126 * datos[i] + 0.7152 * datos[i + 1] + 0.0722 * datos[i + 2];
    n++;
  }
  return n ? suma / n : 0;
}

/**
 * Por cuánto multiplicar este fotograma para que iguale al patrón.
 *
 * El tope existe porque a veces el cambio de luz es de verdad —una llama que
 * crece ilumina de más— y aplastarlo del todo mataría justo lo que se quería
 * animar. Esto corrige la deriva del modelo, no la animación.
 */
export function gananciaHaciaPatron(patron: number, medida: number): number {
  // Una imagen casi negra no tiene brillo que igualar: patrón/0 daría infinito
  // y dejaría el fotograma en blanco.
  if (!Number.isFinite(patron) || patron <= 1) return 1;
  if (!Number.isFinite(medida) || medida <= 1) return 1;
  return Math.max(GANANCIA_MIN, Math.min(GANANCIA_MAX, patron / medida));
}

/** ¿Merece la pena repintar? Por debajo de esto no se ve y cuesta un lienzo. */
export const NOTABLE = 0.02;

export const derivaNotable = (g: number) => Math.abs(g - 1) > NOTABLE;
