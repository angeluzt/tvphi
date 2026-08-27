import { generarLaminasEscena } from "@/lib/lab/generar-laminas";
import { generarLoopDesdeStill } from "./generar-loop";
import { montarVivaConSprites } from "./viva-sprites";
import { medioDe } from "./medio";
import { imagenesDelPlan, MAX_LAMINAS_VIVAS } from "./plan-medios";
import type { EscenaCapa, StoryScene } from "./model";

// Montar solo lo que la IA planeó para cada escena.
//
// DE DÓNDE VIENE ESTO. La IA ya sabía marcar una escena como foto viva o como
// paralaje, pero marcarla no montaba nada: había que abrir la escena, darle a
// «Materializar», esperar, cerrar, abrir la siguiente. En un capítulo de seis
// escenas con tres vivas eso son quince clics y tres esperas largas, y por eso
// en la práctica casi nunca se hacía: se generaba el capítulo y se dejaba
// plano. Lo que estaba a medias no era la IA, era el último tramo.
//
// LO QUE HACE. Recorre las escenas y monta cada una según su plan: la foto viva
// de cuadros pidiendo fotogramas, la de sprites dibujando actores, el paralaje
// repartiendo la escena en láminas y animando las que respiren.
//
// LO QUE NO HACE. Tocar una escena que ya está montada. Si tiene capas o loop,
// se salta: rehacerla sería tirar imágenes ya pagadas, y encima las de alguien
// que a lo mejor las ha retocado a mano.
//
// UN FALLO NO TUMBA EL CAPÍTULO. Igual que al dibujar: lo que no sale se apunta
// y se sigue con la siguiente. Es la diferencia entre «se cayó la tercera y las
// otras tres ni se intentaron» y «salieron cinco de seis, mira cuál falta».

export interface PasoMontaje {
  /** Cuál va y cuántas hay, para la barra. */
  hechas: number;
  total: number;
  detalle: string;
}

export interface MediosMontados {
  /** Escenas que se han montado de verdad. */
  hechas: number;
  /** Las que se quedaron por el camino, con el motivo. */
  saltadas: string[];
  avisos: string[];
  /** Cuánto se ha llegado a pedir, para poder decirlo al acabar. */
  imagenes: number;
  /** Si se paró porque alguien lo pidió. */
  cancelado: boolean;
}

/** Lo que hace falta de fuera. Se inyecta para no atar esto a la pantalla. */
export interface EntornoMontaje {
  formato: "16:9" | "9:16" | "1:1";
  calidad?: "low" | "medium" | "high";
  /** Baja una imagen ya guardada; hace falta como referencia de los fotogramas. */
  leerImagen: (id: string) => Promise<Blob | null>;
  guardarBlob: (blob: Blob, nombre: string) => Promise<string>;
  guardarDataUrl: (dataUrl: string, nombre: string) => Promise<string>;
  /** Escribe el resultado en la escena. Lo hace quien tenga el proyecto. */
  aplicar: (sceneId: string, cambio: Partial<StoryScene>) => void;
  onPaso?: (p: PasoMontaje) => void;
  /** Para poder parar entre escenas sin dejar una a medias. */
  cancelado?: () => boolean;
}

/** Las escenas que tienen algo planeado y todavía no montado. */
export function escenasPendientes(scenes: StoryScene[]): StoryScene[] {
  return scenes.filter((sc) => {
    if (!sc.imageId) return false;
    // Lo que ya está montado manda: si hay capas o loop, esta escena está hecha.
    if (medioDe(sc) !== "still") return false;
    return sc.medio === "apng" || sc.medio === "paralaje";
  });
}

/** Cuántas imágenes va a pedir el montaje de lo que queda. */
export function imagenesPendientes(scenes: StoryScene[]): number {
  return escenasPendientes(scenes).reduce(
    // La foto de la escena ya está dibujada, así que no se vuelve a contar.
    (t, sc) => t + Math.max(0, imagenesDelPlan(sc.medio === "apng" ? "apng" : "paralaje", sc.plan) - 1),
    0,
  );
}

export async function montarMediosCapitulo(
  scenes: StoryScene[],
  env: EntornoMontaje,
): Promise<MediosMontados> {
  const pend = escenasPendientes(scenes);
  const saltadas: string[] = [];
  const avisos: string[] = [];
  let hechas = 0;
  let imagenes = 0;

  for (let i = 0; i < pend.length; i++) {
    if (env.cancelado?.()) {
      return { hechas, saltadas, avisos, imagenes, cancelado: true };
    }
    const sc = pend[i];
    const numero = scenes.indexOf(sc) + 1;
    const donde = `Escena ${numero}`;
    const paso = (detalle: string) => env.onPaso?.({ hechas: i, total: pend.length, detalle: `${donde} · ${detalle}` });
    paso(sc.medio === "apng" ? "foto viva…" : "2.5D…");

    try {
      if (sc.medio === "apng") {
        imagenes += await montarViva(sc, env, paso);
      } else {
        imagenes += await montarParalaje(sc, env, paso, avisos);
      }
      hechas++;
    } catch (err) {
      saltadas.push(`${donde}: ${(err as Error).message}`);
    }
  }

  env.onPaso?.({ hechas: pend.length, total: pend.length, detalle: "" });
  return { hechas, saltadas, avisos, imagenes, cancelado: false };
}

