"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, FileSpreadsheet, FileText, MessageSquareText, Mic, Play, Search } from "lucide-react";
import type { MediaItem, Message } from "@/types";
import { formatDuration } from "@/lib/audio";
import { cn } from "@/lib/utils";

/** Qualquer item que pode virar um passo ou um envio: mensagem pronta ou arquivo da biblioteca. */
export type LibraryItem = MediaItem | Message;

export const isMedia = (item: LibraryItem): item is MediaItem => "url" in item;

const TYPE_LABEL: Record<MediaItem["type"], string> = { image: "Foto", video: "Vídeo", audio: "Áudio", document: "Documento" };

export function itemTypeLabel(item: LibraryItem) {
  return isMedia(item) ? TYPE_LABEL[item.type] : "Mensagem";
}

export function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function fileExt(item: MediaItem) {
  const fromMime = item.mime_type?.split("/")[1]?.split(";")[0];
  const fromUrl = item.url.split("?")[0].split(".").pop();
  return (fromUrl && fromUrl.length <= 5 ? fromUrl : fromMime || "arquivo").toUpperCase();
}

export function DocIcon({ item, className = "w-5 h-5" }: { item: MediaItem; className?: string }) {
  const sheet = /sheet|excel|csv/i.test(item.mime_type || "") || /\.(xlsx?|csv)$/i.test(item.url);
  const Icon = sheet ? FileSpreadsheet : FileText;
  return <Icon className={className} />;
}

/** `#t=0.1` faz o navegador (inclusive Safari) pintar o primeiro quadro do vídeo. */
export const videoPosterSrc = (url: string) => `${url}#t=0.1`;

/** Linha de detalhes: "Vídeo · 0:42 · 3,1 MB", "PDF · 120 KB" ou o começo do texto. */
export function itemMeta(item: LibraryItem, duration?: number | null) {
  if (!isMedia(item)) return (item.content ?? "").replace(/\s+/g, " ").trim() || "Mensagem vazia";
  const dur = duration != null && isFinite(duration) && duration > 0 ? formatDuration(duration) : null;
  const kind = item.type === "document" ? fileExt(item) : TYPE_LABEL[item.type];
  return [kind, dur, fmtSize(item.size)].filter(Boolean).join(" · ");
}

/** Só carrega o arquivo quando o elemento chega perto da tela. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

const THUMB_SIZE = { sm: "w-10 h-10", md: "w-12 h-12" } as const;

/**
 * Miniatura quadrada: foto, primeiro quadro do vídeo, ícone de áudio, documento ou mensagem.
 * `item` vazio desenha o aviso de item removido da biblioteca.
 */
export function MediaThumb({ item, size = "md", onDuration, className }: {
  item: LibraryItem | null | undefined;
  size?: keyof typeof THUMB_SIZE;
  /** recebe a duração de áudio e vídeo quando o arquivo informa */
  onDuration?: (seconds: number) => void;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [failed, setFailed] = useState(false);
  const box = cn("relative shrink-0 rounded-[10px] overflow-hidden grid place-items-center", THUMB_SIZE[size], className);
  const icon = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const readDuration = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const d = e.currentTarget.duration;
    if (isFinite(d) && d > 0) onDuration?.(d);
  };

  if (!item) {
    return <span ref={ref} className={cn(box, "bg-hot-soft text-hot")} aria-hidden="true"><AlertCircle className={icon} /></span>;
  }
  if (!isMedia(item)) {
    return <span ref={ref} className={cn(box, "bg-surface text-muted")} aria-hidden="true"><MessageSquareText className={icon} /></span>;
  }

  if (item.type === "image" && !failed) {
    return (
      <span ref={ref} className={cn(box, "bg-surface")} aria-hidden="true">
        {inView && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        )}
      </span>
    );
  }

  if (item.type === "video" && !failed) {
    return (
      <span ref={ref} className={cn(box, "bg-surface")} aria-hidden="true">
        {inView && (
          <video src={videoPosterSrc(item.url)} preload="metadata" muted playsInline tabIndex={-1}
            onLoadedMetadata={readDuration} onError={() => setFailed(true)}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        )}
        <span className="relative w-5 h-5 rounded-full bg-scrim text-white grid place-items-center">
          <Play className="w-2.5 h-2.5 ml-px fill-current" />
        </span>
      </span>
    );
  }

  if (item.type === "audio") {
    return (
      <span ref={ref} className={cn(box, "bg-accent-soft text-accent-fg")} aria-hidden="true">
        <Mic className={icon} />
        {inView && onDuration && <audio src={item.url} preload="metadata" onLoadedMetadata={readDuration} className="hidden" />}
      </span>
    );
  }

  // documento (ou foto/vídeo que não carregou)
  return (
    <span ref={ref} className={cn(box, "bg-surface text-muted")} aria-hidden="true">
      {item.type === "document" ? (
        <span className="flex flex-col items-center gap-0.5">
          <DocIcon item={item} className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} />
          {size === "md" && <span className="text-[9px] font-bold leading-none tracking-wide">{fileExt(item).slice(0, 4)}</span>}
        </span>
      ) : (
        <AlertCircle className={icon} />
      )}
    </span>
  );
}

