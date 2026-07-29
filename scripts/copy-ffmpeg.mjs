// Copia el núcleo de ffmpeg.wasm a /public para servirlo desde el propio sitio.
//
// Antes se descargaba de un CDN externo en cuanto alguien exportaba un video:
// si ese CDN no estaba disponible (red restringida, país, corte), la exportación
// se quedaba a medias. Sirviéndolo desde aquí siempre está y va más rápido.
// El archivo es grande (~32 MB), así que no se guarda en el repositorio: se
// copia desde node_modules antes de compilar.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const destino = path.join(process.cwd(), "public", "ffmpeg");

try {
  const origen = path.dirname(require.resolve("@ffmpeg/core"));
  fs.mkdirSync(destino, { recursive: true });
  let copiados = 0;
  for (const f of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
    const de = path.join(origen, f);
    const a = path.join(destino, f);
    if (!fs.existsSync(de)) continue;
    // Se salta si ya está y es el mismo tamaño (compilaciones repetidas).
    if (fs.existsSync(a) && fs.statSync(a).size === fs.statSync(de).size) { copiados++; continue; }
    fs.copyFileSync(de, a);
    copiados++;
  }
  console.log(`ffmpeg: ${copiados} archivo(s) listos en public/ffmpeg`);
} catch (e) {
  // Sin el núcleo, exportar sigue funcionando salvo la conversión de formatos.
  console.warn("ffmpeg: no se pudo copiar el núcleo —", e.message);
}