async function montarViva(
  sc: StoryScene,
  env: EntornoMontaje,
  paso: (detalle: string) => void,
): Promise<number> {
  const plan = sc.plan?.viva;

  if (plan?.tecnica === "sprites" && plan.elementos.length) {
    const hecho = await montarVivaConSprites({
      stillId: sc.imageId,
      elementos: plan.elementos,
      calidad: env.calidad,
      guardar: env.guardarBlob,
      onPaso: paso,
    });
    // El loop de la escena se limpia: esta foto viva NO son fotogramas de la
    // foto entera, son actores encima. Dejar los dos puestos haría que el motor
    // cambiara la foto de fondo bajo los actores.
    env.aplicar(sc.id, {
      medio: "apng", capas: hecho.capas, loop: undefined, camara: undefined,
    });
    return hecho.capas.filter((c) => c.spr).length;
  }

  const still = await env.leerImagen(sc.imageId);
  if (!still) throw new Error("falta su imagen en este navegador");
  const n = plan?.fotogramas ?? 6;
  const loop = await generarLoopDesdeStill({
    stillId: sc.imageId,
    still,
    prompt: sc.prompt || "the same scene, tiny natural motion",
    formato: env.formato,
    n,
    fps: plan?.fps ?? 6,
    calidad: env.calidad,
    movimiento: plan?.movimiento,
    onPaso: paso,
    guardar: env.guardarBlob,
  });
  env.aplicar(sc.id, { medio: "apng", loop, capas: undefined, camara: undefined });
  return Math.max(0, loop.imageIds.length - 1);
}

async function montarParalaje(
  sc: StoryScene,
  env: EntornoMontaje,
  paso: (detalle: string) => void,
  avisos: string[],
): Promise<number> {
  const plan = sc.plan?.paralaje;
  if (!sc.prompt || sc.prompt.trim().length < 4) {
    throw new Error("no tiene descripción, y de ahí sale el mapa de láminas");
  }
  const hecho = await generarLaminasEscena({
    prompt: sc.prompt,
    formato: env.formato,
    nCapas: plan?.capas ?? 4,
    pistasVivas: plan?.vivas ?? [],
    // Se anima como mucho lo que el plan pidió, y nunca más del tope: es el
    // mismo número con el que se calculó el precio que se le enseñó al usuario.
    topeVivas: Math.min(MAX_LAMINAS_VIVAS, plan?.vivas.length ?? 0),
    conSprites: !!plan?.sprites,
    calidad: env.calidad,
    onPaso: paso,
    onGuardarImagen: env.guardarDataUrl,
  });
  if (!hecho.capas.length) {
    throw new Error(hecho.fallos.join(" · ") || "no salió ninguna lámina");
  }
  avisos.push(...hecho.avisos, ...hecho.fallos.map((f) => `Escena ${sc.id}: ${f}`));
  let imagenes = hecho.capas.length;

  // Y ahora las que respiran. Se hace DESPUÉS de tener todas las láminas para
  // que, si esto falla o se corta, la escena ya esté montada y solo le falte
  // el movimiento: un paralaje quieto sirve, media escena no.
  const capas: EscenaCapa[] = [...hecho.capas];
  for (const capaId of hecho.vivas) {
    const idx = capas.findIndex((c) => c.id === capaId);
    if (idx < 0) continue;
    const capa = capas[idx];
    const still = await env.leerImagen(capa.imageId);
    if (!still) continue;
    try {
      paso(`animando ${capa.nombre}…`);
      const loop = await generarLoopDesdeStill({
        stillId: capa.imageId,
        still,
        prompt: `${sc.prompt}. Layer: ${capa.nombre}. Tiny motion in this layer only.`,
        formato: env.formato,
        n: 6,
        fps: 6,
        calidad: env.calidad,
        movimiento: capa.nombre,
        onPaso: (t) => paso(`${capa.nombre}: ${t}`),
        guardar: env.guardarBlob,
      });
      capas[idx] = { ...capa, loop };
      imagenes += Math.max(0, loop.imageIds.length - 1);
    } catch (err) {
      avisos.push(`${capa.nombre} se quedó quieta: ${(err as Error).message}`);
    }
  }

  env.aplicar(sc.id, {
    medio: "paralaje",
    capas,
    loop: undefined,
    ...(hecho.camara?.length ? { camara: hecho.camara } : {}),
  });
  return imagenes;
}
