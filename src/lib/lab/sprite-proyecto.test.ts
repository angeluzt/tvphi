import { describe, expect, it } from "vitest";
import {
  ARCHIVO_HOJA_SPRITE,
  ARCHIVO_META_SPRITE,
  ARCHIVO_TIRA_SPRITE,
  archivosProyectoSprite,
  crearProyectoSprite,
  normalizarProyectoSprite,
} from "./sprite-proyecto";
import { crearZip, leerZip } from "../story/zip";

const proyecto = crearProyectoSprite({
  nombre: "Araña mecánica",
  que: "clockwork spider running",
  fps: 12,
  forma: "tira",
  croma: "#ff00ff",
  anchoHoja: 1536,
  altoHoja: 1024,
  fotogramas: 2,
  anchoFotograma: 180,
  altoFotograma: 120,
  celdas: [
    { x: 0, y: 0, ancho: 770, alto: 1024 },
    { x: 766, y: 0, ancho: 770, alto: 1024 },
  ],
});

describe("proyecto de sprite", () => {
  it("conserva hoja, tira y ubicación de cada celda", () => {
    const deNuevo = normalizarProyectoSprite(JSON.parse(JSON.stringify(proyecto)));

    expect(deNuevo).toEqual(proyecto);
    expect(deNuevo.celdas[1]).toEqual({ x: 766, y: 0, ancho: 770, alto: 1024 });
  });

  it("empaqueta dos PNG, no una imagen por fotograma", () => {
    const archivos = archivosProyectoSprite(
      proyecto,
      new Uint8Array(new ArrayBuffer(8)),
      new Uint8Array(new ArrayBuffer(8)),
    );

    expect(archivos.map((a) => a.nombre)).toEqual([
      ARCHIVO_HOJA_SPRITE,
      ARCHIVO_TIRA_SPRITE,
      ARCHIVO_META_SPRITE,
      "leeme.txt",
    ]);
    expect(archivos.filter((a) => a.nombre.endsWith(".png"))).toHaveLength(2);
  });

  it("el ZIP que descarga TVPhi se puede leer de regreso", async () => {
    const archivos = archivosProyectoSprite(
      proyecto,
      new Uint8Array(new ArrayBuffer(8)),
      new Uint8Array(new ArrayBuffer(8)),
    );
    const entradas = await leerZip(crearZip(archivos));
    const meta = entradas.find((e) => e.nombre === ARCHIVO_META_SPRITE);

    expect(entradas.map((e) => e.nombre)).toEqual(archivos.map((e) => e.nombre));
    expect(normalizarProyectoSprite(JSON.parse(new TextDecoder().decode(meta!.datos))))
      .toEqual(proyecto);
  });

  it("rechaza manifiestos sin celdas recuperables", () => {
    expect(() => normalizarProyectoSprite({ ...proyecto, celdas: [] }))
      .toThrow("no contiene las celdas");
  });
});
