import { afterEach, describe, expect, it, vi } from "vitest";
import { esAdminHistorias, mensajeCupoAgotado, mensajeCupoImagenes, puedeParalaje } from "./cupo";
import type { CupoHistorias } from "./cupo";
import * as ajustes from "./ajustes";

describe("cupo · helpers puros", () => {
  const prev = process.env["STORY_QUOTA_EXEMPT_EMAILS"];
  afterEach(() => {
    if (prev === undefined) delete process.env["STORY_QUOTA_EXEMPT_EMAILS"];
    else process.env["STORY_QUOTA_EXEMPT_EMAILS"] = prev;
  });

  it("esAdminHistorias normaliza mayúsculas y espacios", () => {
    process.env["STORY_QUOTA_EXEMPT_EMAILS"] = " Admin@TvPhi.com , otro@x.com ";
    expect(esAdminHistorias("admin@tvphi.com")).toBe(true);
    expect(esAdminHistorias("otro@x.com")).toBe(true);
    expect(esAdminHistorias("nadie@x.com")).toBe(false);
  });

  it("sin lista, nadie es admin", () => {
    delete process.env["STORY_QUOTA_EXEMPT_EMAILS"];
    expect(esAdminHistorias("admin@tvphi.com")).toBe(false);
  });

  it("mensajes de cupo mencionan el retry", () => {
    const c: CupoHistorias = {
      exento: false, usadas: 3, limite: 3, quedan: 0,
      retryAt: "2099-01-01T00:00:00.000Z",
    };
    expect(mensajeCupoAgotado(c)).toMatch(/historias con IA/i);
    expect(mensajeCupoImagenes(c)).toMatch(/im[aá]genes/i);
  });
});

describe("quién puede usar el paralaje 2.5D", () => {
  const original = process.env["STORY_QUOTA_EXEMPT_EMAILS"];
  afterEach(() => {
    if (original === undefined) delete process.env["STORY_QUOTA_EXEMPT_EMAILS"];
    else process.env["STORY_QUOTA_EXEMPT_EMAILS"] = original;
    vi.restoreAllMocks();
  });

  it("el admin puede aunque el ajuste esté apagado", async () => {
    process.env["STORY_QUOTA_EXEMPT_EMAILS"] = "admin@tvphi.com";
    vi.spyOn(ajustes, "leerAjustes").mockResolvedValue({ ...ajustes.AJUSTES_DEFECTO, paralaje25d: false });
    await expect(puedeParalaje("admin@tvphi.com")).resolves.toBe(true);
  });

  it("los demás solo si un admin lo ha encendido", async () => {
    process.env["STORY_QUOTA_EXEMPT_EMAILS"] = "admin@tvphi.com";
    vi.spyOn(ajustes, "leerAjustes").mockResolvedValue({ ...ajustes.AJUSTES_DEFECTO, paralaje25d: false });
    await expect(puedeParalaje("otro@x.com")).resolves.toBe(false);

    vi.spyOn(ajustes, "leerAjustes").mockResolvedValue({ ...ajustes.AJUSTES_DEFECTO, paralaje25d: true });
    await expect(puedeParalaje("otro@x.com")).resolves.toBe(true);
  });

  it("viene apagado de fábrica: nadie lo tiene sin decidirlo", () => {
    expect(ajustes.AJUSTES_DEFECTO.paralaje25d).toBe(false);
  });
});
