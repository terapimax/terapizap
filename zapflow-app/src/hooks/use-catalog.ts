"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { invalidateLeads } from "@/hooks/use-leads";
import { cleanName } from "@/lib/catalog";
import type { Campaign, CardItem, CatalogItem } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

export const OLD_DB_MSG = "Rode o supabase/setup.sql de novo no Supabase para ativar produtos, serviços e campanhas.";

export function catalogError(e: unknown) {
  const m = `${(e as { message?: string })?.message ?? ""} ${(e as { details?: string })?.details ?? ""}`;
  if (/uq_catalog_name/i.test(m)) return "Já existe um produto ou serviço com esse nome.";
  if (/uq_campaigns_name/i.test(m)) return "Já existe uma campanha com esse nome.";
  if (/campaigns_period/i.test(m)) return "O fim da campanha não pode ser antes do início.";
  if (/(catalog_items|campaigns|campaign_items|card_items|campaign_id)/i.test(m) && /does not exist|schema cache|not find/i.test(m)) return OLD_DB_MSG;
  return (e as { message?: string })?.message || "Não foi possível salvar.";
}

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  return user.id;
}

/** Produtos e serviços. `null` = banco ainda sem o catálogo (as telas mostram o campo de texto antigo). */
export function useCatalog() {
  return useQuery({
    queryKey: ["catalog", "items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("catalog_items").select("*").order("name", { ascending: true });
      if (error) return null;
      return (data ?? []) as CatalogItem[];
    },
  });
}

/** Campanhas com os itens de cada uma. `null` = banco antigo. */
export function useCampaigns() {
  return useQuery({
    queryKey: ["catalog", "campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*, campaign_items(item_id)").order("created_at", { ascending: false });
      if (error) return null;
      return (data ?? []) as Campaign[];
    },
  });
}

/** Em quantos cards cada item do catálogo está (para a tela de cadastro). */
export function useCatalogUsage() {
  return useQuery({
    queryKey: ["catalog", "usage"],
    queryFn: async () => {
      const m = new Map<number, number>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("card_items").select("item_id").not("item_id", "is", null).order("id").range(from, from + 999);
        if (error) return m;
        for (const r of data ?? []) m.set(r.item_id as number, (m.get(r.item_id as number) ?? 0) + 1);
        if (!data || data.length < 1000) return m;
      }
    },
  });
}

/** Itens dos cards informados (a ficha do lead carrega os dos cards dele). */
export function useCardItems(cardIds: number[]) {
  const ids = [...cardIds].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["catalog", "card-items", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("card_items").select("*").in("card_id", ids).order("position").order("id");
      if (error) return null;
      return (data ?? []) as CardItem[];
    },
  });
}

export type CatalogItemInput = Partial<Omit<CatalogItem, "id" | "user_id" | "created_at">> & { id?: number };

export function useSaveCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: CatalogItemInput) => {
      if (patch.name !== undefined) {
        patch.name = cleanName(patch.name);
        if (!patch.name) throw new Error("Dê um nome ao produto ou serviço.");
      }
      if (patch.category !== undefined) patch.category = patch.category?.trim() || null;
      if (patch.description !== undefined) patch.description = patch.description?.trim() || null;
      const q = id
        ? supabase.from("catalog_items").update(patch).eq("id", id).select().single()
        : supabase.from("catalog_items").insert({ kind: "service", price: 0, price_mode: "fixed", is_active: true, ...patch, user_id: await uid() }).select().single();
      const { data, error } = await q;
      if (error) throw error;
      return data as CatalogItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
    onError: (e) => toast.error(catalogError(e)),
  });
}

/** Apaga do catálogo. Os cards que já tinham o item continuam com ele (nome e preço guardados). */
export function useDeleteCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("catalog_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); toast.success("Excluído do catálogo"); },
    onError: (e) => toast.error(catalogError(e)),
  });
}

export type CampaignInput = Partial<Omit<Campaign, "id" | "user_id" | "created_at" | "campaign_items">> & { id?: number; itemIds?: number[] };

export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemIds, ...patch }: CampaignInput) => {
      if (patch.name !== undefined) {
        patch.name = cleanName(patch.name);
        if (!patch.name) throw new Error("Dê um nome à campanha.");
      }
      if (patch.notes !== undefined) patch.notes = patch.notes?.trim() || null;
      if (patch.channel !== undefined) patch.channel = patch.channel || null;
      if (patch.starts_on !== undefined) patch.starts_on = patch.starts_on || null;
      if (patch.ends_on !== undefined) patch.ends_on = patch.ends_on || null;
      const user_id = await uid();
      const q = id
        ? supabase.from("campaigns").update(patch).eq("id", id).select().single()
        : supabase.from("campaigns").insert({ is_active: true, ...patch, user_id }).select().single();
      const { data, error } = await q;
      if (error) throw error;
      const c = data as Campaign;
      if (itemIds) {
        const { data: have, error: e1 } = await supabase.from("campaign_items").select("id,item_id").eq("campaign_id", c.id);
        if (e1) throw e1;
        const want = new Set(itemIds);
        const del = (have ?? []).filter((r) => !want.has(r.item_id as number)).map((r) => r.id as number);
        const add = itemIds.filter((i) => !(have ?? []).some((r) => r.item_id === i));
        if (del.length) { const r = await supabase.from("campaign_items").delete().in("id", del); if (r.error) throw r.error; }
        if (add.length) { const r = await supabase.from("campaign_items").insert(add.map((item_id) => ({ campaign_id: c.id, item_id, user_id }))); if (r.error) throw r.error; }
      }
      return c;
    },
    // renomear muda o texto da campanha nos leads (o banco faz)
    onSuccess: (_c, v) => { qc.invalidateQueries({ queryKey: ["catalog"] }); if (v.id && v.name !== undefined) invalidateLeads(qc); },
    onError: (e) => toast.error(catalogError(e)),
  });
}

/** Apaga a campanha. Os leads dela continuam, sem campanha. */
export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["catalog"] }); invalidateLeads(qc); toast.success("Campanha excluída"); },
    onError: (e) => toast.error(catalogError(e)),
  });
}
