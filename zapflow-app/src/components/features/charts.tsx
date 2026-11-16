"use client";

// Gráficos do painel, em SVG puro (sem biblioteca): seguem as cores do tema claro/escuro
// pelas variáveis CSS e têm o valor exato ao passar o mouse ou o dedo.
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Arredonda o topo do eixo para um número "redondo" (1, 2, 5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export interface TrendPoint { label: string; value: number }

/**
 * Linha com área: uma medida só ao longo do tempo (um eixo, uma cor).
 * Passe o mouse para ver o valor de cada dia/semana/mês.
 */
export function TrendChart({ points, format, unit, height = 232, ariaLabel }: {
  points: TrendPoint[];
  format: (v: number) => string;
  /** prefixo do rótulo no hover, ex.: "semana de " */
  unit?: string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const n = points.length;
  const padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z` : "";
  const ticks = top >= 2 ? [0, top / 2, top] : [0, top];
  const xTick = (i: number) => i === 0 || i === n - 1 || (n > 8 && i === Math.floor((n - 1) / 2));
  const h = hover != null && hover < n ? points[hover] : null;
  const empty = points.every((p) => p.value === 0);

  const move = (e: React.PointerEvent<SVGRectElement>) => {
    if (!n) return;
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = e.clientX - box.left;
    setHover(n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - padL) / innerW) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--fg)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--fg)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* grade discreta, com o valor escrito em cima da linha */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v === 0 ? undefined : "3 4"} />
              {v > 0 && <text x={padL} y={y(v) - 5} fontSize="11" fill="var(--muted)" className="tabular-nums">{format(v)}</text>}
            </g>
          ))}
          {!empty && area && <path d={area} fill={`url(#${gid})`} />}
          {!empty && <path d={line} fill="none" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {!empty && n === 1 && <circle cx={x(0)} cy={y(points[0].value)} r="4" fill="var(--fg)" />}
          {points.map((p, i) => xTick(i) && (
            <text key={i} x={x(i)} y={height - 7} fontSize="11" fill="var(--muted)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="tabular-nums">{p.label}</text>
          ))}
          {h && hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padT} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
              <circle cx={x(hover)} cy={y(h.value)} r="5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />
            </g>
          )}
          <rect x="0" y="0" width={width} height={height} fill="transparent" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHover(null)} style={{ touchAction: "pan-y" }} />
        </svg>
      )}
      {empty && width > 0 && (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-muted pointer-events-none">Nada no período ainda.</p>
      )}
      {h && hover != null && (
        <div
          className="absolute z-10 pointer-events-none px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs shadow-elev whitespace-nowrap"
          style={{ top: Math.max(0, y(h.value) - 44), left: Math.max(0, Math.min(width - 150, x(hover) + (x(hover) > width / 2 ? -150 - 10 : 12))), minWidth: 0 }}
        >
          <span className="opacity-70">{unit}{h.label}</span>
          <span className="block font-semibold text-[13px] tabular-nums">{format(h.value)}</span>
        </div>
      )}
    </div>
  );
}

/** Linha miniatura para o cartão de indicador (só a tendência, sem eixos). */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const w = 96, h = 30, pad = 3;
  const n = values.length;
  const max = Math.max(...values, 0);
  if (n < 2 || max === 0) return <span className={cn("block", className)} style={{ width: w, height: h }} aria-hidden="true" />;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (n - 1);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("shrink-0", className)} aria-hidden="true">
      <path d={`${d} L${x(n - 1)} ${h} L${x(0)} ${h} Z`} fill="var(--fg)" opacity="0.07" />
      <path d={d} fill="none" stroke="var(--fg)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

/** Lista de barras horizontais (uma cor), com o valor à direita e detalhe no hover. */
export function BarList({ rows, format, emptyText }: {
  rows: { key: string | number; label: string; value: number; note?: string; dot?: string; accent?: boolean; title?: string }[];
  format: (v: number) => string;
  emptyText: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5 group" title={r.title}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium min-w-0 flex items-center gap-2">
              {r.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.dot, boxShadow: "0 0 0 1px var(--line)" }} aria-hidden="true" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="text-muted tabular-nums whitespace-nowrap">
              <span className="text-fg font-semibold">{format(r.value)}</span>{r.note ? <> · {r.note}</> : null}
            </span>
          </div>
          <div className="h-2 rounded-[4px] bg-surface overflow-hidden">
            <div className={cn("h-full rounded-r-[4px] transition-[width,opacity] duration-300 group-hover:opacity-75", r.accent ? "bg-accent" : "bg-fg")}
              style={{ width: r.value ? `${Math.max(1.5, (r.value / max) * 100)}%` : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
