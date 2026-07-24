import { nanoid } from "nanoid";
import { env } from "../env";
import type { LiveInput, MediaProvider } from "./provider";

// Proveedor de desarrollo: no requiere credenciales.
// Devuelve un playback HLS de muestra para poder probar la reproducción end-to-end.
// El WHIP apunta a una ruta interna que acepta la oferta y responde (loopback),
// de modo que el flujo "Go Live" del navegador funciona sin infraestructura real.
export class MockProvider implements MediaProvider {
  readonly name = "mock";

  async createLiveInput({ channelSlug }: { channelSlug: string; streamKey: string }): Promise<LiveInput> {
    const inputId = `mock_${nanoid(10)}`;
    return {
      inputId,
      whipUrl: `${env.appUrl}/api/media/whip/${inputId}`,
      rtmpUrl: "rtmp://ingest.local/live",
      streamKey: `${channelSlug}-${nanoid(6)}`,
      playbackUrl: env.mockPlaybackUrl,
    };
  }

  async getPlayback(): Promise<{ playbackUrl: string }> {
    return { playbackUrl: env.mockPlaybackUrl };
  }

  async deleteInput(): Promise<void> {
    // no-op
  }
}
