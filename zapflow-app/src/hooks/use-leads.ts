"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { LeadFull, Tag } from "@/types";
import { cleanLeadInput, leadErrorMessage, type LeadInput } from "@/lib/leads";
import { removeLeadTaskFiles } from "@/hooks/use-tasks";
import { toast } from "sonner";

const supabase = createClient();

export const LEAD_SELECT = "*, lead_tags(tag_id), kanban_cards(id,board_id,column_id,value,product,position)";

/** Tudo que mostra leads (lista, Kanban, tarefas, Início) é recarregado junto. */
export function invalidateLeads(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["leads"] });
  qc.invalidateQueries({ queryKey: ["kanban"] });
  qc.invalidateQueries({ queryKey: ["leads-lite"] });
}

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  return user.id;
}

/** Busca em páginas de 1000 (limite do Supabase por consulta). */
async function fetchAllLeads(): Promise<LeadFull[]> {
  const out: LeadFull[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("leads").select(LEAD_SELECT).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as LeadFull[]));
    if (!data || data.length < 1000) return out;
  }
}

export function useLeads() {
  return useQuery({ queryKey: ["leads", "all"], queryFn: fetchAllLeads });
}

export function useLead(id: number | null) {
  return useQuery({
    queryKey: ["leads", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select(LEAD_SELECT).eq("id", id!).single();
      if (error) throw error;
      return data as LeadFull;
    },
  });
}

/** Grava as etiquetas do lead exatamente como `tagIds` (tira as que saíram, põe as novas). */
async function setLeadTags(leadId: number, tagIds: number[], userId: string) {
  const { data, error } = await supabase.from("lead_tags").select("id,tag_id").eq("lead_id", leadId);
  if (error) throw error;
  const have = new Map((data ?? []).map((r) => [r.tag_id as number, r.id as number]));
  const want = new Set(tagIds);
  const remove = [...have].filter(([t]) => !want.has(t)).map(([, id]) => id);
  const add = tagIds.filter((t) => !have.has(t));
  if (remove.length) {
    const r = await supabase.from("lead_tags").delete().in("id", remove);
    if (r.error) throw r.error;
  }
  if (add.length) {
    const r = await supabase.from("lead_tags").insert(add.map((tag_id) => ({ lead_id: leadId, tag_id, user_id: userId })));
    if (r.error) throw r.error;
  }
}

export interface NewCardInput { board_id: number; column_id: number; value?: number; product?: string | null }

/** Próxima posição livre no fim da etapa. */
async function nextPosition(columnId: number) {
  const { data } = await supabase.from("kanban_cards").select("position").eq("column_id", columnId).order("position", { ascending: false }).limit(1);
  return data?.[0] ? Number(data[0].position) + 1 : 0;
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lead, tagIds = [], card }: { lead: LeadInput; tagIds?: number[]; card?: NewCardInput | null }) => {
      const user_id = await uid();
      const { data, error } = await supabase.from("leads").insert({ ...cleanLeadInput(lead), user_id }).select("id").single();
      if (error) throw error;
      const id = (data as { id: number }).id;
      if (tagIds.length) await setLeadTags(id, tagIds, user_id);
      if (card) {
        const position = await nextPosition(card.column_id);
        const r = await supabase.from("kanban_cards").insert({ ...card, value: card.value || 0, lead_id: id, position, user_id });
        if (r.error) throw r.error;
      }
      return id;
    },
    onSuccess: () => { invalidateLeads(qc); toast.success("Lead adicionado"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lead, tagIds, cards }: {
      id: number;
      lead: Partial<LeadInput>;
      tagIds?: number[];
      /** mudanças nos cards deste lead (etapa, valor, produto) */
      cards?: { id: number; column_id?: number; value?: number; product?: string | null }[];
    }) => {
      const user_id = await uid();
      const { error } = await supabase.from("leads").update(cleanLeadInput(lead)).eq("id", id);
      if (error) throw error;
      if (tagIds) await setLeadTags(id, tagIds, user_id);
      for (const { id: cardId, ...c } of cards ?? []) {
        const patch: Record<string, unknown> = { ...c };
        if (c.column_id != null) patch.position = await nextPosition(c.column_id);
        const r = await supabase.from("kanban_cards").update(patch).eq("id", cardId);
        if (r.error) throw r.error;
      }
    },
    onSuccess: () => invalidateLeads(qc),
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/** Apaga leads de vez (com os cards, etiquetas e tarefas deles). */
export function useDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      // as tarefas somem junto (cascade); antes, apaga os áudios exclusivos delas
      for (const id of ids) await removeLeadTaskFiles(id).catch(() => {});
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("leads").delete().in("id", ids.slice(i, i + 200));
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => {
      invalidateLeads(qc);
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(n === 1 ? "Lead excluído" : `${n} leads excluídos`);
    },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/** Põe ou tira uma etiqueta de vários leads de uma vez. */
export function useBulkTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadIds, tagId, add }: { leadIds: number[]; tagId: number; add: boolean }) => {
      const user_id = await uid();
      for (let i = 0; i < leadIds.length; i += 200) {
        const part = leadIds.slice(i, i + 200);
        const { error } = add
          ? await supabase.from("lead_tags").upsert(part.map((lead_id) => ({ lead_id, tag_id: tagId, user_id })), { onConflict: "lead_id,tag_id", ignoreDuplicates: true })
          : await supabase.from("lead_tags").delete().eq("tag_id", tagId).in("lead_id", part);
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { invalidateLeads(qc); toast.success(v.add ? "Etiqueta aplicada" : "Etiqueta removida"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/** Coloca leads num quadro (os que já estão nele ficam onde estão). */
export function useAddToBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadIds, boardId, columnId }: { leadIds: number[]; boardId: number; columnId: number }) => {
      const user_id = await uid();
      const { data, error } = await supabase.from("kanban_cards").select("lead_id").eq("board_id", boardId).in("lead_id", leadIds);
      if (error) throw error;
      const already = new Set((data ?? []).map((r) => r.lead_id as number));
      const todo = leadIds.filter((id) => !already.has(id));
      let pos = await nextPosition(columnId);
      for (let i = 0; i < todo.length; i += 200) {
        const rows = todo.slice(i, i + 200).map((lead_id) => ({ lead_id, board_id: boardId, column_id: columnId, position: pos++, user_id }));
        const r = await supabase.from("kanban_cards").insert(rows);
        if (r.error) throw r.error;
      }
      return { added: todo.length, skipped: already.size };
    },
    onSuccess: ({ added, skipped }) => {
      invalidateLeads(qc);
      toast.success(added === 1 ? "Lead colocado no quadro" : `${added} leads colocados no quadro`, {
        description: skipped ? `${skipped} já estava${skipped === 1 ? "" : "m"} nele.` : undefined,
      });
    },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/* ============================ ETIQUETAS ============================ */

export function useTags() {
  return useQuery({
    queryKey: ["leads", "tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*").order("name");
      if (error) throw error;
      return data as Tag[];
    },
  });
}

export function useSaveTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id?: number; name: string; color: string }) => {
      const user_id = await uid();
      const clean = name.trim().replace(/\s+/g, " ");
      if (!clean) throw new Error("Dê um nome à etiqueta.");
      const q = id
        ? supabase.from("tags").update({ name: clean, color }).eq("id", id).select().single()
        : supabase.from("tags").insert({ name: clean, color, user_id }).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateLeads(qc); toast.success("Etiqueta excluída"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}
