import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { defaultScenes } from "../src/lib/scene";

const prisma = new PrismaClient();

async function main() {
  const pass = await bcrypt.hash("demo1234", 10);

  const demos = [
    { username: "phi", displayName: "Phi", title: "Bienvenido a TVPHI", live: true },
    { username: "gamer", displayName: "GamerPro", title: "Gameplay en vivo", live: false },
  ];

  for (const d of demos) {
    const existing = await prisma.user.findUnique({ where: { username: d.username } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        email: `${d.username}@tvphi.com`,
        username: d.username,
        displayName: d.displayName,
        passwordHash: pass,
        channel: {
          create: {
            slug: d.username,
            title: d.title,
            description: "Canal de demostración de TVPHI.",
            isLive: d.live,
            lastLiveAt: d.live ? new Date() : null,
            scenes: {
              create: defaultScenes().map((s, i) => ({ id: `${d.username}_${s.id}`, name: s.name, order: i, layers: s.layers as any })),
            },
            overlayTokens: { create: { label: "Overlay principal" } },
            rewards: {
              create: [
                { title: "Saludo en pantalla", cost: 100, action: "SHOW_MESSAGE" },
                { title: "Reproducir sonido", cost: 250, action: "PLAY_SOUND" },
              ],
            },
          },
        },
      },
    });
    console.log(`✓ usuario demo: ${d.username} / demo1234`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
