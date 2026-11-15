"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Mic, Pause, Play, Plus, Star, Trash2, UploadCloud, Video } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { AudioInput, type AudioInputValue } from "@/components/features/audio-input";
import { DocIcon, fileExt as ext, fmtSize, videoPosterSrc } from "@/components/features/media-preview";
import { useDeleteMedia, useUpdateMedia, useUploadMedia } from "@/hooks/use-media";
import { useOpenFromQuery } from "@/hooks/use-open-from-query";
import type { MediaItem } from "@/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/audio";
import { toast } from "sonner";

export type MediaKind = "audio" | "media" | "document";

const KIND = {
  audio: {
    singular: "áudio", plural: "áudios", Icon: Mic, accept: "",
    empty: "Grave um áudio na hora ou envie um arquivo. Ele é enviado ao lead como mensagem de voz.",
  },
  media: {
    singular: "mídia", plural: "mídias", Icon: ImageIcon, accept: "image/*,video/*",
    empty: "Adicione imagens e vídeos para enviar com um clique.",
  },
  document: {
    singular: "documento", plural: "documentos", Icon: FileText, accept: "",
    empty: "Adicione PDFs, planilhas e outros arquivos para enviar aos seus leads.",
  },
} as const;

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";


interface Props {
  kind: MediaKind;
  items: MediaItem[];
  isLoading: boolean;
}

