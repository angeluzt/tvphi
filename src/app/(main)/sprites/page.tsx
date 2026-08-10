import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft,Bird } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hayOpenAi } from "@/lib/story/credenciales";
import { esAdminHistorias } from "@/lib/story/cupo";
import { GenerarSprite } from "@/components/lab/generar-sprite";
export const dynamic="force-dynamic";
export default async function SpritesPage(){const u=await getCurrentUser();if(!u)redirect("/auth/login");return <div className="mx-auto max-w-5xl space-y-4">
 <Link href="/" className="btn-ghost w-fit text-xs"><ArrowLeft className="h-3.5 w-3.5"/> Volver</Link>
 <div className="card p-4"><div className="flex gap-2"><Bird className="h-5 w-5 text-accent"/><div><h1 className="text-lg font-bold">Taller de sprites animados</h1>
 <p className="mt-1 text-xs text-muted">Crea personajes con varias animaciones (correr, volar, saltar…). Las fichas de Historias se quedan aparte: aquí solo el mecanismo de sprites.</p></div></div></div>
 <GenerarSprite puedeGenerar={hayOpenAi()} puedePublicar={esAdminHistorias(u.email)}/></div>}
