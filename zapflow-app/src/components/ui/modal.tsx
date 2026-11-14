"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** sm = caixa de confirmação central; md/lg = painel lateral à direita */
  size?: "sm" | "md" | "lg";
  description?: string;
  footer?: React.ReactNode;
}

// Painéis podem abrir um sobre o outro (ex.: lead > nova tarefa).
let openLayers = 0;
export function lockScroll() {
  openLayers++;
  document.body.style.overflow = "hidden";
}
export function unlockScroll() {
  openLayers = Math.max(0, openLayers - 1);
  if (!openLayers) document.body.style.overflow = "";
}
/** Só o painel de cima responde ao Esc. */
export function isTopLayer(el: HTMLElement | null) {
  const all = document.querySelectorAll('[aria-modal="true"]');
  return !!el && all[all.length - 1] === el;
}

/**
 * Painel lateral (sheet). Mantém a mesma API do antigo Modal, então toda tela
 * que usa <Modal> passa a abrir o conteúdo à direita sem esconder a página.
 */
export function Modal({ open, onClose, title, children, size = "md", description, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    lockScroll();
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button")?.focus(), 30);
    return () => {
      clearTimeout(t);
      unlockScroll();
      lastFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopLayer(panelRef.current)) onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const isDialog = size === "sm";

  // Portal no <body>: um ancestral com transform/animação prenderia o "fixed" dentro dele.
  return createPortal(
    <div className={cn("fixed inset-0 z-[100] flex", isDialog ? "items-center justify-center p-4" : "justify-end")}>
      <div className="absolute inset-0 bg-scrim animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex flex-col bg-card text-fg shadow-elev",
          isDialog
            ? "w-full max-w-md max-h-[90vh] rounded-2xl border border-line animate-slide-up"
            : cn("h-full w-full border-l border-line animate-sheet-in", size === "lg" ? "sm:max-w-[640px]" : "sm:max-w-[480px]")
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-bold text-fg">{title}</h3>
            {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="h-9 w-9 -mr-2 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line flex flex-wrap gap-2 justify-end shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Alias semântico para código novo. */
export const Sheet = Modal;
