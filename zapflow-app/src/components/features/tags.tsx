"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, Loader2, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/shared";
import { useDeleteTag, useLeads, useSaveTag, useSetTagBlocking, useTags } from "@/hooks/use-leads";
import { TAG_COLORS, deaccent } from "@/lib/leads";
import { cn } from "@/lib/utils";
import type { Tag } from "@/types";

/** Etiqueta: bolinha da cor + nome. */
export function TagChip({ tag, onRemove, size = "md" }: { tag: Pick<Tag, "name" | "color"> & { is_blocking?: boolean }; onRemove?: () => void; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-card font-medium text-fg whitespace-nowrap max-w-full",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs"
      )}
    >
      {tag.is_blocking
        ? <span title="Etiqueta de ignorar"><Ban className="w-3 h-3 shrink-0 text-hot" aria-label="Ignorar" /></span>
        : <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} aria-hidden="true" />}
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Tirar a etiqueta ${tag.name}`} className="-mr-1 h-4 w-4 grid place-items-center rounded-full text-muted hover:text-fg cursor-pointer">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/** Até `max` etiquetas e um "+N". */
export function TagList({ tags, max = 3, size = "sm" }: { tags: Tag[]; max?: number; size?: "sm" | "md" }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {tags.slice(0, max).map((t) => <TagChip key={t.id} tag={t} size={size} />)}
      {tags.length > max && <span className="text-[11px] text-muted self-center tabular-nums" title={tags.slice(max).map((t) => t.name).join(", ")}>+{tags.length - max}</span>}
    </div>
  );
}

const norm = (s: string) => deaccent(s).toLowerCase().trim();

/**
 * Lista com busca para marcar etiquetas; digitar um nome novo oferece "Criar".
 * `onPick` recebe a etiqueta clicada (marcar/desmarcar fica com quem usa).
 */
export function TagMenu({ selected, onPick, onClose, className }: { selected: number[]; onPick: (tag: Tag) => void; onClose: () => void; className?: string }) {
  const { data: tags = [] } = useTags();
  const save = useSaveTag();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", down);
    ref.current?.addEventListener("keydown", key);
    const el = ref.current;
    return () => { document.removeEventListener("mousedown", down); el?.removeEventListener("keydown", key); };
  }, [onClose]);

  const list = tags.filter((t) => !q || norm(t.name).includes(norm(q)));
  const exact = tags.some((t) => norm(t.name) === norm(q));

  const create = async () => {
    const color = TAG_COLORS[(tags.length + 1) % TAG_COLORS.length];
    const t = await save.mutateAsync({ name: q, color });
    setQ("");
    onPick(t);
  };

  return (
    <div ref={ref} className={cn("absolute z-20 mt-1.5 w-64 rounded-xl border border-line bg-card shadow-elev p-1.5", className)} role="dialog" aria-label="Etiquetas">
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (list.length === 1 && q) onPick(list[0]);
          else if (q.trim() && !exact) create();
        }}
        placeholder="Buscar ou criar etiqueta"
        aria-label="Buscar ou criar etiqueta"
        className="w-full h-9 px-2.5 rounded-lg bg-surface text-sm text-fg placeholder:text-muted outline-none"
      />
      <ul className="max-h-56 overflow-y-auto mt-1" role="listbox" aria-multiselectable="true">
        {list.map((t) => {
          const on = selected.includes(t.id);
          return (
            <li key={t.id} role="option" aria-selected={on}>
              <button type="button" onClick={() => onPick(t)} className="w-full h-9 px-2.5 rounded-lg flex items-center gap-2 text-sm hover:bg-surface cursor-pointer text-left">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                <span className="flex-1 truncate">{t.name}</span>
                {on && <Check className="w-4 h-4 shrink-0" />}
              </button>
            </li>
          );
        })}
        {q.trim() && !exact && (
          <li>
            <button type="button" onClick={create} disabled={save.isPending} className="w-full h-9 px-2.5 rounded-lg flex items-center gap-2 text-sm hover:bg-surface cursor-pointer text-left font-medium">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span className="truncate">Criar “{q.trim()}”</span>
            </button>
          </li>
        )}
        {!q && tags.length === 0 && <li className="px-2.5 py-3 text-sm text-muted">Digite um nome para criar a primeira etiqueta.</li>}
      </ul>
    </div>
  );
}

/** Campo de etiquetas de um formulário: chips + botão que abre o menu. */
export function TagPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const { data: tags = [] } = useTags();
  const [open, setOpen] = useState(false);
  const chosen = value.map((id) => tags.find((t) => t.id === id)).filter((t): t is Tag => !!t);
  const toggle = (t: Tag) => onChange(value.includes(t.id) ? value.filter((v) => v !== t.id) : [...value, t.id]);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((t) => <TagChip key={t.id} tag={t} onRemove={() => toggle(t)} />)}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="h-6 px-2.5 rounded-full border border-dashed border-line text-xs font-medium text-muted hover:text-fg hover:border-fg inline-flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3 h-3" /> Etiqueta
        </button>
      </div>
      {open && <TagMenu selected={value} onPick={toggle} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Painel para renomear, recolorir e excluir etiquetas. */
export function TagManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: tags = [], isLoading } = useTags();
  const { data: leads = [] } = useLeads();
  const save = useSaveTag();
  const del = useDeleteTag();
  const setBlocking = useSetTagBlocking();
  const [editing, setEditing] = useState<{ id?: number; name: string; color: string } | null>(null);
  const [toDelete, setToDelete] = useState<Tag | null>(null);
  const [toBlock, setToBlock] = useState<Tag | null>(null);
  const kanbanCount = (tagId: number) => leads.filter((l) => l.lead_tags.some((x) => x.tag_id === tagId) && l.kanban_cards.length > 0).length;

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of leads) for (const t of l.lead_tags) m.set(t.tag_id, (m.get(t.tag_id) ?? 0) + 1);
    return m;
  }, [leads]);

  const submit = async () => {
    if (!editing) return;
    await save.mutateAsync(editing);
    setEditing(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas" description="Use para separar leads: VIP, orçamento enviado, retornar…">
      <div className="flex flex-col gap-3">
        {editing && !editing.id ? null : (
          <Button variant="secondary" onClick={() => setEditing({ name: "", color: TAG_COLORS[(tags.length + 1) % TAG_COLORS.length] })} className="self-start">
            <Plus className="w-4 h-4" /> Nova etiqueta
          </Button>
        )}
        {editing && !editing.id && <TagEditor value={editing} onChange={setEditing} onSave={submit} onCancel={() => setEditing(null)} saving={save.isPending} />}

        {isLoading ? (
          <span className="skeleton h-24" />
        ) : tags.length === 0 && !editing ? (
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <TagIcon className="w-6 h-6 mx-auto text-muted mb-2" aria-hidden="true" />
            <p className="text-sm font-semibold">Nenhuma etiqueta ainda</p>
            <p className="text-sm text-muted mt-0.5">Crie aqui ou direto na ficha de um lead.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {tags.map((t) => (
              <li key={t.id} className="border-b border-line last:border-0 py-2">
                {editing?.id === t.id ? (
                  <TagEditor value={editing} onChange={setEditing} onSave={submit} onCancel={() => setEditing(null)} saving={save.isPending} />
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-sm font-medium truncate">{t.name}</span>
                    {t.wa_label_id && <span title="Ligada à etiqueta do WhatsApp Business: a extensão sincroniza as duas" className="text-[11px] font-semibold px-1.5 rounded-full bg-ok-soft text-ok">WhatsApp</span>}
                    <span className="text-xs text-muted tabular-nums">{counts.get(t.id) ?? 0} leads</span>
                    <button
                      type="button"
                      aria-pressed={t.is_blocking}
                      onClick={() => (t.is_blocking ? setBlocking.mutate({ id: t.id, blocking: false }) : setToBlock(t))}
                      title="Ignorar: quem tem esta etiqueta não vira lead pelo WhatsApp, não entra no Kanban e não guarda histórico"
                      className={cn("h-7 px-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer border", t.is_blocking ? "bg-hot-soft text-hot border-transparent" : "border-line text-muted hover:text-fg")}
                    >
                      <Ban className="w-3.5 h-3.5" /> {t.is_blocking ? "Ignorando" : "Ignorar"}
                    </button>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${t.name}`} onClick={() => setEditing({ id: t.id, name: t.name, color: t.color })}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${t.name}`} className="hover:text-hot" onClick={() => setToDelete(t)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!toBlock} onClose={() => setToBlock(null)} title={`Ignorar quem tem “${toBlock?.name ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToBlock(null)}>Cancelar</Button>
          <Button variant="danger" onClick={() => { if (toBlock) setBlocking.mutate({ id: toBlock.id, blocking: true }); setToBlock(null); }}>Ignorar</Button>
        </>}
      >
        <div className="flex flex-col gap-2 text-sm text-muted">
          <p>Use para família, amigos e quem não é cliente. Contatos com esta etiqueta (aqui ou no WhatsApp Business) não viram leads pela extensão, não entram no Kanban e não guardam histórico.</p>
          {toBlock && kanbanCount(toBlock.id) > 0 && <p className="text-fg font-medium">{kanbanCount(toBlock.id)} lead(s) com esta etiqueta saem do Kanban agora. Eles continuam salvos em Leads.</p>}
        </div>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Excluir a etiqueta “${toDelete?.name ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}>Excluir etiqueta</Button>
        </>}
      >
        <p className="text-sm text-muted">
          {counts.get(toDelete?.id ?? -1) ? `Ela sai de ${counts.get(toDelete!.id)} lead(s). Os leads continuam salvos.` : "Nenhum lead usa esta etiqueta."}
        </p>
      </Modal>
    </Modal>
  );
}

function TagEditor({ value, onChange, onSave, onCancel, saving }: {
  value: { id?: number; name: string; color: string };
  onChange: (v: { id?: number; name: string; color: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <input
        data-autofocus
        autoFocus
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && onSave()}
        placeholder="Nome da etiqueta"
        aria-label="Nome da etiqueta"
        className="w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg"
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cor">
        {TAG_COLORS.map((c) => (
          <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={value.color === c} onClick={() => onChange({ ...value, color: c })}
            className={cn("w-7 h-7 rounded-full cursor-pointer border-2", value.color === c ? "border-fg" : "border-transparent")}
            style={{ backgroundColor: c, boxShadow: "inset 0 0 0 2px var(--surface)" }} />
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving || !value.name.trim()}>{saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar</Button>
      </div>
    </div>
  );
}
