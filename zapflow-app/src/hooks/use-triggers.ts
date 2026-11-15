"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Trigger, TriggerFire } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

export function useTriggers() {
  return useQuery({
    queryKey: ["triggers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("triggers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Trigger[];
    },
  });
}

export function useCreateTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Trigger, "id" | "user_id" | "created_at">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("triggers")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["triggers"] }); toast.success("Gatilho criado!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Trigger> & { id: number }) => {
      const { error } = await supabase.from("triggers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["triggers"] }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("triggers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["triggers"] }); toast.success("Gatilho removido!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

/** Últimos disparos dos gatilhos de lead (para mostrar "disparou N vezes" e o que aconteceu). */
export function useTriggerFires() {
  return useQuery({
    queryKey: ["trigger-fires"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trigger_fires")
        .select("id, trigger_id, lead_id, event, result, task_id, created_at, lead:leads(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as TriggerFire[];
    },
  });
}
