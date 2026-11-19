"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { Plus, Trash2, Filter, MessageSquareText, Mic, Image as ImageIcon, FileText, Clock, Loader2, AlertCircle, GripVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFunnels, useCreateFunnel, useDeleteFunnel, useUpdateFunnel, useAddFunnelItem, useDeleteFunnelItem, useUpdateFunnelDelay, useReorderFunnelSteps } from "@/hooks/use-funnels";
import { useMessages } from "@/hooks/use-messages";
import { useAllMedia } from "@/hooks/use-media";
import { LibraryPicker, MediaPreview, MediaThumb, isMedia, itemMeta, itemTypeLabel, type LibraryItem } from "@/components/features/media-preview";
import type { FunnelItem } from "@/types";

type StepType = FunnelItem["type"];

const STEP: Record<StepType, { label: string; icon: typeof Mic; presence: string }> = {
  message: { label: "Mensagem", icon: MessageSquareText, presence: "Digitando automático" },
  audio: { label: "Áudio", icon: Mic, presence: "Gravando automático" },
  midia: { label: "Imagem ou vídeo", icon: ImageIcon, presence: "Digitando automático" },
  document: { label: "Documento", icon: FileText, presence: "Digitando automático" },
};

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

function delayLabel(min: number, sec: number) {
  const total = (min || 0) * 60 + (sec || 0);
  if (!total) return "Logo em seguida";
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return "Esperar " + [h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean).join(" ");
}

