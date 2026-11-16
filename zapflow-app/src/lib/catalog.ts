// Regras do catálogo (produtos e serviços) e das campanhas, sem acesso ao banco.

import type { Campaign, CardItem, CatalogItem, CatalogKind, PriceMode } from "@/types";

export const KIND_LABEL: Record<CatalogKind, string> = { product: "Produto", service: "Serviço" };
export const PRICE_MODE_LABEL: Record<PriceMode, string> = { fixed: "Preço fixo", from: "A partir de", quote: "Sob consulta" };

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });

/** "R$ 150", "a partir de R$ 100" ou "Sob consulta". */
export function priceLabel(item: Pick<CatalogItem, "price" | "price_mode">) {
  if (item.price_mode === "quote") return "Sob consulta";
  const p = money(Number(item.price) || 0);
  return item.price_mode === "from" ? `a partir de ${p}` : p;
}

export function durationLabel(min: number | null | undefined) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Preço que entra no card ao escolher o item (sob consulta = 0, para preencher depois). */
export const defaultUnitPrice = (item: Pick<CatalogItem, "price" | "price_mode">) => (item.price_mode === "quote" ? 0 : Number(item.price) || 0);

/** Item do card enquanto é editado na ficha (id = já está salvo). */
export interface DraftCardItem {
  key: string;
  id?: number;
  item_id: number | null;
  name: string;
  quantity: number;
  unit_price: number;
}

export const draftFromSaved = (i: CardItem): DraftCardItem => ({
  key: `s${i.id}`, id: i.id, item_id: i.item_id, name: i.name, quantity: Number(i.quantity) || 1, unit_price: Number(i.unit_price) || 0,
});

let seq = 0;
export const draftFromCatalog = (item: CatalogItem): DraftCardItem => ({
  key: `n${Date.now()}_${seq++}`, item_id: item.id, name: item.name, quantity: 1, unit_price: defaultUnitPrice(item),
});

export const itemsTotal = (items: Pick<DraftCardItem, "quantity" | "unit_price">[]) =>
  Math.round(items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0) * 100) / 100;

/** O que gravar para a lista do card ficar igual a `after` (a ordem da lista vira a posição). */
export function diffCardItems(before: CardItem[], after: DraftCardItem[]) {
  const keep = new Set(after.filter((a) => a.id != null).map((a) => a.id!));
  const remove = before.filter((b) => !keep.has(b.id)).map((b) => b.id);
  const update: { id: number; patch: Partial<Pick<CardItem, "quantity" | "unit_price" | "position" | "name">> }[] = [];
  const insert: { item_id: number | null; name: string; quantity: number; unit_price: number; position: number }[] = [];
  after.forEach((a, position) => {
    const quantity = Math.max(Number(a.quantity) || 1, 0.01);
    const unit_price = Math.max(Number(a.unit_price) || 0, 0);
    if (a.id == null) { insert.push({ item_id: a.item_id, name: a.name.trim(), quantity, unit_price, position }); return; }
    const b = before.find((x) => x.id === a.id);
    if (!b) return;
    const patch: Partial<Pick<CardItem, "quantity" | "unit_price" | "position">> = {};
    if (Number(b.quantity) !== quantity) patch.quantity = quantity;
    if (Number(b.unit_price) !== unit_price) patch.unit_price = unit_price;
    if (b.position !== position) patch.position = position;
    if (Object.keys(patch).length) update.push({ id: a.id, patch });
  });
  return { remove, update, insert };
}

export const sameDraft = (before: CardItem[], after: DraftCardItem[]) => {
  const d = diffCardItems(before, after);
  return !d.remove.length && !d.update.length && !d.insert.length;
};

/** Hoje no fuso do navegador, AAAA-MM-DD. */
export function todayIso(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type CampaignState = "active" | "scheduled" | "ended";

/** Encerrada se foi desligada ou se o período já acabou; agendada se ainda não começou. */
export function campaignState(c: Pick<Campaign, "is_active" | "starts_on" | "ends_on">, today = todayIso()): CampaignState {
  if (!c.is_active || (c.ends_on && c.ends_on < today)) return "ended";
  if (c.starts_on && c.starts_on > today) return "scheduled";
  return "active";
}

export const CAMPAIGN_STATE_LABEL: Record<CampaignState, string> = { active: "Ativa", scheduled: "Agendada", ended: "Encerrada" };

const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export function periodLabel(c: Pick<Campaign, "starts_on" | "ends_on">) {
  if (c.starts_on && c.ends_on) return `${fmtDate(c.starts_on)} a ${fmtDate(c.ends_on)}`;
  if (c.starts_on) return `desde ${fmtDate(c.starts_on)}`;
  if (c.ends_on) return `até ${fmtDate(c.ends_on)}`;
  return "Sem período";
}

/** Nome limpo (espaços repetidos viram um) e comparação sem maiúsculas, igual ao banco. */
export const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
export const sameName = (a: string, b: string) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

/** Ordem do seletor: os da campanha do lead primeiro, depois serviços/produtos por nome. Arquivados só se já escolhidos. */
export function pickerOrder(items: CatalogItem[], campaignItemIds: Set<number>) {
  return items
    .filter((i) => i.is_active)
    .sort((a, b) => Number(campaignItemIds.has(b.id)) - Number(campaignItemIds.has(a.id)) || a.name.localeCompare(b.name, "pt-BR"));
}
