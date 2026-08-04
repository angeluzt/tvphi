import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PISTAS, SONIDOS } from "@/lib/story/musica";

// La música y los sonidos de la app, servidos SOLO a quien tiene sesión.
//
// Antes vivían en public/ y cualquiera podía escribir la URL y bajarse el mp3
// suelto. Un archivo público no es ilegal por sí mismo, pero con 80 nombres
// predecibles la app acababa pareciendo un repositorio de samples, y eso es
// justo lo que la licencia del audio no permite: se pueden usar DENTRO de un
// proyecto, no repartir como archivos.
//
// Aquí no hay listado ni índice: hay que pedir un identificador que exista en
// el catálogo. Y el catálogo solo lo ve quien ha entrado.

const CARPETA: Record<string, { dir: string; ids: Set<string> }> = {
  musica: { dir: "musica", ids: new Set(PISTAS.map((p) => p.id)) },
  sonidos: { dir: "sonidos", ids: new Set(SONIDOS.map((s) => s.id)) },
};

export async function GET(
  _req: Request,
  { params }: { params: { tipo: string; id: string } },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const grupo = CARPETA[params.tipo];
  // El id tiene que estar en el catálogo. Con eso se acaba cualquier intento de
  // salirse de la carpeta: no se construye una ruta con lo que llegue, se
  // comprueba contra una lista cerrada.
  if (!grupo || !grupo.ids.has(params.id)) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  try {
    const datos = await readFile(path.join(process.cwd(), "assets", grupo.dir, `${params.id}.mp3`));
    return new NextResponse(new Uint8Array(datos), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(datos.length),
        // Se puede guardar en la caché del navegador —es el mismo archivo
        // siempre— pero privada: nada de cachés compartidas por el camino.
        "Cache-Control": "private, max-age=604800, immutable",
        // Que no se ofrezca como descarga aunque se abra la URL a mano.
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
