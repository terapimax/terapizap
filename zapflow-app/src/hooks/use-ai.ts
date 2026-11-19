"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SETTINGS, resolveRuntime } from "@/lib/ai/runtime";
import type { AgentProfile, AgentRun, AiSettings, AutoConfig } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

export const AI_OLD_DB_MSG = "Rode o supabase/setup.sql de novo no Supabase para ativar o Agente de IA.";

export function aiError(e: unknown) {
  const m = `${(e as { message?: string })?.message ?? ""} ${(e as { details?: string })?.details ?? ""}`;
  if (/(ai_settings|agent_runs|ai_status|ai_transcript|ai_when_to_use|ai_summary|ai_tags|ai_at)/i.test(m) && /does not exist|schema cache|not find|could not find/i.test(m)) return AI_OLD_DB_MSG;
  return (e as { message?: string })?.message || "Não foi possível salvar.";
}

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  return user.id;
}

/** Configuração do agente. `oldDb` = o banco ainda não tem as tabelas da IA. */
export function useAiSettings() {
  return useQuery({
    queryKey: ["ai", "settings"],
    queryFn: async (): Promise<{ oldDb: boolean; settings: AiSettings }> => {
      const { data, error } = await supabase.from("ai_settings").select("*").maybeSingle();
      if (error) return { oldDb: true, settings: DEFAULT_SETTINGS };
      return { oldDb: false, settings: { ...DEFAULT_SETTINGS, ...(data ?? {}), profile: (data?.profile as AiSettings["profile"]) ?? {} } };
    },
  });
}

/** Chave e modelos já resolvidos (o que realmente vai para a chamada). */
export function useAiRuntime() {
  const q = useAiSettings();
  const rt = useMemo(() => resolveRuntime(q.data?.settings ?? DEFAULT_SETTINGS), [q.data]);
  return { ...q, rt };
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<AiSettings, "user_id" | "updated_at">>) => {
      const user_id = await uid();
      const clean: Record<string, unknown> = { ...patch };
      // chave vazia = apagar a chave
      for (const k of ["anthropic_key", "openai_key", "stt_key", "model_chat", "model_fast", "stt_model"] as const) {
        if (k in clean && typeof clean[k] === "string") clean[k] = (clean[k] as string).trim() || null;
      }
      const { error } = await supabase.from("ai_settings").upsert({ user_id, ...clean, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "settings"] }),
    onError: (e) => toast.error(aiError(e)),
  });
}

/**
 * Salva só uma parte do perfil sem pisar no resto: o Treino e o Automático moram no mesmo JSON.
 * Lê o perfil atual do banco, troca só o que mudou e grava. O Treino nunca apaga as travas do automático.
 */
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (change: { train: AgentProfile } | { auto: Partial<AutoConfig> } | { briefing: NonNullable<AgentProfile["briefing"]> }) => {
      const user_id = await uid();
      const { data, error: e0 } = await supabase.from("ai_settings").select("profile").maybeSingle();
      if (e0) throw e0;
      const current = ((data?.profile as AgentProfile | null) ?? {}) as AgentProfile;
      let next: AgentProfile;
      if ("train" in change) {
        // o Treino não é dono das travas do automático nem do resumo: preserva o que está salvo
        const { auto: _a, briefing: _b, ...rest } = change.train;
        void _a; void _b;
        next = { ...rest, ...(current.auto ? { auto: current.auto } : {}), ...(current.briefing ? { briefing: current.briefing } : {}) };
      } else if ("auto" in change) {
        next = { ...current, auto: change.auto };
      } else {
        next = { ...current, briefing: change.briefing };
      }
      const { error } = await supabase.from("ai_settings").upsert({ user_id, profile: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "settings"] }),
    onError: (e) => toast.error(aiError(e)),
  });
}

export function useAgentRuns(limit = 40) {
  return useQuery({
    queryKey: ["ai", "runs", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_runs").select("*").order("id", { ascending: false }).limit(limit);
      if (error) return null;
      return (data ?? []) as AgentRun[];
    },
  });
}

export type NewRun = Pick<AgentRun, "source" | "provider" | "model" | "input_tokens" | "output_tokens" | "cache_read_tokens"> &
  Partial<Pick<AgentRun, "lead_id" | "duration_ms" | "summary" | "actions" | "error">>;

export function useLogRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (run: NewRun) => {
      const user_id = await uid();
      const { data, error } = await supabase.from("agent_runs").insert({ user_id, ...run }).select("id").single();
      if (error) throw error;
      return data.id as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "runs"] }),
  });
}

export function useRunFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, feedback }: { id: number; feedback: -1 | 1 | null }) => {
      const { error } = await supabase.from("agent_runs").update({ feedback }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "runs"] }),
    onError: (e) => toast.error(aiError(e)),
  });
}

export function useClearRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_runs").delete().gt("id", 0);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai", "runs"] }); toast.success("Registro apagado."); },
    onError: (e) => toast.error(aiError(e)),
  });
}

/** Grava o que a IA leu de um item da biblioteca (mídia ou texto). */
export async function saveLibraryPatch(table: "media_library" | "messages", id: number, patch: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) throw error;
}

export function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["media"] });
    qc.invalidateQueries({ queryKey: ["messages"] });
  };
}
