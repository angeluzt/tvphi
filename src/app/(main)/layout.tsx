import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const admin = user ? esAdminHistorias(user.email) : false;
  return (
    <>
      <SiteHeader
        user={
          user
            ? {
                username: user.username,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                admin,
              }
            : null
        }
      />
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4">{children}</div>
    </>
  );
}
