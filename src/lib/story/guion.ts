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

// Limpia el capítulo entero que devuelve la IA. Devuelve cuántas frases se han
// quitado, para poder decírselo al usuario en vez de hacerlo a escondidas.
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
  // La IA tiende a gapSec/holdSec largos (0.5–1 s) y fundidos de 1 s: se oye
  // como un documental pausado. Aquí se acerca a un ritmo de narración natural.
  ritmarCapitulo(project);
  return { quitadas };
}

// Acorta solo pausas ABSURDAS de un capítulo recién generado.
// Prioridad: audio fluido. gapSec 0 es válido y deseable; la IA pone pausas
// solo cuando la trama lo pide. No se inventa un mínimo entre frases.
export function ritmarCapitulo(project: any) {
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
