"use client";

// Prepara la referencia VFX para dibujar la escena con GPT Image:
// pinta los efectos del JSON sobre negro, quita el negro (alfa) y arma la
// máscara como en el HTML de prueba. OpenAI rellena el fondo; TVPHI vuelve a
// dibujar las partículas encima, así que NO se recompone el VFX extraído.

import {
  flatten,
  frameH,
  setProjectAspect,
  capasVfxActivas,
  type FlatShot,
  type StoryProject,
  type StoryScene,
  type VfxLayer,
  type VfxNode,
} from "./model";
import { VfxScene, vfxSpec, type VfxInput } from "./vfx";

export type ReferenciaVfx = {
  /** PNG RGBA: efectos visibles, negro → transparente. */
  imagen: string;
  /** PNG máscara OpenAI: alfa 0 editable, 255 protegido. */
  mascara: string;
  /** Anclas en texto para el prompt. */
  resumen: string;
};

const TAMANOS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1536, h: 1024 },
  "9:16": { w: 1024, h: 1536 },
  "1:1": { w: 1024, h: 1024 },
};

const BLACK = 10;
const PROTECT = 28;
const FEATHER = 7;
const MUESTRAS = [0.16, 0.48, 1.05, 1.9, 2.8];

function smoothstep(a: number, b: number, x: number) {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function toImage(node: VfxNode, layer: VfxLayer, flat: FlatShot): VfxNode {
  if (layer.espacio === "imagen") return node;
  const f = flat.frames.from;
  const iw = flat.scene.imgW || 16;
  const ih = flat.scene.imgH || 9;
  const h = frameH(f.w, iw, ih);
  const one = (x: number, y: number) => ({
    x: f.cx - f.w / 2 + x * f.w,
    y: f.cy - h / 2 + y * h,
  });
  const a = one(node.x, node.y);
  const b = one(node.x2, node.y2);
  return { x: a.x, y: a.y, x2: b.x, y2: b.y };
}

function inputsDeEscena(project: StoryProject, scene: StoryScene) {
  setProjectAspect(project.aspect);
  const inputs: VfxInput[] = [];
  const summary: string[] = [];

  const seen = new Set<string>();
  for (const flat of flatten(project).filter((f) => f.scene.id === scene.id)) {
    for (const layer of capasVfxActivas(flat.scene, flat.shot)) {
      if (seen.has(layer.id)) continue;
      seen.add(layer.id);
      const nodes = (layer.nodes ?? []).map((n) => toImage(n, layer, flat));
      if (!nodes.length) continue;
      const params: Record<string, number> = { ...layer.params, derivaX: 0, derivaY: 0 };
      if (layer.kind === "rayo" || layer.kind === "electricidad") {
        params.stormrate = Math.max(params.stormrate ?? 1.2, 1.5);
      }
      if (typeof params.intensity === "number") {
        params.intensity = Math.max(1, params.intensity || 0);
      }
      inputs.push({
        id: `${flat.shot.id}:${layer.id}`,
        kind: layer.kind,
        shape: layer.shape,
        nodes,
        colorHex: layer.colorHex,
        params,
        start: 0,
        end: 4,
      });
      const label = vfxSpec(layer.kind).label;
      if (layer.shape === "arriba") {
        summary.push(`${label}: atmósfera desde el borde superior.`);
      } else {
        for (const n of nodes.slice(0, 12)) {
          const a = `${Math.round(n.x * 100)}%, ${Math.round(n.y * 100)}%`;
          const linea = Math.hypot(n.x2 - n.x, n.y2 - n.y) > 0.01;
          summary.push(
            linea
              ? `${label}: de (${a}) a (${Math.round(n.x2 * 100)}%, ${Math.round(n.y2 * 100)}%).`
              : `${label}: ancla en (${a}).`,
          );
        }
      }
    }
  }
  return { inputs, resumen: [...new Set(summary)].join("\n") };
}

function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("No se pudo exportar la referencia VFX"));
      const r = new FileReader();
      r.onerror = () => reject(r.error ?? new Error("FileReader"));
      r.onload = () => resolve(String(r.result).replace(/^data:image\/png;base64,/, ""));
      r.readAsDataURL(blob);
    }, "image/png");
  });
}

/** Negro → transparente + máscara (editable = alfa 0, VFX = alfa 255). */
function prepararEnvio(source: ImageData, w: number, h: number) {
  const tonal = Math.max(10, FEATHER * 2);
  const input = new ImageData(w, h);
  const mask = new ImageData(w, h);

  for (let i = 0; i < source.data.length; i += 4) {
    const r = source.data[i];
    const g = source.data[i + 1];
    const b = source.data[i + 2];
    const sa = source.data[i + 3] / 255;
    const maximum = Math.max(r, g, b) * sa;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) * sa;
    const brightness = Math.max(maximum, luminance);

    const visibleAlpha = Math.round(255 * smoothstep(BLACK, BLACK + tonal, brightness));
    const protectedAlpha = Math.round(
      255 * smoothstep(Math.max(0, PROTECT - tonal), PROTECT, brightness),
    );

    input.data[i] = r;
    input.data[i + 1] = g;
    input.data[i + 2] = b;
    input.data[i + 3] = visibleAlpha;

    mask.data[i] = 255;
    mask.data[i + 1] = 255;
    mask.data[i + 2] = 255;
    mask.data[i + 3] = protectedAlpha;
  }

  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = w;
  inputCanvas.height = h;
  const ictx = inputCanvas.getContext("2d")!;
  ictx.putImageData(input, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext("2d")!;
  mctx.putImageData(mask, 0, 0);

  if (FEATHER > 0) {
    const blurred = document.createElement("canvas");
    blurred.width = w;
    blurred.height = h;
    const bctx = blurred.getContext("2d")!;
    bctx.filter = `blur(${FEATHER}px)`;
    bctx.drawImage(maskCanvas, 0, 0);
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(blurred, 0, 0);
  }

  return { inputCanvas, maskCanvas };
}

/**
 * Si la escena tiene efectos, pinta una referencia negra + máscara para
 * `/v1/images/edits`. Sin efectos → null (generación solo con texto).
 */
export async function crearReferenciaVfx(
  project: StoryProject,
  sceneId: string,
): Promise<ReferenciaVfx | null> {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  const { inputs, resumen } = inputsDeEscena(project, scene);
  if (!inputs.length) return null;

  const size = TAMANOS[project.aspect] ?? TAMANOS["16:9"];
  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) return null;

  // Fondo negro puro: el mismo truco que el HTML (negro → transparente).
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size.w, size.h);

  const fx = new VfxScene();
  fx.setSize(size.w, size.h);
  const key = `vfx-ref:${scene.id}:${inputs.map((x) => x.id).join("|")}`;
  MUESTRAS.forEach((t, i, all) => {
    fx.seek(key, inputs, t);
    fx.draw(ctx, i === all.length - 1 ? 1 : 0.58);
  });

  const source = ctx.getImageData(0, 0, size.w, size.h);
  const { inputCanvas, maskCanvas } = prepararEnvio(source, size.w, size.h);
  const [imagen, mascara] = await Promise.all([
    canvasToBase64(inputCanvas),
    canvasToBase64(maskCanvas),
  ]);
  return { imagen, mascara, resumen };
}
