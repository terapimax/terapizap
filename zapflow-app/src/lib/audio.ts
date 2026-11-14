/**
 * Áudio para o WhatsApp: converte qualquer arquivo (mp3, m4a, wav, webm...) em OGG/Opus mono 48 kHz,
 * o formato exato da mensagem de voz. Tudo roda no navegador (WebCodecs), sem enviar nada a servidores.
 */

const RATE = 48000;
const FRAME = 960; // 20 ms a 48 kHz
const DEFAULT_PRESKIP = 312;

export interface VoiceResult {
  blob: Blob;
  /** duração em segundos */
  duration: number;
  /** picos normalizados (0–1) para desenhar a forma de onda */
  peaks: number[];
}

export function audioConversionSupported() {
  return typeof window !== "undefined" && typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined";
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Decodificação → PCM mono 48 kHz ─────────────────────────

async function decodeToMono48k(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: RATE });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const len = decoded.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += ch[i] / decoded.numberOfChannels;
    }
    return mono;
  } finally {
    ctx.close().catch(() => {});
  }
}

export function computePeaks(pcm: Float32Array, bars = 56): number[] {
  const step = Math.max(1, Math.floor(pcm.length / bars));
  const out: number[] = [];
  let max = 0;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const end = Math.min(pcm.length, (b + 1) * step);
    for (let i = b * step; i < end; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    out.push(peak);
    max = Math.max(max, peak);
  }
  return out.map((p) => (max > 0 ? p / max : 0));
}

// ── Contêiner Ogg (RFC 3533 / RFC 7845) ─────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

function oggPage(packets: Uint8Array[], headerType: number, granule: bigint, serial: number, seq: number) {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) { lacing.push(255); n -= 255; }
    lacing.push(n);
  }
  if (lacing.length > 255) throw new Error("Página Ogg com segmentos demais");
  const bodyLen = packets.reduce((a, p) => a + p.length, 0);
  const page = new Uint8Array(27 + lacing.length + bodyLen);
  const dv = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  page[4] = 0; // versão
  page[5] = headerType;
  dv.setBigUint64(6, granule, true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  dv.setUint32(22, 0, true); // CRC (calculado abaixo)
  page[26] = lacing.length;
  page.set(lacing, 27);
  let off = 27 + lacing.length;
  for (const p of packets) { page.set(p, off); off += p.length; }
  dv.setUint32(22, crc32(page), true);
  return page;
}

function opusHead(preSkip: number) {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  h[8] = 1; // versão
  h[9] = 1; // canais
  new DataView(h.buffer).setUint16(10, preSkip, true);
  new DataView(h.buffer).setUint32(12, RATE, true);
  // ganho 0 e mapeamento de canais 0 já são zero
  return h;
}

function opusTags() {
  const vendor = new TextEncoder().encode("ZapFlow");
  const t = new Uint8Array(8 + 4 + vendor.length + 4);
  t.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
  new DataView(t.buffer).setUint32(8, vendor.length, true);
  t.set(vendor, 12);
  return t; // 0 comentários
}

// ── Codificação Opus (WebCodecs) → OGG ──────────────────────

async function encodeOggOpus(pcm: Float32Array, bitrate = 32000): Promise<Blob> {
  if (!audioConversionSupported()) {
    throw new Error("Este navegador não consegue converter áudio. Use o Google Chrome ou o Edge.");
  }

  const packets: Uint8Array[] = [];
  let preSkip = DEFAULT_PRESKIP;
  let failure: Error | null = null;

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      packets.push(buf);
      const desc = meta?.decoderConfig?.description;
      if (desc && packets.length === 1) {
        const d = new Uint8Array(desc as ArrayBuffer);
        if (d.length >= 12 && d[0] === 0x4f && d[1] === 0x70) preSkip = new DataView(d.buffer, d.byteOffset).getUint16(10, true);
      }
    },
    error: (e) => { failure = e instanceof Error ? e : new Error(String(e)); },
  });

  encoder.configure({
    codec: "opus",
    sampleRate: RATE,
    numberOfChannels: 1,
    bitrate,
    opus: { application: "voip", signal: "voice", frameDuration: 20000 },
  } as AudioEncoderConfig);

  const totalFrames = Math.ceil(pcm.length / FRAME);
  for (let f = 0; f < totalFrames; f++) {
    if (failure) break;
    const frame = new Float32Array(FRAME); // zeros no preenchimento do final
    frame.set(pcm.subarray(f * FRAME, Math.min(pcm.length, (f + 1) * FRAME)));
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: RATE,
      numberOfFrames: FRAME,
      numberOfChannels: 1,
      timestamp: Math.round((f * FRAME * 1e6) / RATE),
      data: frame,
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 40) await new Promise((r) => setTimeout(r, 0));
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  if (packets.length === 0) throw new Error("O áudio está vazio.");

  // Monta o OGG: cabeçalhos + ~1 s de áudio por página
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const parts: Uint8Array[] = [];
  let seq = 0;
  parts.push(oggPage([opusHead(preSkip)], 0x02, BigInt(0), serial, seq++));
  parts.push(oggPage([opusTags()], 0x00, BigInt(0), serial, seq++));

  const PER_PAGE = 50;
  const endGranule = Math.min(packets.length * FRAME, preSkip + pcm.length);
  for (let i = 0; i < packets.length; i += PER_PAGE) {
    const slice = packets.slice(i, i + PER_PAGE);
    const last = i + PER_PAGE >= packets.length;
    const granule = last ? endGranule : (i + slice.length) * FRAME;
    parts.push(oggPage(slice, last ? 0x04 : 0x00, BigInt(granule), serial, seq++));
  }
  return new Blob(parts as BlobPart[], { type: "audio/ogg" });
}

// ── API pública ─────────────────────────────────────────────

/** Converte um áudio qualquer (arquivo ou gravação) em mensagem de voz do WhatsApp. */
export async function toWhatsAppVoice(input: Blob): Promise<VoiceResult> {
  let pcm: Float32Array;
  try {
    pcm = await decodeToMono48k(input);
  } catch {
    throw new Error("Não foi possível ler este áudio. Tente outro arquivo (mp3, m4a, wav ou ogg).");
  }
  if (pcm.length < RATE * 0.3) throw new Error("O áudio é muito curto.");
  const blob = await encodeOggOpus(pcm);
  return { blob, duration: pcm.length / RATE, peaks: computePeaks(pcm) };
}
