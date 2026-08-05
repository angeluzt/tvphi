import type { Escena } from "./escena";
import { ESQUEMA } from "./escena";

// Dos escenas de muestra. La primera es la del prototipo, para tener una
// referencia conocida; la segunda usa las formas nuevas —path, tree, window,
// repeat, star, cloud— porque una forma que no se ve en un ejemplo no la usa
// nadie, ni una persona ni una IA leyendo el JSON.

export const PORTAL: Escena = {
  $schema: ESQUEMA,
  scene: {
    id: "forest-ruins-portal",
    title: "Portal entre ruinas del bosque",
    width: 1920, height: 1080,
    mapBackground: "#101522",
    description: "Ruinas de piedra en un bosque nocturno, con un arco vacío preparado para un portal animado.",
    style: "cinematic dark fantasy, detailed stone and vegetation, moonlit, no text",
  },
  layers: [
    {
      id: "far-sky", name: "01 Cielo lejano", depth: 0.05, blur: 0.3,
      ai: {
        prompt: "The distant night sky and misty atmosphere. Opaque, fills the whole frame.",
        exclude: "ruins, portal, people, foreground vegetation",
      },
      objects: [
        { id: "sky", shape: "rect", semantic: "sky", x: 0, y: 0, w: 1, h: 1, label: "CIELO DE NOCHE" },
        { id: "moon", shape: "circle", semantic: "light_anchor", cx: 0.78, cy: 0.18, r: 0.055, label: "LUNA" },
        { id: "stars", shape: "repeat", semantic: "light_anchor", veces: 7,
          x1: 0.08, y1: 0.1, x2: 0.62, y2: 0.26, label: "ESTRELLAS",
          item: { shape: "star", semantic: "light_anchor", r: 0.008, puntas: 4, hueco: 0.3 } },
        { id: "clouds", shape: "cloud", semantic: "sky", x: 0.05, y: 0.22, w: 0.34, h: 0.12,
          opacity: 0.55, label: "NUBES ALTAS" },
      ],
    },
    {
      id: "distant-landscape", name: "02 Paisaje distante", depth: 0.18, blur: 0.15,
      ai: {
        prompt: "Distant forested mountains and fog. Transparent outside the silhouettes.",
        exclude: "portal, architecture, people, close plants",
      },
      objects: [
        { id: "ridge", shape: "path", semantic: "terrain", smooth: 0.7, closed: true,
          points: [[-0.05, 0.7], [0.12, 0.44], [0.3, 0.58], [0.5, 0.3], [0.72, 0.52], [0.9, 0.38], [1.05, 0.66], [1.05, 1.05], [-0.05, 1.05]],
          label: "SIERRA LEJANA" },
      ],
    },
    {
      id: "architecture", name: "03 Ruinas y suelo", depth: 0.42,
      ai: {
        prompt: "The stone ruins, floor, empty portal frame and steps. Transparent background. Keep every opening open.",
        exclude: "active portal, magic energy, flames, particles, people",
      },
      objects: [
        { id: "ground", shape: "polygon", semantic: "floor",
          points: [[-0.05, 0.68], [1.05, 0.68], [1.05, 1.05], [-0.05, 1.05]], label: "SUELO DE PIEDRA" },
        { id: "col-l", shape: "roundedRect", semantic: "column", x: 0.27, y: 0.25, w: 0.1, h: 0.48, radius: 0.012, label: "COLUMNA" },
        { id: "col-r", shape: "roundedRect", semantic: "column", x: 0.63, y: 0.25, w: 0.1, h: 0.48, radius: 0.012, label: "COLUMNA" },
        { id: "portal-frame", shape: "arch", semantic: "arch", x: 0.34, y: 0.2, w: 0.32, h: 0.52, thickness: 0.055, label: "ARCO VACÍO" },
        { id: "steps", shape: "stairs", semantic: "stairs", x: 0.35, y: 0.72, w: 0.3, h: 0.16, steps: 4, label: "ESCALONES" },
        { id: "torch-l", shape: "rect", semantic: "prop", x: 0.18, y: 0.47, w: 0.025, h: 0.22, label: "ANTORCHA" },
        { id: "torch-r", shape: "rect", semantic: "prop", x: 0.8, y: 0.47, w: 0.025, h: 0.22, label: "ANTORCHA" },
      ],
    },
    {
      id: "subjects-and-vfx", name: "04 Reservas de sujeto y efectos", depth: 0.68,
      ai: {
        prompt: "Guide layer only. Keep the character area compositionally clear and the VFX zones empty.",
        exclude: "painted fire, portal glow, particles, guide colors",
      },
      objects: [
        { id: "hero-body", shape: "roundedRect", semantic: "subject", x: 0.09, y: 0.4, w: 0.16, h: 0.42, radius: 0.055, label: "PERSONAJE" },
        { id: "hero-head", shape: "circle", semantic: "subject", cx: 0.17, cy: 0.34, r: 0.055, label: "CABEZA" },
        { id: "vfx-portal", shape: "ellipse", semantic: "vfx_zone", cx: 0.5, cy: 0.48, rx: 0.105, ry: 0.205, label: "PORTAL · DEJAR VACÍO" },
        { id: "vfx-fire-l", shape: "circle", semantic: "vfx_zone", cx: 0.192, cy: 0.43, r: 0.034, label: "FUEGO" },
        { id: "vfx-fire-r", shape: "circle", semantic: "vfx_zone", cx: 0.812, cy: 0.43, r: 0.034, label: "FUEGO" },
      ],
    },
    {
      id: "foreground", name: "05 Primer plano", depth: 0.94, blur: 0.4,
      ai: {
        prompt: "Close rocks, roots and leaves framing the lower corners. Transparent background.",
        exclude: "people, portal, architecture",
      },
      objects: [
        { id: "rock-l", shape: "path", semantic: "terrain", smooth: 0.5, closed: true,
          points: [[-0.04, 1.02], [0.02, 0.76], [0.2, 0.69], [0.31, 1.02]], label: "ROCA CERCANA" },
        { id: "rock-r", shape: "path", semantic: "terrain", smooth: 0.5, closed: true,
          points: [[0.72, 1.02], [0.8, 0.72], [1.03, 0.66], [1.05, 1.03]], label: "ROCA CERCANA" },
        { id: "leaf-l", shape: "ellipse", semantic: "vegetation", cx: 0.13, cy: 0.72, rx: 0.1, ry: 0.04, rotation: -28, label: "HOJAS" },
        { id: "leaf-r", shape: "ellipse", semantic: "vegetation", cx: 0.88, cy: 0.7, rx: 0.11, ry: 0.04, rotation: 22, label: "HOJAS" },
      ],
    },
  ],
};

