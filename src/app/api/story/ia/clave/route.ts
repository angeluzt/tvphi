import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  MODELOS_POR_DEFECTO,
  hayOpenAi,
  preferenciasModelos,
  guardarModelos,
  IA_NO_DISPONIBLE,
} from "@/lib/story/credenciales";
import { esAdminHistorias, estadoCupoHistorias } from "@/lib/story/cupo";
import { leerAjustes } from "@/lib/story/ajustes";

// Estado de IA para la interfaz.
// Modelos: el usuario normal usa los de por defecto; solo el admin los cambia.

const modelos = z.object({
  texto: z.string().max(80),
  imagen: z.string().max(80),
  voz: z.string().max(80),
  vozNombre: z.string().max(40),
});
const guardar = z.object({
  key: z.string().max(300).optional(),
  models: modelos.partial().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const admin = esAdminHistorias(user.email);
  // Sin el correo confirmado no se ofrece nada que gaste: el servidor lo va a
  // rechazar igual, y un botón que siempre falla es peor que no tenerlo.
  const verificado = admin || !!user.emailVerifiedAt;
  const models = await preferenciasModelos(user.id, user.email);
  const ajustes = await leerAjustes();
  // El cupo VIGENTE, no el que se pintó al cargar la página. Si el admin sube
  // el límite, quien estaba bloqueado lo ve sin tener que recargar.
  const cupo = await estadoCupoHistorias(user.id, user.email);
  return NextResponse.json({
    configurada: hayOpenAi(),
    admin,
    models: { ...MODELOS_POR_DEFECTO, ...models },
    // Lo que ESTE usuario puede hacer de verdad, ya cruzado con los ajustes del
    // panel. El editor lo usa para no ofrecer botones que el servidor va a
    // rechazar, que es peor que no tenerlos.
    puede: {
      vozDePago: verificado && hayOpenAi() && (admin || ajustes.vozDePago),
      imagenes: verificado && hayOpenAi() && (admin || ajustes.imagenesIa),
      elegirCalidad: admin,
    },
    calidadImagen: ajustes.calidadImagen,
    verificado,
    cupo,
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = guardar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  if (parsed.data.key) {
    return NextResponse.json({ error: "No se aceptan claves desde el navegador." }, { status: 400 });
  }
  if (!parsed.data.models) {
    return NextResponse.json({ error: "No hay nada que guardar" }, { status: 400 });
  }
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo el administrador puede cambiar los modelos." }, { status: 403 });
  }
  if (!hayOpenAi()) {
    return NextResponse.json({ error: IA_NO_DISPONIBLE }, { status: 503 });
  }

  try {
    const fusion = await guardarModelos(user.id, user.email, parsed.data.models);
    return NextResponse.json({
      ok: true,
      configurada: true,
      admin: true,
      models: fusion,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 403 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json({ ok: true, configurada: hayOpenAi() });
}
