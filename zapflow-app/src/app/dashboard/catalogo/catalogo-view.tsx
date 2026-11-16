"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Archive, Loader2, Megaphone, Package, Plus, Trash2 } from "lucide-react";
import { useCampaigns, useCatalog, useCatalogUsage, useDeleteCampaign, useDeleteCatalogItem, useSaveCampaign, useSaveCatalogItem, OLD_DB_MSG } from "@/hooks/use-catalog";
import { useLeads } from "@/hooks/use-leads";
import { useOpenFromQuery } from "@/hooks/use-open-from-query";
import { KindIcon } from "@/components/features/catalog";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import {
  CAMPAIGN_STATE_LABEL, KIND_LABEL, PRICE_MODE_LABEL, campaignState, durationLabel, periodLabel, priceLabel, type CampaignState,
} from "@/lib/catalog";
import { ORIGINS, deaccent } from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { Campaign, CatalogItem, CatalogKind, PriceMode } from "@/types";
import { toast } from "sonner";

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";
const selectCls = "h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm cursor-pointer outline-none focus:border-fg max-w-full";
const norm = (s: string) => deaccent(s).toLowerCase().trim();

function Field({ label, htmlFor, children, className, hint }: { label: string; htmlFor: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors whitespace-nowrap", value === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export type CatalogTab = "itens" | "campanhas";
type Tab = CatalogTab;

export function CatalogoView({ initialTab }: { initialTab: CatalogTab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [creating, setCreating] = useState(0);
  useOpenFromQuery(() => setCreating((n) => n + 1));
  const { data: catalog, isLoading } = useCatalog();

  const switchTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "campanhas") url.searchParams.set("aba", "campanhas"); else url.searchParams.delete("aba");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <Segmented label="Cadastro" value={tab} onChange={switchTab} options={[["itens", "Produtos e serviços"], ["campanhas", "Campanhas"]]} />
      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-16" />)}</div>
      ) : catalog === null ? (
        <EmptyState icon={AlertCircle} title="Falta atualizar o banco" description={OLD_DB_MSG} />
      ) : tab === "itens" ? (
        <ItemsTab items={catalog ?? []} createSignal={creating} />
      ) : (
        <CampaignsTab items={catalog ?? []} createSignal={creating} />
      )}
    </div>
  );
}

/* ======================= PRODUTOS E SERVIÇOS ======================= */

function ItemsTab({ items, createSignal }: { items: CatalogItem[]; createSignal: number }) {
  const { data: usage } = useCatalogUsage();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | CatalogKind>("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const [lastSignal, setLastSignal] = useState(createSignal);
  if (createSignal !== lastSignal) { setLastSignal(createSignal); setEditing("new"); }

  const archived = items.filter((i) => !i.is_active).length;
  const nq = norm(q);
  const shown = items
    .filter((i) => (showArchived || i.is_active) && (!kind || i.kind === kind) && (!nq || norm(i.name).includes(nq) || norm(i.category ?? "").includes(nq)))
    .sort((a, b) => (a.category ?? "￿").localeCompare(b.category ?? "￿", "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
  const groups = useMemo(() => {
    const m = new Map<string, CatalogItem[]>();
    for (const i of shown) { const k = i.category?.trim() || ""; m.set(k, [...(m.get(k) ?? []), i]); }
    return [...m];
  }, [shown]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort(), [items]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou categoria" className="sm:w-72" />
        <select aria-label="Tipo" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as "" | CatalogKind)}>
          <option value="">Produtos e serviços</option>
          <option value="service">Só serviços</option>
          <option value="product">Só produtos</option>
        </select>
        {archived > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 accent-[var(--fg)] cursor-pointer" />
            Mostrar arquivados ({archived})
          </label>
        )}
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Novo item</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title="Cadastre o que você vende"
          description="Produtos e serviços aparecem para escolher no card do lead, com preço e duração. Os textos que já estavam nos cards foram trazidos para cá."
          action={<Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Novo item</Button>} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Nada encontrado com esses filtros.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(([cat, list]) => (
            <section key={cat || "_"} aria-label={cat || "Sem categoria"} className="flex flex-col gap-2">
              {(groups.length > 1 || cat) && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{cat || "Sem categoria"}</h3>}
              <Panel className="divide-y divide-line overflow-hidden">
                {list.map((i) => {
                  const n = usage?.get(i.id) ?? 0;
                  return (
                    <button key={i.id} type="button" onClick={() => setEditing(i)}
                      className={cn("w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-surface transition-colors", !i.is_active && "opacity-60")}>
                      <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0"><KindIcon kind={i.kind} className="text-muted" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{i.name}</span>
                          {!i.is_active && <Chip>Arquivado</Chip>}
                        </span>
                        <span className="block text-xs text-muted truncate">
                          {[KIND_LABEL[i.kind], durationLabel(i.duration_min), n ? `em ${n} ${n === 1 ? "negócio" : "negócios"}` : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{priceLabel(i)}</span>
                    </button>
                  );
                })}
              </Panel>
            </section>
          ))}
        </div>
      )}

      <ItemSheet key={editing === "new" ? "new" : editing?.id ?? "none"} item={editing} categories={categories} usage={editing && editing !== "new" ? usage?.get(editing.id) ?? 0 : 0} onClose={() => setEditing(null)} />
    </>
  );
}

