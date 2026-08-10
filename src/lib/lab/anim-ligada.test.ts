import { describe, it, expect } from "vitest";
import {
  normalizarSprite, estadoSpriteEn, duracionRutaSprite,
  animDeSprite, fotogramaActivo, fotogramaDeAnim,
  type SpriteEnCapa,
} from "./sprite-capa";

// Encadenar animaciones del mismo personaje: llega andando, se para, saluda.
//
// Antes eso eran TRES capas con la misma criatura, encendidas y apagadas a mano
// en los momentos exactos: imposible de cuadrar y un desastre en cuanto movías
// la ruta. Ahora la capa lleva sus animaciones colgadas y la ruta dice cuándo
// cambia.
//
// Lo que se prueba aquí es lo que rompe cuando se hace a ojo: que el ciclo de
// fotogramas de la nueva animación empiece EN CERO (si no, el cambio se ve como
// un tirón), que un cambio instantáneo no meta esperas fantasma en la ruta, y
// que un paso que llama a una animación inexistente no llegue a guardarse.

const andar: SpriteEnCapa = {
  fotogramas: 6, fps: 12, x: 0.1, y: 0.8, alto: 0.2, espacio: "pantalla",
};

describe("normalizar animaciones ligadas", () => {
  it("las guarda con sus propios fotogramas y fps", () => {
    const s = normalizarSprite({
      ...andar,
      anims: [{ clave: "saludar", fotogramas: 3, fps: 6, id: "anim-7" }],
    });
    expect(s?.anims).toEqual([{ clave: "saludar", fotogramas: 3, fps: 6, id: "anim-7" }]);
  });

  it("descarta duplicados y las que no tienen clave", () => {
    const s = normalizarSprite({
      ...andar,
      anims: [
        { clave: "correr", fotogramas: 8, fps: 16 },
        { clave: "correr", fotogramas: 2, fps: 2 },
        { clave: "  ", fotogramas: 4, fps: 8 },
        { fotogramas: 4, fps: 8 },
      ],
    });
    expect(s?.anims?.map((a) => a.clave)).toEqual(["correr"]);
    expect(s?.anims?.[0].fotogramas).toBe(8);
  });

  it("un paso «cambiar» a una animación que no existe NO se guarda", () => {
    // Si se guardara, sería una espera invisible que descuadra toda la ruta.
    const s = normalizarSprite({
      ...andar,
      anims: [{ clave: "saludar", fotogramas: 3, fps: 6 }],
      ruta: { pasos: [
        { tipo: "mover", x: 0.5, y: 0.8, segundos: 2 },
        { tipo: "cambiar", anim: "bailar", segundos: 0 },
        { tipo: "cambiar", anim: "saludar", segundos: 0 },
      ] },
    });
    expect(s?.ruta?.pasos).toHaveLength(2);
    expect(s?.ruta?.pasos[1]).toMatchObject({ tipo: "cambiar", anim: "saludar" });
  });

  it("volver a la animación de la capa se escribe con cadena vacía", () => {
    const s = normalizarSprite({
      ...andar,
      anims: [{ clave: "saludar", fotogramas: 3, fps: 6 }],
      ruta: { pasos: [{ tipo: "cambiar", anim: "", segundos: 0 }] },
    });
    expect(s?.ruta?.pasos[0].anim).toBe("");
  });

  it("un «mover» también puede llevar la animación: «vete allí corriendo»", () => {
    const s = normalizarSprite({
      ...andar,
      anims: [{ clave: "correr", fotogramas: 8, fps: 16 }],
      ruta: { pasos: [{ tipo: "mover", x: 1.2, y: 0.8, segundos: 2, anim: "correr" }] },
    });
    expect(s?.ruta?.pasos[0]).toMatchObject({ tipo: "mover", anim: "correr" });
  });

  it("un «cambiar» de cero segundos conserva su cero", () => {
    const s = normalizarSprite({
      ...andar,
      anims: [{ clave: "saludar", fotogramas: 3, fps: 6 }],
      ruta: { pasos: [{ tipo: "cambiar", anim: "saludar", segundos: 0 }] },
    });
    expect(s?.ruta?.pasos[0].segundos).toBe(0);
  });
});

