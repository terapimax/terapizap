"use client";

// Gerente (Fase 4): fila de sugestões da biblioteca, resumos do dia, retomada de conversas e funil proposto.
// Nada aqui envia mensagem na hora: retomadas viram tarefas de envio (a extensão manda, espaçado, e cancela
// se o cliente responder antes); funis e textos só são criados quando o dono aprova.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { aiError } from "@/hooks/use-ai";
import type { AgentReport, AgentSuggestion, Briefing, LeadMessage } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  return user.id;
}

const DAY = 86_400_000;

/* ---------------------------------------------------------------- sugestões */

/** Sugestões pendentes (mais pedidas primeiro). null = o banco ainda não tem a tabela. */
export function useSuggestions() {
  return useQuery({
    queryKey: ["ai", "suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_suggestions").select("*").eq("status", "pending")
        .order("times", { ascending: false }).order("updated_at", { ascending: false }).limit(100);
      if (error) return null;
      return (data ?? []) as AgentSuggestion[];
    },
  });
}

export const SUGGESTION_KIND: Record<string, string> = { texto: "Texto", audio: "Áudio", imagem: "Imagem", video: "Vídeo", documento: "Documento" };

/**
 * Resolve uma sugestão. text = vira texto pronto da biblioteca; task = vira lembrete para gravar/produzir
 * (áudio, vídeo, imagem, documento); dismiss = descarta.
 */
export function useResolveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ s, action, title, content }: { s: AgentSuggestion; action: "text" | "task" | "dismiss"; title?: string; content?: string }) => {
      const user_id = await uid();
      const t = (title ?? s.title).trim();
      const c = (content ?? s.content ?? "").trim();
      if (action === "text") {
        if (!t || !c) throw new Error("Preencha o título e o texto.");
        const { error } = await supabase.from("messages").insert({ user_id, title: t, content: c, is_favorite: false });
        if (error) throw error;
      } else if (action === "task") {
        const { error } = await supabase.from("tasks").insert({
          user_id, kind: "reminder", status: "scheduled", title: `Gravar ${(SUGGESTION_KIND[s.kind] ?? "item").toLowerCase()} para a biblioteca: ${t}`,
          due_at: new Date(Date.now() + 30 * 60_000).toISOString(), notes: c || null, color: "#d1236f", options: { from_agent: true },
        });
        if (error) throw error;
      }
      const { error } = await supabase.from("agent_suggestions")
        .update({ status: action === "dismiss" ? "dismissed" : "accepted", updated_at: new Date().toISOString() }).eq("id", s.id);
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      qc.invalidateQueries({ queryKey: ["ai", "suggestions"] });
      if (action === "text") { qc.invalidateQueries({ queryKey: ["messages"] }); toast.success("Texto criado na biblioteca. Leia-o na aba Biblioteca para o agente saber quando usar."); }
      if (action === "task") { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Lembrete criado em Tarefas, com o roteiro."); }
    },
    onError: (e) => toast.error(aiError(e)),
  });
}

/* ---------------------------------------------------------------- resumos */

/** Último resumo do dia. undefined = carregando; null = nenhum (ou banco antigo). */
export function useLatestBriefing() {
  return useQuery({
    queryKey: ["ai", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_reports").select("*").order("id", { ascending: false }).limit(1);
      if (error) return { report: null, oldDb: true };
      return { report: ((data ?? [])[0] as AgentReport | undefined) ?? null, oldDb: false };
    },
  });
}

export function useSaveBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (content: { briefing: Briefing; totais?: Record<string, number>; model?: string }) => {
      const user_id = await uid();
      const { error } = await supabase.from("agent_reports").insert({ user_id, kind: "briefing", content });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "reports"] }),
    onError: (e) => toast.error(aiError(e)),
  });
}

/* --------------------------------------------- dados extras para o gerente */

