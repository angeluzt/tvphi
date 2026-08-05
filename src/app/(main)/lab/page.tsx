import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { esAdminHistorias } from "@/lib/story/cupo";
import { LabApp } from "@/components/lab/lab-app";

export const dynamic = "force-dynamic";

// Solo para quien administra. Se cierra IGUAL que /admin —comprobando en el
// servidor y redirigiendo—, no escondiendo el enlace: esconder un enlace no
// cierra nada, la URL se escribe a mano.
//
// El día que esto entre en el editor de historias, esta página desaparece: es
// un banco de pruebas, no una sección de la app.
export default async function LabPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (!esAdminHistorias(user.email)) redirect("/");

  return (
    <div className="space-y-4">
      <Link href="/" className="btn-ghost w-fit text-xs">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver
      </Link>
      <LabApp />
    </div>
  );
}
