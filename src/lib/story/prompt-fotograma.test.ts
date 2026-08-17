import { describe, expect, it } from "vitest";
import { promptFotograma } from "./prompt-fotograma";

describe("el prompt de un fotograma", () => {
  it("prohíbe la rejilla con todas las letras", () => {
    // Diciéndole «frame of an animation» a secas, gpt-image devuelve un
    // storyboard 2×2: cuatro escenas dentro de una imagen.
    const p = promptFotograma({ escena: "un lago al amanecer" });
    expect(p).toMatch(/sprite sheet/i);
    expect(p).toMatch(/2x2 grid/i);
    expect(p).toMatch(/unusable/i);
  });

  it("la descripción de la escena va marcada como CONTEXTO y no la primera", () => {
    // Puesta arriba y a secas, el modelo la lee como el encargo y devuelve una
    // escena nueva parecida en vez de editar la que tiene delante.
    const p = promptFotograma({ escena: "un lago al amanecer" });
    expect(p).toContain("CONTEXT ONLY");
    expect(p.indexOf("un lago al amanecer")).toBeGreaterThan(p.indexOf("Return ONE complete picture"));
  });

  it("sin decirle qué se mueve, cae en un genérico acotado", () => {
    const p = promptFotograma({ escena: "x" });
    expect(p).toMatch(/water rippling/);
    expect(p).toContain("THE ONLY THING THAT CHANGES IS:");
  });

  it("lo que se le dice que mueva gana al genérico", () => {
    const p = promptFotograma({ escena: "x", movimiento: "the campfire flames flicker" });
    expect(p).toContain("THE ONLY THING THAT CHANGES IS: the campfire flames flicker.");
    expect(p).not.toMatch(/water rippling/);
  });

  it("dice en qué punto del recorrido va", () => {
    // Sin esto, los N cuadros se pedían con el MISMO texto y el modelo devolvía
    // saltos al azar alrededor de la foto en vez de un movimiento que avanza.
    const a = promptFotograma({ escena: "x", indice: 1, total: 5 });
    const b = promptFotograma({ escena: "x", indice: 3, total: 5 });
    expect(a).toContain("frame 2 of 5");
    expect(a).toContain("25% of the full movement");
    expect(b).toContain("75% of the full movement");
  });

  it("al último le dice que NO vuelva al principio", () => {
    // El bucle va y vuelve, así que el final es el extremo del gesto. Si
    // intenta «cerrar», deshace el movimiento y se pierde medio recorrido.
    const ultimo = promptFotograma({ escena: "x", indice: 4, total: 5 });
    expect(ultimo).toContain("LAST frame");
    expect(ultimo).toMatch(/Do not return it to the starting position/);
    expect(promptFotograma({ escena: "x", indice: 2, total: 5 })).not.toMatch(/LAST frame/);
  });

  it("sin fase no habla de fotogramas", () => {
    // Rehacer un cuadro suelto no siempre sabe su sitio; mejor callar que
    // mentirle con un «frame 1 of 0».
    expect(promptFotograma({ escena: "x" })).not.toMatch(/frame \d+ of/);
  });

  it("con dos referencias dice cuál manda en qué", () => {
    const p = promptFotograma({ escena: "x", conAncla: true });
    expect(p).toContain("IMAGE 1");
    expect(p).toContain("IMAGE 2");
    expect(p).toMatch(/authority on identity/);
    expect(p).toMatch(/correct any drift/i);
  });

  it("con una sola, no inventa una segunda imagen", () => {
    const p = promptFotograma({ escena: "x" });
    expect(p).not.toContain("IMAGE 2");
    expect(p).toContain("Edit the input photograph");
  });

  it("siempre pide que no se cambie la exposición", () => {
    // Medio paso de diferencia entre cuadros se ve como que la imagen entera
    // parpadea, y eso tapa el movimiento pequeño que se buscaba.
    expect(promptFotograma({ escena: "x" }))
      .toMatch(/same exposure, brightness, contrast, white balance/i);
  });
});
