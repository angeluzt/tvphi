// Cuánto puede sonar todo lo que NO es la voz.
//
// EL PROBLEMA. La narración es lo único que hay que entender, y es lo que
// suena más bajo: un TTS ronda los -20 dBFS y la biblioteca está masterizada a
// -14. Con esa diferencia, un golpe a 0.8 no «acompaña» al rayo: se lo come
// todo, y para cuando se oye ya está pagado el capítulo entero.
//
// LA REGLA. Todo lo que no es voz vive entre el 4% y el 12%. El 12% es para lo
// más fuerte que puede pasar —la explosión, el trueno—, el 4% para el fondo que
// solo tiene que estar ahí, y en medio se mueve el resto. No es un tope: es el
// rango entero, así que un ambiente al 12% y otro al 4% siguen sonando
// distinto, que es lo que hace falta para que la mezcla tenga relieve.
//
// POR QUÉ AQUÍ Y NO SOLO EN EL PROMPT. Se le pide al modelo, sí. Pero pedir no
// es garantizar, y esto ya pasó con la música: el prompt decía 0.12 y llegaba
// 0.3. Un número mal puesto en el JSON se oye en el vídeo, y a esas alturas ya
// no hay vuelta atrás sin volver a pagar.

/** Lo más alto que puede sonar un golpe. */
export const VOL_SONIDO_MAX = 0.12;
/** Lo más bajo que tiene sentido: por debajo no se oye y sobra. */
export const VOL_SONIDO_MIN = 0.04;
/** El de en medio, cuando no hay nada que respetar. */
export const VOL_SONIDO_MEDIO = 0.08;

const RANGO = VOL_SONIDO_MAX - VOL_SONIDO_MIN;

/**
 * Deja un volumen dentro del rango, CONSERVANDO lo fuerte que quería ser.
 *
 * Recortar a secas sería lo fácil y lo peor: un capítulo con golpes a 0.9, 0.6
 * y 0.3 quedaría con los tres a 0.12, o sea todo igual de fuerte y la mezcla
 * plana. Lo que se hace con lo que se pasa es traducirlo: se lee como «lo
 * fuerte que quería sonar, de 0 a 1» y se reparte por el rango bueno. Así 0.9
 * sigue sonando por encima de 0.3 después de la corrección.
 *
 * Lo que ya viene dentro del rango no se toca: si el modelo hizo caso, su
 * decisión vale más que la nuestra.
 */
export function acotarVolumen(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return VOL_SONIDO_MEDIO;
  if (n <= 0) return 0; // apagado a propósito: eso sí se respeta tal cual
  if (n < VOL_SONIDO_MIN) return VOL_SONIDO_MIN;
  if (n <= VOL_SONIDO_MAX) return n;
  return Math.round((VOL_SONIDO_MIN + Math.min(1, n) * RANGO) * 1000) / 1000;
}

/** ¿Este número se sale del rango? Sirve para contar sin volver a acotar. */
export function fueraDeRango(v: unknown): boolean {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return true;
  if (n <= 0) return false;
  return n < VOL_SONIDO_MIN || n > VOL_SONIDO_MAX;
}

interface CapituloConSonido {
  audioLayers?: { volume?: unknown }[];
  scenes?: {
    shots?: {
      sfx?: { volume?: unknown }[];
      audioOverrides?: { volume?: unknown }[];
    }[];
  }[];
}

/**
 * Pasa por el rango TODO lo que suena en el capítulo y dice cuánto tocó.
 *
 * Se llama sobre lo que devuelve la IA, no sobre lo que edita alguien: quien
 * mueve una barra a mano está decidiendo, y eso no se le pisa.
 */
export function acotarSonidosCapitulo(project: CapituloConSonido): { tocados: number } {
  let tocados = 0;
  const arreglar = (o: { volume?: unknown }) => {
    // Un override con volume null significa «no cambies el volumen»; tocarlo
    // convertiría un simple «para este sonido» en un cambio de mezcla.
    if (o.volume == null) return;
    if (fueraDeRango(o.volume)) tocados++;
    o.volume = acotarVolumen(o.volume);
  };

  for (const l of project.audioLayers ?? []) arreglar(l);
  for (const sc of project.scenes ?? []) {
    for (const sh of sc.shots ?? []) {
      for (const s of sh.sfx ?? []) arreglar(s);
      for (const o of sh.audioOverrides ?? []) arreglar(o);
    }
  }
  return { tocados };
}

/** Lo que se le dice al modelo, escrito una vez y usado en todos los sitios. */
export function reglaDeVolumen(): string {
  return `Todo lo que no es la voz va entre ${VOL_SONIDO_MIN} y ${VOL_SONIDO_MAX}: `
    + `${VOL_SONIDO_MAX} para lo más fuerte que pasa en el capítulo (una explosión, un trueno), `
    + `${VOL_SONIDO_MIN} para el fondo que solo tiene que estar ahí, y el resto repartido por en medio. `
    + `NUNCA 0.8 ni 0.3: la narración suena más bajo que la biblioteca y cualquier número por encima de ${VOL_SONIDO_MAX} la tapa. `
    + "Reparte de verdad: si todos los sonidos llevan el mismo número, la mezcla sale plana.";
}