function ItemSheet({ item, categories, usage, onClose }: { item: CatalogItem | "new" | null; categories: string[]; usage: number; onClose: () => void }) {
  const isNew = item === "new";
  const base = item && item !== "new" ? item : null;
  const [form, setForm] = useState({
    kind: (base?.kind ?? "service") as CatalogKind,
    name: base?.name ?? "",
    category: base?.category ?? "",
    price_mode: (base?.price_mode ?? "fixed") as PriceMode,
    price: base ? Number(base.price) : 0,
    duration_min: base?.duration_min ?? null as number | null,
    description: base?.description ?? "",
    is_active: base?.is_active ?? true,
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const save = useSaveCatalogItem();
  const del = useDeleteCatalogItem();

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Dê um nome ao item.");
    const ok = await save.mutateAsync({
      ...(base ? { id: base.id } : {}),
      ...form,
      price: form.price_mode === "quote" ? 0 : Math.max(Number(form.price) || 0, 0),
      duration_min: form.kind === "service" && form.duration_min && form.duration_min > 0 ? Math.round(form.duration_min) : null,
    }).catch(() => null);
    if (!ok) return;
    toast.success(isNew ? "Item cadastrado" : "Item salvo");
    onClose();
  };

  return (
    <Modal open={!!item} onClose={onClose} title={isNew ? "Novo produto ou serviço" : form.name || "Item"}
      footer={confirmDel ? (
        <div className="flex-1 flex flex-wrap items-center gap-2">
          <span className="text-sm mr-auto">{usage ? `Está em ${usage} ${usage === 1 ? "negócio" : "negócios"}, que continuam com ele (nome e preço guardados).` : "Excluir de vez?"}</span>
          <Button variant="secondary" onClick={() => setConfirmDel(false)}>Manter</Button>
          <Button variant="danger" onClick={() => base && del.mutate(base.id, { onSuccess: onClose })} disabled={del.isPending}>Excluir</Button>
        </div>
      ) : (
        <>
          {base && (
            <Button variant="ghost" size="icon" aria-label="Excluir item" title="Excluir item" onClick={() => setConfirmDel(true)} className="mr-auto hover:text-hot"><Trash2 className="w-4 h-4" /></Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending || !form.name.trim()}>{save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <Segmented label="Tipo" value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={[["service", "Serviço"], ["product", "Produto"]]} />
        <Field label="Nome" htmlFor="ci-name">
          <input id="ci-name" data-autofocus className={inputCls} value={form.name} maxLength={120} placeholder={form.kind === "service" ? "Ex.: Massagem relaxante 60 min" : "Ex.: Óleo de massagem 100 ml"}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Categoria (opcional)" htmlFor="ci-cat" hint="Serve para agrupar a lista. Ex.: Massagens, Pacotes, Produtos.">
          <input id="ci-cat" className={inputCls} value={form.category} list="ci-cats" maxLength={60} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <datalist id="ci-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Preço" htmlFor="ci-mode">
            <select id="ci-mode" className={inputCls} value={form.price_mode} onChange={(e) => setForm({ ...form, price_mode: e.target.value as PriceMode })}>
              {(Object.keys(PRICE_MODE_LABEL) as PriceMode[]).map((m) => <option key={m} value={m}>{PRICE_MODE_LABEL[m]}</option>)}
            </select>
          </Field>
          {form.price_mode !== "quote" && (
            <Field label="Valor (R$)" htmlFor="ci-price">
              <input id="ci-price" type="number" min="0" step="0.01" inputMode="decimal" className={cn(inputCls, "tabular-nums")} value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
            </Field>
          )}
        </div>
        {form.price_mode === "quote" && <p className="text-xs text-muted -mt-2">Entra no card com valor zero, para você preencher o preço combinado.</p>}
        {form.kind === "service" && (
          <Field label="Duração (minutos, opcional)" htmlFor="ci-dur">
            <input id="ci-dur" type="number" min="1" step="5" inputMode="numeric" className={cn(inputCls, "tabular-nums sm:w-40")} value={form.duration_min ?? ""} placeholder="Ex.: 60"
              onChange={(e) => setForm({ ...form, duration_min: e.target.value ? Number(e.target.value) : null })} />
          </Field>
        )}
        <Field label="Descrição (opcional)" htmlFor="ci-desc">
          <textarea id="ci-desc" rows={3} className={cn(inputCls, "h-auto py-2.5 resize-y")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={!form.is_active} onChange={(e) => setForm({ ...form, is_active: !e.target.checked })} className="w-4 h-4 mt-0.5 accent-[var(--fg)] cursor-pointer" />
          <span>
            <span className="font-medium flex items-center gap-1.5"><Archive className="w-4 h-4" aria-hidden="true" /> Arquivado</span>
            <span className="block text-xs text-muted">Some dos seletores, mas continua nos negócios que já têm este item.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/* ============================ CAMPANHAS ============================ */

const STATE_TONE: Record<CampaignState, "ok" | "neutral" | "cold"> = { active: "ok", scheduled: "cold", ended: "neutral" };

function CampaignsTab({ items, createSignal }: { items: CatalogItem[]; createSignal: number }) {
  const { data: campaigns = [] } = useCampaigns();
  const { data: leads = [] } = useLeads();
  const [q, setQ] = useState("");
  const [state, setState] = useState<"" | CampaignState>("");
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [lastSignal, setLastSignal] = useState(createSignal);
  if (createSignal !== lastSignal) { setLastSignal(createSignal); setEditing("new"); }

  const leadCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of leads) if (l.campaign_id) m.set(l.campaign_id, (m.get(l.campaign_id) ?? 0) + 1);
    return m;
  }, [leads]);
  const nq = norm(q);
  const list = (campaigns ?? []).filter((c) => (!state || campaignState(c) === state) && (!nq || norm(c.name).includes(nq)));
  const order: Record<CampaignState, number> = { active: 0, scheduled: 1, ended: 2 };
  list.sort((a, b) => order[campaignState(a)] - order[campaignState(b)] || a.name.localeCompare(b.name, "pt-BR"));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar campanha" className="sm:w-72" />
        <select aria-label="Situação" className={selectCls} value={state} onChange={(e) => setState(e.target.value as "" | CampaignState)}>
          <option value="">Todas</option>
          {(Object.keys(CAMPAIGN_STATE_LABEL) as CampaignState[]).map((s) => <option key={s} value={s}>{CAMPAIGN_STATE_LABEL[s]}s</option>)}
        </select>
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Nova campanha</Button>
      </div>

      {(campaigns ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="Nenhuma campanha ainda"
          description="Cadastre de onde vêm seus leads (ex.: Black Friday, anúncio no Instagram) e escolha na ficha de cada lead. Também dá para criar na hora, pela ficha."
          action={<Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Nova campanha</Button>} />
      ) : list.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Nenhuma campanha com esses filtros.</p>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden">
          {list.map((c) => {
            const st = campaignState(c);
            const n = leadCount.get(c.id) ?? 0;
            const ni = c.campaign_items?.length ?? 0;
            return (
              <button key={c.id} type="button" onClick={() => setEditing(c)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-surface transition-colors">
                <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0"><Megaphone className="w-4 h-4 text-muted" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{c.name}</span>
                  <span className="block text-xs text-muted truncate">
                    {[c.channel, periodLabel(c), ni ? `${ni} ${ni === 1 ? "item" : "itens"}` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-muted shrink-0 hidden sm:block">{n} {n === 1 ? "lead" : "leads"}</span>
                <Chip tone={STATE_TONE[st]}>{CAMPAIGN_STATE_LABEL[st]}</Chip>
              </button>
            );
          })}
        </Panel>
      )}

      <CampaignSheet key={editing === "new" ? "new" : editing?.id ?? "none"} campaign={editing} items={items}
        leads={editing && editing !== "new" ? leadCount.get(editing.id) ?? 0 : 0} onClose={() => setEditing(null)} />
    </>
  );
}

function CampaignSheet({ campaign, items, leads, onClose }: { campaign: Campaign | "new" | null; items: CatalogItem[]; leads: number; onClose: () => void }) {
  const isNew = campaign === "new";
  const base = campaign && campaign !== "new" ? campaign : null;
  const [form, setForm] = useState({
    name: base?.name ?? "",
    channel: base?.channel ?? "",
    starts_on: base?.starts_on ?? "",
    ends_on: base?.ends_on ?? "",
    notes: base?.notes ?? "",
    is_active: base?.is_active ?? true,
  });
  const [itemIds, setItemIds] = useState<number[]>(() => base?.campaign_items?.map((x) => x.item_id) ?? []);
  const [confirmDel, setConfirmDel] = useState(false);
  const save = useSaveCampaign();
  const del = useDeleteCampaign();
  const choosable = items.filter((i) => i.is_active || itemIds.includes(i.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const badPeriod = !!form.starts_on && !!form.ends_on && form.ends_on < form.starts_on;

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Dê um nome à campanha.");
    if (badPeriod) return toast.error("O fim não pode ser antes do início.");
    const ok = await save.mutateAsync({ ...(base ? { id: base.id } : {}), ...form, itemIds }).catch(() => null);
    if (!ok) return;
    toast.success(isNew ? "Campanha criada" : "Campanha salva");
    onClose();
  };

  return (
    <Modal open={!!campaign} onClose={onClose} title={isNew ? "Nova campanha" : form.name || "Campanha"}
      footer={confirmDel ? (
        <div className="flex-1 flex flex-wrap items-center gap-2">
          <span className="text-sm mr-auto">{leads ? `Os ${leads} leads dela continuam salvos, mas ficam sem campanha. Se só acabou, prefira encerrar.` : "Excluir de vez?"}</span>
          <Button variant="secondary" onClick={() => setConfirmDel(false)}>Manter</Button>
          <Button variant="danger" onClick={() => base && del.mutate(base.id, { onSuccess: onClose })} disabled={del.isPending}>Excluir</Button>
        </div>
      ) : (
        <>
          {base && (
            <Button variant="ghost" size="icon" aria-label="Excluir campanha" title="Excluir campanha" onClick={() => setConfirmDel(true)} className="mr-auto hover:text-hot"><Trash2 className="w-4 h-4" /></Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending || !form.name.trim() || badPeriod}>{save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <Field label="Nome" htmlFor="cp-name">
          <input id="cp-name" data-autofocus className={inputCls} value={form.name} maxLength={80} placeholder="Ex.: Black Friday 2026" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Canal" htmlFor="cp-channel">
          <select id="cp-channel" className={inputCls} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            <option value="">Não informado</option>
            {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
            {form.channel && !ORIGINS.includes(form.channel) && <option value={form.channel}>{form.channel}</option>}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Início (opcional)" htmlFor="cp-start">
            <input id="cp-start" type="date" className={inputCls} value={form.starts_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
          </Field>
          <Field label="Fim (opcional)" htmlFor="cp-end">
            <input id="cp-end" type="date" className={cn(inputCls, badPeriod && "border-hot")} value={form.ends_on} min={form.starts_on || undefined} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
          </Field>
        </div>
        {badPeriod && <p className="text-xs text-hot -mt-2">O fim não pode ser antes do início.</p>}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-medium text-muted mb-1.5">O que a campanha oferece (opcional)</legend>
          {choosable.length === 0 ? (
            <p className="text-sm text-muted">Cadastre produtos e serviços na outra aba para ligar à campanha.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line border border-line rounded-xl max-h-64 overflow-y-auto">
              {choosable.map((i) => {
                const on = itemIds.includes(i.id);
                return (
                  <li key={i.id}>
                    <label className="px-3 py-2.5 flex items-center gap-2.5 cursor-pointer hover:bg-surface text-sm">
                      <input type="checkbox" checked={on} onChange={() => setItemIds((ids) => (on ? ids.filter((x) => x !== i.id) : [...ids, i.id]))} className="w-4 h-4 accent-[var(--fg)] cursor-pointer" />
                      <KindIcon kind={i.kind} className="text-muted" />
                      <span className="flex-1 min-w-0 truncate">{i.name}</span>
                      <span className="text-xs text-muted tabular-nums">{priceLabel(i)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-muted">Aparecem primeiro na hora de escolher o produto no card de quem veio por esta campanha.</p>
        </fieldset>

        <Field label="Observações (opcional)" htmlFor="cp-notes">
          <textarea id="cp-notes" rows={3} className={cn(inputCls, "h-auto py-2.5 resize-y")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" checked={!form.is_active} onChange={(e) => setForm({ ...form, is_active: !e.target.checked })} className="w-4 h-4 mt-0.5 accent-[var(--fg)] cursor-pointer" />
          <span>
            <span className="font-medium">Encerrada</span>
            <span className="block text-xs text-muted">Sai da lista ao escolher a campanha de um lead. Os leads dela continuam com ela.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
