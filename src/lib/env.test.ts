import { afterEach, describe, expect, it, vi } from "vitest";

describe("env fail-closed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("no exige AUTH_SECRET durante next build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("AUTH_SECRET", "");
    const { env, esFaseBuildNext } = await import("@/lib/env");
    expect(esFaseBuildNext()).toBe(true);
    expect(() => env.authSecret).not.toThrow();
  });

  it("exige AUTH_SECRET en runtime de producción", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("AUTH_SECRET", "");
    const { env } = await import("@/lib/env");
    expect(() => env.authSecret).toThrow(/AUTH_SECRET/);
  });
});
