"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MessageCircle, Trash2, Loader2, CalendarClock, Bell, Send, Flame, Thermometer, Snowflake, Columns3, Plus, AlertCircle } from "lucide-react";
import { isTopLayer, lockScroll, unlockScroll } from "@/components/ui/modal";
import { TaskRow, useTaskSheets } from "@/components/features/task-sheets";
import { TagPicker } from "@/components/features/tags";
import { LeadHistory } from "@/components/features/lead-history";
import { useTasks } from "@/hooks/use-tasks";
import { useAddToBoard, useDeleteLeads, useLead, useTags, useUpdateLead } from "@/hooks/use-leads";
import { useAllColumns, useBoards, useRemoveCard } from "@/hooks/use-kanban";
import { isOpen } from "@/lib/tasks";
import { ORIGINS, formatPhone, initials, waLink } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { Button, Chip } from "@/components/ui/shared";
import type { LeadFull, LeadTemp } from "@/types";
import { toast } from "sonner";

export const TEMP: Record<LeadTemp, { label: string; tone: "hot" | "warn" | "cold"; icon: typeof Flame }> = {
  hot: { label: "Quente", tone: "hot", icon: Flame },
  warm: { label: "Morno", tone: "warn", icon: Thermometer },
  cold: { label: "Frio", tone: "cold", icon: Snowflake },
};

type Tab = "dados" | "kanban" | "tarefas" | "historico";

interface LeadDetailModalProps {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  /** aba inicial (o Kanban abre direto em "Kanban") */
  initialTab?: Tab;
}

