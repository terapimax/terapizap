// "Ler" a biblioteca: transcreve áudios e vídeos, descreve imagens, lê PDFs e textos e guarda
// resumo + "quando usar" + etiquetas, para o agente saber o que cada item é e quando enviá-lo.

import ZF_AI from "./zf-ai";
import type { EnrichInput, LibKind, Usage } from "./zf-ai";
import type { AiRuntime } from "./runtime";
import { audioForTranscription, blobToBase64, downloadBlob, imageForVision, PDF_MAX_BYTES, VIDEO_MAX_BYTES } from "./media-prep";
import type { MediaItem, Message } from "@/types";

export interface MediaPatch {
  ai_transcript: string | null;
  ai_summary: string | null;
  ai_when_to_use: string | null;
  ai_tags: string[];
  ai_status: "done" | "skipped" | "error";
  ai_error: string | null;
  ai_at: string;
}

export interface TextPatch {
  ai_when_to_use: string | null;
  ai_tags: string[];
  ai_at: string;
}

export const ZERO_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export function sumUsage(a: Usage, b: Usage): Usage {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite };
}

const isAbort = (e: unknown) => (e as { kind?: string })?.kind === "abort" || (e as Error)?.name === "AbortError";
/** Erro que vale para a conta toda (chave, saldo, modelo): não adianta tentar os outros itens. */
export const isFatal = (e: unknown) => ["auth", "quota", "model"].includes((e as { kind?: string })?.kind ?? "");
/** Limite de velocidade do fornecedor: não é defeito do item. Quem lê em lote pausa e tenta o mesmo item de novo. */
export const isRate = (e: unknown) => (e as { kind?: string })?.kind === "rate";
const ext = (url: string) => (url.split("?")[0].split(".").pop() ?? "").toLowerCase();

function skipped(reason: string): { patch: MediaPatch; usage: Usage } {
  return { patch: { ai_transcript: null, ai_summary: null, ai_when_to_use: null, ai_tags: [], ai_status: "skipped", ai_error: reason, ai_at: new Date().toISOString() }, usage: ZERO_USAGE };
}

/** Lê um arquivo da biblioteca. Lança erro se falhar (use readMediaSafe para guardar o erro no item). */
export async function readMedia(item: MediaItem, rt: AiRuntime, signal?: AbortSignal): Promise<{ patch: MediaPatch; usage: Usage }> {
  const kind: LibKind = item.type;
  const base: EnrichInput = { kind, title: item.title, caption: item.caption };
  let transcript = "";

  if (kind === "audio" || kind === "video") {
    if (!rt.sttReady) {
      throw new Error("Falta a chave para transcrever áudio. Veja Agente › Conexão › Transcrição de áudio.");
    }
    if ((item.size ?? 0) > VIDEO_MAX_BYTES) return skipped("Arquivo grande demais para ler automaticamente.");
    const blob = await downloadBlob(item.url, signal);
    if (blob.size > VIDEO_MAX_BYTES) return skipped("Arquivo grande demais para ler automaticamente.");
    const name = `${item.title.replace(/[^\w.-]+/g, "_").slice(0, 40) || "arquivo"}.${ext(item.url) || (kind === "audio" ? "ogg" : "mp4")}`;
    const { file, filename } = await audioForTranscription(blob, kind, name);
    transcript = await ZF_AI.transcribe({ provider: rt.stt.provider, key: rt.stt.key, model: rt.stt.model, file, filename, signal });
    base.transcript = transcript || null;
  } else if (kind === "image") {
    const blob = await downloadBlob(item.url, signal);
    base.image = await imageForVision(blob);
  } else if (kind === "document") {
    const e = ext(item.url);
    const isPdf = item.mime_type === "application/pdf" || e === "pdf";
    const isText = (item.mime_type ?? "").startsWith("text/") || ["txt", "md", "csv", "json"].includes(e);
    if (!isPdf && !isText) return skipped("Formato sem leitura automática. Use PDF ou texto (.txt, .csv).");
    if ((item.size ?? 0) > PDF_MAX_BYTES) return skipped("Documento grande demais para ler automaticamente (máx. 20 MB).");
    const blob = await downloadBlob(item.url, signal);
    if (isPdf) base.document = { mime: "application/pdf", data: await blobToBase64(blob), name: `${item.title}.pdf` };
    else base.text = (await blob.text()).slice(0, 20000);
  }

  const r = await ZF_AI.enrichItem({ provider: rt.provider, key: rt.key, model: rt.modelFast, item: base, signal });
  const content = kind === "audio" || kind === "video" ? transcript : r.content;
  return {
    patch: {
      ai_transcript: content || null,
      ai_summary: r.summary || null,
      ai_when_to_use: r.when_to_use || null,
      ai_tags: r.tags,
      ai_status: "done",
      ai_error: null,
      ai_at: new Date().toISOString(),
    },
    usage: r.usage,
  };
}

/** Igual a readMedia, mas um erro vira o próprio resultado (status "error" + motivo), exceto cancelamento. */
export async function readMediaSafe(item: MediaItem, rt: AiRuntime, signal?: AbortSignal): Promise<{ patch: MediaPatch; usage: Usage }> {
  try {
    return await readMedia(item, rt, signal);
  } catch (e) {
    if (isAbort(e) || isFatal(e) || isRate(e)) throw e;
    return {
      patch: { ai_transcript: item.ai_transcript ?? null, ai_summary: item.ai_summary ?? null, ai_when_to_use: item.ai_when_to_use ?? null, ai_tags: item.ai_tags ?? [], ai_status: "error", ai_error: ((e as Error).message || "Falha ao ler.").slice(0, 300), ai_at: new Date().toISOString() },
      usage: ZERO_USAGE,
    };
  }
}

export async function readText(msg: Message, rt: AiRuntime, signal?: AbortSignal): Promise<{ patch: TextPatch; usage: Usage }> {
  const r = await ZF_AI.enrichItem({ provider: rt.provider, key: rt.key, model: rt.modelFast, signal, item: { kind: "text", title: msg.title, text: msg.content } });
  return { patch: { ai_when_to_use: r.when_to_use || null, ai_tags: r.tags, ai_at: new Date().toISOString() }, usage: r.usage };
}

export { isAbort };
