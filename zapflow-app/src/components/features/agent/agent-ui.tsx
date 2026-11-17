"use client";

import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/shared";

export const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";
export const areaCls =
  "w-full px-3 py-2.5 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors resize-y leading-relaxed";

export function Field({ label, htmlFor, children, className, hint }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted leading-relaxed">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label, disabledValues = [],
}: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string; disabledValues?: T[] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap bg-surface rounded-[10px] p-[3px] gap-0.5">
      {options.map(([v, l]) => {
        const off = disabledValues.includes(v);
        return (
          <button key={v} type="button" aria-pressed={value === v} disabled={off} onClick={() => onChange(v)}
            className={cn(
              "h-[34px] px-3 rounded-lg text-sm transition-colors whitespace-nowrap",
              off ? "text-muted/60 cursor-not-allowed" : "cursor-pointer",
              value === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg",
            )}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Section({ title, description, icon: Icon, children, aside }: {
  title: string; description?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <Panel className="p-5 sm:p-6 flex flex-col gap-5" aria-label={title}>
      <div className="flex items-start gap-3">
        {Icon && <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0"><Icon className="w-[18px] h-[18px] text-muted" /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted mt-0.5 leading-relaxed">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </Panel>
  );
}

export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".", ",")} mil`;
  return String(n);
}
