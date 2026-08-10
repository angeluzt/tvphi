import { afterEach, describe, expect, it } from "vitest";
import { esAdminHistorias, mensajeCupoAgotado, mensajeCupoImagenes } from "./cupo";
import type { CupoHistorias } from "./cupo";

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
