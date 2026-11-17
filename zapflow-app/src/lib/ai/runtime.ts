// Resolve, a partir da linha ai_settings, o que é preciso para chamar a IA (chave e modelo certos).
// A regra mora no núcleo compartilhado (zf-ai.js) para o painel e a extensão escolherem igual.

import ZF_AI from "./zf-ai";
import type { Runtime } from "./zf-ai";
import type { AiSettings } from "@/types";

export type AiRuntime = Runtime;

export const DEFAULT_SETTINGS: AiSettings = {
  user_id: "",
  provider: "anthropic",
  model_chat: null,
  model_fast: null,
  anthropic_key: null,
  openai_key: null,
  stt_provider: "openai",
  stt_model: null,
  stt_key: null,
  mode: "off",
  profile: {},
  updated_at: "",
};

export function resolveRuntime(s: AiSettings): AiRuntime {
  return ZF_AI.resolveRuntime(s as unknown as Record<string, unknown>);
}

/** "sk-ant-…a1b2" para mostrar que existe uma chave sem expô-la. */
export function maskKey(k: string | null | undefined) {
  const v = (k ?? "").trim();
  if (!v) return "";
  return v.length <= 10 ? "••••" : `${v.slice(0, 6)}…${v.slice(-4)}`;
}
