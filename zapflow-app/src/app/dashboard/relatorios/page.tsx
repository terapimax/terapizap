"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, BarChart3, Clock, Info } from "lucide-react";
import { useBoards, useBoardData } from "@/hooks/use-kanban";
import { useLeads } from "@/hooks/use-leads";
import { useTriggers } from "@/hooks/use-triggers";
import { useCardMoves, useFiresSince } from "@/hooks/use-reports";
import { buildReport, brl, formatDays, pct, PERIODS, STALE_DAYS, type FunnelReport } from "@/lib/reports";
import { LeadDetailModal } from "@/components/features/lead-detail-modal";
import { Panel, EmptyState, Button } from "@/components/ui/shared";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function RelatoriosPage() {
  const boards = useBoards();
  const [pickedBoard, setPickedBoard] = useState<number | null>(null);
  const [days, setDays] = useState<number>(30);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const boardId = (pickedBoard && boards.data?.some((b) => b.id === pickedBoard) ? pickedBoard : null) ?? boards.data?.[0]?.id ?? null;

  const board = useBoardData(boardId);
  const moves = useCardMoves(boardId);
  const leads = useLeads();
  const triggers = useTriggers();
  const fires = useFiresSince(days);

  const report = useMemo<FunnelReport | null>(() => {
    if (!board.data || !moves.data || !leads.data) return null;
    return buildReport({
      columns: board.data,
      cards: board.data.flatMap((c) => c.items),
      moves: moves.data,
      leads: leads.data,
      fires: fires.data ?? [],
      triggers: triggers.data ?? [],
      days,
    });
  }, [board.data, moves.data, leads.data, fires.data, triggers.data, days]);

  if (boards.isError || board.isError || moves.isError || leads.isError) {
    return (
      <Panel className="p-2 max-w-[1240px] w-full mx-auto">
        <EmptyState
          icon={AlertCircle}
          title="Não foi possível carregar os relatórios"
          description="Se você acabou de atualizar o ZapFlow, rode o arquivo supabase/setup.sql no Supabase (SQL Editor) para criar o histórico do funil."
        />
      </Panel>
    );
  }
  if (boards.data && boards.data.length === 0) {
    return (
      <Panel className="p-2 max-w-[1240px] w-full mx-auto">
        <EmptyState icon={BarChart3} title="Nenhum quadro ainda" description="Os relatórios mostram o seu funil do Kanban. Crie um quadro com as etapas da sua venda para começar."
          action={<Link href="/dashboard/kanban"><Button>Abrir Kanban</Button></Link>} />
      </Panel>
    );
  }

  const r = report;
  const periodLabel = days ? `nos últimos ${days} dias` : "desde o início";
  const historyLate = r?.historySince && (!r.since || r.historySince > r.since) ? r.historySince : null;
  const guessedWon = r ? board.data?.filter((c) => r.outcomes.get(c.id) === "won").map((c) => `“${c.title}”`).join(", ") : "";

  return (
    <div className="flex flex-col gap-6 max-w-[1240px] w-full mx-auto animate-fade-in">
      {/* filtros: quadro e período, numa linha só, acima de tudo */}
      <div className="flex flex-wrap items-center gap-2.5">
        {(boards.data?.length ?? 0) > 1 && (
          <select aria-label="Quadro" value={boardId ?? ""} onChange={(e) => setPickedBoard(Number(e.target.value))}
            className="h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm font-semibold cursor-pointer outline-none focus:border-fg max-w-full">
            {boards.data!.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        )}
        <div role="radiogroup" aria-label="Período" className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5">
          {PERIODS.map((p) => (
            <button key={p.days} type="button" role="radio" aria-checked={days === p.days} onClick={() => setDays(p.days)}
              className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors", days === p.days ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {r && (!r.hasWon || r.guessed || historyLate) && (
        <div className="flex flex-col gap-1.5 -mt-2">
          {!r.hasWon && (
            <Note>Nenhuma etapa deste quadro está marcada como venda fechada. No <Link href="/dashboard/kanban" className="font-semibold underline">Kanban</Link>, use o botão de troféu no topo da etapa para marcar “Ganho” (e “Perdido”). Assim aparecem as vendas e a conversão.</Note>
          )}
          {r.hasWon && r.guessed && (
            <Note>Considerando {guessedWon} como venda fechada, pelo nome. Para ajustar, marque as etapas de resultado no <Link href="/dashboard/kanban" className="font-semibold underline">Kanban</Link> (botão de troféu).</Note>
          )}
          {historyLate && (
            <Note>O histórico de etapas começou em {fmtDate(historyLate)}. Antes disso não se sabe quando cada lead mudou de etapa, então o tempo por etapa vale só a partir dessa data.</Note>
          )}
        </div>
      )}

      {/* números principais */}
      <section aria-label="Indicadores" className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Kpi label="Leads novos" value={r && r.newLeads.toLocaleString("pt-BR")} note={periodLabel} />
        <Kpi label="Entraram no funil" value={r && String(r.entered)} note="cards criados no quadro" />
        <Kpi label="Vendas" value={r && (r.hasWon ? String(r.won.count) : "—")} note={r?.hasWon ? brl(r.won.value) : "marque a etapa de ganho"} />
        <Kpi label="Conversão" value={r && (r.hasWon ? pct(r.conversion) : "—")}
          note={r?.hasWon ? (r.entered ? `${r.cohortWon} de ${r.entered} que entraram já fecharam` : "ninguém entrou no período") : "marque a etapa de ganho"} />
        <Kpi label="Tempo até a venda" value={r && (r.hasWon ? formatDays(r.avgDaysToWin) : "—")} note="média, da entrada no funil até fechar" />
        <Kpi label="Em aberto agora" value={r && String(r.open.count)} note={r ? brl(r.open.value) + " em negociação" : ""} />
      </section>

      <div className="flex flex-wrap gap-4">
        <Panel aria-labelledby="h-funil" className="flex-[3_1_480px] min-w-0 p-6 flex flex-col gap-5">
          <div>
            <h2 id="h-funil" className="text-base font-semibold">Funil por etapa</h2>
            <p className="text-[13px] text-muted mt-0.5">Dos leads que entraram no quadro {periodLabel}, quantos chegaram até cada etapa</p>
          </div>
          {!r ? <Skeletons n={4} /> : r.stages.length === 0 ? (
            <p className="text-sm text-muted">Este quadro ainda não tem etapas.</p>
          ) : (
            <FunnelBars report={r} />
          )}
        </Panel>

        <Panel aria-labelledby="h-parados" className="flex-[2_1_300px] min-w-0 p-6 flex flex-col gap-3">
          <div>
            <h2 id="h-parados" className="text-base font-semibold">Parados há {STALE_DAYS}+ dias</h2>
            <p className="text-[13px] text-muted mt-0.5">Na mesma etapa, sem avançar: vale um contato</p>
          </div>
          {!r ? <Skeletons n={3} /> : r.stale.length === 0 ? (
            <div className="flex items-center gap-3 py-3 text-sm text-muted">
              <Clock className="w-5 h-5 shrink-0" aria-hidden="true" /> Nenhum lead parado. Tudo andando!
            </div>
          ) : (
            <ul className="flex flex-col" aria-label="Leads parados">
              {r.stale.slice(0, 8).map((s) => (
                <li key={s.cardId}>
                  <button type="button" onClick={() => setOpenLead(s.leadId)}
                    className="w-full flex items-center gap-3 py-2.5 border-b border-line text-left hover:bg-surface -mx-2 px-2 rounded-lg cursor-pointer">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{s.name}</span>
                      <span className="block text-xs text-muted truncate">{s.column}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{Math.floor(s.days)} dias</span>
                  </button>
                </li>
              ))}
              {r.stale.length > 8 && <li className="text-xs text-muted pt-2">e mais {r.stale.length - 8}</li>}
            </ul>
          )}
        </Panel>
      </div>

      <Panel aria-labelledby="h-etapas" className="p-6 flex flex-col gap-4">
        <div>
          <h2 id="h-etapas" className="text-base font-semibold">Tempo em cada etapa</h2>
          <p className="text-[13px] text-muted mt-0.5">Média de quem saiu da etapa {periodLabel}</p>
        </div>
        {!r ? <Skeletons n={3} /> : <StageTable report={r} />}
      </Panel>

      <Panel aria-labelledby="h-novos" className="p-6 flex flex-col gap-4">
        <div>
          <h2 id="h-novos" className="text-base font-semibold">Leads novos</h2>
          <p className="text-[13px] text-muted mt-0.5">
            {r ? `${plural(r.newLeads, "lead", "leads")} ${periodLabel}, por ${r.bucket === "day" ? "dia" : r.bucket === "week" ? "semana" : "mês"}` : "Carregando…"}
          </p>
        </div>
        {!r ? <span className="skeleton h-40" /> : <Columns report={r} />}
      </Panel>

      <div className="flex flex-wrap gap-4">
        <Panel aria-labelledby="h-origens" className="flex-[1_1_380px] min-w-0 p-6 flex flex-col gap-4">
          <div>
            <h2 id="h-origens" className="text-base font-semibold">De onde vêm os leads</h2>
            <p className="text-[13px] text-muted mt-0.5">Leads novos {periodLabel} e quantos fecharam neste quadro</p>
          </div>
          {!r ? <Skeletons n={3} /> : r.origins.length === 0 ? (
            <p className="text-sm text-muted">Nenhum lead novo no período.</p>
          ) : (
            <OriginTable report={r} />
          )}
        </Panel>

        <Panel aria-labelledby="h-gatilhos" className="flex-[1_1_380px] min-w-0 p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="h-gatilhos" className="text-base font-semibold">Gatilhos</h2>
              <p className="text-[13px] text-muted mt-0.5">Quantas vezes cada gatilho de lead disparou {periodLabel}</p>
            </div>
            <Link href="/dashboard/gatilhos" className="text-[13px] font-semibold text-accent-fg hover:underline whitespace-nowrap">Ver gatilhos</Link>
          </div>
          {!r || fires.isLoading ? <Skeletons n={3} /> : r.triggers.length === 0 ? (
            <p className="text-sm text-muted">Nenhum gatilho disparou no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="font-medium pb-2">Gatilho</th>
                  <th scope="col" className="font-medium pb-2 text-right">Disparos</th>
                  <th scope="col" className="font-medium pb-2 text-right">Deu certo</th>
                  <th scope="col" className="font-medium pb-2 text-right">Não rolou</th>
                </tr>
              </thead>
              <tbody>
                {r.triggers.map((x) => (
                  <tr key={x.id} className="border-t border-line">
                    <td className="py-2.5 pr-3 font-medium truncate max-w-[220px]">{x.title}</td>
                    <td className="py-2.5 text-right tabular-nums">{x.fires}</td>
                    <td className="py-2.5 text-right tabular-nums">{x.ok}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {x.problems ? <Link href="/dashboard/gatilhos" className="underline" title="Veja o motivo na tela de gatilhos">{x.problems}</Link> : 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <LeadDetailModal leadId={openLead} open={!!openLead} initialTab="kanban" onClose={() => setOpenLead(null)} />
    </div>
  );
}

// ── peças ────────────────────────────────────────────────

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] text-muted">
      <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Skeletons({ n }: { n: number }) {
  return <div className="flex flex-col gap-3">{Array.from({ length: n }, (_, i) => <span key={i} className="skeleton h-9" />)}</div>;
}

function Kpi({ label, value, note }: { label: string; value: string | null; note: string }) {
  return (
    <Panel className="p-4 sm:p-5 flex flex-col gap-2.5 min-w-0">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      {value == null ? <span className="skeleton h-8 w-24" /> : <span className="font-display text-[26px] sm:text-[30px] leading-none font-bold tracking-tight tabular-nums">{value}</span>}
      <span className="text-[13px] text-muted">{note}</span>
    </Panel>
  );
}

/** Barras horizontais: quantos chegaram até cada etapa (uma cor só; o ganho em destaque). */
function FunnelBars({ report: r }: { report: FunnelReport }) {
  const max = Math.max(1, ...r.stages.map((s) => s.reached));
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4" aria-label="Funil">
        {r.stages.map((s, i) => {
          const label = `${s.title}: ${plural(s.reached, "lead chegou", "leads chegaram")}${s.pctOfEntered != null ? ` (${pct(s.pctOfEntered)} dos que entraram)` : ""}${i > 0 && s.pctOfPrev != null ? `, ${pct(s.pctOfPrev)} da etapa anterior` : ""}`;
          return (
            <li key={s.id} className="flex flex-col gap-2 group" title={label} aria-label={label}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium truncate flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color, boxShadow: "0 0 0 1px var(--line)" }} aria-hidden="true" />
                  {s.title}
                  {s.outcome === "won" && <span className="text-[11px] font-semibold text-ok bg-ok-soft rounded-full px-1.5">Ganho</span>}
                </span>
                <span className="text-muted tabular-nums whitespace-nowrap">
                  <span className="text-fg font-semibold">{s.reached}</span>
                  {s.pctOfEntered != null && <> · {pct(s.pctOfEntered)}</>}
                  {i > 0 && s.pctOfPrev != null && <span className="hidden sm:inline"> · {pct(s.pctOfPrev)} da anterior</span>}
                </span>
              </div>
              <div className="h-2.5 rounded-md bg-surface overflow-hidden">
                <div className={cn("h-full rounded-r-[4px] transition-[width] duration-300 group-hover:opacity-80", s.outcome === "won" ? "bg-accent" : "bg-fg")}
                  style={{ width: `${(s.reached / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
      {r.lostStages.length > 0 && (
        <p className="text-[13px] text-muted border-t border-line pt-3">
          {r.lostStages.map((s) => `${s.title}: ${s.reached}`).join(" · ")} dos que entraram no período
          {r.lost > 0 && <> · {plural(r.lost, "lead perdido", "leads perdidos")} {r.since ? "no período" : "no total"}</>}
        </p>
      )}
    </div>
  );
}

function StageTable({ report: r }: { report: FunnelReport }) {
  const rows = [...r.stages, ...r.lostStages];
  if (!rows.length) return <p className="text-sm text-muted">Este quadro ainda não tem etapas.</p>;
  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="font-medium pb-2">Etapa</th>
            <th scope="col" className="font-medium pb-2 text-right">Agora</th>
            <th scope="col" className="font-medium pb-2 text-right">Valor agora</th>
            <th scope="col" className="font-medium pb-2 text-right">Tempo médio</th>
            <th scope="col" className="font-medium pb-2 text-right">Parados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color, boxShadow: "0 0 0 1px var(--line)" }} aria-hidden="true" />
                  <span className="truncate">{s.title}</span>
                  {s.outcome && <span className={cn("text-[11px] font-semibold rounded-full px-1.5", s.outcome === "won" ? "text-ok bg-ok-soft" : "text-hot bg-hot-soft")}>{s.outcome === "won" ? "Ganho" : "Perdido"}</span>}
                </span>
              </td>
              <td className="py-2.5 text-right tabular-nums">{s.now}</td>
              <td className="py-2.5 text-right tabular-nums">{brl(s.nowValue)}</td>
              <td className="py-2.5 text-right tabular-nums" title={s.measured ? `média de ${plural(s.measured, "saída", "saídas")}` : "ninguém saiu desta etapa no período"}>
                {s.outcome ? "—" : formatDays(s.avgDays)}
              </td>
              <td className="py-2.5 text-right tabular-nums">{s.outcome ? "—" : s.stale ? <span className="font-semibold text-warn">{s.stale}</span> : 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Colunas por dia/semana/mês (uma série só), com o valor no hover. */
function Columns({ report: r }: { report: FunnelReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...r.series.map((s) => s.count));
  const n = r.series.length;
  const unit = r.bucket === "day" ? "" : r.bucket === "week" ? "semana de " : "";
  const tick = (i: number) => i === 0 || i === n - 1 || (n > 8 && i === Math.floor((n - 1) / 2));
  const h = hover != null ? r.series[hover] : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-44 flex flex-col">
        <div className="flex items-baseline justify-between text-xs text-muted tabular-nums h-5">
          <span>máx. {max}</span>
          {h && <span className="text-fg font-medium" aria-live="polite">{unit}{h.label}: {plural(h.count, "lead", "leads")}</span>}
        </div>
        <div className="flex-1 flex items-end gap-[2px] border-b border-line" role="img"
          aria-label={`Leads novos por ${r.bucket === "day" ? "dia" : r.bucket === "week" ? "semana" : "mês"}: ${r.series.map((s) => `${s.label} ${s.count}`).join(", ")}`}>
          {r.series.map((s, i) => (
            <div key={s.start.getTime()} className="flex-1 h-full flex items-end justify-center cursor-default"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div className={cn("w-full max-w-6 rounded-t-[4px] transition-opacity", hover === i ? "bg-accent" : "bg-fg", hover != null && hover !== i && "opacity-40")}
                style={{ height: s.count ? `${Math.max(3, (s.count / max) * 100)}%` : 0 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex text-[11px] text-muted tabular-nums" aria-hidden="true">
        {r.series.map((s, i) => (
          <span key={s.start.getTime()} className={cn("flex-1 min-w-0 text-center", i === 0 && "text-left", i === n - 1 && "text-right")}>{tick(i) ? s.label : ""}</span>
        ))}
      </div>
    </div>
  );
}

function OriginTable({ report: r }: { report: FunnelReport }) {
  const max = Math.max(1, ...r.origins.map((o) => o.leads));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th scope="col" className="font-medium pb-2">Origem</th>
          <th scope="col" className="font-medium pb-2 text-right">Leads</th>
          {r.hasWon && <th scope="col" className="font-medium pb-2 text-right">Vendas</th>}
          {r.hasWon && <th scope="col" className="font-medium pb-2 text-right">Conversão</th>}
        </tr>
      </thead>
      <tbody>
        {r.origins.map((o) => (
          <tr key={o.origin} className="border-t border-line">
            <td className="py-2.5 pr-3">
              <span className="block font-medium truncate max-w-[200px]">{o.origin}</span>
              <span className="mt-1.5 block h-1.5 rounded-r-[4px] bg-fg" style={{ width: `${(o.leads / max) * 100}%`, maxWidth: 200 }} aria-hidden="true" />
            </td>
            <td className="py-2.5 text-right tabular-nums align-top">{o.leads}</td>
            {r.hasWon && <td className="py-2.5 text-right tabular-nums align-top">{o.won}</td>}
            {r.hasWon && <td className="py-2.5 text-right tabular-nums align-top">{pct(o.pct)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
