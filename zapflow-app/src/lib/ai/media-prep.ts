// Prepara arquivos da biblioteca para a IA ler: áudio/vídeo -> áudio pequeno para transcrever,
// imagem -> reduzida, PDF -> base64. Roda no navegador; nada passa por servidor nosso.

import { toWhatsAppVoice } from "@/lib/audio";

export const STT_MAX_BYTES = 24 * 1024 * 1024; // o limite dos serviços é 25 MB
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 300 * 1024 * 1024; // acima disso nem baixa

export async function downloadBlob(url: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Não consegui baixar o arquivo (${res.status}).`);
  return res.blob();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    r.readAsDataURL(blob);
  });
}

/** Devolve o arquivo que vai para a transcrição: o próprio áudio se couber, senão um OGG/Opus pequeno. */
export async function audioForTranscription(blob: Blob, kind: "audio" | "video", filename: string): Promise<{ file: Blob; filename: string }> {
  if (kind === "audio" && blob.size <= STT_MAX_BYTES) return { file: blob, filename };
  try {
    // decodifica o áudio (até da trilha de um vídeo) e recodifica em OGG/Opus mono: ~1,8 MB a cada 10 min
    const v = await toWhatsAppVoice(blob);
    return { file: v.blob, filename: filename.replace(/\.[^.]+$/, "") + ".ogg" };
  } catch (e) {
    if (blob.size <= STT_MAX_BYTES) return { file: blob, filename }; // o serviço tenta ler o arquivo original (mp4, m4a…)
    throw new Error(kind === "video" ? "Não consegui extrair o áudio deste vídeo (formato ou tamanho)." : (e as Error).message);
  }
}

/** Imagem reduzida para no máximo 1568 px no lado maior, em JPEG (menos tokens e sem estourar o limite). */
export async function imageForVision(blob: Blob): Promise<{ mime: string; data: string }> {
  const bmp = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não consegui preparar a imagem.");
    ctx.fillStyle = "#ffffff"; // PNG com transparência vira JPEG sem ficar preto
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const out: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Não consegui preparar a imagem."))), "image/jpeg", 0.85));
    return { mime: "image/jpeg", data: await blobToBase64(out) };
  } finally {
    bmp.close();
  }
}
