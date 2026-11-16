"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  pointerWithin,
  rectIntersection,
  closestCenter,
  MeasuringStrategy,
  type CollisionDetection,
  type UniqueIdentifier,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useBoards, useCreateBoard, useDeleteBoard, useBoardData,
  useCreateColumn, useDeleteColumn, useRenameColumn, useMoveCard, useInboxColumn, useSetInboxColumn, useSetColumnOutcome,
} from "@/hooks/use-kanban";
import { blockedLeadIds, useAddToBoard, useCreateLead, useLeads, useTags } from "@/hooks/use-leads";
import { Modal } from "@/components/ui/modal";
import { LeadDetailModal, TEMP, TempPicker, inputCls } from "@/components/features/lead-detail-modal";
import { TagList, TagPicker } from "@/components/features/tags";
import { LeadAvatar } from "@/components/features/lead-avatar";
import { useOwners } from "@/hooks/use-owners";
import { OwnerDot } from "@/components/features/owners";
import { CampaignPicker, CardItemsEditor } from "@/components/features/catalog";
import { useCampaigns, useCatalog } from "@/hooks/use-catalog";
import type { DraftCardItem } from "@/lib/catalog";
import { Button, Chip, EmptyState, SearchInput } from "@/components/ui/shared";
import type { ColumnOutcome, KanbanCardWithLead, KanbanColumnWithCards, LeadTemp, Owner, Tag, Task } from "@/types";
import { useTasks } from "@/hooks/use-tasks";
import { formatDue, isOpen, taskState } from "@/lib/tasks";
import { brl, deaccent, formatPhone, phoneKey, tagsOf } from "@/lib/leads";
import { TaskIcon } from "@/components/features/task-sheets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Columns3, Plus, Trash2, Loader2, AlertCircle, UserPlus, Users, Check, Inbox, Trophy, Pencil, Package, Megaphone } from "lucide-react";

/** Próxima tarefa em aberto de cada lead (a lista vem ordenada por horário). */
type NextTasks = Map<number, { next: Task; count: number }>;

type Filter = "all" | LeadTemp;

const STAGE_COLORS = ["#111113", "#d1236f", "#1d4ed8", "#0e7a4f", "#9a5b00", "#b42318", "#6b21a8", "#0f766e"];

const cardKey = (id: number) => `card-${id}`;
const cardIdOf = (key: string) => Number(key.replace("card-", ""));

/**
 * Onde o card vai cair, pela posição do ponteiro (os cantos da coluna erravam com colunas altas):
 * sobre um card -> o card mais próximo (inclusive ele mesmo = "fica aqui"); no vazio de uma etapa ->
 * o card mais próximo dela, ou a própria etapa se estiver vazia. No vão entre etapas (ou logo depois
 * de trocar de etapa, enquanto o layout se ajusta) mantém o último alvo: sem isso o card ficava
 * pulando entre duas colunas até travar a tela. Teclado (sem ponteiro): pela área do card.
 */
/**
 * Posição real do card na tela agora, sem o deslocamento da animação de reordenar.
 * (As medidas guardadas pelo dnd-kit ficam velhas por um instante quando um card entra na etapa.)
 */
function layoutRect(el: HTMLElement | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const t = getComputedStyle(el).transform;
  let ty = 0;
  if (t && t !== "none") {
    const v = t.slice(t.indexOf("(") + 1, -1).split(",").map(Number);
    ty = (t.startsWith("matrix3d") ? v[13] : v[5]) || 0;
  }
  return { top: r.top - ty, bottom: r.bottom - ty };
}

function useCollision(dragState: unknown) {
  const lastOver = useRef<UniqueIdentifier | null>(null);
  const justMoved = useRef(false);
  const detect = useCallback<CollisionDetection>((args) => {
    const within = pointerWithin(args);
    const hits = within.length ? within : args.pointerCoordinates ? [] : rectIntersection(args);
    const p = args.pointerCoordinates;
    // card mais perto do PONTEIRO na vertical (o centro do card arrastado errava no fim da coluna)
    const nearest = (list: typeof args.droppableContainers) => {
      if (!p) return closestCenter({ ...args, droppableContainers: list })[0]?.id ?? null;
      let best: UniqueIdentifier | null = null;
      let bestD = Infinity;
      for (const c of list) {
        const r = layoutRect(c.node.current) ?? args.droppableRects.get(c.id);
        if (!r) continue;
        const d = p.y < r.top ? r.top - p.y : p.y > r.bottom ? p.y - r.bottom : 0;
        if (d < bestD) { bestD = d; best = c.id; }
      }
      return best;
    };
    let id: UniqueIdentifier | null = null;
    const cards = hits.filter((h) => String(h.id).startsWith("card-"));
    if (cards.length) {
      id = nearest(args.droppableContainers.filter((c) => cards.some((h) => h.id === c.id)));
    } else {
      const col = hits.find((h) => String(h.id).startsWith("col-"));
      if (col) {
        const inCol = args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === col.id);
        id = (inCol.length ? nearest(inCol) : null) ?? col.id;
      }
    }
    if (id != null && !justMoved.current) {
      lastOver.current = id;
      return [{ id }];
    }
    if (justMoved.current) lastOver.current = args.active.id;
    return lastOver.current != null ? [{ id: lastOver.current }] : [];
  }, []);
  // depois de trocar de etapa, espera um quadro (o layout se ajustar) antes de voltar a medir
  useEffect(() => {
    const id = requestAnimationFrame(() => { justMoved.current = false; });
    return () => cancelAnimationFrame(id);
  }, [dragState]);
  const start = useCallback((id: UniqueIdentifier) => { lastOver.current = id; }, []);
  const moved = useCallback(() => { justMoved.current = true; }, []);
  return { detect, start, moved };
}

