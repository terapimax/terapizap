"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Estado vazio ---------- */
interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center mb-5">
        <Icon className="w-6 h-6 text-muted" />
      </div>
      <h3 className="text-base font-semibold text-fg mb-1.5">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

/* ---------- Cabeçalho de seção ---------- */
interface PageHeaderProps {
  title: string;
  count?: number;
  children?: React.ReactNode;
}

export function PageHeader({ title, count, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2.5">
        <h2 className="text-xl font-bold text-fg">{title}</h2>
        {typeof count === "number" && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface text-muted tabular-nums">{count}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Busca ---------- */
interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Buscar", className }: SearchInputProps) {
  return (
    <label className={cn("flex items-center gap-2 h-10 px-3 rounded-[10px] bg-surface text-muted w-full sm:w-64", className)}>
      <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-fg placeholder:text-muted"
      />
    </label>
  );
}

/* ---------- Botão ---------- */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "icon";
}

export function Button({ variant = "primary", size = "md", className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap transition-colors duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "icon" && "h-10 w-10 text-sm",
        variant === "primary" && "bg-primary text-on-primary hover:opacity-90",
        variant === "accent" && "bg-accent text-on-accent hover:opacity-90",
        variant === "secondary" && "bg-card text-fg border border-line hover:bg-surface",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-surface",
        variant === "danger" && "bg-hot-soft text-hot hover:opacity-90",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Chip de status ---------- */
type ChipTone = "neutral" | "ok" | "warn" | "hot" | "cold" | "accent";
const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surface text-muted",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  hot: "bg-hot-soft text-hot",
  cold: "bg-cold-soft text-cold",
  accent: "bg-accent-soft text-accent-fg",
};

export function Chip({ tone = "neutral", className, children }: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap", CHIP_TONES[tone], className)}>
      {children}
    </span>
  );
}

/* ---------- Painel (cartão de seção) ---------- */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("bg-card border border-line rounded-2xl", className)} {...props}>
      {children}
    </section>
  );
}

/* ---------- Cartão de item clicável ---------- */
interface ItemCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function ItemCard({ children, className, onClick }: ItemCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border border-line rounded-2xl p-5 group transition-colors duration-150",
        onClick && "cursor-pointer hover:border-fg",
        className
      )}
    >
      {children}
    </div>
  );
}
