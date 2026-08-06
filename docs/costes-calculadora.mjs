// Calculadora de coste por historia. Las cantidades salen MEDIDAS del código;
// los precios, de las tarifas públicas de agosto de 2026.
import fs from "node:fs";

// ── Medido en el repo ───────────────────────────────────────────────────────
const CATALOGO = 33537;   // referenciaCompacta() serializada
const SIST_CAP = 5847;    // INSTRUCCIONES de /ia/capitulo
const SIST_MAPA = 2553;   // INSTRUCCION de /ia/lab/escena
const ENCARGO = 1200;     // el prompt del usuario, uno bueno y largo

// Caracteres por token. El contexto es JSON + español; con el tokenizador de
// OpenAI eso cae cerca de 3,7. Es la única cifra estimada del bloque de arriba.
const CT = 3.7;
const tok = (c) => c / CT;

// ── Precios (USD) ───────────────────────────────────────────────────────────
const P = {
  textoIn: 0.20 / 1e6,      // gpt-5.6-luna
  textoOut: 1.20 / 1e6,
  imagen: 0.041,            // gpt-image-2, 1024×1536, calidad media
  imagenEdit: 0.041 + 0.015,// una edición manda además el mapa como entrada
  vozMin: 0.015,            // gpt-4o-mini-tts, por minuto de audio
};

// ── Tamaño de lo que devuelve el modelo ─────────────────────────────────────
// Una toma del esquema real, con su diálogo. Medida sobre la plantilla que el
// propio prompt le enseña al modelo.
const TOMA = 430 + 120;   // json de la toma + texto narrado medio
const ESCENA = 210;       // envoltorio de la escena (id, imageId, prompt, vfx)

// Ritmo medido en una generación real del usuario: 6 escenas → ~80 s.
const SEG_POR_ESCENA = 80 / 6;

function historia({ segundos, tomasPorEscena = 2, capas = 0 }) {
  const escenas = Math.max(1, Math.round(segundos / SEG_POR_ESCENA));
  // El deslizador corta en 12: más largo obliga a varios capítulos.
  const capitulos = Math.ceil(escenas / 12);
  const escenasPorCap = Math.ceil(escenas / capitulos);

  // 1 · texto del guion (una llamada por capítulo)
  const entrada = tok(CATALOGO + SIST_CAP + ENCARGO) * capitulos;
  const salida = tok((ESCENA + TOMA * tomasPorEscena) * escenas);
  const costeTexto = entrada * P.textoIn + salida * P.textoOut;

  // 2 · imágenes
  let costeImg, llamadasImg;
  if (capas) {
    // 2.5D: por escena, un mapa (texto) y una imagen por capa dibujable.
    const mapaIn = tok(SIST_MAPA + 800) * escenas;
    const mapaOut = tok(3500) * escenas;
    costeImg = mapaIn * P.textoIn + mapaOut * P.textoOut + escenas * capas * P.imagenEdit;
    llamadasImg = escenas * capas;
  } else {
    costeImg = escenas * P.imagen;
    llamadasImg = escenas;
  }

  // 3 · voz
  const costeVoz = (segundos / 60) * P.vozMin;

  const total = costeTexto + costeImg + costeVoz;
  return { segundos, escenas, capitulos, escenasPorCap, llamadasImg,
           costeTexto, costeImg, costeVoz, total };
}

const DUR = [
  ["30 s (TikTok corto)", 30],
  ["60 s (TikTok / Short)", 60],
  ["3 min", 180],
  ["10 min (YouTube largo)", 600],
];

const usd = (n) => "$" + n.toFixed(3);
const filas = [];
console.log("=== PLANO (como está hoy) ===");
console.log("duración".padEnd(24), "esc", "cap", "img", "  texto     imagen     voz      TOTAL");
for (const [n, s] of DUR) {
  const r = historia({ segundos: s });
  filas.push([n, r, null]);
  console.log(n.padEnd(24), String(r.escenas).padStart(3), String(r.capitulos).padStart(3),
    String(r.llamadasImg).padStart(3), usd(r.costeTexto).padStart(9),
    usd(r.costeImg).padStart(9), usd(r.costeVoz).padStart(8), usd(r.total).padStart(9));
}
console.log("\n=== CON 2.5D (4 capas por escena) ===");
console.log("duración".padEnd(24), "esc", "cap", "img", "  texto     imagen     voz      TOTAL   ×plano");
for (let i = 0; i < DUR.length; i++) {
  const [n, s] = DUR[i];
  const r = historia({ segundos: s, capas: 4 });
  filas[i][2] = r;
  const x = (r.total / filas[i][1].total).toFixed(1);
  console.log(n.padEnd(24), String(r.escenas).padStart(3), String(r.capitulos).padStart(3),
    String(r.llamadasImg).padStart(3), usd(r.costeTexto).padStart(9),
    usd(r.costeImg).padStart(9), usd(r.costeVoz).padStart(8), usd(r.total).padStart(9),
    ("×" + x).padStart(6));
}

