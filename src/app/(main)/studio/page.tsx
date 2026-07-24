import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { sceneSchema, defaultScenes, type Scene } from "@/lib/scene";
import { StudioApp } from "@/components/studio/studio-app";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!user.channel) redirect("/auth/register");

  const [dbScenes, overlay] = await Promise.all([
    prisma.scene.findMany({ where: { channelId: user.channel.id }, orderBy: { order: "asc" } }),
    prisma.overlayToken.findFirst({ where: { channelId: user.channel.id } }),
  ]);

  // Valida/parsea las capas guardadas; si algo falla, usa las escenas por defecto.
  let scenes: Scene[] = [];
  for (const s of dbScenes) {
    const parsed = sceneSchema.safeParse({ id: s.id, name: s.name, order: s.order, layers: s.layers });
    if (parsed.success) scenes.push(parsed.data);
  }
  if (scenes.length === 0) scenes = defaultScenes();

  const overlayUrl = overlay ? `${env.appUrl}/overlay/${overlay.token}` : `${env.appUrl}/overlay/none`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Studio</h1>
          <p className="text-sm text-muted">Compón tu directo con escenas y capas — sin OBS.</p>
        </div>
      </div>
      <StudioApp initialScenes={scenes} channelSlug={user.channel.slug} overlayUrl={overlayUrl} />
    </div>
  );
}
