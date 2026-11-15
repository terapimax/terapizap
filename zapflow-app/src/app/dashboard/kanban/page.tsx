"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useBoards, useCreateBoard, useBoardData,
  useCreateColumn, useDeleteColumn,
  useCreateLead, useUpdateLead, useDeleteLead, useMoveLead,
} from "@/hooks/use-kanban";
import { Modal } from "@/components/ui/modal";
import { LeadDetailModal, TEMP } from "@/components/features/lead-detail-modal";
import { Button, Chip, EmptyState, SearchInput } from "@/components/ui/shared";
import type { Lead, KanbanColumnWithLeads, Task } from "@/types";
import { useTasks } from "@/hooks/use-tasks";
import { formatDue, isOpen, taskState } from "@/lib/tasks";
import { TaskIcon } from "@/components/features/task-sheets";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Columns3, Plus, Trash2, Loader2, AlertCircle } from "lucide-react";

/** Próxima tarefa em aberto de cada lead (a lista vem ordenada por horário). */
type NextTasks = Map<number, { next: Task; count: number }>;

type Temp = "hot" | "warm" | "cold";
type Filter = "all" | Temp;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const STAGE_COLORS = ["#111113", "#d1236f", "#1d4ed8", "#0e7a4f", "#9a5b00", "#b42318", "#6b21a8", "#0f766e"];

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

// ── Cartão do lead (visual) ─────────────────────────────

function LeadCardBody({ lead, next }: { lead: Lead; next?: { next: Task; count: number } }) {
  const temp = TEMP[lead.status] ?? TEMP.warm;
  const late = next ? taskState(next.next) === "overdue" : false;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-full bg-surface border border-line grid place-items-center text-xs font-semibold shrink-0">{initials(lead.name)}</span>
        <div className="min-w-0">
          <p className="font-semibold leading-tight truncate">{lead.name}</p>
          {lead.phone && <p className="text-xs text-muted tabular-nums truncate">{lead.phone}</p>}
        </div>
      </div>
      {(lead.last_message || lead.product) && (
        <p className="text-[13px] text-muted line-clamp-2">{lead.last_message || lead.product}</p>
      )}
      {next && (
        <p className={cn("flex items-center gap-1.5 text-xs font-medium tabular-nums", late ? "text-warn" : "text-muted")} title={next.next.title}>
          <TaskIcon task={next.next} className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{late ? "Atrasada · " : ""}{formatDue(next.next.due_at)}</span>
          {next.count > 1 && <span className="ml-auto shrink-0">+{next.count - 1}</span>}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Chip tone={temp.tone}>{temp.label}</Chip>
        <span className="text-sm font-semibold tabular-nums">{brl(Number(lead.value) || 0)}</span>
      </div>
    </>
  );
}

function SortableLeadCard({ lead, next, onOpen, dragDisabled }: { lead: Lead; next?: { next: Task; count: number }; onOpen: (lead: Lead) => void; dragDisabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lead-${lead.id}`,
    data: { type: "lead", lead },
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
      aria-label={`Abrir ${lead.name}`}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) onOpen(lead);
      }}
      className={cn(
        "bg-card border border-line rounded-xl p-3 flex flex-col gap-2.5 text-left touch-none select-none",
        "hover:border-fg transition-colors",
        dragDisabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-0"
      )}
    >
      <LeadCardBody lead={lead} next={next} />
    </div>
  );
}

// ── Coluna (etapa) ───────────────────────────────────────

function StageColumn({
  column,
  items,
  dragDisabled,
  onAddLead,
  onDeleteColumn,
  onOpenLead,
  nextTasks,
}: {
  nextTasks: NextTasks;
  column: KanbanColumnWithLeads;
  items: Lead[];
  dragDisabled: boolean;
  onAddLead: (colId: number) => void;
  onDeleteColumn: (col: KanbanColumnWithLeads) => void;
  onOpenLead: (lead: Lead) => void;
}) {
  const leadIds = useMemo(() => items.map((l) => `lead-${l.id}`), [items]);
  const total = items.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}`, data: { type: "column", column } });

  return (
    <section aria-label={column.title} className="w-[296px] shrink-0 flex flex-col max-h-full bg-surface rounded-2xl">
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2 group">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: column.color }} aria-hidden="true" />
        <h3 className="font-sans text-sm font-semibold tracking-normal truncate">{column.title}</h3>
        <span className="text-xs text-muted tabular-nums">{items.length}</span>
        <span className="ml-auto text-xs text-muted tabular-nums">{brl(total)}</span>
        <button
          type="button"
          onClick={() => onDeleteColumn(column)}
          aria-label={`Excluir etapa ${column.title}`}
          className="h-7 w-7 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </header>

      <div
        ref={setNodeRef}
        className={cn("flex-1 overflow-y-auto px-2.5 pb-2.5 flex flex-col gap-2 min-h-[120px] rounded-b-2xl transition-colors", isOver && "bg-line/40")}
      >
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          {items.map((lead) => (
            <SortableLeadCard key={lead.id} lead={lead} next={nextTasks.get(lead.id)} onOpen={onOpenLead} dragDisabled={dragDisabled} />
          ))}
        </SortableContext>
        {items.length === 0 && <p className="text-xs text-muted text-center py-6">Nenhum lead aqui</p>}
        <button
          type="button"
          onClick={() => onAddLead(column.id)}
          className="h-9 rounded-[10px] text-sm font-medium text-muted hover:text-fg hover:bg-card flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" /> Adicionar lead
        </button>
      </div>
    </section>
  );
}

