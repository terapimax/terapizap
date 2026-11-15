"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { Plus, Trash2, Filter, MessageSquareText, Mic, Image as ImageIcon, FileText, Clock, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFunnels, useCreateFunnel, useDeleteFunnel, useUpdateFunnel, useAddFunnelItem, useDeleteFunnelItem } from "@/hooks/use-funnels";
import { useMessages } from "@/hooks/use-messages";
import { useAllMedia } from "@/hooks/use-media";
import { LibraryPicker, MediaPreview, MediaThumb, itemMeta, itemTypeLabel, type LibraryItem } from "@/components/features/media-preview";
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

export default function FunisPage() {
  const { data: funnels = [], isLoading, isError } = useFunnels();
  const createFunnel = useCreateFunnel();
  const deleteFunnel = useDeleteFunnel();
  const updateFunnel = useUpdateFunnel();
  const addFunnelItem = useAddFunnelItem();
  const deleteFunnelItem = useDeleteFunnelItem();
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
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [delaySeconds, setDelaySeconds] = useState(0);
  const [preview, setPreview] = useState<LibraryItem | null>(null);

  const filtered = funnels.filter((f) => f.title.toLowerCase().includes(search.toLowerCase()));
  const selected = funnels.find((f) => f.id === selectedId) ?? (selectedId === null ? funnels[0] : undefined);

  const pools = useMemo<Record<StepType, LibraryItem[]>>(() => ({
    message: messages,
    audio: allMedia.filter((m) => m.type === "audio"),
    midia: allMedia.filter((m) => m.type === "image" || m.type === "video"),
    document: allMedia.filter((m) => m.type === "document"),
  }), [messages, allMedia]);

  const stepItem = (item: FunnelItem) => pools[item.type].find((m) => m.id === item.item_id);

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

  const handleAddStep = () => {
    if (!stepItemId || !selected) return toast.error("Escolha um item da biblioteca.");
    addFunnelItem.mutate(
      {
        user_id: selected.user_id,
        funnel_id: selected.id,
        item_id: Number(stepItemId),
        type: stepType,
        delay_minutes: delayMinutes,
        delay_seconds: delaySeconds,
        position: selected.items?.length || 0,
      },
      {
        onSuccess: () => {
          setStepOpen(false);
          setStepItemId(null);
          setDelayMinutes(0);
          setDelaySeconds(0);
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
                  <Button onClick={() => setStepOpen(true)}><Plus className="w-4 h-4" /> Adicionar passo</Button>
                </div>
              </div>

              {selected.items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-8 text-center">
                  <p className="text-sm font-semibold">Nenhum passo ainda</p>
                  <p className="text-sm text-muted mt-1">Comece com uma mensagem de boas-vindas e depois um áudio.</p>
                </div>
              ) : (
                <ol className="flex flex-col">
                  {selected.items.map((item, i) => {
                    const cfg = STEP[item.type];
                    const lib = stepItem(item);
                    const last = i === selected.items.length - 1;
                    return (
                      <li key={item.id} className="flex gap-4">
                        <div className="flex flex-col items-center w-9 shrink-0">
                          <span className="w-9 h-9 rounded-full bg-primary text-on-primary grid place-items-center text-[13px] font-semibold tabular-nums">{i + 1}</span>
                          {!last && <span className="flex-1 w-0.5 bg-line min-h-4" aria-hidden="true" />}
                        </div>
                        <div className={cn("flex-1 min-w-0", !last && "pb-4")}>
                          <p className="flex items-center gap-1.5 text-xs text-muted mb-1.5">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> {delayLabel(item.delay_minutes, item.delay_seconds)}
                          </p>
                          <div className="group border border-line rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-3">
                            {lib ? (
                              <button
                                type="button"
                                onClick={() => setPreview(lib)}
                                aria-label={`Ver prévia de ${lib.title}`}
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
                      </li>
                    );
                  })}
                </ol>
              )}

              <p className="text-xs text-muted border-t border-line pt-4">
                O tempo de digitando e gravando é calculado pela extensão: proporcional ao tamanho do texto ou à duração do áudio, com variação a cada envio.
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
      <Modal open={stepOpen} onClose={() => setStepOpen(false)} title="Adicionar passo" description={selected ? `No funil ${selected.title}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setStepOpen(false)}>Cancelar</Button>
          <Button onClick={handleAddStep} disabled={addFunnelItem.isPending || !stepItemId}>{addFunnelItem.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Adicionar passo</Button>
        </>}
      >
        <div className="flex flex-col gap-5">
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

          <fieldset>
            <legend className="text-xs font-medium text-muted mb-1.5">Espera antes deste passo</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2">
                <input type="number" min="0" value={delayMinutes} onChange={(e) => setDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))} className={cn(inputCls, "tabular-nums")} aria-label="Minutos" />
                <span className="text-sm text-muted">min</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="number" min="0" max="59" value={delaySeconds} onChange={(e) => setDelaySeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className={cn(inputCls, "tabular-nums")} aria-label="Segundos" />
                <span className="text-sm text-muted">s</span>
              </label>
            </div>
            <p className="text-xs text-muted mt-2">{delayLabel(delayMinutes, delaySeconds)} e depois {stepType === "audio" ? "gravando" : "digitando"} antes de enviar.</p>
          </fieldset>
        </div>
      </Modal>

      {/* Prévia de um passo */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? ""} description={preview ? itemMeta(preview) : undefined}
        footer={<Button variant="secondary" onClick={() => setPreview(null)}>Fechar</Button>}
      >
        {preview && <MediaPreview key={preview.id + itemTypeLabel(preview)} item={preview} />}
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
