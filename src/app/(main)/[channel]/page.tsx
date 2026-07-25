import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getMediaProvider } from "@/lib/media";
import { ChannelInteractive } from "@/components/channel/channel-interactive";
import { ChatBox } from "@/components/chat/chat-box";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: { channel: string } }) {
  const channel = await prisma.channel.findUnique({
    where: { slug: params.channel },
    include: {
      owner: true,
      rewards: { where: { enabled: true }, orderBy: { cost: "asc" } },
    },
  });
  if (!channel) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === channel.ownerId;
  const subscribed = user
    ? Boolean(
        await prisma.subscription.findFirst({
          where: { channelId: channel.id, userId: user.id, status: "ACTIVE" },
          select: { id: true },
        }),
      )
    : false;

  // Resuelve la URL de reproducción del proveedor de medios.
  let playbackUrl = channel.playbackUrl;
  if (channel.isLive && channel.mediaInputId && !playbackUrl) {
    playbackUrl = (await getMediaProvider().getPlayback(channel.mediaInputId)).playbackUrl;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <ChannelInteractive
          channelSlug={channel.slug}
          playbackUrl={playbackUrl}
          isLive={channel.isLive}
          title={channel.title}
          loggedIn={Boolean(user)}
          isOwner={isOwner}
          subscribed={subscribed}
          rewards={channel.rewards.map((r) => ({
            id: r.id,
            title: r.title,
            cost: r.cost,
            action: r.action,
          }))}
        />

        {/* Info del canal */}
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand/20 text-lg font-bold text-brand">
              {channel.owner.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{channel.title}</h1>
              <p className="truncate text-sm text-muted">@{channel.owner.username}</p>
            </div>
          </div>
          {channel.description && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-fg/80">{channel.description}</p>
          )}
        </div>
      </div>

      {/* Chat */}
      <aside className="card h-[calc(100vh-7rem)] overflow-hidden lg:sticky lg:top-20">
        <ChatBox channelSlug={channel.slug} loggedIn={Boolean(user)} />
      </aside>
    </div>
  );
}
