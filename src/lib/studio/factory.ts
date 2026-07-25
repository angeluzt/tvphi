import { nanoid } from "nanoid";
import type { Layer, LayerType, Scene, Transform } from "@/lib/scene";

const baseTransform = (over: Partial<Transform> = {}): Transform => ({
  x: 0.1,
  y: 0.1,
  w: 0.4,
  h: 0.4,
  rotation: 0,
  opacity: 1,
  z: 1,
  ...over,
});

export function createLayer(type: LayerType): Layer {
  const id = `l_${nanoid(8)}`;
  switch (type) {
    case "webcam":
      return { id, name: "Cámara", visible: true, type, transform: baseTransform({ x: 0.02, y: 0.55, w: 0.28, h: 0.42, z: 2 }), props: {} };
    case "screen":
      return { id, name: "Pantalla", visible: true, type, transform: baseTransform({ x: 0, y: 0, w: 1, h: 1, z: 1 }) };
    case "image":
      return {
        id,
        name: "Imagen",
        visible: true,
        type,
        transform: baseTransform(),
        props: { src: "", fit: "cover" },
      };
    case "video":
      return {
        id,
        name: "Video",
        visible: true,
        type,
        transform: baseTransform(),
        props: { src: "", loop: true, muted: true },
      };
    case "text":
      return {
        id,
        name: "Texto",
        visible: true,
        type,
        transform: baseTransform({ x: 0.1, y: 0.1, w: 0.8, h: 0.2, z: 3 }),
        props: { text: "Nuevo texto", color: "#ffffff", fontSize: 56, fontWeight: 700, align: "left", background: "transparent" },
      };
    case "background":
      return {
        id,
        name: "Fondo",
        visible: true,
        type,
        transform: baseTransform({ x: 0, y: 0, w: 1, h: 1, z: 0 }),
        props: { color: "#0b0b16", gradientTo: "#1a1030" },
      };
    case "alerts":
      return { id, name: "Alertas", visible: true, type, transform: baseTransform({ x: 0, y: 0, w: 1, h: 1, z: 10 }) };
  }
}

export function createScene(name: string): Scene {
  return {
    id: `scene_${nanoid(8)}`,
    name,
    order: 0,
    layers: [createLayer("background"), createLayer("alerts")],
  };
}