/** Prévia completa: foto inteira, vídeo e áudio tocáveis, documento para abrir, mensagem em balão. */
export function MediaPreview({ item, className }: { item: LibraryItem; className?: string }) {
  const [dur, setDur] = useState<number | null>(null);

  if (!isMedia(item)) {
    return (
      <div className={cn("rounded-xl bg-surface p-3", className)}>
        <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-card border border-line px-3 py-2 text-sm whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
          {item.content?.trim() || <span className="text-muted">Mensagem vazia</span>}
        </p>
      </div>
    );
  }

  const caption = item.caption && item.type !== "audio" && (
    <p className="text-xs text-muted mt-2"><span className="font-medium">Legenda:</span> {item.caption}</p>
  );

  if (item.type === "image" || item.type === "video") {
    return (
      <div className={className}>
        <div className="rounded-xl overflow-hidden bg-surface grid place-items-center">
          {item.type === "video" ? (
            <video key={item.id} src={videoPosterSrc(item.url)} controls preload="metadata" playsInline className="w-full max-h-[280px]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.id} src={item.url} alt={item.title} className="w-full max-h-[280px] object-contain" />
          )}
        </div>
        {caption}
      </div>
    );
  }

  if (item.type === "audio") {
    return (
      <div className={cn("rounded-xl bg-surface p-3", className)}>
        <audio key={item.id} src={item.url} controls preload="metadata" className="w-full h-10"
          onLoadedMetadata={(e) => setDur(isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)} />
        {dur !== null && <p className="text-xs text-muted mt-2 tabular-nums">Duração {formatDuration(dur)} · vai como mensagem de voz</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-surface hover:bg-line/50 transition-colors">
        <MediaThumb item={item} className="bg-card" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate">{item.title}</span>
          <span className="block text-xs text-muted">{itemMeta(item)} · Abrir ou baixar</span>
        </span>
        <Download className="w-4 h-4 text-muted shrink-0" />
      </a>
      {caption}
    </div>
  );
}

/**
 * Seletor visual da biblioteca: lista com miniatura, tipo, duração e tamanho,
 * busca quando a lista cresce e prévia completa do item escolhido.
 */
export function LibraryPicker({ id, label, items, loading, value, onChange, empty }: {
  id: string;
  label: string;
  items: LibraryItem[] | undefined;
  loading?: boolean;
  value: number | null;
  onChange: (id: number | null) => void;
  empty: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const labelId = `${id}-label`;
  const all = items ?? [];
  const selected = all.find((i) => i.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((i) => i.title.toLowerCase().includes(q)) : all;

  // ao editar, o item já escolhido aparece na lista sem precisar rolar
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ block: "nearest" });
  }, []); // só na abertura

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const at = radios.indexOf(document.activeElement as HTMLButtonElement);
    const next = radios[Math.min(radios.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-medium text-muted">{label}</span>

      {loading ? (
        <div className="flex flex-col gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-[60px]" />)}</div>
      ) : all.length === 0 ? (
        <p className="text-sm text-muted rounded-xl border border-dashed border-line p-4 text-center">{empty}</p>
      ) : (
        <>
          {all.length > 6 && (
            <label className="relative">
              <span className="sr-only">Buscar em {label.toLowerCase()}</span>
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pelo título"
                className="w-full h-9 pl-9 pr-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors" />
            </label>
          )}

          <div ref={listRef} role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}
            className="max-h-[264px] overflow-y-auto rounded-xl border border-line divide-y divide-line">
            {shown.length === 0 ? (
              <p className="text-sm text-muted text-center px-4 py-6">Nada com “{query}”.</p>
            ) : (
              shown.map((item) => (
                <PickerRow key={item.id} item={item} checked={item.id === value} onPick={() => onChange(item.id)} />
              ))
            )}
          </div>

          {selected ? (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-xs font-medium text-muted">Prévia</span>
              <MediaPreview item={selected} />
            </div>
          ) : value ? (
            <p className="flex items-center gap-1.5 text-xs text-hot"><AlertCircle className="w-3.5 h-3.5" /> O item escolhido foi removido da biblioteca. Escolha outro.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PickerRow({ item, checked, onPick }: { item: LibraryItem; checked: boolean; onPick: () => void }) {
  const [dur, setDur] = useState<number | null>(null);
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onPick}
      className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition-colors outline-none focus-visible:bg-surface",
        checked ? "bg-surface" : "hover:bg-surface")}>
      <MediaThumb item={item} onDuration={setDur} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{item.title}</span>
        <span className="block text-xs text-muted truncate">{itemMeta(item, dur)}</span>
      </span>
      <span className={cn("w-5 h-5 rounded-full border grid place-items-center shrink-0 transition-colors",
        checked ? "bg-primary border-primary text-on-primary" : "border-line")} aria-hidden="true">
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
