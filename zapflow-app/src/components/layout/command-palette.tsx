"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAIN_NAV, LIBRARY_TABS, SETTINGS_NAV } from "./nav-items";

const ENTRIES = [...MAIN_NAV.filter((i) => i.label !== "Biblioteca"), ...LIBRARY_TABS, SETTINGS_NAV];

/** Busca rápida (Ctrl K / ⌘K): navega para qualquer tela pelo nome. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => {
      setQ("");
      setIdx(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => {
          if (!o) { setQ(""); setIdx(0); }
          return !o;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("zf:open-palette", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("zf:open-palette", show);
    };
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ENTRIES.filter((e) => (e.label + " " + e.description).toLowerCase().includes(s)) : ENTRIES;
  }, [q]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Busca rápida" className="relative w-full max-w-lg bg-card border border-line rounded-2xl shadow-elev overflow-hidden animate-slide-up">
        <label className="flex items-center gap-3 px-4 h-14 border-b border-line">
          <Search className="w-5 h-5 text-muted shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && results[idx]) go(results[idx].href);
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Ir para…"
            aria-label="Ir para"
            className="flex-1 bg-transparent outline-none text-base text-fg placeholder:text-muted"
          />
          <kbd className="text-[11px] text-muted border border-line rounded-md px-1.5 py-0.5">Esc</kbd>
        </label>
        <ul className="max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado para “{q}”.</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <li key={r.href} role="option" aria-selected={i === idx}>
                <button
                  type="button"
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => go(r.href)}
                  className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-left cursor-pointer", i === idx && "bg-surface")}
                >
                  <span className="w-8 h-8 rounded-lg bg-surface border border-line grid place-items-center shrink-0"><Icon className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="block text-xs text-muted truncate">{r.description}</span>
                  </span>
                  {i === idx && <CornerDownLeft className="w-4 h-4 text-muted" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
