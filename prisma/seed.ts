import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const pass = await bcrypt.hash("demo1234", 10);

  const demos = [
    { username: "phi", displayName: "Phi", email: "phi@tvphi.com" },
    { username: "demo", displayName: "Demo", email: "demo@tvphi.com" },
  ];

  for (const d of demos) {
    const existing = await prisma.user.findUnique({ where: { username: d.username } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        email: d.email,
        username: d.username,
        displayName: d.displayName,
        passwordHash: pass,
        // emailVerifiedAt nulo: en local conviene marcarlo a mano o verificar
        // si se prueba el flujo de IA.
      },
    });
    console.log(`Usuario ${d.username} / demo1234`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
