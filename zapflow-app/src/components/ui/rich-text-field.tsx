"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Smile, Strikethrough } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de texto com a formatação do WhatsApp: *negrito*, _itálico_, ~riscado~
 * e emojis. Aceita várias linhas (Enter quebra a linha).
 */

const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  { label: "Rostos", items: ["😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😍", "🥰", "😘", "🤩", "😎", "🤗", "🤔", "😅", "😂", "🙏", "👏", "💪", "😇", "🥳", "😌", "😴", "🤝"] },
  { label: "Gestos", items: ["👍", "👌", "✌️", "🤞", "👉", "👈", "👇", "☝️", "👋", "🙌", "👀", "✨", "🔥", "💥", "⭐", "🌟"] },
  { label: "Símbolos", items: ["✅", "☑️", "✔️", "❌", "⚠️", "❗", "❓", "➡️", "▶️", "🔹", "🔸", "🔺", "🔻", "💯", "🆕", "🆓", "🔔", "📌", "📍", "🎁", "🎉", "🏆", "💎", "❤️", "💚", "💙"] },
  { label: "Negócios", items: ["💰", "💵", "💳", "💸", "🏷️", "🛒", "🛍️", "📦", "🚚", "🕒", "📅", "📞", "📱", "💬", "📲", "📝", "📷", "🎥", "🔗", "🏠", "🏥", "🩺", "💆", "🦶", "🦵", "🧘"] },
];

// marca → trecho já formatado? (para desfazer ao clicar de novo)
function toggleWrap(value: string, start: number, end: number, mark: string) {
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);

  // já está marcado por fora da seleção: *[texto]* → remove
  if (before.endsWith(mark) && after.startsWith(mark) && sel) {
    return { text: before.slice(0, -mark.length) + sel + after.slice(mark.length), from: start - mark.length, to: end - mark.length };
  }
  // seleção já inclui as marcas: [*texto*] → remove
  if (sel.length > mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, -mark.length);
    return { text: before + inner + after, from: start, to: start + inner.length };
  }
  // o WhatsApp não formata se houver espaço colado nas marcas: deixa o espaço do lado de fora
  const lead = sel.match(/^\s*/)?.[0] ?? "";
  const trail = sel.match(/\s*$/)?.[0] ?? "";
  const core = sel.trim();
  if (!core) {
    // sem seleção: abre as marcas e deixa o cursor no meio
    return { text: before + mark + mark + after, from: start + mark.length, to: start + mark.length };
  }
  const text = before + lead + mark + core + mark + trail + after;
  const from = start + lead.length + mark.length;
  return { text, from, to: from + core.length };
}

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function RichTextField({ id, value, onChange, placeholder, rows = 5, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // fecha o painel de emojis ao clicar fora
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setEmojiOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [emojiOpen]);

  const apply = (text: string, from: number, to: number) => {
    onChange(text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(from, to);
    });
  };

  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const r = toggleWrap(value, el.selectionStart, el.selectionEnd, mark);
    apply(r.text, r.from, r.to);
  };

  const insert = (emoji: string) => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    apply(value.slice(0, s) + emoji + value.slice(e), s + emoji.length, s + emoji.length);
  };

  const tools = [
    { label: "Negrito (Ctrl+B)", mark: "*", Icon: Bold },
    { label: "Itálico (Ctrl+I)", mark: "_", Icon: Italic },
    { label: "Riscado", mark: "~", Icon: Strikethrough },
  ];

  const btn = "h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-fg hover:bg-surface cursor-pointer transition-colors disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div ref={wrapRef} className="relative rounded-[10px] bg-card border border-line focus-within:border-fg transition-colors">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-line" role="toolbar" aria-label="Formatação do texto">
        {tools.map(({ label, mark, Icon }) => (
          <button
            key={mark}
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrap(mark)}
            className={btn}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
        <span className="w-px h-4 bg-line mx-1" aria-hidden="true" />
        <button
          type="button"
          title="Emojis"
          aria-label="Inserir emoji"
          aria-expanded={emojiOpen}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEmojiOpen((o) => !o)}
          className={cn(btn, emojiOpen && "bg-surface text-fg")}
        >
          <Smile className="w-4 h-4" />
        </button>
      </div>

      {emojiOpen && (
        <div className="absolute left-1.5 top-[42px] z-20 w-[min(320px,calc(100%-12px))] max-h-[240px] overflow-y-auto rounded-xl bg-card border border-line shadow-lg p-2">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label} className="mb-1.5 last:mb-0">
              <p className="text-[11px] font-medium text-muted px-1 mb-0.5">{g.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {g.items.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insert(em)}
                    className="h-8 grid place-items-center rounded-md text-lg hover:bg-surface cursor-pointer"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={ref}
        id={id}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
          const k = e.key.toLowerCase();
          if (k === "b") { e.preventDefault(); wrap("*"); }
          else if (k === "i") { e.preventDefault(); wrap("_"); }
        }}
        className="block w-full px-3 py-2.5 rounded-b-[10px] bg-transparent text-sm text-fg placeholder:text-muted outline-none resize-y min-h-[110px] leading-relaxed"
      />
      <p className="px-3 pb-2 text-[11px] text-muted">
        Enter pula de linha. No WhatsApp: *negrito*, _itálico_, ~riscado~.
      </p>
    </div>
  );
}