export const CALLE: Escena = {
  $schema: ESQUEMA,
  scene: {
    id: "calle-lluvia",
    title: "Calle de noche bajo la lluvia",
    width: 1920, height: 1080,
    mapBackground: "#0d1117",
    description: "Una calle estrecha de noche, mojada, con farolas encendidas y un personaje al fondo.",
    style: "cinematic noir, wet asphalt reflections, warm street lamps against cold blue night, no text",
  },
  layers: [
    {
      id: "cielo", name: "01 Cielo y luna", depth: 0.04, blur: 0.35,
      ai: { prompt: "Overcast night sky with a hazy moon. Opaque, fills the frame.", exclude: "buildings, street, people" },
      objects: [
        { id: "sky", shape: "rect", semantic: "sky", x: 0, y: 0, w: 1, h: 1, label: "CIELO NUBLADO" },
        { id: "moon", shape: "circle", semantic: "light_anchor", cx: 0.24, cy: 0.14, r: 0.045, opacity: 0.6, label: "LUNA VELADA" },
        { id: "nube", shape: "cloud", semantic: "sky", x: 0.3, y: 0.06, w: 0.5, h: 0.18, opacity: 0.5, label: "NUBES" },
      ],
    },
    {
      id: "fachadas", name: "02 Fachadas del fondo", depth: 0.22, blur: 0.2,
      ai: {
        prompt: "Two rows of narrow city buildings receding down the street, dark brick, lit windows. Transparent background.",
        exclude: "street surface, lamps, people, foreground",
      },
      objects: [
        { id: "bloque-izq", shape: "rect", semantic: "wall", x: -0.02, y: 0.12, w: 0.34, h: 0.62, label: "FACHADA IZQUIERDA" },
        { id: "tejado-izq", shape: "triangle", semantic: "wall", x: -0.02, y: 0.03, w: 0.34, h: 0.1, label: "TEJADO" },
        { id: "bloque-der", shape: "rect", semantic: "wall", x: 0.68, y: 0.1, w: 0.34, h: 0.64, label: "FACHADA DERECHA" },
        { id: "tejado-der", shape: "wedge", semantic: "wall", x: 0.68, y: 0.02, w: 0.34, h: 0.09, label: "TEJADO INCLINADO" },
        { id: "vent-izq", shape: "repeat", semantic: "window", veces: 4,
          x1: 0.06, y1: 0.24, x2: 0.26, y2: 0.24, label: "VENTANAS",
          item: { shape: "window", semantic: "window", w: 0.05, h: 0.09, columnas: 2, filas: 2 } },
        { id: "vent-izq2", shape: "repeat", semantic: "window", veces: 4,
          x1: 0.06, y1: 0.44, x2: 0.26, y2: 0.44,
          item: { shape: "window", semantic: "window", w: 0.05, h: 0.09, columnas: 2, filas: 2 } },
        { id: "vent-der", shape: "repeat", semantic: "window", veces: 4,
          x1: 0.74, y1: 0.22, x2: 0.94, y2: 0.22, label: "VENTANAS",
          item: { shape: "window", semantic: "window", w: 0.05, h: 0.09, columnas: 2, filas: 2 } },
        { id: "portal", shape: "door", semantic: "door", x: 0.75, y: 0.5, w: 0.07, h: 0.24, arco: true, label: "PORTAL" },
      ],
    },
    {
      id: "calle", name: "03 Calzada y farolas", depth: 0.45,
      ai: {
        prompt: "Wet cobbled street with reflections, pavement edges and iron street lamps. Transparent background.",
        exclude: "glow halos, rain streaks, people",
      },
      objects: [
        { id: "asfalto", shape: "polygon", semantic: "floor",
          points: [[0.28, 0.72], [0.72, 0.72], [1.06, 1.05], [-0.06, 1.05]], label: "CALZADA MOJADA" },
        { id: "charco", shape: "path", semantic: "water", smooth: 0.9, closed: true,
          points: [[0.36, 0.9], [0.52, 0.85], [0.64, 0.93], [0.5, 1.0], [0.38, 0.97]], label: "CHARCO" },
        { id: "farolas", shape: "repeat", semantic: "prop", veces: 3,
          x1: 0.24, y1: 0.56, x2: 0.12, y2: 0.72, label: "FAROLA",
          item: { shape: "rect", semantic: "prop", w: 0.012, h: 0.26 } },
        { id: "foco-1", shape: "circle", semantic: "light_anchor", cx: 0.24, cy: 0.43, r: 0.018, label: "LUZ" },
        { id: "foco-2", shape: "circle", semantic: "light_anchor", cx: 0.79, cy: 0.4, r: 0.018, label: "LUZ" },
      ],
    },
    {
      id: "reservas", name: "04 Reservas", depth: 0.66,
      ai: {
        // La lluvia va sobre TODO el cuadro, pero no se marca con una forma que
        // lo cubra: una mancha a pantalla completa deja el PNG de esta capa sin
        // un solo píxel transparente, y entonces al apilarla tapa lo de detrás.
        // Lo que ocupa todo se dice con palabras; las formas son para lo que
        // tiene un sitio.
        prompt: "Guide layer only. Leave the figure area clear and the VFX zones empty. Animated rain will cover the whole frame later, so do not paint any rain here.",
        exclude: "painted rain, painted glow, guide colors",
      },
      objects: [
        { id: "figura", shape: "roundedRect", semantic: "subject", x: 0.46, y: 0.5, w: 0.08, h: 0.24, radius: 0.03, label: "FIGURA AL FONDO" },
        { id: "vfx-halo-1", shape: "circle", semantic: "vfx_zone", cx: 0.24, cy: 0.43, r: 0.06, label: "HALO · DEJAR VACÍO" },
        { id: "vfx-halo-2", shape: "circle", semantic: "vfx_zone", cx: 0.79, cy: 0.4, r: 0.06, label: "HALO · DEJAR VACÍO" },
        { id: "gotas", shape: "star", semantic: "vfx_zone", cx: 0.5, cy: 0.12, r: 0.02, puntas: 4, hueco: 0.25, label: "LLUVIA EN TODO EL CUADRO" },
      ],
    },
    {
      id: "primer-plano", name: "05 Primer plano", depth: 0.95, blur: 0.5,
      ai: {
        prompt: "Very close dark silhouettes framing the shot: a wall edge on one side and a bare tree on the other. Transparent background.",
        exclude: "people, street, sky",
      },
      objects: [
        { id: "esquina", shape: "wedge", semantic: "wall", x: -0.02, y: 0.1, w: 0.16, h: 0.95, label: "ESQUINA CERCANA" },
        { id: "arbol", shape: "tree", semantic: "vegetation", x: 0.78, y: 0.28, w: 0.3, h: 0.72, tronco: 0.55, label: "ÁRBOL DESNUDO" },
      ],
    },
  ],
};

export const EJEMPLOS = [
  { id: "portal", nombre: "Portal en el bosque", escena: PORTAL },
  { id: "calle", nombre: "Calle de noche", escena: CALLE },
];
