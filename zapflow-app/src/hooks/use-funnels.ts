"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Funnel, FunnelItem } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

export function useFunnels() {
  return useQuery({
    queryKey: ["funnels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnels")
        .select("*, funnel_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((f: Record<string, unknown>) => ({
        ...f,
        items: ((f.funnel_items as FunnelItem[]) || []).sort(
          (a: FunnelItem, b: FunnelItem) => (a.position - b.position) || (a.id - b.id)
        ),
      })) as Funnel[];
    },
  });
}

export function useCreateFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("funnels")
        .insert({ title, description: "", is_favorite: false, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); toast.success("Funil criado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("funnels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); toast.success("Funil removido!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFunnel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number; title?: string; description?: string; is_favorite?: boolean }) => {
      const { error } = await supabase.from("funnels").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useAddFunnelItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<FunnelItem, "id" | "created_at">) => {
      const { data, error } = await supabase.from("funnel_items").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); toast.success("Item adicionado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteFunnelItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("funnel_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnels"] }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateFunnelDelay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, funnel_id, ...delay }: Pick<FunnelItem, "id" | "funnel_id" | "delay_minutes" | "delay_seconds">) => {
      const { error } = await supabase.from("funnel_items").update(delay)
        .eq("id", id).eq("funnel_id", funnel_id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => toast.success("Intervalo salvo."),
    onError: (e) => toast.error(`Erro ao salvar o intervalo. ${e.message}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["funnels"] }),
  });
}

export function useReorderFunnelSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ funnelId, expectedIds, steps }: { funnelId: number; expectedIds: number[]; steps: FunnelItem[] }) => {
      const { error } = await supabase.rpc("zf_reorder_funnel_steps", {
        p_funnel_id: funnelId, p_expected_ids: expectedIds, p_order_ids: steps.map(step => step.id),
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Ordem salva."),
    onError: (e) => toast.error(`Erro ao salvar a ordem. ${e.message}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["funnels"] }),
  });
}
