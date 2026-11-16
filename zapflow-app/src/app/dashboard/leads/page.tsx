"use client";

import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Columns3, Download, FileUp, Loader2, Minus, Plus, Tag as TagIcon, Trash2, Upload, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, SearchInput } from "@/components/ui/shared";
import { LeadDetailModal, TEMP, TempPicker, inputCls } from "@/components/features/lead-detail-modal";
import { TagList, TagManager, TagMenu, TagPicker } from "@/components/features/tags";
import { blockedLeadIds, invalidateLeads, useAddToBoard, useBulkTag, useCreateLead, useDeleteLeads, useLeads, useTags } from "@/hooks/use-leads";
import { useAllColumns, useBoards } from "@/hooks/use-kanban";
import { useBulkOwner, useOwners } from "@/hooks/use-owners";
import { OwnerLabel } from "@/components/features/owners";
import { useOpenFromQuery } from "@/hooks/use-open-from-query";
import { FIELD_LABEL, ORIGINS, deaccent, formatPhone, initials, phoneKey, tagsOf } from "@/lib/leads";
import { downloadText, exportCsv, parseImport, runImport, type ImportReport, type ParsedImport } from "@/lib/leads-import";
import { cn } from "@/lib/utils";
import type { KanbanBoard, KanbanColumn, LeadFull, LeadTemp } from "@/types";
import { toast } from "sonner";

const PAGE = 100;
type KanbanFilter = "" | "none" | number;

const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");

/** Quadro + etapa (usado em "Novo lead", "Importar" e nas ações em massa). */
function BoardStagePicker({ boards, columns, value, onChange, optional = true }: {
  boards: KanbanBoard[];
  columns: KanbanColumn[];
  value: { boardId: number; columnId: number } | null;
  onChange: (v: { boardId: number; columnId: number } | null) => void;
  optional?: boolean;
}) {
  const cols = columns.filter((c) => c.board_id === value?.boardId);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <select aria-label="Quadro" className={inputCls} value={value?.boardId ?? ""}
        onChange={(e) => {
          const b = Number(e.target.value);
          const first = columns.find((c) => c.board_id === b);
          onChange(b && first ? { boardId: b, columnId: first.id } : null);
        }}>
        {optional ? <option value="">Não colocar no Kanban</option> : <option value="" disabled>Escolha o quadro</option>}
        {boards.map((b) => <option key={b.id} value={b.id} disabled={!columns.some((c) => c.board_id === b.id)}>{b.title}{columns.some((c) => c.board_id === b.id) ? "" : " (sem etapas)"}</option>)}
      </select>
      <select aria-label="Etapa" className={inputCls} value={value?.columnId ?? ""} disabled={!value}
        onChange={(e) => value && onChange({ ...value, columnId: Number(e.target.value) })}>
        {!value && <option value="">Etapa</option>}
        {cols.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </div>
  );
}

// ── Novo lead ────────────────────────────────────────────

