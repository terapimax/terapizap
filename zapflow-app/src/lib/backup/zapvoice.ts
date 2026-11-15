// Lê o backup .json do ZapVoice (versão 3) e converte para o formato do ZapFlow.
//
// Como o ZapVoice guarda: listas com os nomes (messages, audios, medias, docs, funnels…)
// e, separado, "objectsList" com o conteúdo de cada item pelo mesmo id:
//   texto  -> data = "o texto"
//   áudio  -> data = "data:audio/ogg;base64,…"
//   mídia  -> data = "data:image/jpeg;base64,…", caption = legenda

import { emptyTables, type BackupSource } from "./format";

type Obj = Record<string, unknown>;
interface ZvObject { id: string; data?: string; caption?: string; isPtt?: boolean; fileName?: string }

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Obj[]) : []);

export function isZapVoiceBackup(j: unknown): j is Obj {
  return !!j && typeof j === "object" && Array.isArray((j as Obj).objectsList) && ["audios", "medias", "messages"].some((k) => Array.isArray((j as Obj)[k]));
}

function dataUrlInfo(d: string) {
  const m = /^data:([^;,]*)(;base64)?,/.exec(d);
  if (!m) return null;
  const b64 = d.length - m[0].length;
  return { mime: m[1] || "application/octet-stream", size: m[2] ? Math.floor((b64 * 3) / 4) - (d.endsWith("==") ? 2 : d.endsWith("=") ? 1 : 0) : b64 };
}

function mediaType(mime: string): "audio" | "image" | "video" | "document" {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "document";
}

/** Lê o atraso de um passo de funil em segundos, aceitando os formatos mais prováveis. */
function delaySeconds(s: Obj): number {
  const d = s.delay ?? s.delayInSeconds ?? s.delaySeconds ?? s.timeout ?? s.wait ?? s.interval;
  if (typeof d === "number") return d > 3600 * 24 ? Math.round(d / 1000) : d;
  if (typeof d === "string" && /^\d+$/.test(d)) return Number(d);
  if (d && typeof d === "object") {
    const o = d as Obj;
    return (Number(o.hours) || 0) * 3600 + (Number(o.minutes) || 0) * 60 + (Number(o.seconds) || 0);
  }
  return (Number(s.minutes) || 0) * 60 + (Number(s.seconds) || 0);
}

