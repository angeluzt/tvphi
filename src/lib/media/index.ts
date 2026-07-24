import { env } from "../env";
import { CloudflareStreamProvider } from "./cloudflare";
import { MockProvider } from "./mock";
import type { MediaProvider } from "./provider";

let provider: MediaProvider | null = null;

// Selecciona el proveedor de medios según MEDIA_PROVIDER.
export function getMediaProvider(): MediaProvider {
  if (provider) return provider;
  provider = env.mediaProvider === "cloudflare" ? new CloudflareStreamProvider() : new MockProvider();
  return provider;
}

export type { LiveInput, MediaProvider } from "./provider";
