import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { esAdminHistorias } from "@/lib/story/cupo";

export const dynamic = "force-dynamic";

// El PNG de un sprite guardado.
//
// Igual que con la música: solo lo ve quien ha entrado, y aquí NO se construye
// ninguna ruta de disco con lo que llega. El identificador es la clave de una
// fila, así que o existe o no existe; no hay carpeta de la que salirse ni
// nombre que colar. Los bytes salen de la base de datos tal como entraron, y
// solo entran si son un PNG de verdad (lo comprueba el POST de al lado).

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const fila = await prisma.sprite.findUnique({
    where: { id: params.id },
    select: { tira: true, nombre: true },
  });
  if (!fila) return new NextResponse("Ese sprite no está en la biblioteca.", { status: 404 });

  const cuerpo = new Uint8Array(fila.tira);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(cuerpo.byteLength),
      // Un sprite no cambia nunca: se guarda entero o no se guarda. Se puede
      // cachear a lo bestia, y conviene, porque el montaje lo pide en cada
      // recarga. «private» porque hace falta sesión para pedirlo.
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${fila.nombre.replace(/[^\w\-.]+/g, "-")}.png"`,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esAdminHistorias(user.email)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const borrado = await prisma.sprite.deleteMany({ where: { id: params.id } });
  if (!borrado.count) {
    return NextResponse.json({ error: "Ese sprite ya no está." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