function NewLeadSheet({ open, onClose, leads, boards, columns, onOpenLead }: {
  open: boolean; onClose: () => void; leads: LeadFull[]; boards: KanbanBoard[]; columns: KanbanColumn[]; onOpenLead: (id: number) => void;
}) {
  const create = useCreateLead();
  const empty = { name: "", phone: "", email: "", origin: "", campaign: "", notes: "", status: "warm" as LeadTemp };
  const [form, setForm] = useState(empty);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [board, setBoard] = useState<{ boardId: number; columnId: number } | null>(null);
  const key = phoneKey(form.phone);
  const dup = key ? leads.find((l) => l.phone_key === key) : undefined;

  const close = () => { setForm(empty); setTagIds([]); setBoard(null); onClose(); };
  const submit = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do lead.");
    if (dup) return toast.error("Já existe um lead com este telefone.");
    await create.mutateAsync({ lead: form, tagIds, card: board ? { board_id: board.boardId, column_id: board.columnId } : null });
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Novo lead"
      footer={<>
        <Button variant="secondary" onClick={close}>Cancelar</Button>
        <Button onClick={submit} disabled={create.isPending || !form.name.trim() || !!dup}>{create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar lead</Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="n-name" className="text-xs font-medium text-muted">Nome</label>
          <input id="n-name" data-autofocus className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome do contato" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="n-phone" className="text-xs font-medium text-muted">Telefone</label>
            <input id="n-phone" type="tel" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 98765-4321" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="n-email" className="text-xs font-medium text-muted">E-mail</label>
            <input id="n-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@empresa.com" />
          </div>
        </div>
        {dup && (
          <div className="rounded-xl bg-warn-soft text-warn p-3 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[180px]">Este telefone já é de <b>{dup.name}</b>.</span>
            <Button size="sm" variant="secondary" onClick={() => { close(); onOpenLead(dup.id); }}>Abrir lead</Button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="n-origin" className="text-xs font-medium text-muted">Origem</label>
            <select id="n-origin" className={inputCls} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })}>
              <option value="">Não informada</option>
              {ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="n-campaign" className="text-xs font-medium text-muted">Campanha</label>
            <input id="n-campaign" className={inputCls} value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="Ex.: Black Friday" />
          </div>
        </div>
        <TempPicker value={form.status} onChange={(status) => setForm({ ...form, status })} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Etiquetas</span>
          <TagPicker value={tagIds} onChange={setTagIds} />
        </div>
        {boards.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Kanban</span>
            <BoardStagePicker boards={boards} columns={columns} value={board} onChange={setBoard} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="n-notes" className="text-xs font-medium text-muted">Observações</label>
          <textarea id="n-notes" rows={3} className={cn(inputCls, "h-auto py-2.5 resize-y")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  );
}

// ── Importar planilha ────────────────────────────────────

function ImportSheet({ open, onClose, leads, boards, columns }: { open: boolean; onClose: () => void; leads: LeadFull[]; boards: KanbanBoard[]; columns: KanbanColumn[] }) {
  const qc = useQueryClient();
  const { data: tags = [] } = useTags();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState("");
  const [board, setBoard] = useState<{ boardId: number; columnId: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const keys = useMemo(() => new Set(leads.map((l) => l.phone_key).filter(Boolean)), [leads]);
  const existingCount = parsed ? parsed.rows.filter((r) => { const k = phoneKey(r.phone); return k && keys.has(k); }).length : 0;
  const running = !!progress && !report;

  const reset = () => { setFileName(""); setParsed(null); setError(""); setBoard(null); setProgress(null); setReport(null); if (fileRef.current) fileRef.current.value = ""; };
  const close = () => { if (running) return; reset(); onClose(); };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    reset();
    setFileName(f.name);
    try {
      // planilhas antigas do Excel vêm em latin1; se o UTF-8 der caracteres quebrados, relê
      const buf = await f.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
      setParsed(parseImport(text));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const start = async () => {
    if (!parsed) return;
    setProgress({ done: 0, total: parsed.rows.length });
    try {
      const r = await runImport(createClient(), parsed.rows, { existing: leads, tags, board }, (done, total) => setProgress({ done, total }));
      setReport(r);
      invalidateLeads(qc);
    } catch (e) {
      setProgress(null);
      setError((e as Error).message);
    }
  };

  const example = () => downloadText("﻿Nome;Telefone;E-mail;Origem;Campanha;Temperatura;Etiquetas;Observações\r\nMaria Souza;(11) 98765-4321;maria@email.com;Instagram;Black Friday;Quente;VIP, Orçamento;Quer o plano anual\r\n", "modelo-leads.csv");

  return (
    <Modal open={open} onClose={close} title="Importar leads" description="Planilha .csv do Excel, Google Planilhas ou contatos do Google/celular."
      footer={report ? <Button onClick={close}>Concluir</Button> : <>
        <Button variant="secondary" onClick={close} disabled={running}>Cancelar</Button>
        <Button onClick={start} disabled={!parsed || running || parsed.rows.length === 0}>
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {parsed ? `Importar ${parsed.rows.length} ${parsed.rows.length === 1 ? "lead" : "leads"}` : "Importar"}
        </Button>
      </>}
    >
      {report ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-ok-soft text-ok p-4 flex items-start gap-3">
            <Check className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Importação concluída</p>
              <p>{report.created} novos · {report.updated} já existentes completados{report.onBoard ? ` · ${report.onBoard} colocados no Kanban` : ""}</p>
            </div>
          </div>
          {report.failed.length > 0 && (
            <div className="rounded-xl bg-hot-soft text-hot p-4 text-sm">
              <p className="font-semibold mb-1">{report.failed.length} problema(s)</p>
              <ul className="list-disc pl-5 max-h-40 overflow-y-auto">{report.failed.slice(0, 50).map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" id="imp-file" onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="imp-file"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
            className="rounded-2xl border border-dashed border-line p-6 text-center cursor-pointer hover:border-fg transition-colors">
            <FileUp className="w-6 h-6 mx-auto text-muted mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold">{fileName || "Escolha ou arraste a planilha"}</p>
            <p className="text-xs text-muted mt-0.5">A 1ª linha precisa ter os nomes das colunas (Nome, Telefone…).</p>
          </label>
          <button type="button" onClick={example} className="text-[13px] font-semibold text-accent-fg hover:underline self-start cursor-pointer">Baixar planilha modelo</button>

          {error && <p className="rounded-xl bg-hot-soft text-hot p-3 text-sm flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}</p>}

          {parsed && (
            <>
              <div className="rounded-xl bg-surface p-4 text-sm flex flex-col gap-2">
                <p><b className="tabular-nums">{parsed.rows.length}</b> leads na planilha
                  {existingCount > 0 && <> · <b className="tabular-nums">{existingCount}</b> já existem (só completamos o que estiver vazio e somamos as etiquetas)</>}
                </p>
                {(parsed.repeated > 0 || parsed.empty > 0) && (
                  <p className="text-muted">
                    {parsed.repeated > 0 && `${parsed.repeated} linha(s) com telefone repetido foram juntadas. `}
                    {parsed.empty > 0 && `${parsed.empty} linha(s) sem nome e sem telefone serão ignoradas.`}
                  </p>
                )}
                <p className="text-muted">Colunas reconhecidas: {parsed.fields.map((f) => FIELD_LABEL[f]).join(", ")}</p>
              </div>
              {boards.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">Colocar também no Kanban</span>
                  <BoardStagePicker boards={boards} columns={columns} value={board} onChange={setBoard} />
                </div>
              )}
              {progress && (
                <div className="flex flex-col gap-1.5" role="status">
                  <div className="h-2 rounded-full bg-surface overflow-hidden"><div className="h-full bg-fg transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
                  <p className="text-xs text-muted tabular-nums">{progress.done} de {progress.total}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Página ───────────────────────────────────────────────

export default function LeadsPage() {
  const { data: leads = [], isLoading, isError } = useLeads();
  const { data: tags = [] } = useTags();
  const { data: boards = [] } = useBoards();
  const { data: columns = [] } = useAllColumns();
  const bulkTag = useBulkTag();
  const addToBoard = useAddToBoard();
  const del = useDeleteLeads();
  const { data: owners = [] } = useOwners();
  const bulkOwner = useBulkOwner();
  const ownerById = useMemo(() => new Map(owners.map((o) => [o.id, o])), [owners]);
  const [ownerFilter, setOwnerFilter] = useState<number | "" | "none">("");

  const [query, setQuery] = useState("");
  const [temp, setTemp] = useState<"" | LeadTemp>("");
  const [tagFilter, setTagFilter] = useState<number | "" | "none">("");
  const [kanban, setKanban] = useState<KanbanFilter>("");
  const [origin, setOrigin] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<"add" | "remove" | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [bulkBoard, setBulkBoard] = useState<{ boardId: number; columnId: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useOpenFromQuery(() => setNewOpen(true));
  // a extensão abre o painel direto na ficha do lead da conversa: /dashboard/leads?lead=12
  useOpenFromQuery((v) => { if (Number(v) > 0) setOpenId(Number(v)); }, "lead");

  const boardName = useMemo(() => new Map(boards.map((b) => [b.id, b.title])), [boards]);
  const colName = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const origins = useMemo(() => [...new Set(leads.map((l) => l.origin).filter((o): o is string => !!o))].sort(), [leads]);

  const filtered = useMemo(() => {
    const q = deaccent(query.trim()).toLowerCase();
    const digits = q.replace(/\D/g, "");
    return leads.filter((l) =>
      (!q || deaccent(l.name).toLowerCase().includes(q) || (l.email ?? "").toLowerCase().includes(q) || (!!digits && (l.phone ?? "").replace(/\D/g, "").includes(digits))) &&
      (!temp || l.status === temp) &&
      (tagFilter === "" || (tagFilter === "none" ? l.lead_tags.length === 0 : l.lead_tags.some((t) => t.tag_id === tagFilter))) &&
      (kanban === "" || (kanban === "none" ? l.kanban_cards.length === 0 : l.kanban_cards.some((c) => c.board_id === kanban))) &&
      (!origin || l.origin === origin) &&
      (ownerFilter === "" || (ownerFilter === "none" ? !l.owner_id : l.owner_id === ownerFilter))
    );
  }, [leads, query, temp, tagFilter, kanban, origin, ownerFilter]);

  const shown = filtered.slice(0, limit);
  const filtering = !!(query.trim() || temp || tagFilter !== "" || kanban !== "" || origin || ownerFilter !== "");
  const selIds = [...selected].filter((id) => leads.some((l) => l.id === id));
  const blocked = useMemo(() => blockedLeadIds(leads, tags), [leads, tags]);
  const bulkAllowed = selIds.filter((id) => !blocked.has(id));
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allShownSelected) shown.forEach((l) => n.delete(l.id)); else filtered.forEach((l) => n.add(l.id));
    return n;
  });
  const clearFilters = () => { setQuery(""); setTemp(""); setTagFilter(""); setKanban(""); setOrigin(""); setOwnerFilter(""); };

  const doExport = () => {
    const list = selIds.length ? leads.filter((l) => selected.has(l.id)) : filtered;
    if (!list.length) return toast.error("Nenhum lead para exportar.");
    const d = new Date();
    downloadText(exportCsv(list, tags, boards, columns), `leads-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.csv`);
    toast.success(`${list.length} ${list.length === 1 ? "lead exportado" : "leads exportados"}`);
  };

  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar seus leads" description="O banco não respondeu ou ainda está na versão antiga. Rode o supabase/setup.sql de novo no Supabase e recarregue a página." />;
  }

  const selectCls = "h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm cursor-pointer outline-none focus:border-fg max-w-full";

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} placeholder="Buscar nome, telefone ou e-mail" className="sm:w-72" />
        <select aria-label="Temperatura" className={selectCls} value={temp} onChange={(e) => setTemp(e.target.value as "" | LeadTemp)}>
          <option value="">Todas as temperaturas</option>
          <option value="hot">Quentes</option><option value="warm">Mornos</option><option value="cold">Frios</option>
        </select>
        <select aria-label="Etiqueta" className={selectCls} value={tagFilter} onChange={(e) => setTagFilter(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}>
          <option value="">Todas as etiquetas</option>
          <option value="none">Sem etiqueta</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select aria-label="Kanban" className={selectCls} value={kanban} onChange={(e) => setKanban(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}>
          <option value="">Com ou sem Kanban</option>
          <option value="none">Fora do Kanban</option>
          {boards.map((b) => <option key={b.id} value={b.id}>No quadro {b.title}</option>)}
        </select>
        {origins.length > 0 && (
          <select aria-label="Origem" className={selectCls} value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">Todas as origens</option>
            {origins.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {owners.length > 0 && (
          <select aria-label="Responsável" className={selectCls} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value === "" ? "" : e.target.value === "none" ? "none" : Number(e.target.value))}>
            <option value="">Todos os responsáveis</option>
            <option value="none">Sem responsável</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Button variant="secondary" onClick={() => setTagsOpen(true)}><TagIcon className="w-4 h-4" /> Etiquetas</Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> Importar</Button>
          <Button variant="secondary" onClick={doExport} title={selIds.length ? "Exportar os selecionados" : "Exportar a lista filtrada"}><Download className="w-4 h-4" /> Exportar</Button>
          <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4" /> Novo lead</Button>
        </div>
      </div>

      {/* Ações em massa */}
      {selIds.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-primary text-on-primary px-4 py-2.5 shadow-elev" role="region" aria-label="Ações nos selecionados">
          <span className="text-sm font-semibold tabular-nums mr-1">{selIds.length} {selIds.length === 1 ? "selecionado" : "selecionados"}</span>
          <div className="relative">
            <button type="button" onClick={() => setBulkMenu(bulkMenu === "add" ? null : "add")} className="h-8 px-3 rounded-lg text-sm font-medium hover:bg-white/15 inline-flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" /> Etiqueta</button>
            {bulkMenu === "add" && <TagMenu className="text-fg" selected={[]} onClose={() => setBulkMenu(null)} onPick={(t) => { bulkTag.mutate({ leadIds: selIds, tagId: t.id, add: true }); setBulkMenu(null); }} />}
          </div>
          {tags.length > 0 && (
            <div className="relative">
              <button type="button" onClick={() => setBulkMenu(bulkMenu === "remove" ? null : "remove")} className="h-8 px-3 rounded-lg text-sm font-medium hover:bg-white/15 inline-flex items-center gap-1.5 cursor-pointer"><Minus className="w-4 h-4" /> Etiqueta</button>
              {bulkMenu === "remove" && <TagMenu className="text-fg" selected={[]} onClose={() => setBulkMenu(null)} onPick={(t) => { bulkTag.mutate({ leadIds: selIds, tagId: t.id, add: false }); setBulkMenu(null); }} />}
            </div>
          )}
          {boards.length > 0 && <button type="button" onClick={() => setBoardOpen(true)} className="h-8 px-3 rounded-lg text-sm font-medium hover:bg-white/15 inline-flex items-center gap-1.5 cursor-pointer"><Columns3 className="w-4 h-4" /> Colocar no Kanban</button>}
          {owners.length > 0 && (
            <select aria-label="Definir responsável dos selecionados" value="" disabled={bulkOwner.isPending}
              onChange={(e) => { const v = e.target.value; if (v) bulkOwner.mutate({ leadIds: selIds, ownerId: v === "none" ? null : Number(v) }); }}
              className="h-8 pl-2 pr-6 rounded-lg text-sm font-medium bg-transparent hover:bg-white/15 cursor-pointer outline-none [&>option]:text-black">
              <option value="">Responsável…</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value="none">Sem responsável</option>
            </select>
          )}
          <button type="button" onClick={() => setConfirmDelete(true)} className="h-8 px-3 rounded-lg text-sm font-medium hover:bg-white/15 inline-flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-4 h-4" /> Excluir</button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Limpar seleção" className="ml-auto h-8 w-8 rounded-lg hover:bg-white/15 grid place-items-center cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <span key={i} className="skeleton h-14" />)}</div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum lead ainda"
          description="Aqui fica a sua base de contatos. Cadastre um lead, importe uma planilha ou adicione pelo Kanban."
          action={<div className="flex flex-wrap gap-2 justify-center">
            <Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4" /> Novo lead</Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="w-4 h-4" /> Importar planilha</Button>
          </div>}
        />
      ) : (
        <>
          <p className="text-xs text-muted -mt-2 tabular-nums">
            {filtering ? `${filtered.length} de ${leads.length} leads` : `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
            {filtering && <> · <button type="button" onClick={clearFilters} className="font-semibold text-fg hover:underline cursor-pointer">Limpar filtros</button></>}
          </p>
          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum lead com esses filtros" description="Mude a busca ou os filtros." action={<Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>} />
          ) : (
            <div className="bg-card border border-line rounded-2xl overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th scope="col" className="w-12 pl-4 py-3">
                      <input type="checkbox" aria-label="Selecionar todos" checked={allShownSelected} onChange={toggleAll} className="w-4 h-4 accent-[var(--fg)] cursor-pointer align-middle" />
                    </th>
                    <th scope="col" className="px-3 py-3 font-semibold">Lead</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Etiquetas</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Temperatura</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Kanban</th>
                    {owners.length > 0 && <th scope="col" className="px-3 py-3 font-semibold">Responsável</th>}
                    <th scope="col" className="px-3 py-3 font-semibold">Origem</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const t = TEMP[l.status] ?? TEMP.warm;
                    const on = selected.has(l.id);
                    return (
                      <tr key={l.id} onClick={() => setOpenId(l.id)} className={cn("border-t border-line cursor-pointer hover:bg-surface", on && "bg-surface")}>
                        <td className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`Selecionar ${l.name}`} checked={on} onChange={() => toggle(l.id)} className="w-4 h-4 accent-[var(--fg)] cursor-pointer align-middle" />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-surface border border-line grid place-items-center text-xs font-semibold shrink-0">{initials(l.name)}</span>
                            <div className="min-w-0">
                              <button type="button" className="font-semibold truncate block max-w-[240px] text-left hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setOpenId(l.id); }}>{l.name}</button>
                              <p className="text-xs text-muted tabular-nums truncate">{l.phone ? formatPhone(l.phone) : l.email || "Sem telefone"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 max-w-[220px]"><TagList tags={tagsOf(l, tags)} max={3} /></td>
                        <td className="px-3 py-3"><Chip tone={t.tone}>{t.label}</Chip></td>
                        <td className="px-3 py-3">
                          {l.kanban_cards.length === 0 ? <span className="text-xs text-muted">—</span> : (
                            <div className="flex flex-col gap-0.5">
                              {l.kanban_cards.slice(0, 2).map((c) => {
                                const col = colName.get(c.column_id);
                                return (
                                  <span key={c.id} className="inline-flex items-center gap-1.5 text-xs truncate max-w-[200px]">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: col?.color ?? "var(--muted)" }} aria-hidden="true" />
                                    <span className="text-muted truncate">{boardName.get(c.board_id)}:</span> <span className="font-medium truncate">{col?.title}</span>
                                  </span>
                                );
                              })}
                              {l.kanban_cards.length > 2 && <span className="text-[11px] text-muted">+{l.kanban_cards.length - 2} quadros</span>}
                            </div>
                          )}
                        </td>
                        {owners.length > 0 && (
                          <td className="px-3 py-3 max-w-[160px]">{l.owner_id && ownerById.get(l.owner_id) ? <OwnerLabel owner={ownerById.get(l.owner_id)!} /> : <span className="text-xs text-muted">—</span>}</td>
                        )}
                        <td className="px-3 py-3 text-muted">{l.origin || "—"}</td>
                        <td className="px-4 py-3 text-muted tabular-nums whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > shown.length && (
                <div className="border-t border-line p-3 text-center">
                  <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE * 3)}>Mostrar mais ({filtered.length - shown.length})</Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Painéis */}
      <NewLeadSheet open={newOpen} onClose={() => setNewOpen(false)} leads={leads} boards={boards} columns={columns} onOpenLead={setOpenId} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} leads={leads} boards={boards} columns={columns} />
      <TagManager open={tagsOpen} onClose={() => setTagsOpen(false)} />
      <LeadDetailModal leadId={openId} open={!!openId} onClose={() => setOpenId(null)} />

      <Modal open={boardOpen} onClose={() => setBoardOpen(false)} title={`Colocar ${selIds.length} ${selIds.length === 1 ? "lead" : "leads"} no Kanban`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setBoardOpen(false)}>Cancelar</Button>
          <Button disabled={!bulkBoard || addToBoard.isPending || bulkAllowed.length === 0} onClick={() => bulkBoard && addToBoard.mutate({ leadIds: bulkAllowed, boardId: bulkBoard.boardId, columnId: bulkBoard.columnId }, { onSuccess: () => { setBoardOpen(false); setSelected(new Set()); } })}>
            {addToBoard.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Colocar no quadro
          </Button>
        </>}
      >
        <div className="flex flex-col gap-3">
          <BoardStagePicker boards={boards} columns={columns} value={bulkBoard} onChange={setBulkBoard} optional={false} />
          <p className="text-xs text-muted">Quem já está neste quadro continua na etapa em que está.</p>
          {bulkAllowed.length < selIds.length && <p className="text-xs text-warn">{selIds.length - bulkAllowed.length} lead(s) com etiqueta de ignorar ficam de fora.</p>}
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Excluir ${selIds.length} ${selIds.length === 1 ? "lead" : "leads"}?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Manter</Button>
          <Button variant="danger" disabled={del.isPending} onClick={() => del.mutate(selIds, { onSuccess: () => { setConfirmDelete(false); setSelected(new Set()); } })}>
            {del.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Excluir de vez
          </Button>
        </>}
      >
        <p className="text-sm text-muted">Eles saem de todos os quadros, junto com as etiquetas e as tarefas. Isso não pode ser desfeito. Se quiser guardar, exporte antes.</p>
      </Modal>
    </div>
  );
}
