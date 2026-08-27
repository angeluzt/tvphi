import { describe, expect, it } from "vitest";
import {
  VOL_MUSICA_EN_ESCENA, VOL_SFX_BAJO, VOL_SFX_MAX,
  esPistaDeMusica, techoSfx, topeOverride, topeSfx, volumenInicialSfx,
} from "./volumen-sfx";

describe("el techo de los efectos de sonido", () => {
  it("un golpe nunca pasa del 12%", () => {
    expect(topeSfx(0.8, false)).toBe(VOL_SFX_MAX);
    expect(topeSfx(1, false)).toBe(0.12);
  });

  it("un ambiente en bucle nunca pasa del 4%", () => {
    // Suena durante la escena entera, no dos segundos: al 12% ya tapa la voz.
    expect(topeSfx(0.8, true)).toBe(VOL_SFX_BAJO);
    expect(topeSfx(0.12, true)).toBe(0.04);
  });

  it("lo que ya está por debajo se respeta", () => {
    // El tope es un techo, no un nivel: quien quiera un golpe al 3% lo tiene.
    expect(topeSfx(0.03, false)).toBe(0.03);
    expect(topeSfx(0.02, true)).toBe(0.02);
    expect(topeSfx(0, true)).toBe(0);
  });

  it("un número ilegible cae en el techo, no en cero", () => {
    // Un capítulo de la IA sin `volume` tiene que sonar; enmudecerlo sería
    // peor que ponerlo alto, porque no se nota que falta.
    expect(topeSfx(undefined, false)).toBe(VOL_SFX_MAX);
    expect(topeSfx("alto", true)).toBe(VOL_SFX_BAJO);
    expect(topeSfx(NaN, false)).toBe(VOL_SFX_MAX);
    expect(topeSfx(-3, true)).toBe(VOL_SFX_BAJO);
  });

  it("el techo y el volumen de entrada son el mismo número", () => {
    // Un efecto recién puesto entra ya en su sitio: si entrara en silencio
    // habría que ir a buscar la barra en cada sonido que se añade.
    expect(techoSfx(false)).toBe(0.12);
    expect(techoSfx(true)).toBe(0.04);
    expect(volumenInicialSfx(false)).toBe(techoSfx(false));
    expect(volumenInicialSfx(true)).toBe(techoSfx(true));
  });
});

describe("la música puesta por escena no es un ambiente", () => {
  it("conserva su techo del 12% aunque vaya en bucle", () => {
    // Una pista de música puede vivir dentro de `sfx`: así se pone música por
    // escena en vez de una cama global. Ya se aparta sola al narrar, así que
    // meterla en el cajón de los ambientes la habría bajado al techo bajo sin que
    // nadie lo pidiera.
    expect(topeSfx(0.5, true, true)).toBe(VOL_MUSICA_EN_ESCENA);
    expect(techoSfx(true, true)).toBe(0.12);
  });

  it("se reconoce por el prefijo del id, no por el nombre", () => {
    expect(esPistaDeMusica("lib:bosque")).toBe(true);
    expect(esPistaDeMusica("son:lluvia")).toBe(false);
    expect(esPistaDeMusica(undefined)).toBe(false);
    expect(esPistaDeMusica("")).toBe(false);
  });

  it("un sonido de la biblioteca en bucle sí baja al techo bajo", () => {
    // La lluvia es un ambiente, aunque venga de la app: suena bajo la voz
    // durante la escena entera.
    expect(topeSfx(0.5, true, esPistaDeMusica("son:lluvia"))).toBe(VOL_SFX_BAJO);
  });
});

describe("las excepciones de volumen desde otra toma", () => {
  it("«déjalo como venía» sigue siendo null", () => {
    // Convertirlo en un número borraría la diferencia entre no tocar nada y
    // bajar el sonido a cero.
    expect(topeOverride(null, false)).toBeNull();
    expect(topeOverride(undefined, true)).toBeNull();
  });

  it("un número sí se acota, o la excepción sería la puerta de atrás", () => {
    expect(topeOverride(0.9, false)).toBe(VOL_SFX_MAX);
    expect(topeOverride(0.9, true)).toBe(VOL_SFX_BAJO);
    expect(topeOverride(0.03, true)).toBe(0.03);
  });
});
