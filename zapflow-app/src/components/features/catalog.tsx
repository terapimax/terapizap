"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Briefcase, Check, Loader2, Package, Plus, Trash2, X } from "lucide-react";
import { useCampaigns, useCatalog, useSaveCampaign, useSaveCatalogItem } from "@/hooks/use-catalog";
import {
  CAMPAIGN_STATE_LABEL, campaignState, draftFromCatalog, durationLabel, itemsTotal, pickerOrder, priceLabel, sameName,
  type DraftCardItem,
} from "@/lib/catalog";
import { deaccent } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shared";
import type { CatalogItem, CatalogKind } from "@/types";

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

const norm = (s: string) => deaccent(s).toLowerCase().trim();
const money2 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function KindIcon({ kind, className }: { kind: CatalogKind; className?: string }) {
  const Icon = kind === "service" ? Briefcase : Package;
  return <Icon className={cn("w-4 h-4 shrink-0", className)} aria-hidden="true" />;
}

/* ============================ CAMPANHA ============================ */

/**
 * Campanha do lead: lista as campanhas (encerradas só se já escolhidas) e permite criar uma na hora.
 * Banco antigo (sem cadastro): campo de texto livre, como antes.
 */
export function CampaignPicker({ id, value, text, onChange, onTextChange }: {
  id: string;
  value: number | null;
  /** texto antigo (banco sem cadastro de campanhas) */
  text: string;
  onChange: (campaignId: number | null) => void;
  onTextChange: (t: string) => void;
}) {
  const { data: campaigns, isLoading } = useCampaigns();
  const save = useSaveCampaign();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  if (isLoading) return <span className="skeleton h-10" />;
  if (!campaigns) {
    return <input id={id} className={inputCls} value={text} placeholder="Ex.: Black Friday" onChange={(e) => onTextChange(e.target.value)} />;
  }

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    const existing = campaigns.find((c) => sameName(c.name, clean));
    const c = existing ?? (await save.mutateAsync({ name: clean }).catch(() => null));
    if (!c) return;
    onChange(c.id);
    setCreating(false);
    setName("");
  };

  if (creating) {
    return (
      <div className="flex gap-1.5">
        <input id={id} autoFocus className={inputCls} value={name} placeholder="Nome da nova campanha" maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); create(); }
            if (e.key === "Escape") { e.stopPropagation(); setCreating(false); }
          }} />
        <Button size="icon" variant="secondary" aria-label="Criar campanha" onClick={create} disabled={!name.trim() || save.isPending} className="shrink-0">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setCreating(false)} className="shrink-0"><X className="w-4 h-4" /></Button>
      </div>
    );
  }

  const shown = campaigns.filter((c) => c.id === value || campaignState(c) !== "ended").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return (
    <select id={id} className={inputCls} value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new") { setCreating(true); return; }
        onChange(e.target.value ? Number(e.target.value) : null);
      }}>
      <option value="">Sem campanha</option>
      {shown.map((c) => {
        const st = campaignState(c);
        return <option key={c.id} value={c.id}>{c.name}{st !== "active" ? ` (${CAMPAIGN_STATE_LABEL[st].toLowerCase()})` : ""}</option>;
      })}
      <option value="__new">+ Nova campanha…</option>
    </select>
  );
}

/* ====================== PRODUTO / SERVIÇO ====================== */

/**
 * Busca no catálogo com criação rápida. Os itens da campanha do lead aparecem primeiro.
 */
