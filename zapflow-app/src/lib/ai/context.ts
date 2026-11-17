// Monta o que o agente "enxerga": biblioteca, etapas do Kanban, etiquetas e catálogo.
// A transformação mora no núcleo compartilhado (zf-ai.js), para o painel e a extensão
// entregarem exatamente o mesmo contexto ao agente. Aqui só ficam os tipos do painel.

import ZF_AI from "./zf-ai";
import type { CatalogRef, LibItem, StageRef, TagRef } from "./zf-ai";
import type { CatalogItem, Funnel, KanbanBoard, KanbanColumn, MediaItem, Message, Tag } from "@/types";

export function buildLibItems(messages: Message[], media: MediaItem[], funnels: Funnel[]): LibItem[] {
  return ZF_AI.libraryFromRows({ messages, media, funnels });
}

export function buildStages(boards: KanbanBoard[], columns: KanbanColumn[]): StageRef[] {
  return ZF_AI.stagesFromRows(boards, columns);
}

export function buildTagRefs(tags: Tag[]): TagRef[] {
  return ZF_AI.tagsFromRows(tags);
}

export function buildCatalogRefs(items: CatalogItem[] | null | undefined): CatalogRef[] {
  return ZF_AI.catalogFromRows(items);
}

/** Quantos itens a IA já leu e quantos faltam. */
export function libraryProgress(media: MediaItem[], messages: Message[]) {
  const readable = media.filter((m) => m.ai_status !== "skipped");
  return {
    media: { total: media.length, done: media.filter((m) => m.ai_status === "done").length, error: media.filter((m) => m.ai_status === "error").length, skipped: media.length - readable.length, pending: readable.filter((m) => !m.ai_status).length },
    texts: { total: messages.length, done: messages.filter((m) => !!m.ai_at).length, pending: messages.filter((m) => !m.ai_at).length },
  };
}
