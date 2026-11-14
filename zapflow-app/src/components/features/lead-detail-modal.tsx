"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MessageCircle, Trash2, Loader2, CalendarPlus, CalendarClock, Bell, Send, Flame, Thermometer, Snowflake } from "lucide-react";
import { isTopLayer, lockScroll, unlockScroll } from "@/components/ui/modal";
import { TaskRow, useTaskSheets } from "@/components/features/task-sheets";
import { useTasks } from "@/hooks/use-tasks";
import { isOpen } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { Button, Chip } from "@/components/ui/shared";
import type { KanbanColumn, Lead } from "@/types";

type Temp = "hot" | "warm" | "cold";

export const TEMP: Record<Temp, { label: string; tone: "hot" | "warn" | "cold"; icon: typeof Flame }> = {
  hot: { label: "Quente", tone: "hot", icon: Flame },
  warm: { label: "Morno", tone: "warn", icon: Thermometer },
  cold: { label: "Frio", tone: "cold", icon: Snowflake },
};

const ORIGINS = ["Instagram", "Facebook", "Google", "Indicação", "Site", "WhatsApp", "E-mail", "Outros"];

interface LeadDetailModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onSave?: (data: Partial<Lead> & { id: number }) => void;
  onDelete?: (id: number) => void;
  columns?: Pick<KanbanColumn, "id" | "title">[];
  saving?: boolean;
}

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