export function fromZapVoice(j: Obj): BackupSource {
  const objects = new Map<string, ZvObject>();
  for (const o of arr(j.objectsList)) objects.set(str(o.id), o as unknown as ZvObject);

  const tables = emptyTables();
  const notes: string[] = [];
  /** id do ZapVoice -> { tabela, id local } (para os funis apontarem certo) */
  const ref = new Map<string, { table: "messages" | "media_library"; id: number; type: string }>();
  let nextId = 1;
  let filesBytes = 0;
  const base = Date.now() - 1000 * 60 * 60; // mantém a ordem original nas listas (mais novos primeiro)
  let order = 0;
  const createdAt = () => new Date(base - order++ * 1000).toISOString();
  let missing = 0;

  for (const m of arr(j.messages)) {
    const o = objects.get(str(m.id));
    if (!o) { missing++; continue; }
    const id = nextId++;
    tables.messages.push({ id, title: str(m.name) || "Mensagem", content: str(o.data), is_favorite: !!m.isFavorite, created_at: createdAt() });
    ref.set(str(m.id), { table: "messages", id, type: "message" });
  }

  const addMedia = (list: Obj[], forced?: "audio" | "document") => {
    for (const m of list) {
      const o = objects.get(str(m.id));
      const info = o?.data ? dataUrlInfo(o.data) : null;
      if (!o || !info) { missing++; continue; }
      const id = nextId++;
      const type = forced === "audio" ? "audio" : forced === "document" ? "document" : mediaType(info.mime);
      filesBytes += info.size;
      tables.media_library.push({
        id,
        title: str(m.name) || str(o.fileName) || "Arquivo",
        caption: o.caption ? str(o.caption) : null,
        url: `zapvoice:${str(m.id)}`,
        type,
        mime_type: info.mime,
        size: info.size,
        is_favorite: !!m.isFavorite,
        is_view_once: !!m.asViewOnce,
        created_at: createdAt(),
      });
      ref.set(str(m.id), { table: "media_library", id, type: type === "audio" ? "audio" : type === "document" ? "document" : "midia" });
    }
  };
  addMedia(arr(j.audios), "audio");
  addMedia(arr(j.medias));
  addMedia(arr(j.docs), "document");

  // Funis: o ZapVoice não documenta o formato; lemos os passos que apontam para itens conhecidos.
  let lostSteps = 0;
  for (const f of arr(j.funnels)) {
    const fid = nextId++;
    tables.funnels.push({ id: fid, title: str(f.name ?? f.title) || "Funil", description: null, is_favorite: !!f.isFavorite, created_at: createdAt() });
    const steps = arr(f.items ?? f.steps ?? f.sequence ?? f.messages ?? f.itens);
    let pos = 0;
    for (const s of steps) {
      const key = [s.itemId, s.objectId, s.refId, s.messageId, s.audioId, s.mediaId, s.docId, s.id].map(str).find((k) => k && ref.has(k));
      const target = key ? ref.get(key)! : null;
      if (!target) { lostSteps++; continue; }
      const secs = Math.max(0, Math.round(delaySeconds(s)));
      tables.funnel_items.push({
        id: nextId++, funnel_id: fid, item_id: target.id, type: target.type,
        delay_minutes: Math.floor(secs / 60), delay_seconds: secs % 60, position: pos++, created_at: createdAt(),
      });
    }
  }
  if (tables.funnels.length) notes.push("Funis do ZapVoice: confira os tempos entre os passos depois de restaurar.");
  if (lostSteps) notes.push(`${lostSteps} passo(s) de funil apontam para itens que não estão no backup e ficaram de fora.`);
  if (missing) notes.push(`${missing} item(ns) sem conteúdo no arquivo ficaram de fora.`);

  const triggers = arr(j.triggers).length;
  if (triggers) notes.push(`${triggers} gatilho(s) do ZapVoice não foram trazidos: lá eles respondem a palavras recebidas, e aqui os gatilhos funcionam por etapas de lead. Recrie em Gatilhos.`);
  // Etiquetas do ZapVoice viram etiquetas daqui (os contatos de cada uma não vêm no backup).
  const palette = ["#6b7280", "#d1236f", "#b42318", "#c2410c", "#9a5b00", "#0e7a4f", "#0f766e", "#1d4ed8", "#6b21a8", "#be185d"];
  const seenTags = new Set<string>();
  for (const l of arr(j.labels)) {
    const name = str(l.name ?? l.title ?? l.label).trim();
    if (!name || seenTags.has(name.toLowerCase())) continue;
    seenTags.add(name.toLowerCase());
    const color = /^#[0-9a-f]{6}$/i.test(str(l.color)) ? str(l.color) : palette[tables.tags.length % palette.length];
    tables.tags.push({ id: nextId++, name, color, created_at: createdAt() });
  }
  if (tables.tags.length) notes.push(`${tables.tags.length} etiqueta(s) do ZapVoice foram trazidas (sem os contatos, que não vêm no backup).`);
  const flows = arr(j.flows).length;
  if (flows) notes.push(`${flows} fluxo(s) do ZapVoice não têm equivalente e não foram trazidos.`);

  return {
    kind: "zapvoice",
    label: `Backup do ZapVoice${j.version ? ` (versão ${str(j.version)})` : ""}`,
    created_at: null,
    tables,
    filesBytes,
    notes,
    hasFile: (url) => url.startsWith("zapvoice:") && !!objects.get(url.slice(9))?.data,
    async getFile(url) {
      if (!url.startsWith("zapvoice:")) return null;
      const o = objects.get(url.slice(9));
      if (!o?.data) return null;
      const blob = await (await fetch(o.data)).blob();
      o.data = ""; // libera a memória do texto gigante assim que vira arquivo
      return blob;
    },
  };
}
