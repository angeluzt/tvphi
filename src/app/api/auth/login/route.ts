import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { pasarse, origen } from "@/lib/rate-limit";

const schema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
});

const VENTANA = 15 * 60 * 1000;
const TOPE_IP = 30;
const TOPE_ID = 12;

export async function POST(req: Request) {
  const ip = origen(req);
  if (pasarse(`login:ip:${ip}`, TOPE_IP, VENTANA)) {
    return NextResponse.json(
      { error: "Demasiados intentos desde aquí. Espera unos minutos." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const emailOrUsername = parsed.data.emailOrUsername.trim();
  const password = parsed.data.password;
  const claveId = emailOrUsername.toLowerCase();
  if (pasarse(`login:id:${claveId}`, TOPE_ID, VENTANA)) {
    return NextResponse.json(
      { error: "Demasiados intentos con esta cuenta. Espera unos minutos." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: emailOrUsername, mode: "insensitive" } },
        { username: { equals: emailOrUsername, mode: "insensitive" } },
      ],
    },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
