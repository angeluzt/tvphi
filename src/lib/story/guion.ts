import { topeSfx } from "./volumen-sfx";

// Quitar de la narración lo que no es la historia.
//
// Esto existe por un fallo real: se generó un capítulo y las voces acababan
// diciendo «¿te gustó cómo quedó?». El texto que va en "text" se lee TAL CUAL
// en el video, así que una frase de relleno ahí no es un detalle: es un vídeo
// arruinado que además ya se ha pagado.
//
// Se pide en el prompt, sí. Pero un prompt es una petición, no una garantía, y
// esto se ejecuta sobre la salida de un modelo que no controlamos. Aquí se
// comprueba.
//
// Regla de oro al tocar esto: ante la duda, NO se borra. Perder una frase de la
// historia es peor que dejar pasar una de relleno, porque lo segundo se ve al
// escuchar y lo primero deja un agujero que nadie nota hasta el final.

// Frases que no pertenecen a ninguna historia: son de presentador de vídeo.
// Solo cosas que NUNCA diría un narrador dentro de un cuento.
const META = [
  // Pedir opinión SOBRE EL PROPIO VÍDEO. Un personaje puede preguntar
  // «¿te gusta el mar?» y eso es historia, así que hace falta que se refiera a
  // la cosa: cómo quedó, el vídeo, la historia, la toma.
  // OJO: aquí no vale \w. En JavaScript \w es solo ASCII, así que «gustó» no
  // encajaba y la frase del fallo real se colaba entera. Con \S sí.
  /¿\s*(te|os|les)\s+(gust|pareci)\S*\s+(c[oó]mo\s+qued|el\s+v[ií]deo|la\s+historia|la\s+toma|el\s+audio|esto|as[ií])/i,
  /¿\s*(qué|que)\s+(te|os|les)\s+(pareci|ha\s+parecid)\S*\s*\??$/i,
  /\bhow\s+did\s+you\s+like\s+(it|the\s+video)\b/i,
  // Despedidas y cierres de canal
  /espero\s+que\s+(te|os|les)\s+(haya|hayan)?\s*gustad/i,
  /gracias\s+por\s+(ver|escuchar|acompañar)/i,
  /hasta\s+(la\s+pr[oó]xima|el\s+pr[oó]ximo)/i,
  /no\s+olvides\s+(suscribirte|comentar|dar)/i,
  /\bsuscr[ií]b/i,
  /d[ae]le\s+like/i,
  /thanks\s+for\s+watching/i,
  /don'?t\s+forget\s+to\s+subscribe/i,
  /hope\s+you\s+(enjoyed|liked)/i,
  // Presentaciones de vídeo
  // «Bienvenidos a este canal», no «Bienvenido, dijo el guardián».
  /\bbienvenid[oa]s?\s+(a|de\s+nuevo)\s+(este|esta|un|una|mi|nuestro|nuestra|todos)/i,
  /en\s+(este|el)\s+(v[ií]deo|cap[ií]tulo)\s+(de\s+hoy|te|os|les|vamos)/i,
  /hoy\s+(te|os|les)\s+(voy\s+a\s+)?(contar|traigo|presento)/i,
  /en\s+esta\s+historia\s+(te|os|les|vamos|voy)/i,
  /\bwelcome\s+(to|back)\b/i,
  // Acotaciones y etiquetas de guion
  /^\s*(narrador|narradora|voz\s+en\s+off|escena\s+\d+|toma\s+\d+)\s*:/i,
  /^\s*\(.*\)\s*$/,
  /^\s*\[.*\]\s*$/,
  // Cierres de cuento que el usuario no pidió
  /colorín\s+colorado/i,
  /^\s*fin\s*[.!]?\s*$/i,
  /^\s*the\s+end\s*[.!]?\s*$/i,
];

