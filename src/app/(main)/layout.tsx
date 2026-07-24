import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader
        user={
          user
            ? {
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                channelSlug: user.channel?.slug ?? null,
              }
            : null
        }
      />
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4">{children}</div>
    </>
  );
}