// ── Página ───────────────────────────────────────────────

const NO_COLUMNS: KanbanColumnWithLeads[] = [];

export default function KanbanPage() {
  const { data: boards = [], isLoading: boardsLoading, isError: boardsError } = useBoards();
  const createBoard = useCreateBoard();
  const createColumn = useCreateColumn();
  const deleteColumn = useDeleteColumn();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const moveLead = useMoveLead();
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
  const [newColOpen, setNewColOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState("");
  const [newColColor, setNewColColor] = useState(STAGE_COLORS[0]);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addLeadColId, setAddLeadColId] = useState<number | null>(null);
  const [leadForm, setLeadForm] = useState<{ name: string; phone: string; product: string; value: number; status: Temp }>({ name: "", phone: "", product: "", value: 0, status: "warm" });
  const [activeDragLead, setActiveDragLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [colToDelete, setColToDelete] = useState<KanbanColumnWithLeads | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const currentBoardId = activeBoardId || boards[0]?.id || null;
  const { data: loadedColumns, isLoading: colsLoading } = useBoardData(currentBoardId);
  // Lista vazia estável: um `= []` novo a cada render fazia o efeito abaixo rodar sem parar enquanto os dados carregavam
  const columns = loadedColumns ?? NO_COLUMNS;

  const [localColumns, setLocalColumns] = useState<KanbanColumnWithLeads[]>([]);

  useEffect(() => {
    if (!activeDragLead) setLocalColumns(columns);
  }, [columns, activeDragLead]);

  const filtering = filter !== "all" || query.trim() !== "";
  const visibleItems = (col: KanbanColumnWithLeads) => {
    const q = query.trim().toLowerCase();
    return col.items.filter(
      (l) => (filter === "all" || l.status === filter) && (!q || l.name.toLowerCase().includes(q) || (l.phone || "").includes(q))
    );
  };
  const totalVisible = localColumns.reduce((n, c) => n + visibleItems(c).length, 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (e: DragStartEvent) => {
    const leadData = e.active.data.current?.lead as Lead | undefined;
    if (leadData) setActiveDragLead(leadData);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const isActiveLead = activeId.startsWith("lead-");
    const isOverLead = overId.startsWith("lead-");
    const isOverColumn = overId.startsWith("col-");

    if (!isActiveLead) return;

    setLocalColumns((prevCols) => {
      const activeLeadId = Number(activeId.replace("lead-", ""));
      const activeColIndex = prevCols.findIndex((c) => c.items.some((l) => l.id === activeLeadId));
      if (activeColIndex === -1) return prevCols;

      const activeCol = prevCols[activeColIndex];
      const activeItemIndex = activeCol.items.findIndex((l) => l.id === activeLeadId);
      const activeItem = activeCol.items[activeItemIndex];

      let overColIndex = -1;
      if (isOverLead) {
        const overLeadId = Number(overId.replace("lead-", ""));
        overColIndex = prevCols.findIndex((c) => c.items.some((l) => l.id === overLeadId));
      } else if (isOverColumn) {
        const overColId = Number(overId.replace("col-", ""));
        overColIndex = prevCols.findIndex((c) => c.id === overColId);
      }

      if (overColIndex === -1 || activeColIndex === overColIndex) return prevCols;

      const newCols = [...prevCols];
      const newActiveColItems = [...newCols[activeColIndex].items];
      const newOverColItems = [...newCols[overColIndex].items];

      newActiveColItems.splice(activeItemIndex, 1);
      const movedItem = { ...activeItem, column_id: newCols[overColIndex].id };

      if (isOverLead) {
        const overLeadId = Number(overId.replace("lead-", ""));
        const overItemIndex = newOverColItems.findIndex((l) => l.id === overLeadId);
        const isBelowOverItem = over && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        const modifier = isBelowOverItem ? 1 : 0;
        const newIndex = overItemIndex >= 0 ? overItemIndex + modifier : newOverColItems.length;
        newOverColItems.splice(newIndex, 0, movedItem);
      } else {
        newOverColItems.push(movedItem);
      }

      newCols[activeColIndex] = { ...newCols[activeColIndex], items: newActiveColItems };
      newCols[overColIndex] = { ...newCols[overColIndex], items: newOverColItems };
      return newCols;
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragLead(null);
    const { active, over } = e;
    if (!over) return;

    const activeLeadId = Number(String(active.id).replace("lead-", ""));
    const overId = String(over.id);

    setLocalColumns((prevCols) => {
      const activeColIndex = prevCols.findIndex((c) => c.items.some((l) => l.id === activeLeadId));
      if (activeColIndex === -1) return prevCols;

      const activeCol = prevCols[activeColIndex];
      const activeItemIndex = activeCol.items.findIndex((l) => l.id === activeLeadId);
      const activeItem = activeCol.items[activeItemIndex];

      let overColIndex = -1;
      let overItemIndex = -1;

      if (overId.startsWith("lead-")) {
        const overLeadId = Number(overId.replace("lead-", ""));
        overColIndex = prevCols.findIndex((c) => c.items.some((l) => l.id === overLeadId));
        if (overColIndex !== -1) overItemIndex = prevCols[overColIndex].items.findIndex((l) => l.id === overLeadId);
      } else if (overId.startsWith("col-")) {
        const overColId = Number(overId.replace("col-", ""));
        overColIndex = prevCols.findIndex((c) => c.id === overColId);
      }

      if (overColIndex === -1) return prevCols;

      const newCols = [...prevCols];

      if (activeColIndex === overColIndex) {
        if (activeItemIndex !== overItemIndex && overItemIndex !== -1) {
          const newItems = [...newCols[activeColIndex].items];
          newItems.splice(activeItemIndex, 1);
          newItems.splice(overItemIndex, 0, activeItem);
          newCols[activeColIndex] = { ...newCols[activeColIndex], items: newItems };
        }
      } else {
        overItemIndex = newCols[overColIndex].items.findIndex((l) => l.id === activeLeadId);
      }

      const targetCol = newCols[overColIndex];
      const finalIndex = overItemIndex !== -1 ? overItemIndex : targetCol.items.findIndex((l) => l.id === activeLeadId);

      const originalCol = columns.find((c) => c.items.some((l) => l.id === activeLeadId));
      const originalIndex = originalCol ? originalCol.items.findIndex((l) => l.id === activeLeadId) : -1;

      if (originalCol?.id !== targetCol.id || originalIndex !== finalIndex) {
        moveLead.mutate({ leadId: activeLeadId, columnId: targetCol.id, position: Math.max(0, finalIndex) });
      }
      return newCols;
    });
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

  const openAddLead = (colId?: number) => {
    const id = colId ?? columns[0]?.id;
    if (!id) return toast.error("Crie uma etapa antes de adicionar leads.");
    setAddLeadColId(id);
    setAddLeadOpen(true);
  };

  const handleCreateLead = async () => {
    if (!leadForm.name.trim() || !addLeadColId) return toast.error("Informe o nome do lead.");
    const targetCol = columns.find((c) => c.id === addLeadColId);
    await createLead.mutateAsync({ ...leadForm, name: leadForm.name.trim(), column_id: addLeadColId, position: targetCol?.items.length || 0 });
    setLeadForm({ name: "", phone: "", product: "", value: 0, status: "warm" });
    setAddLeadOpen(false);
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
        title="Não foi possível carregar seus leads"
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
          description="Crie um quadro para organizar seus leads por etapa, do primeiro contato ao fechamento."
          action={<Button onClick={() => setNewBoardOpen(true)}><Plus className="w-4 h-4" /> Criar primeiro quadro</Button>}
        />
        {boardModal}
      </>
    );
  }

  const SEG: [Filter, string][] = [["all", "Todos"], ["hot", "Quentes"], ["warm", "Mornos"], ["cold", "Frios"]];

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
        </div>

        <div role="group" aria-label="Filtrar por temperatura" className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5">
          {SEG.map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
              className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors", filter === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </div>

        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome ou telefone" className="sm:w-60" />

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="secondary" onClick={() => setNewColOpen(true)}><Plus className="w-4 h-4" /> Nova etapa</Button>
          <Button onClick={() => openAddLead()}><Plus className="w-4 h-4" /> Novo lead</Button>
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
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 h-full pb-4 items-start">
              {localColumns.map((col) => (
                <StageColumn
                  key={col.id}
                  column={col}
                  items={filtering ? visibleItems(col) : col.items}
                  dragDisabled={filtering}
                  onAddLead={openAddLead}
                  onDeleteColumn={setColToDelete}
                  onOpenLead={setSelectedLead}
                  nextTasks={nextTasks}
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

            <DragOverlay>
              {activeDragLead && (
                <div className="w-[272px] bg-card border border-fg rounded-xl p-3 flex flex-col gap-2.5 shadow-elev pointer-events-none">
                  <LeadCardBody lead={activeDragLead} next={nextTasks.get(activeDragLead.id)} />
                </div>
              )}
            </DragOverlay>
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
                <button
                  key={c}
                  type="button"
                  aria-label={`Cor ${c}`}
                  aria-pressed={newColColor === c}
                  onClick={() => setNewColColor(c)}
                  className={cn("w-8 h-8 rounded-full cursor-pointer border-2", newColColor === c ? "border-fg" : "border-transparent")}
                  style={{ backgroundColor: c, boxShadow: "inset 0 0 0 2px var(--card)" }}
                />
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted">Dica: chame a última etapa de “Fechados” para o Início calcular a taxa de conversão.</p>
        </div>
      </Modal>

      <Modal open={addLeadOpen} onClose={() => setAddLeadOpen(false)} title="Novo lead"
        description={columns.find((c) => c.id === addLeadColId)?.title ? `Na etapa ${columns.find((c) => c.id === addLeadColId)?.title}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setAddLeadOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreateLead} disabled={createLead.isPending}>{createLead.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar lead</Button>
        </>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nl-name" className="text-xs font-medium text-muted">Nome</label>
            <input id="nl-name" data-autofocus value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} placeholder="Nome do contato" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nl-phone" className="text-xs font-medium text-muted">Telefone</label>
              <input id="nl-phone" type="tel" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="(11) 98765-4321" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nl-value" className="text-xs font-medium text-muted">Valor (R$)</label>
              <input id="nl-value" type="number" min="0" value={leadForm.value} onChange={(e) => setLeadForm({ ...leadForm, value: Number(e.target.value) })} className={cn(inputCls, "tabular-nums")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nl-stage" className="text-xs font-medium text-muted">Etapa</label>
            <select id="nl-stage" value={addLeadColId ?? ""} onChange={(e) => setAddLeadColId(Number(e.target.value))} className={inputCls}>
              {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nl-product" className="text-xs font-medium text-muted">Produto ou interesse</label>
            <input id="nl-product" value={leadForm.product} onChange={(e) => setLeadForm({ ...leadForm, product: e.target.value })} placeholder="O que o lead procura?" className={inputCls} />
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-muted mb-1.5">Temperatura</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TEMP) as Temp[]).map((s) => {
                const cfg = TEMP[s];
                const Icon = cfg.icon;
                const on = leadForm.status === s;
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => setLeadForm({ ...leadForm, status: s })}
                    className={cn("h-10 rounded-[10px] border text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors", on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
                    <Icon className="w-4 h-4" /> {cfg.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </Modal>

      <Modal open={!!colToDelete} onClose={() => setColToDelete(null)} title={`Excluir a etapa “${colToDelete?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setColToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (colToDelete) deleteColumn.mutate(colToDelete.id); setColToDelete(null); }}>Excluir etapa</Button>
        </>}
      >
        <p className="text-sm text-muted">
          {colToDelete?.items.length
            ? `Os ${colToDelete.items.length} leads desta etapa também serão excluídos. Isso não pode ser desfeito.`
            : "A etapa está vazia. Isso não pode ser desfeito."}
        </p>
      </Modal>

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        columns={columns}
        saving={updateLead.isPending}
        onClose={() => setSelectedLead(null)}
        onSave={(data) => updateLead.mutate(data, { onSuccess: () => { toast.success("Lead salvo"); setSelectedLead(null); } })}
        onDelete={(id) => deleteLead.mutate(id, { onSuccess: () => setSelectedLead(null) })}
      />
    </div>
  );
}
