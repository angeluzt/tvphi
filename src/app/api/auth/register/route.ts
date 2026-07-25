import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { defaultScenes } from "@/lib/scene";

const schema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/, "Solo letras, números y _"),
  displayName: z.string().min(1).max(40).optional(),
  password: z.string().min(6).max(100),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { email, username, password } = parsed.data;
  const displayName = parsed.data.displayName || username;
  const slug = slugify(username);

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return NextResponse.json({ error: "Email o usuario ya en uso" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayName,
      passwordHash,
      channel: {
        create: {
          slug,
          title: `Proyecto de ${displayName}`,
          scenes: {
            create: defaultScenes().map((s) => ({
              name: s.name,
              order: s.order,
              layers: s.layers as any,
            })),
          },
        },
      },
    },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true, username: user.username, slug });
}