// ── Card (visual) ────────────────────────────────────────

function CardBody({ card, tags, next }: { card: KanbanCardWithLead; tags: Tag[]; next?: { next: Task; count: number } }) {
  const lead = card.lead;
  const temp = TEMP[lead.status] ?? TEMP.warm;
  const late = next ? taskState(next.next) === "overdue" : false;
  // a lista de responsáveis já está carregada pela página (mesma consulta, sem ida extra ao banco)
  const { data: owners = [] } = useOwners();
  const owner: Owner | undefined = lead.owner_id ? owners.find((o) => o.id === lead.owner_id) : undefined;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <LeadAvatar name={lead.name} src={lead.avatar} className="w-8 h-8 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight truncate">{lead.name}</p>
          {lead.phone && <p className="text-xs text-muted tabular-nums truncate">{formatPhone(lead.phone)}</p>}
        </div>
        {owner && <OwnerDot owner={owner} />}
      </div>
      {card.product ? (
        <p className="text-[13px] text-fg line-clamp-2 flex gap-1.5" title="Produtos e serviços"><Package className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted" aria-hidden="true" /><span>{card.product}</span></p>
      ) : lead.last_message ? (
        <p className="text-[13px] text-muted line-clamp-2">{lead.last_message}</p>
      ) : null}
      {lead.campaign && (
        <p className="text-xs text-muted flex items-center gap-1.5 min-w-0" title="Campanha"><Megaphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{lead.campaign}</span></p>
      )}
      <TagList tags={tagsOf(lead, tags)} />
      {next && (
        <p className={cn("flex items-center gap-1.5 text-xs font-medium tabular-nums", late ? "text-warn" : "text-muted")} title={next.next.title}>
          <TaskIcon task={next.next} className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{late ? "Atrasada · " : ""}{formatDue(next.next.due_at)}</span>
          {next.count > 1 && <span className="ml-auto shrink-0">+{next.count - 1}</span>}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Chip tone={temp.tone}>{temp.label}</Chip>
        <span className="text-sm font-semibold tabular-nums">{brl(Number(card.value) || 0)}</span>
      </div>
    </>
  );
}

function SortableCard({ card, tags, next, onOpen, dragDisabled }: { card: KanbanCardWithLead; tags: Tag[]; next?: { next: Task; count: number }; onOpen: (c: KanbanCardWithLead) => void; dragDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey(card.id),
    data: { type: "card", card },
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${card.lead.name}`}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(card);
      }}
      className={cn(
        "bg-card border border-line rounded-xl p-3 flex flex-col gap-2.5 text-left touch-manipulation select-none",
        "hover:border-fg transition-colors",
        dragDisabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        // o lugar do card fica marcado enquanto ele é arrastado
        isDragging && "border-dashed border-muted/50 bg-transparent hover:border-muted/50 [&>*]:invisible"
      )}
    >
      <CardBody card={card} tags={tags} next={next} />
    </div>
  );
}

// ── Coluna (etapa) ───────────────────────────────────────

const OUTCOMES: { value: ColumnOutcome | null; label: string; hint: string }[] = [
  { value: "won", label: "Ganho", hint: "venda fechada" },
  { value: "lost", label: "Perdido", hint: "não comprou" },
  { value: null, label: "Etapa normal", hint: "ainda em andamento" },
];

/** Marca a etapa como de resultado (para os relatórios: vendas, conversão, perdidos). */
function OutcomeMenu({ column, onPick }: { column: KanbanColumnWithCards; onPick: (o: ColumnOutcome | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const cur = column.outcome ?? null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Resultado da etapa ${column.title}${cur ? `: ${cur === "won" ? "Ganho" : "Perdido"}` : ""}`}
        aria-expanded={open}
        title={cur === "won" ? "Etapa de venda fechada (Ganho) — conta nos relatórios" : cur === "lost" ? "Etapa de perdidos — conta nos relatórios" : "Resultado da etapa (para os relatórios)"}
        className={cn(
          "h-7 w-7 grid place-items-center rounded-lg hover:bg-card transition-opacity cursor-pointer",
          cur === "won" ? "text-ok" : cur === "lost" ? "text-hot" : "text-muted hover:text-fg",
          open || cur ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        )}
      >
        <Trophy className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div role="menu" aria-label="Resultado da etapa" className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl border border-line bg-card shadow-elev p-1.5">
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-muted">Esta etapa é…</p>
          {OUTCOMES.map((o) => (
            <button key={String(o.value)} type="button" role="menuitemradio" aria-checked={cur === o.value}
              onClick={() => { setOpen(false); if (cur !== o.value) onPick(o.value); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left hover:bg-surface cursor-pointer">
              <span className="w-4 shrink-0">{cur === o.value && <Check className="w-4 h-4" aria-hidden="true" />}</span>
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-muted ml-auto">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Nome da etapa: aparece inteiro e vira campo de texto ao clicar (Enter salva, Esc desiste). */
function StageTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    const el = ref.current;
    if (!editing || !el) return;
    el.focus();
    el.select();
  }, [editing]);
  // o campo cresce com o texto (nomes longos ocupam duas ou três linhas)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  const commit = () => {
    const t = (draft ?? "").replace(/\s+/g, " ").trim();
    setDraft(null);
    if (t && t !== title) onRename(t);
  };
  if (editing) {
    return (
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        maxLength={60}
        aria-label="Nome da etapa"
        onChange={(e) => setDraft(e.target.value.replace(/[\r\n]+/g, " "))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
        }}
        className="flex-1 min-w-0 -my-[3px] -mx-1.5 px-1.5 py-[2px] rounded-md bg-card border border-fg outline-none resize-none overflow-hidden font-display text-sm font-semibold leading-snug"
      />
    );
  }
  return (
    <h3 className="flex-1 min-w-0 font-sans text-sm font-semibold tracking-normal leading-snug">
      <button
        type="button"
        onClick={() => setDraft(title)}
        title="Clique para renomear a etapa"
        aria-label={`${title}. Clique para renomear a etapa`}
        className="group/title text-left break-words [overflow-wrap:anywhere] cursor-text rounded-md -mx-1.5 px-1.5 hover:bg-card transition-colors"
      >
        {title}
        <Pencil className="inline-block w-3 h-3 ml-1.5 -mt-0.5 text-muted opacity-0 group-hover/title:opacity-100 transition-opacity" aria-hidden="true" />
      </button>
    </h3>
  );
}

function StageColumn({ column, items, tags, dragDisabled, onAdd, onDeleteColumn, onOpen, nextTasks, isInbox, onMakeInbox, onSetOutcome, onRename }: {
  isInbox: boolean;
  onRename: (col: KanbanColumnWithCards, title: string) => void;
  onMakeInbox: (col: KanbanColumnWithCards) => void;
  onSetOutcome: (col: KanbanColumnWithCards, outcome: ColumnOutcome | null) => void;
  column: KanbanColumnWithCards;
  items: KanbanCardWithLead[];
  tags: Tag[];
  dragDisabled: boolean;
  onAdd: (colId: number) => void;
  onDeleteColumn: (col: KanbanColumnWithCards) => void;
  onOpen: (c: KanbanCardWithLead) => void;
  nextTasks: NextTasks;
}) {
  const ids = useMemo(() => items.map((c) => cardKey(c.id)), [items]);
  const total = items.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { type: "column", column } });

  return (
    <section aria-label={column.title} className="w-[296px] shrink-0 flex flex-col max-h-full bg-surface rounded-2xl">
      <header className="px-4 pt-3.5 pb-2 group flex flex-col gap-1.5">
        {/* linha 1: o nome inteiro (quebra em duas linhas se precisar); clique para renomear */}
        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full shrink-0 mt-[7px]" style={{ backgroundColor: column.color }} aria-hidden="true" />
          <StageTitle title={column.title} onRename={(t) => onRename(column, t)} />
        </div>
        {/* linha 2: números e ações da etapa */}
        <div className="flex items-center gap-2 min-h-7 pl-4">
          <span className="text-xs text-muted tabular-nums whitespace-nowrap">{items.length} {items.length === 1 ? "lead" : "leads"} · {brl(total)}</span>
          {isInbox && (
            <span title="Os novos leads do WhatsApp entram aqui" className="inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-accent-soft text-accent-fg text-[11px] font-semibold">
              <Inbox className="w-3 h-3" aria-hidden="true" /> Entrada
            </span>
          )}
          <span className="ml-auto flex items-center">
            <OutcomeMenu column={column} onPick={(o) => onSetOutcome(column, o)} />
            {!isInbox && (
              <button
                type="button"
                onClick={() => onMakeInbox(column)}
                aria-label={`Usar ${column.title} como etapa de entrada dos leads do WhatsApp`}
                title="Usar como etapa de entrada (leads novos do WhatsApp caem aqui)"
                className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-card opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
              >
                <Inbox className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDeleteColumn(column)}
              aria-label={`Excluir etapa ${column.title}`}
              className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </header>

      <div ref={setNodeRef} className={cn("flex-1 overflow-y-auto px-2.5 pb-2.5 flex flex-col gap-2 min-h-[120px] rounded-b-2xl transition-colors", isOver && "bg-line/40")}>
        <SortableContext id={`col-${column.id}`} items={ids} strategy={verticalListSortingStrategy}>
          {items.map((c) => (
            <SortableCard key={c.id} card={c} tags={tags} next={nextTasks.get(c.lead_id)} onOpen={onOpen} dragDisabled={dragDisabled} />
          ))}
        </SortableContext>
        {items.length === 0 && <p className="text-xs text-muted text-center py-6">Nenhum lead aqui</p>}
        <button
          type="button"
          onClick={() => onAdd(column.id)}
          className="h-9 rounded-[10px] text-sm font-medium text-muted hover:text-fg hover:bg-card flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar lead
        </button>
      </div>
    </section>
  );
}

// ── Adicionar lead ao quadro (existente ou novo) ─────────

function AddToBoardSheet({ open, onClose, boardId, columns, columnId, setColumnId }: {
  open: boolean;
  onClose: () => void;
  boardId: number;
  columns: KanbanColumnWithCards[];
  columnId: number | null;
  setColumnId: (id: number) => void;
}) {
  const { data: leads = [], isLoading } = useLeads();
  const createLead = useCreateLead();
  const addToBoard = useAddToBoard();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [form, setForm] = useState({ name: "", phone: "", status: "warm" as LeadTemp, value: 0, product: "" });
  const [tagIds, setTagIds] = useState<number[]>([]);
  // com catálogo: itens escolhidos (o valor acompanha a soma); banco antigo: texto livre
  const { data: catalog } = useCatalog();
  const { data: campaigns } = useCampaigns();
  const [items, setItems] = useState<DraftCardItem[]>([]);
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [campaignText, setCampaignText] = useState("");
  const campaignItemIds = useMemo(
    () => new Set((campaigns ?? []).find((c) => c.id === campaignId)?.campaign_items?.map((x) => x.item_id) ?? []),
    [campaigns, campaignId]
  );

  const reset = () => {
    setQ(""); setPicked([]); setForm({ name: "", phone: "", status: "warm", value: 0, product: "" }); setTagIds([]);
    setItems([]); setCampaignId(null); setCampaignText("");
  };
  const close = () => { reset(); onClose(); };

  const { data: allTags = [] } = useTags();
  // quem tem etiqueta de ignorar não entra no Kanban
  const outside = useMemo(() => {
    const blocked = blockedLeadIds(leads, allTags);
    return leads.filter((l) => !blocked.has(l.id) && !l.kanban_cards.some((c) => c.board_id === boardId));
  }, [leads, allTags, boardId]);
  const nq = deaccent(q).toLowerCase().trim();
  const found = outside.filter((l) => !nq || deaccent(l.name).toLowerCase().includes(nq) || (l.phone ?? "").replace(/\D/g, "").includes(nq.replace(/\D/g, "") || "\u0000")).slice(0, 60);
  const key = phoneKey(form.phone);
  const dup = key ? leads.find((l) => l.phone_key === key) : undefined;
  const dupOnBoard = dup?.kanban_cards.some((c) => c.board_id === boardId);
  const stage = columns.find((c) => c.id === columnId)?.title;

  const submit = async () => {
    if (!columnId) return;
    if (mode === "existing") {
      if (!picked.length) return toast.error("Escolha pelo menos um lead.");
      await addToBoard.mutateAsync({ leadIds: picked, boardId, columnId });
    } else {
      if (!form.name.trim()) return toast.error("Informe o nome do lead.");
      if (dup) return toast.error("Já existe um lead com este telefone. Use o lead existente.");
      await createLead.mutateAsync({
        lead: {
          name: form.name, phone: form.phone, status: form.status, email: null, origin: null, notes: null,
          campaign: campaigns ? null : campaignText, ...(campaigns ? { campaign_id: campaignId } : {}),
        },
        tagIds,
        card: catalog
          ? { board_id: boardId, column_id: columnId, value: form.value, items }
          : { board_id: boardId, column_id: columnId, value: form.value, product: form.product.trim() || null },
      });
    }
    close();
  };

  const busy = createLead.isPending || addToBoard.isPending;

  return (
    <Modal open={open} onClose={close} title="Adicionar lead ao quadro" description={stage ? `Na etapa ${stage}` : undefined}
      footer={<>
        <Button variant="secondary" onClick={close}>Cancelar</Button>
        <Button onClick={submit} disabled={busy || (mode === "existing" ? !picked.length : !form.name.trim() || !!dup)}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === "existing" ? (picked.length > 1 ? `Adicionar ${picked.length} leads` : "Adicionar lead") : "Criar e adicionar"}
        </Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Tipo" className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5 self-start">
          {([["existing", "Lead que já existe", Users], ["new", "Novo lead", UserPlus]] as const).map(([v, label, Icon]) => (
            <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
              className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors inline-flex items-center gap-1.5", mode === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="ab-stage" className="text-xs font-medium text-muted">Etapa</label>
          <select id="ab-stage" value={columnId ?? ""} onChange={(e) => setColumnId(Number(e.target.value))} className={inputCls}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {mode === "existing" ? (
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar por nome ou telefone" className="sm:w-full" />
            {isLoading ? (
              <span className="skeleton h-40" />
            ) : outside.length === 0 ? (
              <p className="text-sm text-muted">Todos os seus leads já estão neste quadro. Crie um novo lead.</p>
            ) : found.length === 0 ? (
              <p className="text-sm text-muted">Nenhum lead encontrado.</p>
            ) : (
              <ul className="flex flex-col border border-line rounded-xl overflow-hidden" role="listbox" aria-multiselectable="true" aria-label="Leads">
                {found.map((l) => {
                  const on = picked.includes(l.id);
                  return (
                    <li key={l.id} role="option" aria-selected={on} className="border-b border-line last:border-0">
                      <button type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== l.id) : [...p, l.id]))}
                        className={cn("w-full px-3 py-2.5 flex items-center gap-3 text-left cursor-pointer hover:bg-surface", on && "bg-surface")}>
                        <span className={cn("w-5 h-5 rounded-md border grid place-items-center shrink-0", on ? "bg-primary border-primary text-on-primary" : "border-line")}>{on && <Check className="w-3.5 h-3.5" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold truncate">{l.name}</span>
                          <span className="block text-xs text-muted tabular-nums truncate">{l.phone ? formatPhone(l.phone) : "Sem telefone"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nl-name" className="text-xs font-medium text-muted">Nome</label>
              <input id="nl-name" data-autofocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do contato" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nl-phone" className="text-xs font-medium text-muted">Telefone</label>
                <input id="nl-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 98765-4321" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nl-value" className="text-xs font-medium text-muted">Valor (R$)</label>
                <input id="nl-value" type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className={cn(inputCls, "tabular-nums")} />
              </div>
            </div>
            {dup && (
              <div className="rounded-xl bg-warn-soft text-warn p-3 text-sm flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[180px]">Este telefone já é de <b>{dup.name}</b>{dupOnBoard ? ", que já está neste quadro." : "."}</span>
                {!dupOnBoard && (
                  <Button size="sm" variant="secondary" onClick={() => { setMode("existing"); setPicked([dup.id]); setQ(dup.name); }}>Usar este lead</Button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nl-campaign" className="text-xs font-medium text-muted">Campanha</label>
              <CampaignPicker id="nl-campaign" value={campaignId} text={campaignText} onChange={setCampaignId} onTextChange={setCampaignText} />
            </div>
            {catalog ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Produtos e serviços</span>
                <CardItemsEditor idPrefix="nl" value={items} campaignItemIds={campaignItemIds}
                  onChange={(next, total) => { setItems(next); setForm((f) => ({ ...f, value: total })); }} />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="nl-product" className="text-xs font-medium text-muted">Produto ou interesse</label>
                <input id="nl-product" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="O que o lead procura?" className={inputCls} />
              </div>
            )}
            <TempPicker value={form.status} onChange={(status) => setForm({ ...form, status })} />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Etiquetas</span>
              <TagPicker value={tagIds} onChange={setTagIds} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Página ───────────────────────────────────────────────

const NO_COLUMNS: KanbanColumnWithCards[] = [];

export default function KanbanPage() {
  const qc = useQueryClient();
  const { data: boards = [], isLoading: boardsLoading, isError: boardsError } = useBoards();
  const { data: tags = [] } = useTags();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const createColumn = useCreateColumn();
  const deleteColumn = useDeleteColumn();
  const renameColumn = useRenameColumn();
  const moveCard = useMoveCard();
  const inbox = useInboxColumn();
  const setInbox = useSetInboxColumn();
  const setOutcome = useSetColumnOutcome();
  const tasks = useTasks();
  const nextTasks = useMemo<NextTasks>(() => {
    const map: NextTasks = new Map();
    for (const t of tasks.data ?? []) {
      if (!t.lead_id || !isOpen(t)) continue;
      const cur = map.get(t.lead_id);
      if (cur) cur.count++;
      else map.set(t.lead_id, { next: t, count: 1 });
    }
    return map;
  }, [tasks.data]);

  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [boardToDelete, setBoardToDelete] = useState(false);
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColColor, setNewColColor] = useState(STAGE_COLORS[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [addColId, setAddColId] = useState<number | null>(null);
  const [activeDrag, setActiveDrag] = useState<KanbanCardWithLead | null>(null);
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [colToDelete, setColToDelete] = useState<KanbanColumnWithCards | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tagFilter, setTagFilter] = useState<number | "">("");
  const { data: owners = [] } = useOwners();
  const [ownerFilter, setOwnerFilter] = useState<number | "" | "none">("");
  const [query, setQuery] = useState("");

  const currentBoardId = (activeBoardId && boards.some((b) => b.id === activeBoardId) ? activeBoardId : null) || boards[0]?.id || null;
  const currentBoard = boards.find((b) => b.id === currentBoardId);
  const { data: loadedColumns, isLoading: colsLoading } = useBoardData(currentBoardId);
  // Lista vazia estável: um `= []` novo a cada render fazia o efeito abaixo rodar sem parar enquanto os dados carregavam
  const columns = loadedColumns ?? NO_COLUMNS;

  // Cópia das etapas só enquanto arrasta (para mostrar o card na etapa nova antes de soltar).
  // Fora do arraste, a tela mostra os dados direto.
  const [dragColumns, setDragColumns] = useState<KanbanColumnWithCards[] | null>(null);
  const localColumns = dragColumns ?? columns;
  const collision = useCollision(dragColumns);

  const filtering = filter !== "all" || tagFilter !== "" || ownerFilter !== "" || query.trim() !== "";
  const visibleItems = (col: KanbanColumnWithCards) => {
    const q = deaccent(query.trim()).toLowerCase();
    const digits = q.replace(/\D/g, "");
    return col.items.filter((c) =>
      (filter === "all" || c.lead.status === filter) &&
      (tagFilter === "" || c.lead.lead_tags.some((t) => t.tag_id === tagFilter)) &&
      (ownerFilter === "" || (ownerFilter === "none" ? !c.lead.owner_id : c.lead.owner_id === ownerFilter)) &&
      (!q || deaccent(c.lead.name).toLowerCase().includes(q) || (!!digits && (c.lead.phone || "").replace(/\D/g, "").includes(digits)))
    );
  };
  const totalVisible = localColumns.reduce((n, c) => n + visibleItems(c).length, 0);

  // Mouse: começa a arrastar depois de 5 px (clique continua abrindo o lead).
  // Toque: segurar 200 ms; antes disso o dedo rola a coluna normalmente.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // o navegador às vezes dispara um clique ao soltar: não abre a ficha nesse caso
  const lastDragEnd = useRef(0);
  const openCard = (c: KanbanCardWithLead) => { if (Date.now() - lastDragEnd.current > 250) setOpenLeadId(c.lead_id); };

  const handleDragStart = (e: DragStartEvent) => {
    const card = e.active.data.current?.card as KanbanCardWithLead | undefined;
    if (!card) return;
    collision.start(e.active.id);
    setActiveDrag(card);
    setDragColumns(columns);
    document.body.classList.add("zf-dragging");
  };

  // Enquanto arrasta para outra etapa, já mostra o card nela.
  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey || !activeKey.startsWith("card-")) return;

    setDragColumns((cur) => {
      const prev = cur ?? columns;
      const id = cardIdOf(activeKey);
      const from = prev.findIndex((c) => c.items.some((x) => x.id === id));
      if (from === -1) return prev;
      const to = overKey.startsWith("card-")
        ? prev.findIndex((c) => c.items.some((x) => x.id === cardIdOf(overKey)))
        : prev.findIndex((c) => `col-${c.id}` === overKey);
      if (to === -1 || from === to) return prev;
      collision.moved();

      const next = [...prev];
      const fromItems = [...next[from].items];
      const toItems = [...next[to].items];
      const idx = fromItems.findIndex((x) => x.id === id);
      const [moved] = fromItems.splice(idx, 1);
      const item = { ...moved, column_id: next[to].id };
      if (overKey.startsWith("card-")) {
        const overIdx = toItems.findIndex((x) => x.id === cardIdOf(overKey));
        // acima ou abaixo do card de destino, pela posição do ponteiro
        const start = e.activatorEvent as MouseEvent | TouchEvent;
        const y0 = "touches" in start ? start.touches[0]?.clientY : start.clientY;
        const pointerY = y0 != null ? y0 + e.delta.y : (active.rect.current.translated?.top ?? 0) + (active.rect.current.translated?.height ?? 0) / 2;
        const below = pointerY > over.rect.top + over.rect.height / 2;
        toItems.splice(overIdx >= 0 ? overIdx + (below ? 1 : 0) : toItems.length, 0, item);
      } else {
        toItems.push(item);
      }
      next[from] = { ...next[from], items: fromItems };
      next[to] = { ...next[to], items: toItems };
      return next;
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    lastDragEnd.current = Date.now();
    setActiveDrag(null);
    document.body.classList.remove("zf-dragging");
    const { active, over } = e;
    if (!over) { setDragColumns(null); return; }
    const id = cardIdOf(String(active.id));
    const overKey = String(over.id);

    // calcula fora do setState: o React pode chamar a função duas vezes (e gravaria duas vezes)
    const prev = localColumns;
    const colIdx = prev.findIndex((c) => c.items.some((x) => x.id === id));
    if (colIdx === -1) { setDragColumns(null); return; }
    const next = [...prev];
    if (overKey.startsWith("card-")) {
      const overColIdx = prev.findIndex((c) => c.items.some((x) => x.id === cardIdOf(overKey)));
      if (overColIdx === colIdx) {
        const items = [...prev[colIdx].items];
        const fromI = items.findIndex((x) => x.id === id);
        const toI = items.findIndex((x) => x.id === cardIdOf(overKey));
        if (fromI !== toI) {
          const [m] = items.splice(fromI, 1);
          items.splice(toI, 0, m);
          next[colIdx] = { ...prev[colIdx], items };
        }
      }
    }
    setDragColumns(null);
    // já deixa o card no lugar novo nos dados (sem isso ele voltava para a etapa antiga até gravar)
    const final = next.map((col) => ({ ...col, items: col.items.map((x, i) => ({ ...x, column_id: col.id, position: i })) }));
    qc.cancelQueries({ queryKey: ["kanban", "board", currentBoardId] });
    qc.setQueryData(["kanban", "board", currentBoardId], final);

    const original = columns.find((c) => c.items.some((x) => x.id === id));
    const target = next[colIdx];
    const affected = [target, ...(original && original.id !== target.id ? [next.find((c) => c.id === original.id)!] : [])].filter(Boolean);
    const before = new Map(columns.flatMap((c) => c.items.map((x) => [x.id, { column_id: x.column_id, position: x.position }] as const)));
    const changed = affected.some((col) => col.items.some((x, i) => before.get(x.id)?.column_id !== col.id || before.get(x.id)?.position !== i));
    if (changed) moveCard.mutate({ columns: affected.map((col) => ({ columnId: col.id, cardIds: col.items.map((x) => x.id) })), before });
  };

  const handleCreateBoard = async () => {
    if (!newBoardTitle.trim()) return toast.error("Dê um nome ao quadro.");
    const b = await createBoard.mutateAsync(newBoardTitle.trim());
    if (b?.id) setActiveBoardId(b.id);
    setNewBoardTitle("");
    setNewBoardOpen(false);
  };

  const handleCreateColumn = async () => {
    if (!newColTitle.trim() || !currentBoardId) return toast.error("Dê um nome à etapa.");
    await createColumn.mutateAsync({ board_id: currentBoardId, title: newColTitle.trim(), color: newColColor, position: columns.length });
    setNewColTitle("");
    setNewColOpen(false);
  };

  const openAdd = (colId?: number) => {
    const id = colId ?? columns[0]?.id;
    if (!id) return toast.error("Crie uma etapa antes de adicionar leads.");
    setAddColId(id);
    setAddOpen(true);
  };

  // ── Estados de carregamento / erro / vazio ──

  if (boardsLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex gap-3"><span className="skeleton h-10 w-56" /><span className="skeleton h-10 w-72" /></div>
        <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton w-[296px] h-[420px] rounded-2xl shrink-0" />)}</div>
      </div>
    );
  }

  if (boardsError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Não foi possível carregar o Kanban"
        description="O banco de dados não respondeu. Verifique se o projeto no Supabase está ativo e recarregue a página."
      />
    );
  }

  const boardModal = (
    <Modal open={newBoardOpen} onClose={() => setNewBoardOpen(false)} title="Novo quadro" size="sm"
      footer={<>
        <Button variant="secondary" onClick={() => setNewBoardOpen(false)}>Cancelar</Button>
        <Button onClick={handleCreateBoard} disabled={createBoard.isPending}>{createBoard.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar quadro</Button>
      </>}
    >
      <label htmlFor="board-title" className="text-xs font-medium text-muted">Nome</label>
      <input id="board-title" data-autofocus value={newBoardTitle} onChange={(e) => setNewBoardTitle(e.target.value)} placeholder="Ex.: Vendas" className={cn(inputCls, "mt-1.5")} onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()} />
    </Modal>
  );

  if (boards.length === 0) {
    return (
      <>
        <EmptyState
          icon={Columns3}
          title="Nenhum quadro ainda"
          description="Crie um quadro para acompanhar seus leads por etapa, do primeiro contato ao fechamento. Os leads ficam salvos em Leads mesmo fora do quadro."
          action={<Button onClick={() => setNewBoardOpen(true)}><Plus className="w-4 h-4" /> Criar primeiro quadro</Button>}
        />
        {boardModal}
      </>
    );
  }

  const SEG: [Filter, string][] = [["all", "Todos"], ["hot", "Quentes"], ["warm", "Mornos"], ["cold", "Frios"]];
  const boardCards = columns.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5 animate-fade-in">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <label htmlFor="board-pick" className="sr-only">Quadro</label>
          <select
            id="board-pick"
            value={currentBoardId || ""}
            onChange={(e) => setActiveBoardId(Number(e.target.value))}
            className="h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm font-semibold cursor-pointer outline-none focus:border-fg"
          >
            {boards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <Button variant="secondary" size="icon" aria-label="Novo quadro" title="Novo quadro" onClick={() => setNewBoardOpen(true)}><Plus className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Excluir este quadro" title="Excluir este quadro" className="hover:text-hot" onClick={() => setBoardToDelete(true)}><Trash2 className="w-4 h-4" /></Button>
        </div>

        <div role="group" aria-label="Filtrar por temperatura" className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5">
          {SEG.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
              className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors", filter === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <select aria-label="Filtrar por etiqueta" value={tagFilter} onChange={(e) => setTagFilter(e.target.value ? Number(e.target.value) : "")}
            className="h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm cursor-pointer outline-none focus:border-fg">
            <option value="">Todas as etiquetas</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        {owners.length > 0 && (
          <select aria-label="Filtrar por responsável" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}
            className="h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm cursor-pointer outline-none focus:border-fg">
            <option value="">Todos os responsáveis</option>
            <option value="none">Sem responsável</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}

        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome ou telefone" className="sm:w-60" />

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="secondary" onClick={() => setNewColOpen(true)}><Plus className="w-4 h-4" /> Nova etapa</Button>
          <Button onClick={() => openAdd()}><Plus className="w-4 h-4" /> Adicionar lead</Button>
        </div>
      </div>

      {filtering && (
        <p className="text-xs text-muted -mt-2">
          {totalVisible} {totalVisible === 1 ? "lead encontrado" : "leads encontrados"} · arrastar fica desativado enquanto há filtro.
        </p>
      )}

      {/* Quadro */}
      <div className="flex-1 min-h-[420px] overflow-x-auto overflow-y-hidden -mx-4 sm:-mx-8 px-4 sm:px-8">
        {colsLoading ? (
          <div className="flex gap-4">{[0, 1, 2].map((i) => <span key={i} className="skeleton w-[296px] h-[420px] rounded-2xl shrink-0" />)}</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={collision.detect} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={() => { document.body.classList.remove("zf-dragging"); setActiveDrag(null); setDragColumns(null); }}>
            <div className="flex gap-4 h-full pb-4 items-start">
              {localColumns.map((col) => (
                <StageColumn
                  key={col.id}
                  column={col}
                  items={filtering ? visibleItems(col) : col.items}
                  tags={tags}
                  dragDisabled={filtering}
                  onAdd={openAdd}
                  onDeleteColumn={setColToDelete}
                  onOpen={openCard}
                  nextTasks={nextTasks}
                  isInbox={inbox.column?.id === col.id}
                  onMakeInbox={(c) => setInbox.mutate(c.id)}
                  onSetOutcome={(c, outcome) => setOutcome.mutate({ id: c.id, outcome })}
                  onRename={(c, title) => renameColumn.mutate({ id: c.id, boardId: c.board_id, title })}
                />
              ))}
              <button
                type="button"
                onClick={() => setNewColOpen(true)}
                className="w-[296px] shrink-0 h-24 rounded-2xl border border-dashed border-line flex items-center justify-center gap-2 text-sm font-medium text-muted hover:text-fg hover:border-fg cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" /> Nova etapa
              </button>
            </div>

            {/* O card que segue o ponteiro vai direto no <body>: dentro da página, a animação de entrada
                (transform) e a rolagem do quadro deslocavam o card para longe do cursor. */}
            {typeof document !== "undefined" && createPortal(
              <DragOverlay zIndex={80} dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>
                {activeDrag && (
                  <div className="zf-drag-card bg-card border border-fg rounded-xl p-3 flex flex-col gap-2.5 shadow-elev cursor-grabbing select-none">
                    <CardBody card={activeDrag} tags={tags} next={nextTasks.get(activeDrag.lead_id)} />
                  </div>
                )}
              </DragOverlay>,
              document.body
            )}
          </DndContext>
        )}
      </div>

      {/* Painéis e diálogos */}
      {boardModal}

      <Modal open={newColOpen} onClose={() => setNewColOpen(false)} title="Nova etapa" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setNewColOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreateColumn} disabled={createColumn.isPending}>{createColumn.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar etapa</Button>
        </>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="col-title" className="text-xs font-medium text-muted">Nome da etapa</label>
            <input id="col-title" data-autofocus value={newColTitle} onChange={(e) => setNewColTitle(e.target.value)} placeholder="Ex.: Em negociação" className={inputCls} onKeyDown={(e) => e.key === "Enter" && handleCreateColumn()} />
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-muted mb-1.5">Cor do marcador</legend>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={newColColor === c} onClick={() => setNewColColor(c)}
                  className={cn("w-8 h-8 rounded-full cursor-pointer border-2", newColColor === c ? "border-fg" : "border-transparent")}
                  style={{ backgroundColor: c, boxShadow: "inset 0 0 0 2px var(--card)" }} />
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted">Dica: chame a última etapa de “Fechados” para o Início calcular a taxa de conversão.</p>
        </div>
      </Modal>

      {currentBoardId && (
        <AddToBoardSheet open={addOpen} onClose={() => setAddOpen(false)} boardId={currentBoardId} columns={columns} columnId={addColId} setColumnId={setAddColId} />
      )}

      <Modal open={!!colToDelete} onClose={() => setColToDelete(null)} title={`Excluir a etapa “${colToDelete?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setColToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (colToDelete) deleteColumn.mutate(colToDelete.id); setColToDelete(null); }}>Excluir etapa</Button>
        </>}
      >
        <p className="text-sm text-muted">
          {colToDelete?.items.length
            ? `Os ${colToDelete.items.length} leads desta etapa saem do quadro, mas continuam salvos em Leads.`
            : "A etapa está vazia."}
        </p>
      </Modal>

      <Modal open={boardToDelete} onClose={() => setBoardToDelete(false)} title={`Excluir o quadro “${currentBoard?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setBoardToDelete(false)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (currentBoardId) deleteBoard.mutate(currentBoardId, { onSuccess: () => setActiveBoardId(null) }); setBoardToDelete(false); }}>Excluir quadro</Button>
        </>}
      >
        <p className="text-sm text-muted">
          As etapas somem junto{boardCards ? ` e os ${boardCards} leads saem do quadro` : ""}. Os leads continuam salvos em Leads.
        </p>
      </Modal>

      <LeadDetailModal leadId={openLeadId} open={!!openLeadId} initialTab="kanban" onClose={() => setOpenLeadId(null)} />
    </div>
  );
}
