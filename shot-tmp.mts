import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw as any;
const OUT = "/tmp/claude-0/-home-user-tvphi/af3c3440-90a0-5450-9263-c85d6028db07/scratchpad/caps";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
p.on("pageerror", (e: any) => console.log("PAGE ERROR:", e.message));
await p.goto("http://localhost:3111/prueba-montaje", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const lienzo = p.locator("canvas").first();

// Animar VARIAS capas a la vez: marcar 3 y aplicar "Flotar"
await p.getByRole("button", { name: /Seleccionar todas/i }).click();
await p.waitForTimeout(300);
await p.locator('select').filter({ hasText: "Quieto" }).first().selectOption("flotar");
await p.waitForTimeout(800);
console.log("AVISO:", await p.locator("text=/con movimiento/").first().textContent().catch(() => "—"));
await lienzo.screenshot({ path: `${OUT}/E1-guias-varias-capas.png` });

// Una trayectoria A→B en la capa 04 sola
await p.getByRole("button", { name: /Quitar selección/i }).click();
await p.waitForTimeout(200);
await p.locator('button[title="04 Farolillos y arces cercanos"]').click();
await p.waitForTimeout(300);
await p.locator('select').filter({ hasText: "Quieto" }).first().selectOption("trayectoria");
await p.waitForTimeout(900);
await lienzo.screenshot({ path: `${OUT}/E2-guia-A-B.png` });

// El panel de animaciones
const panel = p.getByRole("button", { name: /Animaciones de la escena/ }).locator("xpath=ancestor::div[2]");
await panel.scrollIntoViewIfNeeded();
await p.waitForTimeout(400);
await panel.screenshot({ path: `${OUT}/E3-panel-animaciones.png` });
console.log("FILAS:", (await panel.textContent())?.slice(0, 400));
await b.close();