export function MediaManager({ kind, items, isLoading }: Props) {
  const cfg = KIND[kind];
  const upload = useUploadMedia();
  const update = useUpdateMedia();
  const remove = useDeleteMedia();

  const [search, setSearch] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  useOpenFromQuery(() => setAddOpen(true));

  // reprodução (uma por vez)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePlay = (item: MediaItem) => {
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(item.url);
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    a.onended = () => { setPlayingId(null); setProgress(0); };
    a.onerror = () => { setPlayingId(null); toast.error("Não foi possível tocar este áudio."); };
    a.play().catch(() => setPlayingId(null));
    audioRef.current = a;
    setProgress(0);
    setPlayingId(item.id);
  };

  const q = search.trim().toLowerCase();
  const shown = items.filter((m) => (!onlyFav || m.is_favorite) && (!q || m.title.toLowerCase().includes(q)));

  const addButton = (
    <Button onClick={() => setAddOpen(true)}>
      <Plus className="w-4 h-4" /> Novo {cfg.singular}
    </Button>
  );

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-[1100px] w-full mx-auto">
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder={`Buscar ${cfg.plural}`} />
        <button
          type="button"
          aria-pressed={onlyFav}
          onClick={() => setOnlyFav((v) => !v)}
          className={cn(
            "h-10 px-3.5 rounded-[10px] border text-sm font-medium flex items-center gap-2 cursor-pointer transition-colors",
            onlyFav ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg"
          )}
        >
          <Star className={cn("w-4 h-4", onlyFav && "fill-current")} /> Favoritos
        </button>
        <span className="text-sm text-muted tabular-nums">{items.length} {items.length === 1 ? cfg.singular : cfg.plural}</span>
        <div className="ml-auto">{addButton}</div>
      </div>

      {isLoading ? (
        kind === "media" ? (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="skeleton aspect-[4/3]" />)}</div>
        ) : (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className="skeleton h-[68px]" />)}</div>
        )
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={cfg.Icon}
            title={items.length === 0 ? `Nenhum ${cfg.singular} ainda` : "Nada encontrado"}
            description={items.length === 0 ? cfg.empty : onlyFav ? "Você ainda não favoritou nenhum item." : `Nenhum resultado para “${search}”.`}
            action={items.length === 0 ? addButton : undefined}
          />
        </Panel>
      ) : kind === "media" ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {shown.map((item) => (
            <div key={item.id} className="group relative bg-card border border-line rounded-2xl overflow-hidden hover:border-fg transition-colors">
              <button type="button" onClick={() => setDetail(item)} aria-label={`Abrir ${item.title}`} className="block w-full text-left cursor-pointer">
                <div className="aspect-[4/3] bg-surface relative">
                  {item.type === "video" ? (
                    <>
                      <video src={videoPosterSrc(item.url)} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                      <span className="absolute left-2 bottom-2"><Chip className="bg-scrim text-white"><Video className="w-3 h-3" /> Vídeo</Chip></span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold truncate">{item.title}</p>
                  <p className="text-xs text-muted truncate">{[fmtSize(item.size), item.caption].filter(Boolean).join(" · ") || "Sem legenda"}</p>
                </div>
              </button>
              <button
                type="button"
                aria-label={item.is_favorite ? "Remover dos favoritos" : "Favoritar"}
                aria-pressed={item.is_favorite}
                onClick={() => update.mutate({ id: item.id, is_favorite: !item.is_favorite })}
                className={cn("absolute top-2 right-2 h-8 w-8 rounded-full grid place-items-center bg-card/90 border border-line cursor-pointer", item.is_favorite ? "text-warn" : "text-muted hover:text-fg")}
              >
                <Star className={cn("w-4 h-4", item.is_favorite && "fill-current")} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden" aria-label={`Lista de ${cfg.plural}`}>
          {shown.map((item) => {
            const isPlaying = playingId === item.id;
            const isVoice = /ogg|opus/i.test(item.mime_type || "") || /\.(ogg|opus)$/i.test(item.url);
            return (
              <div key={item.id} className="group relative flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
                {kind === "audio" ? (
                  <button
                    type="button"
                    onClick={() => togglePlay(item)}
                    aria-label={isPlaying ? `Pausar ${item.title}` : `Ouvir ${item.title}`}
                    className="w-10 h-10 rounded-full bg-primary text-on-primary grid place-items-center shrink-0 cursor-pointer hover:opacity-90"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                ) : (
                  <span className="w-10 h-10 rounded-[10px] bg-surface group-hover:bg-card grid place-items-center shrink-0 text-muted"><DocIcon item={item} /></span>
                )}

                <button type="button" onClick={() => setDetail(item)} className="flex-1 min-w-0 text-left cursor-pointer">
                  <p className="text-sm font-semibold truncate">{item.title}</p>
                  <p className="text-xs text-muted truncate">
                    {[kind === "document" ? ext(item) : null, fmtSize(item.size), new Date(item.created_at).toLocaleDateString("pt-BR")].filter(Boolean).join(" · ")}
                  </p>
                </button>

                {kind === "audio" && (
                  isVoice ? <Chip tone="ok" className="hidden sm:inline-flex">Mensagem de voz</Chip>
                  : <span title="Este áudio não está no formato de mensagem de voz e pode falhar no envio. Envie-o de novo para converter."><Chip tone="warn">Formato antigo</Chip></span>
                )}

                <button
                  type="button"
                  aria-label={item.is_favorite ? "Remover dos favoritos" : "Favoritar"}
                  aria-pressed={item.is_favorite}
                  onClick={() => update.mutate({ id: item.id, is_favorite: !item.is_favorite })}
                  className={cn("h-8 w-8 grid place-items-center rounded-lg cursor-pointer", item.is_favorite ? "text-warn" : "text-muted hover:text-fg hover:bg-card")}
                >
                  <Star className={cn("w-4 h-4", item.is_favorite && "fill-current")} />
                </button>
                {kind === "document" && (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Baixar ${item.title}`} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-card">
                    <Download className="w-4 h-4" />
                  </a>
                )}
                <button type="button" aria-label={`Excluir ${item.title}`} onClick={() => setToDelete(item)} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>

                {isPlaying && (
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-line" aria-hidden="true">
                    <div className="h-full bg-fg" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}

      <AddSheet kind={kind} open={addOpen} onClose={() => setAddOpen(false)} upload={upload} />

      <DetailSheet
        item={detail}
        kind={kind}
        onClose={() => setDetail(null)}
        saving={update.isPending}
        onSave={(id, patch) => update.mutate({ id, ...patch }, { onSuccess: () => { toast.success("Salvo"); setDetail(null); } })}
        onDelete={(it) => { setDetail(null); setToDelete(it); }}
      />

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Excluir “${toDelete?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (toDelete) remove.mutate(toDelete); setToDelete(null); }}>Excluir</Button>
        </>}
      >
        <p className="text-sm text-muted">O arquivo some da biblioteca e dos funis que o usam. Isso não pode ser desfeito.</p>
      </Modal>
    </div>
  );
}

// ── Painel: adicionar ───────────────────────────────────────

function AddSheet({ kind, open, onClose, upload }: { kind: MediaKind; open: boolean; onClose: () => void; upload: ReturnType<typeof useUploadMedia> }) {
  // key: o formulário recomeça do zero a cada abertura
  if (!open) return null;
  return <AddForm kind={kind} onClose={onClose} upload={upload} />;
}

function AddForm({ kind, onClose, upload }: { kind: MediaKind; onClose: () => void; upload: ReturnType<typeof useUploadMedia> }) {
  const cfg = KIND[kind];
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [caption, setCaption] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [voice, setVoice] = useState<AudioInputValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFiles = (list: FileList | File[] | null | undefined) => {
    const arr = Array.from(list ?? []);
    if (!arr.length) return;
    const ok = kind === "media" ? arr.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/")) : arr;
    if (ok.length < arr.length) toast.error("Só imagens e vídeos são aceitos aqui.");
    setFiles(ok);
    if (ok.length === 1 && !titleEdited) setTitle(ok[0].name.replace(/\.[^.]+$/, ""));
  };

  const onVoice = (v: AudioInputValue | null) => {
    setVoice(v);
    if (v && !titleEdited) setTitle(v.suggestedTitle);
  };

  const canSave = kind === "audio" ? !!voice && !!title.trim() : files.length > 0 && (files.length > 1 || !!title.trim());

  const save = async () => {
    setBusy(true);
    try {
      if (kind === "audio" && voice) {
        const file = new File([voice.blob], "audio.ogg", { type: "audio/ogg" });
        await upload.mutateAsync({ file, title: title.trim(), type: "audio" });
      } else {
        for (const f of files) {
          const type = kind === "document" ? "document" : f.type.startsWith("video/") ? "video" : "image";
          await upload.mutateAsync({ file: f, title: files.length === 1 ? title.trim() : f.name.replace(/\.[^.]+$/, ""), caption: caption.trim() || undefined, type });
        }
      }
      onClose();
    } catch {
      /* o aviso de erro já aparece pelo hook */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={`Novo ${cfg.singular}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button onClick={save} disabled={!canSave || busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} {busy ? "Salvando…" : "Salvar"}</Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        {kind === "audio" ? (
          <AudioInput onChange={onVoice} disabled={busy} />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); takeFiles(e.dataTransfer.files); }}
            className={cn("rounded-xl border border-dashed p-6 text-center transition-colors", dragOver ? "border-fg bg-surface" : "border-line")}
          >
            <input ref={fileRef} type="file" multiple accept={cfg.accept || undefined} className="sr-only" aria-label="Escolher arquivos" onChange={(e) => { takeFiles(e.target.files); e.target.value = ""; }} />
            {files.length === 0 ? (
              <>
                <UploadCloud className="w-8 h-8 mx-auto text-muted mb-2" aria-hidden="true" />
                <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-semibold underline underline-offset-2 cursor-pointer">Escolher {kind === "media" ? "imagens ou vídeos" : "arquivos"}</button>
                <p className="text-sm text-muted mt-1">ou arraste até aqui</p>
              </>
            ) : (
              <div className="text-left">
                <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {files.map((f) => (
                    <li key={f.name + f.size} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{f.name}</span>
                      <span className="text-xs text-muted tabular-nums shrink-0">{fmtSize(f.size)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => { setFiles([]); if (!titleEdited) setTitle(""); }} className="text-xs font-semibold text-muted hover:text-fg mt-3 cursor-pointer">Trocar seleção</button>
              </div>
            )}
          </div>
        )}

        {(kind === "audio" ? !!voice : files.length === 1) && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="media-title" className="text-xs font-medium text-muted">Título</label>
            <input id="media-title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleEdited(true); }} placeholder="Como você vai reconhecer este item" className={inputCls} />
          </div>
        )}
        {files.length > 1 && <p className="text-xs text-muted">Os nomes dos arquivos viram os títulos. Você pode renomear depois.</p>}

        {kind !== "audio" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="media-caption" className="text-xs font-medium text-muted">Legenda (opcional)</label>
            <input id="media-caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Texto que acompanha o envio" className={inputCls} />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Painel: detalhes ────────────────────────────────────────

function DetailSheet({ item, kind, onClose, onSave, onDelete, saving }: {
  item: MediaItem | null; kind: MediaKind; onClose: () => void; saving: boolean;
  onSave: (id: number, patch: { title: string; caption: string | null }) => void; onDelete: (item: MediaItem) => void;
}) {
  if (!item) return null;
  return <DetailForm key={item.id} item={item} kind={kind} onClose={onClose} onSave={onSave} onDelete={onDelete} saving={saving} />;
}

function DetailForm({ item, kind, onClose, onSave, onDelete, saving }: {
  item: MediaItem; kind: MediaKind; onClose: () => void; saving: boolean;
  onSave: (id: number, patch: { title: string; caption: string | null }) => void; onDelete: (item: MediaItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [caption, setCaption] = useState(item.caption || "");
  const [dur, setDur] = useState<number | null>(null);

  return (
    <Modal open onClose={onClose} title={item.title} description={[ext(item), fmtSize(item.size)].filter(Boolean).join(" · ")}
      footer={<>
        <Button variant="ghost" onClick={() => onDelete(item)} className="mr-auto hover:text-hot"><Trash2 className="w-4 h-4" /> Excluir</Button>
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
        <Button onClick={() => onSave(item.id, { title: title.trim() || item.title, caption: kind === "audio" ? null : caption.trim() || null })} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar
        </Button>
      </>}
    >
      <div className="flex flex-col gap-5">
        {kind === "audio" && (
          <div className="p-4 rounded-xl bg-surface">
            <audio controls src={item.url} onLoadedMetadata={(e) => setDur(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)} className="w-full" />
            {dur !== null && <p className="text-xs text-muted mt-2 tabular-nums">Duração {formatDuration(dur)}</p>}
          </div>
        )}
        {kind === "media" && (
          <div className="rounded-xl overflow-hidden bg-surface">
            {item.type === "video" ? <video src={item.url} controls className="w-full max-h-[340px]" /> : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={item.title} className="w-full max-h-[340px] object-contain" />
            )}
          </div>
        )}
        {kind === "document" && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-surface hover:bg-line/50 transition-colors">
            <span className="w-10 h-10 rounded-[10px] bg-card grid place-items-center"><DocIcon item={item} /></span>
            <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{item.title}</span><span className="block text-xs text-muted">Abrir ou baixar</span></span>
            <Download className="w-4 h-4 text-muted" />
          </a>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-title" className="text-xs font-medium text-muted">Título</label>
          <input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </div>
        {kind !== "audio" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-caption" className="text-xs font-medium text-muted">Legenda</label>
            <input id="d-caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Texto que acompanha o envio" className={inputCls} />
          </div>
        )}
      </div>
    </Modal>
  );
}
