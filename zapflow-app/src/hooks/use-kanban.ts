"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { KanbanBoard, KanbanColumn, KanbanColumnWithLeads, Lead } from "@/types";
import { toast } from "sonner";
import { removeLeadTaskFiles } from "@/hooks/use-tasks";

const supabase = createClient();

// ── Boards ──────────────────────────────────────────────

export function useBoards() {
  return useQuery({
    queryKey: ["kanban", "boards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kanban_boards")
        .select("*")
        .order("created_at", { ascending: true });
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
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("kanban_boards")
        .insert({ title, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Quadro criado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("kanban_boards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Quadro removido!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

// ── Columns & Leads ──────────────────────────────────────

export function useBoardData(boardId: number | null) {
  return useQuery({
    queryKey: ["kanban", "board", boardId],
    enabled: !!boardId,
    queryFn: async () => {
      if (!boardId) return [];

      // Fetch columns
      const { data: cols, error: colError } = await supabase
        .from("kanban_columns")
        .select("*")
        .eq("board_id", boardId)
        .order("position", { ascending: true });
      if (colError) throw colError;

      // Fetch leads for all columns
      const columnIds = (cols || []).map((c: KanbanColumn) => c.id);
      let leads: Lead[] = [];
      if (columnIds.length > 0) {
        const { data: leadsData, error: leadError } = await supabase
          .from("leads")
          .select("*")
          .in("column_id", columnIds)
          .order("position", { ascending: true });
        if (leadError) throw leadError;
        leads = (leadsData || []) as Lead[];
      }

      // Group leads by column
      return (cols || []).map((col: KanbanColumn) => ({
        ...col,
        items: leads.filter((l) => l.column_id === col.id),
      })) as KanbanColumnWithLeads[];
    },
  });
}

export function useCreateColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { board_id: number; title: string; color: string; position: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("kanban_columns")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Coluna criada!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("kanban_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

// ── Leads ──────────────────────────────────────────────

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      phone?: string;
      email?: string;
      product?: string;
      value?: number;
      status?: "hot" | "warm" | "cold";
      column_id: number;
      position: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("leads")
        .insert({
          ...input,
          user_id: user.id,
          value: input.value || 0,
          status: input.status || "warm",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); toast.success("Lead adicionado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: number }) => {
      const { error } = await supabase.from("leads").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      // as tarefas do lead somem junto (cascade); antes, apaga os áudios exclusivos delas
      await removeLeadTaskFiles(id).catch(() => {});
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["leads-lite"] });
      toast.success("Lead removido!");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useMoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, columnId, position }: { leadId: number; columnId: number; position: number }) => {
      const { error } = await supabase
        .from("leads")
        .update({ column_id: columnId, position })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kanban"] }); },
    onError: (e) => toast.error(`Erro ao mover: ${e.message}`),
  });
}