// Marcas de que una frase es HISTORIA y no relleno: guiones de diálogo,
// comillas, o un verbo de decir. Un personaje puede decir casi cualquier cosa,
// incluido «gracias» o «bienvenido», y eso no se toca jamás.
//
// Esta salvaguarda es lo que evita el fallo peor: borrar un diálogo de verdad.
// Salió de la prueba, que pilló que «—¿Te gusta el mar? —preguntó ella» se
// estaba borrando.
const ES_HISTORIA = /^[—–-]|["«"']|\b(dijo|preguntó|susurró|respondió|gritó|murmuró|exclamó|contestó|repitió|añadió|pensó)\b/i;

export function esMeta(frase: string): boolean {
  const f = frase.trim();
  if (!f) return false;
  // Las acotaciones entre paréntesis o corchetes sí se van aunque lleven
  // comillas: son notas de guion, no algo que nadie diga.
  const acotacion = /^\s*[([].*[)\]]\s*$/.test(f) || /^\s*(narrador|narradora|voz\s+en\s+off)\s*:/i.test(f);
  if (!acotacion && ES_HISTORIA.test(f)) return false;
  return META.some((r) => r.test(f));
}

// Parte en frases sin romper los números («1.500») ni los puntos suspensivos.
function frases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+(?=[¿¡"'«A-ZÁÉÍÓÚÑ])/u)
    .map((f) => f.trim())
    .filter(Boolean);
}

// Devuelve la narración sin las frases de relleno. Si no queda nada, devuelve
// cadena vacía y quien llama decide (normalmente, quitar ese diálogo).
export function limpiarNarracion(texto: string): { texto: string; quitadas: string[] } {
  const partes = frases(texto);
  const quitadas: string[] = [];
  const dejar = partes.filter((f) => {
    if (esMeta(f)) { quitadas.push(f); return false; }
    return true;
  });
  return { texto: dejar.join(" ").trim(), quitadas };
}

// Quita del capítulo las frases que no son historia. SOLO toca texto: no roza
// ni una duración, ni una pausa, ni un fundido. Es seguro llamarla sobre
// cualquier cosa.
//
// Lo que sí toca tiempos vive en prepararCapituloGenerado(), aparte y con
// guardia, porque no es lo mismo corregir una frase que reescribir el montaje.
export function limpiarCapitulo(project: any): { quitadas: string[] } {
  const quitadas: string[] = [];
  for (const sc of project?.scenes ?? []) {
    for (const sh of sc?.shots ?? []) {
      if (!Array.isArray(sh?.dialogues)) continue;
      for (const d of sh.dialogues) {
        if (typeof d?.text !== "string") continue;
        const r = limpiarNarracion(d.text);
        if (r.quitadas.length) {
          quitadas.push(...r.quitadas);
          d.text = r.texto;
        }
      }
      // Un diálogo que se queda sin nada que decir sobra: si se deja, es una
      // toma muda con su pausa y sus segundos.
      sh.dialogues = sh.dialogues.filter((d: any) => (d?.text ?? "").trim().length > 0);
    }
  }
  return { quitadas };
}

// ¿Este capítulo ya está trabajado?
//
// La señal más fiable es que alguna frase tenga voz generada: en cuanto hay
// audio, las duraciones de las tomas están cuadradas contra ese audio y las
// pausas ya son decisiones de alguien. Un capítulo recién salido de la IA no
// tiene ni un audio.
function yaTrabajado(project: any): boolean {
  for (const sc of project?.scenes ?? [])
    for (const sh of sc?.shots ?? [])
      for (const d of sh?.dialogues ?? []) if (d?.audioId) return true;
  return false;
}

// Acorta pausas ABSURDAS de un capítulo RECIÉN GENERADO.
//
// La IA tiende a poner gapSec y holdSec de medio segundo largo y fundidos de un
// segundo: se oye como un documental pausado. Esto lo acerca a un ritmo de
// narración normal.
//
// NO se exporta, y es a propósito. Esto reescribe los tiempos del montaje, así
// que soltarlo sobre un capítulo que alguien ya ha ajustado le borraría el
// trabajo sin avisar. La única puerta de entrada es prepararCapituloGenerado(),
// que además comprueba que el capítulo no esté ya trabajado.
function ritmarCapitulo(project: any) {
  for (const sc of project?.scenes ?? []) {
    for (const sh of sc?.shots ?? []) {
      const hold = Number(sh.holdSec) || 0;
      // hold largo entre tomas = silencio muerto; se recorta.
      sh.holdSec = hold > 0.2 ? 0 : Math.max(0, hold);

      const td = Number(sh.transitionDur) || 0;
      if (sh.transition === "fade" || sh.transition === "slide") {
        if (td > 0.45) sh.transitionDur = 0.35;
      } else if (sh.transition === "cut") {
        sh.transitionDur = 0;
      }

      const dials = Array.isArray(sh.dialogues) ? sh.dialogues : [];
      dials.forEach((d: any) => {
        let g = Number(d.gapSec);
        if (!Number.isFinite(g) || g < 0) g = 0;
        // Solo se toca lo exagerado (≥0.45 s). 0–0.35 lo decide la IA/usuario.
        d.gapSec = g >= 0.45 ? 0.2 : g;
      });
    }
  }
}

// Lo ÚNICO que debe llamarse sobre lo que devuelve la IA, y solo sobre eso.
//
// Hace dos cosas de naturaleza distinta y conviene tenerlas claras:
//   · limpiar el guion (quitar frases de presentador) es seguro siempre;
//   · ritmar (tocar pausas, holds y fundidos) NO lo es, porque reescribe
//     tiempos que pueden ser de alguien.
//
// Por eso el ritmo solo se aplica si el capítulo está recién nacido. Si ya
// tiene voces generadas, se limpia el texto y se dejan los tiempos en paz.
export function prepararCapituloGenerado(project: any): { quitadas: string[]; ritmado: boolean } {
  const { quitadas } = limpiarCapitulo(project);
  if (yaTrabajado(project)) return { quitadas, ritmado: false };
  ritmarCapitulo(project);
  return { quitadas, ritmado: true };
}

// Red de seguridad para la música, por la misma razón que la del guion: pedir
// no es garantizar. El prompt decía «volume 0.3» y una cama global, y eso es
// exactamente lo que salía; se corrigió el texto, pero un modelo puede seguir
// devolviendo lo que le parezca y el usuario ya lo ha pagado.
//
// Dos cosas se enderezan aquí:
//   · el volumen, porque a 0.3 la biblioteca (masterizada a -14 dBFS) tapa la
//     narración; el rango bueno es 0.08-0.15 y la música ya baja sola al narrar.
//   · más de una cama global, porque suenan sumadas (+3 dB) y se comen la voz.
export const VOL_MUSICA_MAX = 0.18;
export const VOL_MUSICA = 0.12;

export function ajustarMusicaCapitulo(project: any) {
  const capas = project.audioLayers ?? [];
  const musicas = capas.filter((l: any) => l.kind === "music");
  let bajadas = 0;
  for (const l of musicas) {
    if (l.volume > VOL_MUSICA_MAX) { l.volume = VOL_MUSICA; bajadas++; }
  }
  // Se queda la primera; las demás sobran. No se tiran: pasan a la primera
  // toma de una escena distinta, que es donde la música por escena tiene
  // sentido, y así no se pierde la elección del modelo.
  const sobran = musicas.slice(1);
  for (const l of sobran) {
    project.audioLayers = project.audioLayers.filter((x: any) => x.id !== l.id);
    const escena = project.scenes[Math.min(project.scenes.length - 1,
      Math.floor(project.scenes.length / 2))];
    const toma = escena?.shots?.[0];
    if (!toma) continue;
    toma.sfx = [...(toma.sfx ?? []), {
      id: l.id, audioId: l.audioId, name: l.name,
      // `topeSfx` con `esMusica` para que quede claro que esto NO baja al 5%:
      // es una pista de música puesta por escena, no un ambiente.
      volume: topeSfx(l.volume, true, true), dur: 0, gapSec: 0, loop: true,
    }];
  }
  return { bajadas, movidas: sobran.length };
}
