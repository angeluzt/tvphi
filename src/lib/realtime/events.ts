// Contrato de eventos de tiempo real, compartido entre el servidor Socket.IO y el cliente.

export type ChannelRoleName = "VIEWER" | "SUBSCRIBER" | "MODERATOR" | "BROADCASTER";

export interface ChatUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: ChannelRoleName;
}

export interface ChatMessagePayload {
  id: string;
  user: ChatUser;
  body: string;
  createdAt: string;
}

export type AlertKind = "donation" | "follow" | "subscription" | "redemption";

export interface AlertPayload {
  id: string;
  kind: AlertKind;
  title: string; // p.ej. "María donó $5"
  subtitle?: string; // mensaje del usuario
  amount?: string; // formateado
  accent?: string; // color
  sound?: string; // clave de sonido
  durationMs?: number;
}

// Acción que debe ejecutar el overlay/compositor (por redención de reward).
export interface OverlayAction {
  id: string;
  action: "SHOW_MESSAGE" | "PLAY_SOUND" | "CHANGE_SCENE" | "CUSTOM";
  payload: Record<string, unknown>;
}

export interface ChannelSettings {
  isLive: boolean;
  subscriberOnlyChat: boolean;
  slowModeSeconds: number;
  emoteOnly: boolean;
}

// Eventos servidor -> cliente
export interface ServerToClientEvents {
  "chat:message": (msg: ChatMessagePayload) => void;
  "chat:delete": (data: { messageId: string }) => void;
  "chat:history": (msgs: ChatMessagePayload[]) => void;
  "chat:cleared": () => void;
  presence: (data: { viewers: number }) => void;
  alert: (payload: AlertPayload) => void;
  "overlay:action": (action: OverlayAction) => void;
  "channel:settings": (settings: ChannelSettings) => void;
  "points:update": (data: { balance: number }) => void;
  "system:notice": (data: { level: "info" | "error"; message: string }) => void;
}

// Eventos cliente -> servidor
export interface ClientToServerEvents {
  join: (data: { channelSlug: string }, ack?: (res: JoinAck) => void) => void;
  "chat:send": (data: { body: string }) => void;
  mod: (data: {
    type: "TIMEOUT" | "BAN" | "UNBAN" | "BLOCK" | "UNBLOCK" | "DELETE_MESSAGE";
    targetUsername?: string;
    messageId?: string;
    seconds?: number;
    reason?: string;
  }) => void;
  award: (data: { targetUsername: string; amount: number }) => void;
  "reward:redeem": (data: { rewardId: string; userInput?: string }) => void;
  "settings:update": (data: Partial<ChannelSettings>) => void;
  "overlay:test": (data: { kind: AlertKind }) => void;
}

export interface JoinAck {
  ok: boolean;
  role: ChannelRoleName;
  settings: ChannelSettings;
  error?: string;
}

// Nombre de sala por canal (subscriptores del overlay usan otra).
export const channelRoom = (slug: string) => `channel:${slug}`;
export const overlayRoom = (token: string) => `overlay:${token}`;