function DelayFields({ step }: { step?: FunnelItem }) {
  const total = Math.max(0, (step?.delay_minutes || 0) * 60 + (step?.delay_seconds || 0));
  const fields = [
    { name: "hours", label: "Horas", value: Math.floor(total / 3600) },
    { name: "minutes", label: "Minutos", value: Math.floor(total / 60) % 60 },
    { name: "seconds", label: "Segundos", value: total % 60, max: 59 },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-semibold mb-2">Espera antes deste passo</legend>
      <div className="grid grid-cols-3 gap-3">
        {fields.map(field => (
          <label key={field.name} className="min-w-0 text-xs text-muted">
            {field.label}
            <input name={field.name} type="number" min={0} max={field.max} step={1} defaultValue={field.value}
              className={cn(inputCls, "mt-1 tabular-nums")} />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">Ao terminar a espera, a extensão começa a digitar ou gravar. Com tudo em zero, ela começa logo em seguida.</p>
    </fieldset>
  );
}

function readDelay(form: HTMLFormElement) {
  const fields = new FormData(form);
  const [hours, minutes, seconds] = ["hours", "minutes", "seconds"].map(name => Number(fields.get(name) || 0));
  const totalMinutes = hours * 60 + minutes;
  if (![hours, minutes, seconds].every(n => Number.isSafeInteger(n) && n >= 0) || seconds > 59 || totalMinutes > 2_147_483_647) {
    toast.error("Confira o intervalo. Use números inteiros e segundos de 0 a 59.");
    return null;
  }
  return { delay_minutes: totalMinutes, delay_seconds: seconds };
}

function SortableStep({ id, index, last, disabled, children }: {
  id: number; index: number; last: boolean; disabled: boolean; children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative flex gap-2 sm:gap-4", isDragging && "z-10 bg-card rounded-xl shadow-elev")}>
      <div className="flex flex-col items-center shrink-0">
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
          aria-label={`Mover passo ${index + 1}`} title="Arraste para mudar a ordem"
          className="flex h-10 items-center gap-1 rounded-lg text-muted touch-none cursor-grab active:cursor-grabbing hover:bg-surface disabled:cursor-default">
          <GripVertical className="w-4 h-4" aria-hidden="true" />
          <span className="w-8 h-8 rounded-full bg-primary text-on-primary grid place-items-center text-[13px] font-semibold tabular-nums">{index + 1}</span>
        </button>
        {!last && <span className="flex-1 w-0.5 bg-line min-h-4" aria-hidden="true" />}
      </div>
      {children}
    </li>
  );
}

export default function FunisPage() {
  const { data: funnels = [], isLoading, isError } = useFunnels();
  const createFunnel = useCreateFunnel();
  const deleteFunnel = useDeleteFunnel();
  const updateFunnel = useUpdateFunnel();
  const addFunnelItem = useAddFunnelItem();
  const deleteFunnelItem = useDeleteFunnelItem();
  const updateDelay = useUpdateFunnelDelay();
  const reorder = useReorderFunnelSteps();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const { data: messages = [] } = useMessages();
  const { data: allMedia = [] } = useAllMedia();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [confirmFunnel, setConfirmFunnel] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<number | null>(null);

  const [stepOpen, setStepOpen] = useState(false);
  const [stepType, setStepType] = useState<StepType>("message");
  const [stepItemId, setStepItemId] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<FunnelItem | null>(null);

  const filtered = funnels.filter((f) => f.title.toLowerCase().includes(search.toLowerCase()));
  const selected = funnels.find((f) => f.id === selectedId) ?? (selectedId === null ? funnels[0] : undefined);
  const steps = reorder.isPending && reorder.variables.funnelId === selected?.id ? reorder.variables.steps : selected?.items ?? [];

  const pools = useMemo<Record<StepType, LibraryItem[]>>(() => ({
    message: messages,
    audio: allMedia.filter((m) => m.type === "audio"),
    midia: allMedia.filter((m) => m.type === "image" || m.type === "video"),
    document: allMedia.filter((m) => m.type === "document"),
  }), [messages, allMedia]);

  const stepItem = (item: FunnelItem) => pools[item.type].find((m) => m.id === item.item_id);
  const preview = editingStep && stepItem(editingStep);

  function moveStep({ active, over }: DragEndEvent) {
    if (!selected || !over || active.id === over.id || reorder.isPending) return;
    const ids = selected.items.map(step => step.id);
    const from = ids.indexOf(Number(active.id)), to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate({ funnelId: selected.id, expectedIds: ids, steps: arrayMove(selected.items, from, to) });
  }

  function saveDelay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStep || updateDelay.isPending) return;
    const delay = readDelay(event.currentTarget);
    if (delay) updateDelay.mutate({ id: editingStep.id, funnel_id: editingStep.funnel_id, ...delay }, {
      onSuccess: () => setEditingStep(null),
    });
  }

  const handleCreate = () => {
    if (!title.trim()) return toast.error("Dê um nome ao funil.");
    createFunnel.mutate(title.trim(), {
      onSuccess: (data) => {
        setCreateOpen(false);
        setTitle("");
        if (data?.id) setSelectedId(data.id);
      },
    });
  };

  const handleAddStep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (addFunnelItem.isPending) return;
    if (!stepItemId || !selected) return toast.error("Escolha um item da biblioteca.");
    const delay = readDelay(event.currentTarget);
    if (!delay) return;
    addFunnelItem.mutate(
      {
        user_id: selected.user_id,
        funnel_id: selected.id,
        item_id: Number(stepItemId),
        type: stepType,
        ...delay,
        position: Math.min(2_147_483_647, (selected.items.at(-1)?.position ?? -1) + 1),
      },
      {
        onSuccess: () => {
          setStepOpen(false);
          setStepItemId(null);
        },
      }
    );
  };

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Não foi possível carregar seus funis"
        description="O banco de dados não respondeu. Verifique se o projeto no Supabase está ativo e recarregue a página."
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-5 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar funis" />
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Novo funil</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
        {/* Lista */}
        <Panel aria-label="Lista de funis" className="p-2 lg:max-h-[calc(100vh-220px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-1">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-14" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted text-center px-4 py-8">{search ? `Nenhum funil com “${search}”.` : "Nenhum funil ainda."}</p>
          ) : (
            filtered.map((f) => {
              const active = selected?.id === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-current={active}
                  onClick={() => setSelectedId(f.id)}
                  className={cn("w-full text-left px-3 py-2.5 rounded-[10px] flex flex-col gap-0.5 cursor-pointer transition-colors", active ? "bg-surface" : "hover:bg-surface")}
                >
                  <span className="text-sm font-semibold truncate">{f.title}</span>
                  <span className="text-xs text-muted tabular-nums">{f.items?.length || 0} {f.items?.length === 1 ? "passo" : "passos"}</span>
                </button>
              );
            })
          )}
        </Panel>

        {/* Construtor */}
        <Panel aria-label="Construtor do funil" className="p-6 min-w-0">
          {!selected ? (
            <EmptyState
              icon={Filter}
              title={funnels.length ? "Selecione um funil" : "Crie seu primeiro funil"}
              description="Monte uma sequência de mensagens, áudios e arquivos. A extensão envia cada passo com digitando ou gravando antes."
              action={!funnels.length ? <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Novo funil</Button> : undefined}
            />
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-start gap-3">
                <FunnelTitle
                  key={selected.id}
                  title={selected.title}
                  description={selected.description || ""}
                  onSave={(u) => updateFunnel.mutate({ id: selected.id, ...u })}
                />
                <div className="flex gap-2">
                  {confirmFunnel ? (
                    <>
                      <Button variant="secondary" onClick={() => setConfirmFunnel(false)}>Manter</Button>
                      <Button
                        variant="danger"
                        onClick={() => deleteFunnel.mutate(selected.id, { onSuccess: () => { setSelectedId(null); setConfirmFunnel(false); } })}
                      >
                        Excluir funil
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label="Excluir funil" title="Excluir funil" onClick={() => setConfirmFunnel(true)} className="hover:text-hot">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button disabled={reorder.isPending} onClick={() => setStepOpen(true)}><Plus className="w-4 h-4" /> Adicionar passo</Button>
                </div>
              </div>

              {selected.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center">
                  <p className="text-sm font-semibold">Nenhum passo ainda</p>
                  <p className="text-sm text-muted mt-1">Comece com uma mensagem de boas-vindas e depois um áudio.</p>
                </div>
              ) : (
                <DndContext key={selected.id} id={`passos-funil-${selected.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={moveStep}
                  accessibility={{ screenReaderInstructions: { draggable: "Pressione espaço para pegar o passo, use as setas para mover e pressione espaço para soltar. Escape cancela." } }}>
                  <SortableContext items={steps.map(step => step.id)} strategy={verticalListSortingStrategy}>
                    <ol className="flex flex-col" aria-label="Passos do funil" aria-busy={reorder.isPending}>
                      {steps.map((item, i) => {
                        const cfg = STEP[item.type];
                        const lib = stepItem(item);
                        const last = i === steps.length - 1;
                        return (
                          <SortableStep key={item.id} id={item.id} index={i} last={last} disabled={steps.length < 2 || reorder.isPending || deleteFunnelItem.isPending}>
                            <div className={cn("flex-1 min-w-0", !last && "pb-4")}>
                              <button type="button" onClick={() => setEditingStep(item)} title="Editar intervalo" aria-label={`Editar intervalo do passo ${i + 1}`}
                                className="flex items-center gap-1.5 text-xs text-muted mb-1.5 py-1 rounded cursor-pointer hover:text-fg focus-visible:text-fg">
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {delayLabel(item.delay_minutes, item.delay_seconds)}
                                <Pencil className="ml-1 w-3 h-3" aria-hidden="true" /> Editar
                              </button>
                              <div className="group border border-line rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-3">
                                {lib ? (
                                  <button
                                    type="button"
                                    onClick={() => setEditingStep(item)}
                                    aria-label={`Abrir passo ${i + 1}, ${lib.title}`}
                                    className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-[10px] -m-1 p-1 cursor-pointer hover:bg-surface transition-colors"
                                  >
                                    <MediaThumb item={lib} />
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-xs text-muted">{itemTypeLabel(lib)}</span>
                                      <span className="block font-semibold truncate">{lib.title}</span>
                                    </span>
                                  </button>
                                ) : (
                                  <div className="flex-1 min-w-0 flex items-center gap-3">
                                    <MediaThumb item={null} />
                                    <span className="flex-1 min-w-0">
                                      <span className="block text-xs text-muted">{cfg.label}</span>
                                      <span className="block font-semibold truncate text-hot">Item removido da biblioteca</span>
                                    </span>
                                  </div>
                                )}
                                <Chip tone="accent">{cfg.presence}</Chip>
                                {stepToDelete === item.id ? (
                                  <span className="flex gap-1.5">
                                    <Button size="sm" variant="secondary" onClick={() => setStepToDelete(null)}>Manter</Button>
                                    <Button size="sm" variant="danger" onClick={() => { deleteFunnelItem.mutate(item.id); setStepToDelete(null); }}>Excluir</Button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setStepToDelete(item.id)}
                                    aria-label={`Excluir passo ${i + 1}`}
                                    className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </SortableStep>
                        );
                      })}
                    </ol>
                  </SortableContext>
                </DndContext>
              )}

              <p className="text-xs text-muted border-t border-line pt-4">
                Arraste o passo pela alça ao lado do número. A espera acompanha o passo. As alterações valem para os próximos disparos.
              </p>
            </div>
          )}
        </Panel>
      </div>

      {/* Novo funil */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo funil" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={createFunnel.isPending}>{createFunnel.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar funil</Button>
        </>}
      >
        <label htmlFor="nf-title" className="text-xs font-medium text-muted">Nome</label>
        <input id="nf-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Boas-vindas" className={cn(inputCls, "mt-1.5")} onKeyDown={(e) => e.key === "Enter" && handleCreate()} />
      </Modal>

      {/* Adicionar passo */}
      <Modal open={stepOpen} onClose={() => { if (!addFunnelItem.isPending) setStepOpen(false); }} title="Adicionar passo" description={selected ? `No funil ${selected.title}` : undefined}
        footer={<>
          <Button variant="secondary" disabled={addFunnelItem.isPending} onClick={() => setStepOpen(false)}>Cancelar</Button>
          <Button type="submit" form="add-funnel-step" disabled={addFunnelItem.isPending || !stepItemId}>{addFunnelItem.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar passo</Button>
        </>}
      >
        <form id="add-funnel-step" onSubmit={handleAddStep} className="flex flex-col gap-5">
          <fieldset>
            <legend className="text-xs font-medium text-muted mb-1.5">Tipo</legend>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STEP) as StepType[]).map((t) => {
                const cfg = STEP[t];
                const Icon = cfg.icon;
                const on = stepType === t;
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => { setStepType(t); setStepItemId(null); }}
                    className={cn("h-11 rounded-[10px] border text-sm font-medium flex items-center gap-2 px-3 cursor-pointer transition-colors", on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
                    <Icon className="w-4 h-4" /> {cfg.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <LibraryPicker
            key={stepType}
            id="step-item"
            label={stepType === "message" ? "Mensagem da biblioteca" : "Item da biblioteca"}
            items={pools[stepType]}
            value={stepItemId}
            onChange={setStepItemId}
            empty="Nenhum item deste tipo na biblioteca. Adicione um em Biblioteca primeiro."
          />

          <DelayFields />
        </form>
      </Modal>

      <Modal open={!!editingStep} onClose={() => { if (!updateDelay.isPending) setEditingStep(null); }}
        title="Editar passo" description={preview?.title || "Item removido da biblioteca"}
        footer={<>
          <Button variant="secondary" disabled={updateDelay.isPending} onClick={() => setEditingStep(null)}>Cancelar</Button>
          <Button type="submit" form="edit-funnel-step" disabled={updateDelay.isPending}>
            {updateDelay.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar intervalo
          </Button>
        </>}
      >
        {editingStep && <form key={editingStep.id} id="edit-funnel-step" onSubmit={saveDelay} className="flex flex-col gap-5">
          <DelayFields step={editingStep} />
          {preview && <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-sm font-semibold">Prévia</h4>
              {isMedia(preview) && <span className="text-xs text-muted">{itemMeta(preview)}</span>}
            </div>
            <MediaPreview item={preview} />
          </div>}
        </form>}
      </Modal>
    </div>
  );
}

/** Nome e descrição editáveis no lugar; a key do funil reinicia os campos ao trocar de funil. */
function FunnelTitle({ title, description, onSave }: { title: string; description: string; onSave: (u: { title?: string; description?: string }) => void }) {
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };
  return (
    <div className="flex-1 min-w-[220px] flex flex-col gap-1">
      <label htmlFor="f-title" className="sr-only">Nome do funil</label>
      <input
        id="f-title"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => {
          if (t === title) return;
          if (!t.trim()) { setT(title); toast.error("O nome não pode ficar vazio."); return; }
          onSave({ title: t.trim() });
        }}
        onKeyDown={blurOnEnter}
        className="font-display text-xl font-bold tracking-tight bg-transparent outline-none rounded-lg px-2 -mx-2 py-1 hover:bg-surface focus:bg-surface"
      />
      <label htmlFor="f-desc" className="sr-only">Descrição</label>
      <input
        id="f-desc"
        value={d}
        onChange={(e) => setD(e.target.value)}
        onBlur={() => { if (d !== description) onSave({ description: d }); }}
        onKeyDown={blurOnEnter}
        placeholder="Adicione uma descrição"
        className="text-sm text-muted bg-transparent outline-none rounded-lg px-2 -mx-2 py-1 hover:bg-surface focus:bg-surface placeholder:text-muted"
      />
    </div>
  );
}