describe("la ruta cambiando de animación", () => {
  const spr = normalizarSprite({
    ...andar,
    anims: [
      { clave: "saludar", fotogramas: 3, fps: 6 },
      { clave: "correr", fotogramas: 8, fps: 16 },
    ],
    ruta: { pasos: [
      { tipo: "mover", x: 0.5, y: 0.8, segundos: 2 },
      { tipo: "cambiar", anim: "saludar", segundos: 0 },
      { tipo: "pausa", segundos: 1 },
      { tipo: "mover", x: 1.2, y: 0.8, segundos: 1, anim: "correr" },
    ] },
  })!;

  it("un cambio instantáneo no alarga la ruta", () => {
    // 2 andando + 0 del cambio + 1 parado + 1 corriendo.
    expect(duracionRutaSprite(spr)).toBe(4);
  });

  it("arranca con la animación de la capa", () => {
    const e = estadoSpriteEn(spr, 0.5);
    expect(e.anim).toBe("");
    expect(animDeSprite(spr, e.anim).fotogramas).toBe(6);
  });

  it("a mitad de la pausa ya está saludando", () => {
    const e = estadoSpriteEn(spr, 2.5);
    expect(e.anim).toBe("saludar");
    expect(animDeSprite(spr, e.anim)).toEqual({ fotogramas: 3, fps: 6 });
  });

  it("y el ciclo del saludo empieza EN CERO, no a mitad", () => {
    // Justo al cambiar (t=2) lleva 0 s de saludo, así que le toca el cuadro 0.
    // Sin reloj propio llevaría 2 s del reloj de la ruta y empezaría por el 0
    // de casualidad; a los 2,1 s ya no coincidiría.
    expect(fotogramaActivo(spr, 2).indice).toBe(0);
    expect(estadoSpriteEn(spr, 2.5).desdeAnim).toBeCloseTo(0.5);
    // 0,5 s a 6 fps son 3 cuadros; con 3 cuadros en total, vuelve al 0.
    expect(fotogramaActivo(spr, 2.5).indice).toBe(0);
    expect(fotogramaActivo(spr, 2.2).indice).toBe(1);
  });

  it("el «mover» con anim corre desde su primer cuadro", () => {
    const e = estadoSpriteEn(spr, 3);
    expect(e.anim).toBe("correr");
    expect(e.desdeAnim).toBeCloseTo(0);
    expect(fotogramaActivo(spr, 3).indice).toBe(0);
    expect(fotogramaActivo(spr, 3.25).indice).toBe(4);   // 0,25 s a 16 fps
  });

  it("y sigue moviéndose donde debe mientras cambia de animación", () => {
    // El cambio de dibujo no puede teletransportarlo: a los 3,5 s va por la
    // mitad del último tramo, de 0,5 a 1,2.
    expect(estadoSpriteEn(spr, 3.5).x).toBeCloseTo(0.85);
  });

  it("al terminar conserva la última animación", () => {
    const e = estadoSpriteEn(spr, 99);
    expect(e.terminado).toBe(true);
    expect(e.anim).toBe("correr");
  });

  it("en bucle vuelve a la animación de partida al recomenzar", () => {
    const enBucle = { ...spr, ruta: { ...spr.ruta!, bucle: true } };
    expect(estadoSpriteEn(enBucle, 4.1).anim).toBe("");
    expect(estadoSpriteEn(enBucle, 2.5).anim).toBe("saludar");
  });
});

describe("compatibilidad con lo de antes", () => {
  it("un sprite sin animaciones ligadas se comporta igual que siempre", () => {
    const s = normalizarSprite({
      ...andar,
      ruta: { pasos: [{ tipo: "mover", x: 1, y: 0.8, segundos: 2 }] },
    })!;
    expect(s.anims).toBeUndefined();
    const e = estadoSpriteEn(s, 1);
    expect(e.anim).toBe("");
    expect(fotogramaActivo(s, 1).indice).toBe(fotogramaDeAnim(6, 12, 1));
  });

  it("animDeSprite cae a la tira de la capa cuando la clave no existe", () => {
    expect(animDeSprite(andar, "fantasma")).toEqual({ fotogramas: 6, fps: 12 });
    expect(animDeSprite(andar, "")).toEqual({ fotogramas: 6, fps: 12 });
  });

  it("una trayectoria simple no tiene animaciones que cambiar", () => {
    const s = normalizarSprite({ ...andar, trayectoria: { x: 1, y: 0.8, segundos: 2 } })!;
    expect(estadoSpriteEn(s, 1).anim).toBe("");
    expect(estadoSpriteEn(s, 1).desdeAnim).toBe(1);
  });
});
