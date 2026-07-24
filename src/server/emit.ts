import type { Server as IOServer } from "socket.io";
import {
  channelRoom,
  type AlertPayload,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from "@/lib/realtime/events";

type IO = IOServer<ClientToServerEvents, ServerToClientEvents>;

// Devuelve la instancia de Socket.IO adjuntada por el servidor personalizado.
// En un despliegue con el realtime separado, aquí se publicaría por Redis en su lugar.
export function getIO(): IO | null {
  return ((globalThis as any).__tvphi_io as IO) ?? null;
}

export function emitAlertToChannel(slug: string, alert: AlertPayload) {
  getIO()?.to(channelRoom(slug)).emit("alert", alert);
}

export function emitSettingsToChannel(slug: string, settings: Parameters<ServerToClientEvents["channel:settings"]>[0]) {
  getIO()?.to(channelRoom(slug)).emit("channel:settings", settings);
}
