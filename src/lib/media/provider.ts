// Contrato del proveedor de medios. Permite emitir desde el navegador (WHIP)
// o desde OBS (RTMP) contra el mismo canal, y reproducir por HLS.

export interface LiveInput {
  inputId: string;
  /** URL WHIP para publicar por WebRTC desde el navegador (Studio). */
  whipUrl: string;
  /** URL RTMP para OBS. */
  rtmpUrl: string;
  /** Clave de stream para OBS. */
  streamKey: string;
  /** URL HLS para los espectadores. */
  playbackUrl: string;
}

export interface MediaProvider {
  readonly name: string;
  createLiveInput(opts: { channelSlug: string; streamKey: string }): Promise<LiveInput>;
  getPlayback(inputId: string): Promise<{ playbackUrl: string }>;
  deleteInput(inputId: string): Promise<void>;
}