function Field({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Painel lateral com os dados do lead (substitui o antigo modal de tela cheia). */
export function LeadDetailModal(props: LeadDetailModalProps) {
  if (!props.open || !props.lead) return null;
  // key: ao trocar de lead, o formulário recomeça com os dados dele
  return <LeadSheet key={props.lead.id} {...props} lead={props.lead} />;
}

function LeadSheet({ lead, onClose, onSave, onDelete, columns = [], saving }: LeadDetailModalProps & { lead: Lead }) {
  const [tab, setTab] = useState<"dados" | "tarefas" | "historico">("dados");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    name: lead.name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    product: lead.product || "",
    value: Number(lead.value) || 0,
    status: (lead.status || "warm") as Temp,
    origin: lead.origin || "",
    campaign: lead.campaign || "",
    column_id: lead.column_id,
  });
  const panelRef = useRef<HTMLDivElement>(null);

  const allTasks = useTasks();
  const leadTasks = (allTasks.data ?? []).filter((t) => t.lead_id === lead.id);
  const openTasks = leadTasks.filter(isOpen);
  const doneTasks = leadTasks.filter((t) => !isOpen(t)).reverse();
  const { openNew, openTask, sheets } = useTaskSheets(leadTasks);
  // usa os dados já salvos do lead (o telefone digitado e não salvo ainda não vale para envio)
  const savedLead = { id: lead.id, name: lead.name, phone: lead.phone };

  useEffect(() => {
    lockScroll();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopLayer(panelRef.current)) onClose(); };
    window.addEventListener("keydown", h);
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 30);
    return () => { clearTimeout(t); unlockScroll(); window.removeEventListener("keydown", h); };
  }, [onClose]);

  const temp = TEMP[form.status] ?? TEMP.warm;
  const stage = columns.find((c) => c.id === form.column_id)?.title;
  const digits = (form.phone || "").replace(/\D/g, "");
  const waLink = digits ? `https://wa.me/${digits.length <= 11 ? "55" + digits : digits}` : null;
  const initials = (form.name || lead.name).trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const created = lead.created_at ? new Date(lead.created_at) : null;

  const save = () => {
    if (!form.name.trim()) return;
    onSave?.({ ...form, name: form.name.trim(), id: lead.id });
  };

  // Portal no <body>: a animação da página prenderia o painel dentro do conteúdo.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-sheet-title"
        className="relative h-full w-full sm:max-w-[480px] bg-card border-l border-line shadow-elev flex flex-col animate-sheet-in"
      >
        {/* Cabeçalho */}
        <div className="px-6 pt-5 pb-4 border-b border-line flex gap-4 items-start">
          <span className="w-12 h-12 rounded-full bg-surface border border-line grid place-items-center text-base font-semibold shrink-0">{initials}</span>
          <div className="flex-1 min-w-0">
            <h2 id="lead-sheet-title" className="text-xl font-bold truncate">{form.name || lead.name}</h2>
            <p className="text-sm text-muted tabular-nums">{form.phone || "Sem telefone"}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Chip tone={temp.tone}>{temp.label}</Chip>
              {stage && <Chip>{stage}</Chip>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar detalhes" className="h-9 w-9 -mr-2 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div role="tablist" className="px-6 border-b border-line flex gap-6">
          {([["dados", "Dados"], ["tarefas", "Tarefas"], ["historico", "Histórico"]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("py-3 text-sm border-b-2 -mb-px cursor-pointer", tab === id ? "border-fg text-fg font-semibold" : "border-transparent text-muted font-medium hover:text-fg")}
            >
              {label}
              {id === "tarefas" && openTasks.length > 0 && (
                <span className="ml-1.5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold tabular-nums">{openTasks.length}</span>
              )}
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
                <Field label="Produto ou interesse" htmlFor="lead-product">
                  <input id="lead-product" className={inputCls} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
                </Field>
                <Field label="Valor (R$)" htmlFor="lead-value">
                  <input id="lead-value" type="number" min="0" step="0.01" className={cn(inputCls, "tabular-nums")} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
                </Field>
                {columns.length > 0 && (
                  <Field label="Etapa" htmlFor="lead-stage">
                    <select id="lead-stage" className={inputCls} value={form.column_id} onChange={(e) => setForm({ ...form, column_id: Number(e.target.value) })}>
                      {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Origem" htmlFor="lead-origin">
                  <select id="lead-origin" className={inputCls} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
                    <option value="">Não informada</option>
                    {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
                    {form.origin && !ORIGINS.includes(form.origin) && <option value={form.origin}>{form.origin}</option>}
                  </select>
                </Field>
                <Field label="Campanha" htmlFor="lead-campaign" className="sm:col-span-2">
                  <input id="lead-campaign" className={inputCls} value={form.campaign} placeholder="Ex.: Black Friday" onChange={(e) => setForm({ ...form, campaign: e.target.value })} />
                </Field>
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs font-medium text-muted mb-1.5">Temperatura</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(TEMP) as Temp[]).map((t) => {
                    const cfg = TEMP[t];
                    const Icon = cfg.icon;
                    const on = form.status === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setForm({ ...form, status: t })}
                        className={cn(
                          "h-10 rounded-[10px] border text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors",
                          on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg"
                        )}
                      >
                        <Icon className="w-4 h-4" /> {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
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
            <ol className="flex flex-col">
              <li className="flex gap-3">
                <span className="w-8 h-8 rounded-full bg-surface grid place-items-center text-muted shrink-0"><CalendarPlus className="w-4 h-4" /></span>
                <div>
                  <p className="text-sm font-semibold">Lead criado</p>
                  <p className="text-xs text-muted">
                    {created ? created.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" }) : "Data não registrada"}
                    {form.origin ? ` · origem: ${form.origin}` : ""}
                  </p>
                </div>
              </li>
              <li className="mt-5 p-4 rounded-xl bg-surface text-sm text-muted">
                Mensagens, áudios e funis enviados pela extensão vão aparecer aqui quando o registro de envios estiver ativo.
              </li>
            </ol>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-line flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg mr-auto">Excluir {lead.name}? Isso não pode ser desfeito.</span>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Manter</Button>
              <Button variant="danger" onClick={() => onDelete?.(lead.id)}>Excluir</Button>
            </div>
          ) : (
            <>
              {onDelete && (
                <Button variant="ghost" size="icon" aria-label="Excluir lead" title="Excluir lead" onClick={() => setConfirmDelete(true)} className="hover:text-hot">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button variant="secondary" onClick={() => openNew({ lead: savedLead, kind: "send" })} title="Agendar envio">
                <CalendarClock className="w-4 h-4" /> Agendar
              </Button>
              {waLink && (
                <a href={waLink} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-[10px] border border-line bg-card text-sm font-semibold inline-flex items-center gap-2 hover:bg-surface">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              )}
              <Button className="ml-auto" onClick={save} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
              </Button>
            </>
          )}
        </div>
      </div>
      {sheets}
    </div>,
    document.body
  );
}