export function CatalogPicker({ catalog, campaignItemIds, onPick, label = "Adicionar produto ou serviço" }: {
  catalog: CatalogItem[];
  campaignItemIds: Set<number>;
  onPick: (item: CatalogItem) => void;
  label?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const save = useSaveCatalogItem();
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const nq = norm(q);
  const matches = useMemo(
    () => pickerOrder(catalog, campaignItemIds).filter((i) => !nq || norm(i.name).includes(nq) || norm(i.category ?? "").includes(nq)).slice(0, 30),
    [catalog, campaignItemIds, nq]
  );
  const exact = catalog.some((i) => sameName(i.name, q));
  const creates: CatalogKind[] = q.trim() && !exact ? ["service", "product"] : [];
  type Opt = { kind: "item"; item: CatalogItem } | { kind: "create"; as: CatalogKind };
  const opts: Opt[] = [...matches.map((item) => ({ kind: "item" as const, item })), ...creates.map((as) => ({ kind: "create" as const, as }))];
  const firstOther = matches.findIndex((i) => !campaignItemIds.has(i.id));

  const choose = async (o: Opt | undefined) => {
    if (!o) return;
    if (o.kind === "item") onPick(o.item);
    else {
      const created = await save.mutateAsync({ kind: o.as, name: q }).catch(() => null);
      if (!created) return;
      onPick(created);
    }
    setQ("");
    setActive(0);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Plus className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-label={label}
          aria-activedescendant={open && opts[active] ? `${listId}-${active}` : undefined}
          className={cn(inputCls, "pl-9")} placeholder={catalog.length ? `${label} (busque ou crie)` : "Digite o nome para criar o primeiro item"}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, opts.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open) choose(opts[active]); }
            else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
          }}
        />
        {save.isPending && <Loader2 className="w-4 h-4 animate-spin text-muted absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>
      {open && opts.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-10 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-card shadow-elev py-1">
          {opts.map((o, i) => (
            <li key={o.kind === "item" ? o.item.id : `new-${o.as}`}>
              {o.kind === "item" && campaignItemIds.size > 0 && i === 0 && campaignItemIds.has(o.item.id) && (
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Da campanha do lead</p>
              )}
              {o.kind === "item" && i === firstOther && firstOther > 0 && (
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted border-t border-line mt-1">Outros</p>
              )}
              <div
                id={`${listId}-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={cn("px-3 py-2 flex items-center gap-2.5 cursor-pointer text-sm", i === active && "bg-surface")}
              >
                {o.kind === "item" ? (
                  <>
                    <KindIcon kind={o.item.kind} className="text-muted" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{o.item.name}</span>
                      {(o.item.category || o.item.duration_min) && (
                        <span className="block text-xs text-muted truncate">{[o.item.category, durationLabel(o.item.duration_min)].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted tabular-nums shrink-0">{priceLabel(o.item)}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                    <span className="truncate">Criar {o.as === "service" ? "serviço" : "produto"} <b>“{q.trim()}”</b></span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Itens do card: quantidade e preço negociado de cada um, com a soma.
 * `onChange` recebe a lista nova e a soma (quem usa decide se troca o valor do card).
 */
export function CardItemsEditor({ value, onChange, campaignItemIds, idPrefix }: {
  value: DraftCardItem[];
  onChange: (items: DraftCardItem[], total: number) => void;
  campaignItemIds: Set<number>;
  idPrefix: string;
}) {
  const { data: catalog } = useCatalog();
  const byId = useMemo(() => new Map((catalog ?? []).map((i) => [i.id, i])), [catalog]);
  const set = (items: DraftCardItem[]) => onChange(items, itemsTotal(items));
  const patch = (key: string, p: Partial<DraftCardItem>) => set(value.map((x) => (x.key === key ? { ...x, ...p } : x)));

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col divide-y divide-line border border-line rounded-xl" aria-label="Produtos e serviços do card">
          {value.map((it) => {
            const cat = it.item_id != null ? byId.get(it.item_id) : undefined;
            return (
              <li key={it.key} className="px-3 py-2.5 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  {cat ? <KindIcon kind={cat.kind} className="text-muted mt-0.5" /> : <Package className="w-4 h-4 mt-0.5 text-muted shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{it.name}</span>
                    <span className="block text-xs text-muted truncate">
                      {cat ? [priceLabel(cat), durationLabel(cat.duration_min)].filter(Boolean).join(" · ") : it.item_id == null && it.id ? "Fora do catálogo" : ""}
                    </span>
                  </span>
                  <button type="button" aria-label={`Tirar ${it.name}`} title="Tirar do card" onClick={() => set(value.filter((x) => x.key !== it.key))}
                    className="h-8 w-8 -mt-1 -mr-1 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft cursor-pointer shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 sm:pl-6 text-xs text-muted">
                  <label className="flex items-center gap-1.5">
                    Qtd.
                    <input id={`${idPrefix}-q-${it.key}`} type="number" min="0.01" step="any" inputMode="decimal" value={it.quantity}
                      onChange={(e) => patch(it.key, { quantity: Number(e.target.value) })}
                      className="w-14 h-8 px-2 rounded-lg bg-card border border-line text-sm text-fg tabular-nums outline-none focus:border-fg" />
                  </label>
                  <span aria-hidden="true">×</span>
                  <label className="flex items-center gap-1.5">
                    <span className="sr-only">Preço de {it.name}</span>R$
                    <input id={`${idPrefix}-p-${it.key}`} type="number" min="0" step="0.01" inputMode="decimal" value={it.unit_price}
                      onChange={(e) => patch(it.key, { unit_price: Number(e.target.value) })}
                      className="w-20 sm:w-24 h-8 px-2 rounded-lg bg-card border border-line text-sm text-fg tabular-nums outline-none focus:border-fg" />
                  </label>
                  <span className="ml-auto text-sm font-medium text-fg tabular-nums">{money2(itemsTotal([it]))}</span>
                </div>
              </li>
            );
          })}
          <li className="px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-muted">Soma dos itens</span>
            <span className="font-semibold tabular-nums">{money2(itemsTotal(value))}</span>
          </li>
        </ul>
      )}
      <CatalogPicker catalog={catalog ?? []} campaignItemIds={campaignItemIds}
        onPick={(item) => {
          // escolher de novo o mesmo item soma 1 na quantidade
          const has = value.find((x) => x.item_id === item.id);
          set(has ? value.map((x) => (x === has ? { ...x, quantity: (Number(x.quantity) || 0) + 1 } : x)) : [...value, draftFromCatalog(item)]);
        }} />
    </div>
  );
}