console.log("\n=== DE QUÉ SE COMPONE UN TIKTOK DE 60 s (plano) ===");
const t = historia({ segundos: 60 });
for (const [k, v] of [["texto (guion)", t.costeTexto], ["imágenes", t.costeImg], ["voz", t.costeVoz]]) {
  console.log("  " + k.padEnd(16), usd(v).padStart(9), (v / t.total * 100).toFixed(0).padStart(4) + "%");
}
console.log("\n  del texto, el catálogo de efectos es",
  (CATALOGO / (CATALOGO + SIST_CAP + ENCARGO) * 100).toFixed(0) + "% de la entrada");
const entradaTok = tok(CATALOGO + SIST_CAP + ENCARGO);
console.log("  entrada por capítulo:", Math.round(entradaTok), "tokens ·",
  usd(entradaTok * P.textoIn), "— y NO cambia con la duración");

console.log("\n=== SI SE RECORTA EL CATÁLOGO ===");
for (const recorte of [0, 0.3, 0.5, 0.7]) {
  const cat = CATALOGO * (1 - recorte);
  const e = tok(cat + SIST_CAP + ENCARGO);
  const ahorro = (tok(CATALOGO + SIST_CAP + ENCARGO) - e) * P.textoIn;
  console.log(`  -${(recorte*100).toFixed(0).padStart(2)}% del catálogo →`,
    Math.round(e).toString().padStart(5), "tokens ·", "ahorro", usd(ahorro), "por capítulo",
    "(" + usd(ahorro * 100) + " cada 100 historias)");
}

fs.writeFileSync("/tmp/claude-0/-home-user-tvphi/68c4190f-547c-581e-88f2-ed96fed72233/scratchpad/costes/datos.json",
  JSON.stringify({ filas: filas.map(([n, p, c]) => ({ nombre: n, plano: p, capas: c })) }, null, 1));

console.log("\n=== LAS PALANCAS QUE SÍ MUEVEN LA AGUJA (TikTok 60 s) ===");
const base = historia({ segundos: 60 }).total;
const opciones = [
  ["tal cual está hoy", historia({ segundos: 60 }).total],
  ["reusar imagen: 3 tomas por escena en vez de 2", historia({ segundos: 60, tomasPorEscena: 3 }).total * 0 + (() => {
     // mismas escenas ≠ misma duración: con 3 tomas por escena hacen falta menos escenas
     const escenas = Math.round(60 / (80/6) * 2/3);
     return escenas * 0.041 + 0.004 + 0.015;
   })()],
  ["API Batch (-50% en imágenes, tarda hasta 24 h)", 0.004 + (5*0.041*0.5) + 0.015],
  ["ambas cosas", 0.004 + (Math.round(60/(80/6)*2/3)*0.041*0.5) + 0.015],
  ["recortar el catálogo un 70%", base - 0.0013],
];
for (const [n, v] of opciones) {
  const dif = (v - base) / base * 100;
  console.log("  " + n.padEnd(46), usd(v).padStart(8),
    (dif === 0 ? "" : (dif > 0 ? "+" : "") + dif.toFixed(0) + "%").padStart(7));
}

console.log("\n=== COSTE POR MINUTO DE VÍDEO TERMINADO ===");
for (const [n, s] of DUR) {
  const p = historia({ segundos: s }), c = historia({ segundos: s, capas: 4 });
  console.log("  " + n.padEnd(24), "plano", usd(p.total / (s/60)).padStart(8), "/min ·",
    "2.5D", usd(c.total / (s/60)).padStart(8), "/min");
}

console.log("\n=== CUÁNTAS VISTAS PARA CUBRIR EL COSTE ===");
// RPM: ingreso por cada 1.000 reproducciones.
const RPM = [["TikTok / Shorts (bajo)", 0.03], ["TikTok / Shorts (bueno)", 0.15],
             ["YouTube largo (bajo)", 2], ["YouTube largo (bueno)", 8]];
for (const [donde, rpm] of RPM) {
  const corto = historia({ segundos: 60 }).total, largo = historia({ segundos: 600 }).total;
  const usar = donde.startsWith("YouTube") ? largo : corto;
  const etiqueta = donde.startsWith("YouTube") ? "vídeo de 10 min" : "vídeo de 60 s";
  console.log("  " + donde.padEnd(24), "RPM $" + String(rpm).padEnd(5),
    "→", Math.round(usar / rpm * 1000).toLocaleString("es").padStart(9), "vistas para cubrir un", etiqueta);
}

console.log("\n=== SI PRODUCES A DIARIO (coste mensual) ===");
for (const [n, s, cant] of [["1 TikTok al día", 60, 30], ["3 TikToks al día", 60, 90],
                            ["1 vídeo de 10 min por semana", 600, 4],
                            ["1 TikTok al día + 1 largo semanal", 0, 0]]) {
  if (!cant) {
    const v = historia({ segundos: 60 }).total * 30 + historia({ segundos: 600 }).total * 4;
    console.log("  " + n.padEnd(34), usd(v).padStart(8), "al mes ·", usd(v * 12).padStart(8), "al año");
    continue;
  }
  const v = historia({ segundos: s }).total * cant;
  console.log("  " + n.padEnd(34), usd(v).padStart(8), "al mes ·", usd(v * 12).padStart(8), "al año");
}
