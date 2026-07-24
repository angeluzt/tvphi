import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getMediaProvider } from "@/lib/media";
import { emitSettingsToChannel } from "@/server/emit";

// Inicia la emisión: garantiza un live input en el proveedor de medios,
// marca el canal en vivo y devuelve las URLs de ingest (WHIP y RTMP/OBS).
export async function POST() {
  const user = await getCurrentUser();
  if (!user?.channel) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const channel = user.channel;
  const provider = getMediaProvider();

  let { mediaInputId, whipUrl, playbackUrl } = channel;
  let rtmpUrl = "";
  let streamKey = channel.streamKey;

  // Crea el input si no existe todavía.
  if (!mediaInputId || !whipUrl) {
    const input = await provider.createLiveInput({
      channelSlug: channel.slug,
      streamKey: channel.streamKey,
    });
    mediaInputId = input.inputId;
    whipUrl = input.whipUrl;
    playbackUrl = input.playbackUrl;
    rtmpUrl = input.rtmpUrl;
    streamKey = input.streamKey;
    await prisma.channel.update({
      where: { id: channel.id },
      data: { mediaInputId, whipUrl, playbackUrl, streamKey },
    });
  } else {
    playbackUrl = (await provider.getPlayback(mediaInputId)).playbackUrl;
  }

  const updated = await prisma.channel.update({
    where: { id: channel.id },
    data: { isLive: true, lastLiveAt: new Date() },
  });
  await prisma.streamSession.create({ data: { channelId: channel.id, source: "studio" } });

  emitSettingsToChannel(channel.slug, {
    isLive: true,
    subscriberOnlyChat: updated.subscriberOnlyChat,
    slowModeSeconds: updated.slowModeSeconds,
    emoteOnly: updated.emoteOnly,
  });

  return NextResponse.json({
    ok: true,
    whipUrl,
    rtmpUrl,
    streamKey,
    playbackUrl,
    provider: provider.name,
  });
}
