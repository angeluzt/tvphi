import { afterEach, describe, expect, it, vi } from "vitest";

describe("env fail-closed", () => {
  const OLD = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD };
    vi.resetModules();
  });

  it("no exige AUTH_SECRET durante next build (NODE_ENV=production)", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.AUTH_SECRET;
    const { env, esFaseBuildNext } = await import("@/lib/env");
    expect(esFaseBuildNext()).toBe(true);
    expect(() => env.authSecret).not.toThrow();
  });

  it("exige AUTH_SECRET en runtime de producción", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    delete process.env.AUTH_SECRET;
    const { env } = await import("@/lib/env");
    expect(() => env.authSecret).toThrow(/AUTH_SECRET/);
  });
});