/** Execuções do agente dos últimos `days` dias (para o resumo). */
export async function recentRuns(days = 7) {
  const { data, error } = await supabase.from("agent_runs").select("source,actions,feedback,created_at")
    .gte("created_at", new Date(Date.now() - days * DAY).toISOString()).order("id", { ascending: false }).limit(500);
  return error ? [] : data ?? [];
}

/** Mudanças de etapa dos últimos `days` dias (vendas ganhas e perdidas). */
export async function recentMoves(days = 7) {
  const { data, error } = await supabase.from("kanban_card_moves").select("to_column_id,value,at,seeded")
    .gte("at", new Date(Date.now() - days * DAY).toISOString()).limit(5000);
  return error ? [] : data ?? [];
}

/** Últimas mensagens de cada lead (histórico guardado pela extensão), da mais antiga para a mais nova. */
export async function leadHistories(ids: number[], per = 12): Promise<Map<number, LeadMessage[]>> {
  const out = new Map<number, LeadMessage[]>();
  if (!ids.length) return out;
  const { data, error } = await supabase.from("lead_messages").select("lead_id,from_me,by_zapflow,kind,body,at")
    .in("lead_id", ids).order("at", { ascending: false }).limit(ids.length * 40);
  if (error) return out;
  for (const m of (data ?? []) as LeadMessage[]) {
    const list = out.get(m.lead_id) ?? [];
    if (list.length < per) list.push(m);
    out.set(m.lead_id, list);
  }
  for (const [k, v] of out) out.set(k, v.reverse());
  return out;
}

/* ------------------------------------------------------- retomar conversas */

export interface FollowupItem { lead: { id: number; name: string; phone: string | null; wa_id: string | null }; text: string }

/**
 * Agenda as mensagens de retomada como tarefas de envio, espaçadas (a primeira em ~2 min, depois a cada
 * 4 a 8 min). A extensão envia com "digitando…" e cancela se o cliente responder antes.
 */
export function useScheduleFollowups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: FollowupItem[]) => {
      const user_id = await uid();
      let at = Date.now() + 2 * 60_000;
      const rows = items.filter((i) => i.text.trim() && (i.lead.wa_id || i.lead.phone)).slice(0, 10).map((i, n) => {
        if (n > 0) at += (4 + Math.random() * 4) * 60_000;
        return {
          user_id, lead_id: i.lead.id, kind: "send", status: "scheduled", title: `Retomar conversa: ${i.lead.name}`, due_at: new Date(at).toISOString(),
          contact: i.lead.name, phone: i.lead.phone, content_type: "text", text: i.text.trim(), color: "#d1236f",
          options: { ...(i.lead.wa_id ? { chat_id: i.lead.wa_id } : {}), cancel_on_reply: true, humanize: true, from_agent: true, created_at_ms: Date.now() },
        };
      });
      if (!rows.length) throw new Error("Nenhum lead com WhatsApp para agendar.");
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`${n} ${n === 1 ? "envio agendado" : "envios agendados"} em Tarefas. Deixe o WhatsApp Web aberto com a extensão.`);
    },
    onError: (e) => toast.error(aiError(e)),
  });
}

/* ------------------------------------------------------------------ funil */

export function useCreateProposedFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { titulo: string; descricao: string; passos: { id: number; type: "message" | "audio" | "midia" | "document"; delay_minutes: number }[] }) => {
      const user_id = await uid();
      const { data, error } = await supabase.from("funnels").insert({ user_id, title: p.titulo.trim() || "Funil sugerido", description: p.descricao || "", is_favorite: false }).select("id").single();
      if (error) throw error;
      const fid = (data as { id: number }).id;
      const items = p.passos.map((s, i) => ({ user_id, funnel_id: fid, item_id: s.id, type: s.type, delay_minutes: s.delay_minutes, delay_seconds: 0, position: i }));
      const { error: e2 } = await supabase.from("funnel_items").insert(items);
      if (e2) { await supabase.from("funnels").delete().eq("id", fid); throw e2; }
      return fid;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); toast.success("Funil criado. Ele já aparece em Funis e na extensão."); },
    onError: (e) => toast.error(aiError(e)),
  });
}
