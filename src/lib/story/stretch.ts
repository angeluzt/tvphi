// Estirar o encoger un audio SIN cambiar el tono (WSOLA).
//
// Para qué: la voz IA (MMS-TTS) no deja pedirle que lea más rápido o más
// despacio — se comprobó en el código de transformers.js: la tubería de
// text-to-speech no acepta ni un parámetro. Lo único que queda es tocar el
// audio ya generado.
//
// Acelerarlo a secas (playbackRate) cambia también el tono: más rápido suena a
// ardilla. Aquí se hace lo otro: se recorta o se repite el audio por trozos,
// solapándolos, de forma que la voz dura otra cosa pero sigue sonando igual de
// grave o de aguda.
//
// Y combinándolo con playbackRate se consigue lo contrario, que es lo que da
// "voces distintas": cambiar el tono SIN cambiar la duración. Para un tono P y
// una velocidad S se estira por P/S y se reproduce a P:
//     duración final = original · (P/S) / P = original / S      (solo S manda)
//     tono final     = original · P                             (solo P manda)
//
// WSOLA en vez de un solapado a ciegas: antes de pegar cada trozo se busca, en
// un margen pequeño, el sitio donde mejor casa con lo ya escrito. Sin eso las
// ondas se pelean al sumarse y la voz sale con un temblor metálico.

const VENTANA = 1024; // muestras por trozo
const SALTO = VENTANA / 2; // se solapa la mitad: con Hann, la suma queda plana
const BUSQUEDA = 384; // cuánto se puede mover un trozo para que case
const PASO_BUSQUEDA = 2; // se mira de dos en dos: la mitad de cuentas, igual de bien

// Hann. Con salto = ventana/2, dos ventanas consecutivas suman 1 exactamente.
function hann(n: number) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}
const VENTANA_HANN = hann(VENTANA);

// Estira un canal por el factor dado (2 = dura el doble, 0.5 = la mitad).
export function stretchChannel(src: Float32Array, factor: number): Float32Array {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.005 || src.length < VENTANA * 2) {
    return src;
  }
  const salida = new Float32Array(Math.max(VENTANA, Math.round(src.length * factor)));
  // Por cada SALTO de salida se avanza SALTO/factor en la entrada.
  const avance = SALTO / factor;

  let escritos = 0; // dónde se escribe el siguiente trozo
  let leidos = 0; // de dónde se lee (posición ideal, sin ajustar)
  // Cola de lo último escrito: es contra lo que se busca el mejor encaje.
  let anterior = -1;

  while (escritos + VENTANA <= salida.length) {
    let desde = Math.round(leidos);
    if (desde + VENTANA > src.length) break;

    // WSOLA: se mueve el trozo dentro de ±BUSQUEDA buscando el mayor parecido
    // con la mitad que ya está escrita, para que al solaparse no se cancelen.
    if (anterior >= 0) {
      let mejor = desde;
      let mejorPunt = -Infinity;
      const ini = Math.max(0, desde - BUSQUEDA);
      const fin = Math.min(src.length - VENTANA, desde + BUSQUEDA);
      for (let c = ini; c <= fin; c += PASO_BUSQUEDA) {
        let punt = 0;
        // Solo se compara el trozo que de verdad se va a solapar.
        for (let i = 0; i < SALTO; i += 2) punt += src[c + i] * src[anterior + SALTO + i];
        if (punt > mejorPunt) { mejorPunt = punt; mejor = c; }
      }
      desde = mejor;
    }

    for (let i = 0; i < VENTANA; i++) salida[escritos + i] += src[desde + i] * VENTANA_HANN[i];

    anterior = desde;
    escritos += SALTO;
    leidos += avance;
  }
  return salida;
}

// Estira un AudioBuffer entero. Devuelve el mismo si no hay nada que hacer.
export function stretchBuffer(ctx: BaseAudioContext, buf: AudioBuffer, factor: number): AudioBuffer {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.005) return buf;
  const canales: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) {
    canales.push(stretchChannel(buf.getChannelData(c), factor));
  }
  const largo = Math.max(1, ...canales.map((c) => c.length));
  const salida = ctx.createBuffer(buf.numberOfChannels, largo, buf.sampleRate);
  // copyToChannel es tiquismiquis con el tipo del buffer subyacente.
  for (let c = 0; c < canales.length; c++) salida.getChannelData(c).set(canales[c]);
  return salida;
}
