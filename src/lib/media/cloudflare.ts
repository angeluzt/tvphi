import { env } from "../env";
import type { LiveInput, MediaProvider } from "./provider";

// Proveedor real: Cloudflare Stream Live Inputs.
// Acepta ingest por WHIP (navegador) y RTMPS (OBS) y entrega HLS por CDN.
// Docs: https://developers.cloudflare.com/stream/stream-live/
const API = "https://api.cloudflare.com/client/v4";

function authHeaders() {
  return {
    Authorization: `Bearer ${env.cloudflareStreamToken}`,
    "Content-Type": "application/json",
  };
}

export class CloudflareStreamProvider implements MediaProvider {
  readonly name = "cloudflare";

  private assertConfigured() {
    if (!env.cloudflareAccountId || !env.cloudflareStreamToken) {
      throw new Error(
        "Cloudflare Stream no está configurado (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_TOKEN).",
      );
    }
  }

  async createLiveInput({ channelSlug }: { channelSlug: string; streamKey: string }): Promise<LiveInput> {
    this.assertConfigured();
    const res = await fetch(`${API}/accounts/${env.cloudflareAccountId}/stream/live_inputs`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        meta: { name: channelSlug },
        recording: { mode: "automatic" },
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(`Cloudflare createLiveInput falló: ${JSON.stringify(data.errors ?? data)}`);
    }
    const r = data.result;
    const uid: string = r.uid;
    return {
      inputId: uid,
      whipUrl: r.webRTC?.url ?? "",
      rtmpUrl: r.rtmps?.url ?? "rtmps://live.cloudflare.com:443/live/",
      streamKey: r.rtmps?.streamKey ?? "",
      playbackUrl: this.hlsUrl(uid),
    };
  }

  private hlsUrl(uid: string) {
    // customer-<code> se resuelve a nivel de cuenta; el manifest sigue este patrón.
    return `https://videodelivery.net/${uid}/manifest/video.m3u8`;
  }

  async getPlayback(inputId: string): Promise<{ playbackUrl: string }> {
    return { playbackUrl: this.hlsUrl(inputId) };
  }

  async deleteInput(inputId: string): Promise<void> {
    this.assertConfigured();
    await fetch(`${API}/accounts/${env.cloudflareAccountId}/stream/live_inputs/${inputId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }
}
