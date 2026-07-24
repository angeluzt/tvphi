// Cliente WHIP (WebRTC-HTTP Ingest Protocol) para publicar desde el navegador.
// Recibe un MediaStream (salida del compositor) y lo envía al endpoint WHIP del proveedor.

export interface WhipSession {
  pc: RTCPeerConnection;
  resourceUrl: string | null;
  stop: () => Promise<void>;
}

export async function publishWhip(whipUrl: string, stream: MediaStream): Promise<WhipSession> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
  });

  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
  // Solo enviamos.
  pc.getTransceivers().forEach((t) => (t.direction = "sendonly"));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGathering(pc);

  const res = await fetch(whipUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? offer.sdp,
  });

  if (!res.ok) {
    pc.close();
    throw new Error(`WHIP falló (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const answer = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  const resourceUrl = res.headers.get("Location");

  return {
    pc,
    resourceUrl,
    async stop() {
      try {
        if (resourceUrl) {
          await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
        }
      } finally {
        pc.getSenders().forEach((s) => s.track?.stop());
        pc.close();
      }
    },
  };
}

function waitIceGathering(pc: RTCPeerConnection, timeoutMs = 2000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(done, timeoutMs);
  });
}
