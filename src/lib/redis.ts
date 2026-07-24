import Redis from "ioredis";
import { env } from "./env";

// Conexiones Redis: una para comandos y otra para el adaptador de Socket.IO (pub/sub).
// Se crean de forma perezosa; si Redis no está disponible, la app sigue funcionando
// para features que no lo requieren (el realtime se degrada con aviso en logs).

const globalForRedis = globalThis as unknown as {
  redisPub?: Redis;
  redisSub?: Redis;
  redisCmd?: Redis;
};

function make(label: string) {
  const client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });
  client.on("error", (err) => {
    // Evita ruido: solo el primer error por proceso
    if (!(client as any)._loggedError) {
      (client as any)._loggedError = true;
      console.warn(`[redis:${label}] no disponible:`, err.message);
    }
  });
  return client;
}

export function getRedis() {
  if (!globalForRedis.redisCmd) globalForRedis.redisCmd = make("cmd");
  return globalForRedis.redisCmd;
}

export function getRedisPubSub() {
  if (!globalForRedis.redisPub) globalForRedis.redisPub = make("pub");
  if (!globalForRedis.redisSub) globalForRedis.redisSub = make("sub");
  return { pub: globalForRedis.redisPub, sub: globalForRedis.redisSub };
}
