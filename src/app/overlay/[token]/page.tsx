import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlertOverlay } from "@/components/alerts/alert-overlay";

export const dynamic = "force-dynamic";

// Página browser-source para OBS (o para el compositor del Studio).
// Fondo transparente: solo renderiza las alertas/acciones entrantes.
export default async function OverlayPage({ params }: { params: { token: string } }) {
  const overlay = await prisma.overlayToken.findUnique({
    where: { token: params.token },
    include: { channel: true },
  });
  if (!overlay) notFound();

  return (
    <>
      {/* Hace transparente el fondo del documento para capturas en OBS */}
      <style>{`html,body{background:transparent !important;}`}</style>
      <div className="fixed inset-0">
        <AlertOverlay channelSlug={overlay.channel.slug} transparent />
      </div>
    </>
  );
}
