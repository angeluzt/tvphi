import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { attachRealtime } from "./src/server/realtime";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
// Escuchar en 0.0.0.0 para que la plataforma (Railway, etc.) pueda alcanzar la app.
// OJO: no usar process.env.HOSTNAME — en contenedores es el ID del contenedor y
// ataría el servidor a la interfaz equivocada (healthcheck "service unavailable").
const hostname = process.env.HOST ?? "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    handle(req, res, parsedUrl);
  });

  attachRealtime(server);

  server.listen(port, hostname, () => {
    console.log(`▶ TVPHI listo en http://${hostname}:${port}  (realtime en /socket.io)`);
  });
});