export const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Temperatura em 3 botões. */
export function TempPicker({ value, onChange }: { value: LeadTemp; onChange: (t: LeadTemp) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-medium text-muted mb-1.5">Temperatura</legend>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(TEMP) as LeadTemp[]).map((t) => {
          const cfg = TEMP[t];
          const Icon = cfg.icon;
          const on = value === t;
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => onChange(t)}
              className={cn("h-10 rounded-[10px] border text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors", on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
              <Icon className="w-4 h-4" /> {cfg.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Painel lateral com tudo do lead. Busca os dados sozinho pelo id. */
export function LeadDetailModal(props: LeadDetailModalProps) {
  if (!props.open || !props.leadId) return null;
  // key: ao trocar de lead, o formulário recomeça com os dados dele
  return <LeadSheet key={props.leadId} {...props} leadId={props.leadId} />;
}

function LeadSheet({ leadId, onClose, initialTab = "dados" }: LeadDetailModalProps & { leadId: number }) {
  const { data: lead, isLoading, isError } = useLead(leadId);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    lockScroll();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopLayer(panelRef.current)) onClose(); };
    window.addEventListener("keydown", h);
    return () => { unlockScroll(); window.removeEventListener("keydown", h); };
  }, [onClose]);

  // Portal no <body>: a animação da página prenderia o painel dentro do conteúdo.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-sheet-title"
        className="relative h-full w-full sm:max-w-[520px] bg-card border-l border-line shadow-elev flex flex-col animate-sheet-in"
      >
        {lead ? (
          <LeadForm lead={lead} onClose={onClose} initialTab={initialTab} />
        ) : (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-line flex items-center gap-4">
              <h2 id="lead-sheet-title" className="sr-only">Lead</h2>
              {isLoading ? <span className="skeleton h-12 w-48" /> : <p className="text-sm text-muted flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {isError ? "Não foi possível abrir este lead." : "Lead não encontrado."}</p>}
              <button type="button" onClick={onClose} aria-label="Fechar" className="ml-auto h-9 w-9 -mr-2 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            {isLoading && <div className="p-6 flex flex-col gap-4">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-10" />)}</div>}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

type CardEdit = { column_id: number; value: number; product: string };

function LeadForm({ lead, onClose, initialTab }: { lead: LeadFull; onClose: () => void; initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: lead.name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    status: (lead.status || "warm") as LeadTemp,
    origin: lead.origin || "",
    campaign: lead.campaign || "",
    notes: lead.notes || "",
  });
  const [tagIds, setTagIds] = useState<number[]>(() => lead.lead_tags.map((t) => t.tag_id));
  const [cardEdits, setCardEdits] = useState<Map<number, CardEdit>>(new Map());

  const update = useUpdateLead();
  const del = useDeleteLeads();
  const addToBoard = useAddToBoard();
  const removeCard = useRemoveCard();
  const { data: boards = [] } = useBoards();
  const { data: columns = [] } = useAllColumns();

  const allTasks = useTasks();
  const leadTasks = (allTasks.data ?? []).filter((t) => t.lead_id === lead.id);
  const openTasks = leadTasks.filter(isOpen);
  const doneTasks = leadTasks.filter((t) => !isOpen(t)).reverse();
  const { openNew, openTask, sheets } = useTaskSheets(leadTasks);
  // usa os dados já salvos do lead (o telefone digitado e não salvo ainda não vale para envio)
  const savedLead = { id: lead.id, name: lead.name, phone: lead.phone };

  const cards = lead.kanban_cards;
  const { data: allTags = [] } = useTags();
  // etiqueta de ignorar (salva no lead): ele não entra no Kanban
  const blocking = allTags.find((t) => t.is_blocking && lead.lead_tags.some((x) => x.tag_id === t.id));
  const cardView = (c: LeadFull["kanban_cards"][number]): CardEdit =>
    cardEdits.get(c.id) ?? { column_id: c.column_id, value: Number(c.value) || 0, product: c.product ?? "" };
  const setCard = (id: number, patch: Partial<CardEdit>) => {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    setCardEdits((m) => new Map(m).set(id, { ...cardView(c), ...patch }));
  };

  const freeBoards = boards.filter((b) => !cards.some((c) => c.board_id === b.id));
  const [newBoard, setNewBoard] = useState<number | "">("");
  const newBoardCols = columns.filter((c) => c.board_id === newBoard);
  const [newCol, setNewCol] = useState<number | "">("");

  const temp = TEMP[form.status] ?? TEMP.warm;
  const link = waLink(form.phone);
  const stageChips = useMemo(
    () => cards.map((c) => columns.find((col) => col.id === cardView(c).column_id)?.title).filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, columns, cardEdits]
  );

  const save = () => {
    if (!form.name.trim()) return;
    const changed = cards.flatMap((c) => {
      const e = cardEdits.get(c.id);
      if (!e) return [];
      const patch: { id: number; column_id?: number; value?: number; product?: string | null } = { id: c.id };
      if (e.column_id !== c.column_id) patch.column_id = e.column_id;
      if (e.value !== (Number(c.value) || 0)) patch.value = e.value;
      if (e.product.trim() !== (c.product ?? "")) patch.product = e.product.trim() || null;
      return Object.keys(patch).length > 1 ? [patch] : [];
    });
    update.mutate(
      { id: lead.id, lead: form, tagIds, cards: changed },
      { onSuccess: () => { toast.success("Lead salvo"); setCardEdits(new Map()); onClose(); } }
    );
  };

  const addCard = () => {
    if (!newBoard) return;
    const col = newCol || newBoardCols[0]?.id;
    if (!col) return;
    addToBoard.mutate({ leadIds: [lead.id], boardId: newBoard, columnId: col }, { onSuccess: () => { setNewBoard(""); setNewCol(""); } });
  };

  return (
    <>
      {/* Cabeçalho */}
      <div className="px-6 pt-5 pb-4 border-b border-line flex gap-4 items-start">
        <span className="w-12 h-12 rounded-full bg-surface border border-line grid place-items-center text-base font-semibold shrink-0">{initials(form.name || lead.name)}</span>
        <div className="flex-1 min-w-0">
          <h2 id="lead-sheet-title" className="text-xl font-bold truncate">{form.name || lead.name}</h2>
          <p className="text-sm text-muted tabular-nums">{form.phone ? formatPhone(form.phone) : "Sem telefone"}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Chip tone={temp.tone}>{temp.label}</Chip>
            {stageChips.map((s, i) => <Chip key={i}>{s}</Chip>)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes" className="h-9 w-9 -mr-2 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Abas */}
      <div role="tablist" className="px-6 border-b border-line flex gap-5 overflow-x-auto">
        {([["dados", "Dados"], ["kanban", "Kanban"], ["tarefas", "Tarefas"], ["historico", "Histórico"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("py-3 text-sm border-b-2 -mb-px cursor-pointer whitespace-nowrap", tab === id ? "border-fg text-fg font-semibold" : "border-transparent text-muted font-medium hover:text-fg")}>
            {label}
            {id === "tarefas" && openTasks.length > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold tabular-nums">{openTasks.length}</span>}
            {id === "kanban" && cards.length > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-surface text-muted text-[11px] font-semibold tabular-nums">{cards.length}</span>}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "dados" ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome" htmlFor="lead-name" className="sm:col-span-2">
                <input id="lead-name" data-autofocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Telefone" htmlFor="lead-phone">
                <input id="lead-phone" type="tel" className={inputCls} value={form.phone} placeholder="(11) 98765-4321" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="E-mail" htmlFor="lead-email">
                <input id="lead-email" type="email" className={inputCls} value={form.email} placeholder="nome@empresa.com" onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Origem" htmlFor="lead-origin">
                <select id="lead-origin" className={inputCls} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
                  <option value="">Não informada</option>
                  {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
                  {form.origin && !ORIGINS.includes(form.origin) && <option value={form.origin}>{form.origin}</option>}
                </select>
              </Field>
              <Field label="Campanha" htmlFor="lead-campaign">
                <input id="lead-campaign" className={inputCls} value={form.campaign} placeholder="Ex.: Black Friday" onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
              </Field>
            </div>
            <TempPicker value={form.status} onChange={(status) => setForm({ ...form, status })} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Etiquetas</span>
              <TagPicker value={tagIds} onChange={setTagIds} />
            </div>
            <Field label="Observações" htmlFor="lead-notes">
              <textarea id="lead-notes" rows={4} className={cn(inputCls, "h-auto py-2.5 resize-y")} value={form.notes} placeholder="O que é importante lembrar sobre este lead?" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        ) : tab === "kanban" ? (
          <div className="flex flex-col gap-4">
            {cards.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center">
                <Columns3 className="w-6 h-6 mx-auto text-muted mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold">{lead.name.split(" ")[0]} não está em nenhum quadro</p>
                <p className="text-sm text-muted mt-0.5">Coloque num quadro para acompanhar a negociação por etapa.</p>
              </div>
            ) : (
              cards.map((c) => {
                const v = cardView(c);
                const board = boards.find((b) => b.id === c.board_id);
                const cols = columns.filter((col) => col.board_id === c.board_id);
                return (
                  <section key={c.id} aria-label={board?.title} className="rounded-xl border border-line p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Columns3 className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                      <h4 className="font-sans text-sm font-semibold tracking-normal truncate flex-1">{board?.title ?? "Quadro"}</h4>
                      <Button variant="ghost" size="sm" onClick={() => removeCard.mutate(c.id)} disabled={removeCard.isPending} className="hover:text-hot">Tirar do quadro</Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Etapa" htmlFor={`card-col-${c.id}`}>
                        <select id={`card-col-${c.id}`} className={inputCls} value={v.column_id} onChange={(e) => setCard(c.id, { column_id: Number(e.target.value) })}>
                          {cols.map((col) => <option key={col.id} value={col.id}>{col.title}</option>)}
                        </select>
                      </Field>
                      <Field label="Valor (R$)" htmlFor={`card-val-${c.id}`}>
                        <input id={`card-val-${c.id}`} type="number" min="0" step="0.01" className={cn(inputCls, "tabular-nums")} value={v.value} onChange={(e) => setCard(c.id, { value: Number(e.target.value) })} />
                      </Field>
                      <Field label="Produto ou interesse" htmlFor={`card-prod-${c.id}`} className="sm:col-span-2">
                        <input id={`card-prod-${c.id}`} className={inputCls} value={v.product} placeholder="O que o lead procura?" onChange={(e) => setCard(c.id, { product: e.target.value })} />
                      </Field>
                    </div>
                  </section>
                );
              })
            )}

            {blocking ? (
              <p className="rounded-xl bg-warn-soft text-warn p-3 text-sm">
                Este lead tem a etiqueta “{blocking.name}”, que manda ignorar: não entra no Kanban, não é capturado pela extensão e não guarda histórico. Tire a etiqueta para voltar ao normal.
              </p>
            ) : boards.length === 0 ? (
              <p className="text-sm text-muted">Crie um quadro na tela Kanban para colocar leads nele.</p>
            ) : freeBoards.length > 0 && (
              <div className="rounded-xl bg-surface p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold">Colocar num quadro</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select aria-label="Quadro" className={inputCls} value={newBoard} onChange={(e) => { setNewBoard(e.target.value ? Number(e.target.value) : ""); setNewCol(""); }}>
                    <option value="">Escolha o quadro</option>
                    {freeBoards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                  </select>
                  <select aria-label="Etapa" className={inputCls} value={newCol || newBoardCols[0]?.id || ""} onChange={(e) => setNewCol(Number(e.target.value))} disabled={!newBoard || newBoardCols.length === 0}>
                    {!newBoard ? <option value="">Etapa</option> : newBoardCols.length === 0 ? <option value="">Quadro sem etapas</option> : newBoardCols.map((col) => <option key={col.id} value={col.id}>{col.title}</option>)}
                  </select>
                </div>
                <Button variant="secondary" className="self-start" onClick={addCard} disabled={!newBoard || newBoardCols.length === 0 || addToBoard.isPending}>
                  {addToBoard.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Colocar no quadro
                </Button>
              </div>
            )}
          </div>
        ) : tab === "tarefas" ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => openNew({ lead: savedLead, kind: "send" })}><Send className="w-4 h-4" /> Agendar envio</Button>
              <Button variant="secondary" onClick={() => openNew({ lead: savedLead, kind: "reminder" })}><Bell className="w-4 h-4" /> Lembrete</Button>
            </div>
            {allTasks.isLoading ? (
              <span className="skeleton h-[66px]" />
            ) : leadTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center">
                <CalendarClock className="w-6 h-6 mx-auto text-muted mb-2" aria-hidden="true" />
                <p className="text-sm font-semibold">Nenhuma tarefa para {lead.name.split(" ")[0]}</p>
                <p className="text-sm text-muted mt-0.5">Agende um texto ou áudio para ser enviado em outro dia, ou crie um lembrete.</p>
              </div>
            ) : (
              <>
                {openTasks.length > 0 && (
                  <section className="flex flex-col gap-2" aria-label="Em aberto">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Em aberto</h4>
                    {openTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showLead={false} />)}
                  </section>
                )}
                {doneTasks.length > 0 && (
                  <section className="flex flex-col gap-2" aria-label="Anteriores">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Anteriores</h4>
                    {doneTasks.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} showLead={false} />)}
                  </section>
                )}
              </>
            )}
          </div>
        ) : (
          <LeadHistory lead={lead} origin={form.origin} />
        )}
      </div>

      {/* Rodapé */}
      <div className="px-6 py-4 border-t border-line flex flex-wrap items-center gap-2">
        {confirmDelete ? (
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg mr-auto">Excluir {lead.name} de vez? Sai de todos os quadros, com as tarefas.</span>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Manter</Button>
            <Button variant="danger" onClick={() => del.mutate([lead.id], { onSuccess: onClose })} disabled={del.isPending}>Excluir</Button>
          </div>
        ) : (
          <>
            <Button variant="ghost" size="icon" aria-label="Excluir lead" title="Excluir lead" onClick={() => setConfirmDelete(true)} className="hover:text-hot">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button variant="secondary" onClick={() => openNew({ lead: savedLead, kind: "send" })} title="Agendar envio">
              <CalendarClock className="w-4 h-4" /> Agendar
            </Button>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-[10px] border border-line bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-surface">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
            <Button className="ml-auto" onClick={save} disabled={update.isPending || !form.name.trim()}>
              {update.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
            </Button>
          </>
        )}
      </div>
      {sheets}
    </>
  );
}
