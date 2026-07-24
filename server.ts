import { createServer } from "http";
import next from "next";
import { parse } from "url";
import { attachRealtime } from "./src/server/realtime";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "0.0.0.0";

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
