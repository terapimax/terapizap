"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { ColumnOutcome, KanbanBoard, KanbanCardWithLead, KanbanColumn, KanbanColumnWithCards } from "@/types";
import { leadErrorMessage } from "@/lib/leads";
import { invalidateLeads } from "@/hooks/use-leads";
import { toast } from "sonner";

const supabase = createClient();

// ── Quadros ──────────────────────────────────────────────

export function useBoards() {
  return useQuery({
    queryKey: ["kanban", "boards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kanban_boards").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data as KanbanBoard[];
    },
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const { data, error } = await supabase.from("kanban_boards").insert({ title, user_id: user.id }).select().single();
      if (error) throw error;
      return data as KanbanBoard;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Quadro criado"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("kanban_boards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateLeads(qc); toast.success("Quadro excluído. Os leads continuam em Leads."); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

// ── Etapas e cards ───────────────────────────────────────

/** Todas as etapas de todos os quadros (para a ficha do lead escolher a etapa). */
export function useAllColumns() {
  return useQuery({
    queryKey: ["kanban", "columns-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("kanban_columns").select("*").order("board_id").order("position");
      if (error) throw error;
      return data as KanbanColumn[];
    },
  });
}

const CARD_SELECT = "*, lead:leads(*, lead_tags(tag_id))";

export function useBoardData(boardId: number | null) {
  return useQuery({
    queryKey: ["kanban", "board", boardId],
    enabled: !!boardId,
    queryFn: async () => {
      if (!boardId) return [];
      const [cols, cards] = await Promise.all([
        supabase.from("kanban_columns").select("*").eq("board_id", boardId).order("position", { ascending: true }),
        supabase.from("kanban_cards").select(CARD_SELECT).eq("board_id", boardId).order("position", { ascending: true }).order("id", { ascending: true }),
      ]);
      if (cols.error) throw cols.error;
      if (cards.error) throw cards.error;
      const all = (cards.data ?? []) as KanbanCardWithLead[];
      return (cols.data ?? []).map((col: KanbanColumn) => ({
        ...col,
        items: all.filter((c) => c.column_id === col.id && c.lead),
      })) as KanbanColumnWithCards[];
    },
  });
}

export function useCreateColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { board_id: number; title: string; color: string; position: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const { data, error } = await supabase.from("kanban_columns").insert({ ...input, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Etapa criada"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/** Apaga a etapa. Os cards dela saem do quadro; os leads continuam em Leads. */
export function useDeleteColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateLeads(qc),
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/** Tira o lead deste quadro (o lead continua salvo). */
export function useRemoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("kanban_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidateLeads(qc); toast.success("Lead tirado do quadro. Ele continua em Leads."); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/**
 * Grava a nova ordem depois de arrastar: `columns` = etapas afetadas, cada uma com os ids
 * dos cards na ordem final. Só manda o que mudou.
 */
export function useMoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ columns, before }: {
      columns: { columnId: number; cardIds: number[] }[];
      before: Map<number, { column_id: number; position: number }>;
    }) => {
      const updates: { id: number; column_id: number; position: number }[] = [];
      for (const col of columns) {
        col.cardIds.forEach((id, position) => {
          const b = before.get(id);
          if (!b || b.column_id !== col.columnId || b.position !== position) updates.push({ id, column_id: col.columnId, position });
        });
      }
      // o card que mudou de etapa vai primeiro: é o único que importa se algo falhar no meio
      updates.sort((a, b) => Number(before.get(b.id)?.column_id !== b.column_id) - Number(before.get(a.id)?.column_id !== a.column_id));
      for (const u of updates) {
        const { error } = await supabase.from("kanban_cards").update({ column_id: u.column_id, position: u.position }).eq("id", u.id);
        if (error) throw error;
      }
    },
    onSettled: () => invalidateLeads(qc),
    onError: (e) => toast.error(`Não foi possível mover: ${leadErrorMessage(e)}`),
  });
}

/** Marca a etapa como de resultado (venda fechada / perdido) ou volta a ser etapa normal (null). */
export function useSetColumnOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: ColumnOutcome | null }) => {
      const { error } = await supabase.from("kanban_columns").update({ outcome }).eq("id", id);
      if (error) throw error;
      return outcome;
    },
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ["kanban"] });
      toast.success(o === "won" ? "Etapa marcada como venda fechada" : o === "lost" ? "Etapa marcada como perdido" : "Etapa voltou a ser normal");
    },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}

/**
 * Etapa de entrada: onde caem os leads novos que chegam pelo WhatsApp.
 * Sem nenhuma marcada vale a 1ª etapa do 1º quadro (a mesma regra da função do banco).
 */
export function useInboxColumn() {
  const { data: boards = [] } = useBoards();
  const { data: columns = [] } = useAllColumns();
  const marked = columns.find((c) => c.is_inbox);
  if (marked) return { column: marked, explicit: true };
  for (const b of boards) {
    const first = columns.filter((c) => c.board_id === b.id).sort((a, z) => a.position - z.position || a.id - z.id)[0];
    if (first) return { column: first, explicit: false };
  }
  return { column: null, explicit: false };
}

export function useSetInboxColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (columnId: number) => {
      // só pode haver uma: desmarca a atual antes de marcar a nova
      const off = await supabase.from("kanban_columns").update({ is_inbox: false }).eq("is_inbox", true);
      if (off.error) throw off.error;
      const { error } = await supabase.from("kanban_columns").update({ is_inbox: true }).eq("id", columnId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Os novos leads do WhatsApp vão cair nesta etapa"); },
    onError: (e) => toast.error(leadErrorMessage(e)),
  });
}
