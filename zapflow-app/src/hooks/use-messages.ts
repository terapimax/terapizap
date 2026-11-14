"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

export function useMessages() {
  return useQuery({
    queryKey: ["messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Message[];
    },
  });
}

export function useCreateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("messages")
        .insert({ ...input, user_id: user.id, is_favorite: false })
        .select()
        .single();
      if (error) throw error;
      return data as Message;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages"] }); toast.success("Mensagem criada!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useUpdateMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Message> & { id: number }) => {
      const { error } = await supabase.from("messages").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages"] }); toast.success("Mensagem atualizada!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("messages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["messages"] }); toast.success("Mensagem removida!"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}
