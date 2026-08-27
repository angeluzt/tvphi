import { describe, expect, it } from "vitest";
import { migrateProject, newSfx, newOverlay, inheritedLoops, flatten } from "./model";
import { VOL_SFX_BAJO, VOL_SFX_MAX, VOL_MUSICA_EN_ESCENA } from "./volumen-sfx";

// EL TOPE, COMPROBADO SOBRE UN CAPÍTULO ENTERO.
//
// `volumen-sfx.test.ts` comprueba la función; esto comprueba que no haya
// GRIETAS: que ningún camino por el que entra un volumen se salte el tope. Es
// la diferencia que importa, porque el fallo que se vio en producción no fue
// que la función estuviera mal, sino que había sitios que no pasaban por ella.
//
// Se recorre el proyecto ya migrado y se mira TODO lo que suena.

/** Todos los volúmenes de efectos del proyecto, con su etiqueta. */
function volumenes(p: ReturnType<typeof migrateProject>) {
  const fuera: { donde: string; audioId: string; bucle: boolean; v: number }[] = [];
  p.scenes.forEach((sc, si) => {
    sc.shots.forEach((sh, hi) => {
      sh.sfx.forEach((s) => fuera.push({
        donde: `e${si + 1}t${hi + 1} sfx ${s.name}`, audioId: s.audioId, bucle: s.loop, v: s.volume,
      }));
      sh.overlays.forEach((o) => {
        if (o.soundId) {
          fuera.push({
            donde: `e${si + 1}t${hi + 1} sticker ${o.id}`,
            audioId: o.soundId, bucle: !!o.soundLoop, v: o.soundVolume,
          });
        }
      });
    });
  });
  return fuera;
}

/** Lo más alto que puede sonar eso, según lo que es. */
const techo = (audioId: string, bucle: boolean) =>
  audioId.startsWith("lib:") ? VOL_MUSICA_EN_ESCENA : bucle ? VOL_SFX_BAJO : VOL_SFX_MAX;

/** Un capítulo con la forma que devuelve la IA, con los volúmenes disparados. */
const capituloRuidoso = {
  aspect: "16:9",
  narrationVolume: 1,
  audioLayers: [],
  scenes: [{
    id: "s1", imageId: "img-1", imgW: 1536, imgH: 1024,
    shots: [{
      id: "s1a", durationSec: 6,
      dialogues: [{ id: "d1", text: "Hola.", quien: "" }],
      sfx: [
        // Un golpe al 60%: exactamente lo que se vio en producción.
        { id: "x1", audioId: "son:big-explosion", name: "Explosión", volume: 0.6, loop: false },
        // Un ambiente al 80%, que es peor todavía: suena la escena entera.
        { id: "x2", audioId: "son:rain-loop", name: "Lluvia", volume: 0.8, loop: true },
        // Sin volumen: no puede acabar en el 0.8 de antes ni en silencio.
        { id: "x3", audioId: "son:door", name: "Puerta" },
        // Basura: un volumen que no es un número.
        { id: "x4", audioId: "son:wind", name: "Viento", volume: "fuerte", loop: true },
        // Música por escena: esta NO baja al 5%, es música.
        { id: "m1", audioId: "lib:bosque", name: "Bosque", volume: 0.9, loop: true },
      ],
      overlays: [
        { id: "o1", imageId: "st-1", soundId: "son:whoosh", soundVolume: 0.95 },
        { id: "o2", imageId: "st-2", soundId: "son:hum", soundVolume: 0.7, soundLoop: true },
      ],
      audioOverrides: [],
    }, {
      // La toma siguiente intenta SUBIR el bucle heredado: la puerta de atrás.
      id: "s1b", durationSec: 4,
      dialogues: [], sfx: [], overlays: [],
      audioOverrides: [{ sfxId: "x2", stop: false, volume: 0.75 }],
    }],
  }],
};

describe("ningún sonido de un capítulo pasa de su techo", () => {
  const p = migrateProject(capituloRuidoso);

  it("nada supera el 12%, pase lo que pase", () => {
    // Es la regla dura: 12% es el máximo absoluto de cualquier cosa que no sea
    // narración. Por encima de ahí la voz deja de entenderse.
    for (const s of volumenes(p)) {
      expect(s.v, `${s.donde} (${s.audioId})`).toBeLessThanOrEqual(VOL_SFX_MAX);
    }
  });

  it("cada uno respeta el techo que le toca", () => {
    for (const s of volumenes(p)) {
      expect(s.v, `${s.donde} (${s.audioId})`).toBeLessThanOrEqual(techo(s.audioId, s.bucle));
    }
  });

  it("un ambiente en bucle baja al techo bajo, no al de los golpes", () => {
    const lluvia = volumenes(p).find((s) => s.audioId === "son:rain-loop")!;
    expect(lluvia.v).toBe(VOL_SFX_BAJO);
  });

  it("un golpe al 60% se queda en el 12%", () => {
    const boom = volumenes(p).find((s) => s.audioId === "son:big-explosion")!;
    expect(boom.v).toBe(VOL_SFX_MAX);
  });

  it("el sonido de un sticker también, que es un efecto como otro", () => {
    const v = volumenes(p);
    expect(v.find((s) => s.audioId === "son:whoosh")!.v).toBe(VOL_SFX_MAX);
    expect(v.find((s) => s.audioId === "son:hum")!.v).toBe(VOL_SFX_BAJO);
  });

  it("sin volumen no acaba ni alto ni mudo", () => {
    // Enmudecerlo sería peor que dejarlo alto: no se nota que falta.
    const puerta = volumenes(p).find((s) => s.audioId === "son:door")!;
    expect(puerta.v).toBe(VOL_SFX_MAX);
    expect(puerta.v).toBeGreaterThan(0);
  });

  it("una música por escena conserva su techo de música", () => {
    const bosque = volumenes(p).find((s) => s.audioId === "lib:bosque")!;
    expect(bosque.v).toBe(VOL_MUSICA_EN_ESCENA);
  });

  it("«volumen aquí» desde otra toma no es la puerta de atrás", () => {
    // Una excepción apunta a un sonido de OTRA toma, así que se acota al
    // resolverla, que es donde se sabe a qué apunta.
    const flat = flatten(p);
    const heredados = inheritedLoops(flat, 1);
    const lluvia = heredados.find((l) => l.sfx.audioId === "son:rain-loop");
    expect(lluvia, "la lluvia debería heredarse en la toma siguiente").toBeDefined();
    expect(lluvia!.volume).toBeLessThanOrEqual(VOL_SFX_BAJO);
  });
});

describe("lo que se añade a mano entra ya en su sitio", () => {
  it("un golpe nuevo al 12% y un ambiente nuevo al techo bajo", () => {
    expect(newSfx("son:crash", "Golpe", 2).volume).toBe(VOL_SFX_MAX);
    expect(newSfx("son:tavern", "Taberna", 30, true).volume).toBe(VOL_SFX_BAJO);
  });

  it("un sticker nuevo no entra al 90%", () => {
    expect(newOverlay("st-1").soundVolume).toBeLessThanOrEqual(VOL_SFX_MAX);
  });
});
