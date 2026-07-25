import { z } from "zod";

// Modelo de escenas y capas del Studio. Las capas se guardan como JSON en Scene.layers
// y se validan con estos esquemas al leer/escribir.

export const transformSchema = z.object({
  x: z.number().default(0), // 0..1 (proporción del ancho)
  y: z.number().default(0), // 0..1
  w: z.number().default(1), // 0..1
  h: z.number().default(1), // 0..1
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  z: z.number().default(0),
});
export type Transform = z.infer<typeof transformSchema>;

export const layerBase = {
  id: z.string(),
  name: z.string().default("Capa"),
  visible: z.boolean().default(true),
  transform: transformSchema,
};

export const layerSchema = z.discriminatedUnion("type", [
  z.object({
    ...layerBase,
    type: z.literal("webcam"),
    // Recuerda qué cámara física usar (persiste en la BD).
    props: z
      .object({ deviceId: z.string().optional(), label: z.string().optional() })
      .default({}),
  }),
  z.object({ ...layerBase, type: z.literal("screen") }),
  z.object({
    ...layerBase,
    type: z.literal("image"),
    props: z.object({ src: z.string(), fit: z.enum(["cover", "contain"]).default("cover") }),
  }),
  z.object({
    ...layerBase,
    type: z.literal("video"),
    props: z.object({ src: z.string(), loop: z.boolean().default(true), muted: z.boolean().default(true) }),
  }),
  z.object({
    ...layerBase,
    type: z.literal("text"),
    props: z.object({
      text: z.string().default("Texto"),
      color: z.string().default("#ffffff"),
      fontSize: z.number().default(48),
      fontWeight: z.number().default(700),
      align: z.enum(["left", "center", "right"]).default("left"),
      background: z.string().default("transparent"),
    }),
  }),
  z.object({
    ...layerBase,
    type: z.literal("background"),
    props: z.object({
      color: z.string().default("#0b0b12"),
      gradientTo: z.string().optional(),
    }),
  }),
  z.object({ ...layerBase, type: z.literal("alerts") }),
]);
export type Layer = z.infer<typeof layerSchema>;
export type LayerType = Layer["type"];

export const sceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number().default(0),
  layers: z.array(layerSchema).default([]),
});
export type Scene = z.infer<typeof sceneSchema>;

export const TransitionKinds = ["cut", "fade", "slide"] as const;
export type TransitionKind = (typeof TransitionKinds)[number];

// Escena de ejemplo para nuevos canales.
export function defaultScenes(): Scene[] {
  return [
    {
      id: "scene_intro",
      name: "Intro",
      order: 0,
      layers: [
        {
          id: "l_bg",
          name: "Fondo",
          visible: true,
          type: "background",
          transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 0 },
          props: { color: "#0b0b16", gradientTo: "#1a1030" },
        },
        {
          id: "l_title",
          name: "Título",
          visible: true,
          type: "text",
          transform: { x: 0.08, y: 0.4, w: 0.84, h: 0.2, rotation: 0, opacity: 1, z: 1 },
          props: { text: "¡Empezamos pronto!", color: "#ffffff", fontSize: 72, fontWeight: 800, align: "center", background: "transparent" },
        },
        {
          id: "l_alerts",
          name: "Alertas",
          visible: true,
          type: "alerts",
          transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 10 },
        },
      ],
    },
    {
      id: "scene_live",
      name: "En vivo",
      order: 1,
      layers: [
        {
          id: "l_bg2",
          name: "Fondo",
          visible: true,
          type: "background",
          transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 0 },
          props: { color: "#07070d" },
        },
        {
          id: "l_cam",
          name: "Cámara",
          visible: true,
          type: "webcam",
          transform: { x: 0.02, y: 0.55, w: 0.28, h: 0.42, rotation: 0, opacity: 1, z: 2 },
          props: {},
        },
        {
          id: "l_alerts2",
          name: "Alertas",
          visible: true,
          type: "alerts",
          transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1, z: 10 },
        },
      ],
    },
  ];
}
