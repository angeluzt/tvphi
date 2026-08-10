import { describe, it, expect } from "vitest";

// El id que publica el listado de personajes TIENE que ser el que aceptan las
// rutas que lo reciben. Suena obvio; no lo era.
//
// EL FALLO QUE ESTO HABRÍA CAZADO. El listado publicaba `id: "sprite:" + p.id`
// —un prefijo de cuando estos personajes convivían con las fichas de
// Historias— y además `spriteId: p.id`, el de verdad. Renombrar usaba
// `spriteId` y funcionaba; borrar cogió `id` y mandaba una cadena que no existe
// en ninguna tabla. El servidor contestaba, con toda la razón, «ese personaje
// ya no está» para personajes que estaban perfectamente. Y como el mensaje
// suena a «ya se borró», invitaba a pensar que sobraban filas en la base de
// datos en vez de que el id iba mal.
//
// La lección no es «acuérdate de usar spriteId», es que dos identificadores
// para la misma fila son una trampa. El prefijo se ha quitado.

/** Lo mismo que hace la ruta al recibir el id. */
const idDeLaRuta = (recibido: string) => recibido.replace(/^sprite:/, "");

/** Lo que publica el listado hoy. */
const idDelListado = (filaId: string) => ({ id: filaId, spriteId: filaId });

describe("el id de un personaje", () => {
  it("el que publica el listado sirve para borrar", () => {
    const fila = "cmabc123";
    const pub = idDelListado(fila);
    expect(idDeLaRuta(pub.id)).toBe(fila);
    expect(idDeLaRuta(pub.spriteId)).toBe(fila);
  });

  it("«id» y «spriteId» son el mismo, para que no se pueda coger el malo", () => {
    const pub = idDelListado("cmabc123");
    expect(pub.id).toBe(pub.spriteId);
  });

  it("la ruta sigue aceptando el prefijo viejo", () => {
    // Quien tenga la página abierta de antes del arreglo manda «sprite:…».
    // Sin esto seguiría sin poder borrar hasta recargar, y el síntoma no lo
    // sugiere por ningún lado.
    expect(idDeLaRuta("sprite:cmabc123")).toBe("cmabc123");
  });

  it("no destroza un id que casualmente lleve «sprite» dentro", () => {
    expect(idDeLaRuta("cmsprite123")).toBe("cmsprite123");
    expect(idDeLaRuta("cm-sprite:x")).toBe("cm-sprite:x");
  });
});
