import Link from "next/link";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { getCurrentUser } from "@/lib/auth";
import { ReenviarVerificacion } from "@/components/auth/reenviar-verificacion";

// Dónde cae quien abre el enlace del correo.
//
// Cada final dice qué pasó y qué hacer ahora. Un «enlace no válido» a secas
// deja a la persona sin salida; si el enlace caducó, lo que necesita es un
// botón para pedir otro, no una disculpa.

export const dynamic = "force-dynamic";

type Estado = "listo" | "ya" | "caducado" | "invalido" | "otro-correo" | "error";

const TEXTOS: Record<Estado, { titulo: string; cuerpo: string; bien: boolean }> = {
  listo: {
    titulo: "Correo confirmado",
    cuerpo: "Ya puedes usar la IA para escribir capítulos, generar imágenes y narrar.",
    bien: true,
  },
  ya: {
    titulo: "Ya estaba confirmado",
    cuerpo: "Esta cuenta ya tenía el correo comprobado. No hay nada más que hacer.",
    bien: true,
  },
  caducado: {
    titulo: "El enlace caducó",
    cuerpo: "Los enlaces valen 2 días. Pide otro y te llega uno nuevo al momento.",
    bien: false,
  },
  invalido: {
    titulo: "Ese enlace ya no vale",
    cuerpo:
      "O se usó antes, o se pidió uno más nuevo que dejó este sin efecto. "
      + "Pide otro y usa el último que te llegue.",
    bien: false,
  },
  "otro-correo": {
    titulo: "La cuenta cambió de dirección",
    cuerpo:
      "Este enlace confirmaba el correo anterior, así que ya no prueba nada. "
      + "Pide uno nuevo y te llegará a la dirección actual.",
    bien: false,
  },
  error: {
    titulo: "Algo falló al confirmar",
    cuerpo: "No se pudo comprobar el enlace. Inténtalo otra vez en un momento.",
    bien: false,
  },
};

export default async function VerificadoPage({
  searchParams,
}: {
  searchParams: { estado?: string };
}) {
  const clave = (searchParams.estado ?? "error") as Estado;
  const t = TEXTOS[clave] ?? TEXTOS.error;
  const user = await getCurrentUser();

  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card p-8">
        <Logo className="mb-6" />
        <div className="flex items-start gap-3">
          {t.bien
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            : clave === "caducado"
              ? <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
              : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{t.titulo}</h1>
            <p className="mt-1 text-sm text-muted">{t.cuerpo}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {!t.bien && (
            user
              ? <ReenviarVerificacion />
              : (
                <p className="text-sm text-muted">
                  Entra a tu cuenta y pide otro enlace desde ahí.
                </p>
              )
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/story" className="btn-brand text-sm">Ir a mis historias</Link>
            {!user && <Link href="/auth/login" className="btn-ghost text-sm">Entrar</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
