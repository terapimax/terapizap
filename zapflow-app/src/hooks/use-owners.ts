"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Owner } from "@/types";
import { invalidateLeads } from "@/hooks/use-leads";
import { toast } from "sonner";

const supabase = createClient();

const message = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  if (/uq_owners_name|duplicate key/i.test(m)) return "Já existe um responsável com esse nome.";
  if (/owners|owner_id/i.test(m) && /does not exist|schema cache|not find/i.test(m)) return "Rode o supabase/setup.sql de novo no Supabase para ativar os responsáveis.";
  return m || "Não foi possível salvar.";
};

/**
 * Responsáveis (quem atende os leads). Banco ainda na versão antiga = lista vazia,
 * e as telas simplesmente não mostram nada de responsável.
 */
export function useOwners() {
  return useQuery({
    queryKey: ["owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("owners").select("*").order("name", { ascending: true });
      if (error) return [] as Owner[];
      return (data ?? []) as Owner[];
    },
  });
}

export function useSaveOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: { id?: number; name?: string; color?: string; in_rotation?: boolean }) => {
      const { id, ...patch } = o;
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (!patch.name) throw new Error("Escreva o nome do responsável.");
      }
      if (id) {
        const { error } = await supabase.from("owners").update(patch).eq("id", id);
        if (error) throw error;
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const { error } = await supabase.from("owners").insert({ ...patch, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owners"] }),
    onError: (e) => toast.error(message(e)),
  });
}

/** Apaga o responsável. Os leads dele continuam, sem responsável. */
export function useDeleteOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("owners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owners"] }); invalidateLeads(qc); toast.success("Responsável removido. Os leads dele ficaram sem responsável."); },
    onError: (e) => toast.error(message(e)),
  });
}

/** Passa vários leads para um responsável (null = tira o responsável). */
export function useBulkOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadIds, ownerId }: { leadIds: number[]; ownerId: number | null }) => {
      for (let i = 0; i < leadIds.length; i += 200) {
        const { error } = await supabase.from("leads").update({ owner_id: ownerId }).in("id", leadIds.slice(i, i + 200));
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { invalidateLeads(qc); toast.success(v.ownerId ? "Responsável definido" : "Responsável removido"); },
    onError: (e) => toast.error(message(e)),
  });
}
