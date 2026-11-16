"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CalendarDays, Flame, Hourglass, Minus, Users } from "lucide-react";
import { useBoards, useBoardData } from "@/hooks/use-kanban";
import { useLeads } from "@/hooks/use-leads";
import { useOwners } from "@/hooks/use-owners";
import { useTasks } from "@/hooks/use-tasks";
import { useTriggers } from "@/hooks/use-triggers";
import { useCardMoves, useFiresSince } from "@/hooks/use-reports";
import { buildReport, brl, formatDays, pct, PERIODS, STALE_DAYS, type FunnelReport } from "@/lib/reports";
import { formatDue, isOpen, localDate, stateLabel, taskState } from "@/lib/tasks";
import { TaskIcon } from "@/components/features/task-sheets";
import { BarList, Sparkline, TrendChart } from "@/components/features/charts";
import { Panel, Chip, EmptyState } from "@/components/ui/shared";
import { cn } from "@/lib/utils";

const int = (n: number) => n.toLocaleString("pt-BR");
const plural = (n: number, one: string, many: string) => `${int(n)} ${n === 1 ? one : many}`;

type Metric = "leads" | "sales";

const TEMPS = [
  { id: "hot", label: "Quentes", color: "var(--hot)" },
  { id: "warm", label: "Mornos", color: "var(--warn)" },
  { id: "cold", label: "Frios", color: "var(--cold)" },
] as const;

export default function DashboardPage() {
  const boards = useBoards();
  const [pickedBoard, setPickedBoard] = useState<number | null>(null);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>("leads");
  const boardId = (pickedBoard && boards.data?.some((b) => b.id === pickedBoard) ? pickedBoard : null) ?? boards.data?.[0]?.id ?? null;

  const board = useBoardData(boardId);
  const moves = useCardMoves(boardId);
  const leads = useLeads();
  const owners = useOwners();
  const tasks = useTasks();
  const triggers = useTriggers();
  const fires = useFiresSince(days);

  const failed = boards.isError || board.isError || leads.isError;
  const noBoard = !!boards.data && boards.data.length === 0;

  // o período escolhido e o período anterior de mesmo tamanho (para a comparação dos indicadores)
  const { report: r, previous } = useMemo<{ report: FunnelReport | null; previous: FunnelReport | null }>(() => {
    if (!leads.data || (boardId && (!board.data || !moves.data))) return { report: null, previous: null };
    const base = {
      columns: board.data ?? [],
      cards: (board.data ?? []).flatMap((c) => c.items),
      moves: moves.data ?? [],
      leads: leads.data,
      owners: owners.data ?? [],
      triggers: triggers.data ?? [],
    };
    const now = new Date();
    const report = buildReport({ ...base, fires: fires.data ?? [], days, now });
    const previous = days > 0 && report.since ? buildReport({ ...base, fires: [], days, now: new Date(report.since.getTime() - 1) }) : null;
    return { report, previous };
  }, [board.data, moves.data, leads.data, owners.data, triggers.data, fires.data, days, boardId]);

  const cards = useMemo(() => (board.data ?? []).flatMap((c) => c.items), [board.data]);
  const openTasks = useMemo(() => (tasks.data ?? []).filter(isOpen), [tasks.data]);

  // o que pede ação agora
  const attention = useMemo(() => {
    if (!r) return null;
    const overdue = openTasks.filter((t) => taskState(t) === "overdue").length;
    const withTask = new Set(openTasks.map((t) => t.lead_id).filter(Boolean));
    const openCards = cards.filter((c) => !r.outcomes.has(c.column_id));
    const hotIdle = openCards.filter((c) => c.lead.status === "hot" && !withTask.has(c.lead_id)).length;
    const temps = TEMPS.map((t) => ({ ...t, count: openCards.filter((c) => c.lead.status === t.id).length }));
    return { overdue, hotIdle, stale: r.stale.length, temps, openCount: openCards.length };
  }, [r, openTasks, cards]);

  const sinceMs = r?.since ? r.since.getTime() : -Infinity;
  const sent = (tasks.data ?? []).filter((t) => t.kind === "send" && t.status === "sent" && t.finished_at && new Date(t.finished_at).getTime() >= sinceMs).length;

  if (failed) {
    return (
      <Panel className="p-2 max-w-[1240px] w-full mx-auto">
        <EmptyState icon={AlertCircle} title="Não foi possível carregar seus dados"
          description="O banco de dados não respondeu. Verifique se o projeto no Supabase está ativo e recarregue a página." />
      </Panel>
    );
  }

  const periodLabel = days ? `últimos ${days} dias` : "desde o início";
  const prevLabel = days ? `vs. ${days} dias anteriores` : "";
  const bucketWord = r?.bucket === "day" ? "dia" : r?.bucket === "week" ? "semana" : "mês";
  const ticket = r && r.won.count ? r.won.value / r.won.count : null;
  const upcoming = openTasks.slice(0, 4);
  const fireCount = r ? r.triggers.reduce((a, t) => a + t.fires, 0) : 0;

  return (
    <div className="flex flex-col gap-5 max-w-[1240px] w-full mx-auto animate-fade-in">
      {/* filtros numa linha só, acima de tudo */}
      <div className="flex flex-wrap items-center gap-2.5">
        {(boards.data?.length ?? 0) > 1 && (
          <select aria-label="Quadro" value={boardId ?? ""} onChange={(e) => setPickedBoard(Number(e.target.value))}
            className="h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm font-semibold cursor-pointer outline-none focus:border-fg max-w-full">
            {boards.data!.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        )}
        <Segmented label="Período" value={days} onChange={setDays} options={PERIODS.map((p) => [p.days, p.label] as const)} />
        <Link href="/dashboard/relatorios" className="ml-auto h-10 px-3 rounded-[10px] text-sm font-semibold inline-flex items-center gap-1.5 text-muted hover:text-fg hover:bg-surface transition-colors">
          Relatório completo <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>

      {noBoard && (
        <Panel className="p-2">
          <EmptyState icon={Users} title="Monte seu funil para ver a operação aqui"
            description="Crie um quadro no Kanban com as etapas da sua venda. Vendas, conversão e gargalos aparecem nesta tela."
            action={<Link href="/dashboard/kanban" className="h-10 px-4 rounded-[10px] bg-primary text-on-primary text-sm font-semibold inline-flex items-center">Ir para o Kanban</Link>} />
        </Panel>
      )}

      {/* indicadores: número, comparação com o período anterior e a tendência */}
      <section aria-label="Indicadores" className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Leads novos" value={r && int(r.newLeads)} note={periodLabel}
          delta={r && previous ? change(r.newLeads, previous.newLeads) : null} deltaLabel={prevLabel}
          spark={r?.series.map((s) => s.count)} />
        <Kpi label="Vendas" value={r && (r.hasWon ? brl(r.won.value) : "—")}
          note={r?.hasWon ? `${plural(r.won.count, "venda", "vendas")}${ticket ? ` · ticket médio ${brl(ticket)}` : ""}` : "marque a etapa de ganho no Kanban"}
          delta={r?.hasWon && previous ? change(r.won.value, previous.won.value) : null} deltaLabel={prevLabel}
          spark={r?.hasWon ? r.series.map((s) => s.wonValue) : undefined} />
        <Kpi label="Conversão" value={r && (r.hasWon ? pct(r.conversion) : "—")}
          note={r?.hasWon ? (r.entered ? `${r.cohortWon} de ${r.entered} que entraram no funil` : "ninguém entrou no funil no período") : "marque a etapa de ganho no Kanban"}
          delta={r?.hasWon && previous && r.conversion != null && previous.conversion != null ? { diff: r.conversion - previous.conversion, text: `${Math.abs(r.conversion - previous.conversion).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` } : null}
          deltaLabel={prevLabel} />
        <Kpi label="Em negociação" value={r && brl(r.open.value)}
          note={r ? `${plural(r.open.count, "lead em aberto", "leads em aberto")}${r.hasWon && r.avgDaysToWin != null ? ` · fecha em ${formatDays(r.avgDaysToWin)}` : ""}` : ""} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* evolução no tempo: uma medida por vez (leads ou vendas), um eixo só */}
        <Panel aria-labelledby="h-evolucao" className="p-5 sm:p-6 flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="h-evolucao" className="text-base font-semibold">{metric === "leads" ? "Leads novos" : "Vendas fechadas"}</h2>
              <p className="text-[13px] text-muted mt-0.5">
                {r ? (metric === "leads" ? `${plural(r.newLeads, "lead", "leads")} · por ${bucketWord}, ${periodLabel}` : `${brl(r.won.value)} em ${plural(r.won.count, "venda", "vendas")} · por ${bucketWord}, ${periodLabel}`) : "Carregando…"}
              </p>
            </div>
            <Segmented label="Medida" value={metric} onChange={setMetric} options={[["leads", "Leads"], ["sales", "Vendas"]]} />
          </div>
          {!r ? <span className="skeleton h-[232px]" /> : metric === "sales" && !r.hasWon ? (
            <p className="text-sm text-muted h-[232px] grid place-items-center text-center">Marque a etapa de venda fechada no Kanban (botão de troféu) para ver as vendas aqui.</p>
          ) : (
            <TrendChart
              points={r.series.map((s) => ({ label: s.label, value: metric === "leads" ? s.count : s.wonValue }))}
              format={metric === "leads" ? (v) => plural(Math.round(v), "lead", "leads") : brl}
              unit={r.bucket === "week" ? "semana de " : ""}
              ariaLabel={`${metric === "leads" ? "Leads novos" : "Vendas"} por ${bucketWord}: ${r.series.map((s) => `${s.label} ${metric === "leads" ? s.count : brl(s.wonValue)}`).join(", ")}`}
            />
          )}
        </Panel>

        {/* o que pede ação agora */}
        <Panel aria-labelledby="h-atencao" className="p-5 sm:p-6 flex flex-col gap-1 min-w-0">
          <div className="mb-2">
            <h2 id="h-atencao" className="text-base font-semibold">Precisa de atenção</h2>
            <p className="text-[13px] text-muted mt-0.5">O que está travando a operação agora</p>
          </div>
          {!attention ? [0, 1, 2].map((i) => <span key={i} className="skeleton h-14 my-1" />) : (
            <>
              <Alert href="/dashboard/tarefas" icon={CalendarClock} tone="hot" count={attention.overdue} title="Tarefas atrasadas" hint="envios e lembretes que já passaram do horário" />
              <Alert href="/dashboard/relatorios" icon={Hourglass} tone="warn" count={attention.stale} title={`Leads parados há ${STALE_DAYS}+ dias`} hint="na mesma etapa, sem avançar" />
              <Alert href="/dashboard/kanban" icon={Flame} tone="accent" count={attention.hotIdle} title="Quentes sem próxima tarefa" hint="lead quente sem retorno agendado" />
            </>
          )}
          {attention && attention.openCount > 0 && (
            <div className="mt-auto pt-4">
              <p className="text-xs font-medium text-muted mb-2">Temperatura dos leads em aberto</p>
              {/* barra segmentada: cada parte tem nome e número logo abaixo (a cor nunca vai sozinha) */}
              <div className="flex h-2.5 gap-[2px]" role="img" aria-label={attention.temps.map((t) => `${t.label}: ${t.count}`).join(", ")}>
                {attention.temps.filter((t) => t.count > 0).map((t) => (
                  <span key={t.id} className="h-full rounded-[3px] min-w-[4px]" style={{ flexGrow: t.count, flexBasis: 0, backgroundColor: t.color }} title={`${t.label}: ${t.count}`} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[13px]">
                {attention.temps.map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    <span className="text-muted">{t.label}</span>
                    <span className="font-semibold tabular-nums">{int(t.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel aria-labelledby="h-funil" className="p-5 sm:p-6 flex flex-col gap-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="h-funil" className="text-base font-semibold">Funil agora</h2>
              <p className="text-[13px] text-muted mt-0.5">Leads e valor em cada etapa neste momento</p>
            </div>
            <Link href="/dashboard/kanban" className="text-[13px] font-semibold text-accent-fg hover:underline whitespace-nowrap">Abrir Kanban</Link>
          </div>
          {!r ? <Skeletons n={4} /> : (
            <BarList
              emptyText="Nenhuma etapa criada ainda. Monte seu funil na tela Kanban."
              format={(v) => plural(v, "lead", "leads")}
              rows={[...r.stages, ...r.lostStages].map((s) => ({
                key: s.id,
                label: s.title,
                value: s.now,
                dot: s.color,
                accent: s.outcome === "won",
                note: `${brl(s.nowValue)}${!s.outcome && s.avgDays != null ? ` · ${formatDays(s.avgDays)} na etapa` : ""}`,
                title: `${s.title}: ${plural(s.now, "lead", "leads")}, ${brl(s.nowValue)}${s.stale ? ` · ${plural(s.stale, "parado", "parados")}` : ""}`,
              }))}
            />
          )}
        </Panel>

        <Panel aria-labelledby="h-origens" className="p-5 sm:p-6 flex flex-col gap-5 min-w-0">
          <div>
            <h2 id="h-origens" className="text-base font-semibold">De onde vêm os leads</h2>
            <p className="text-[13px] text-muted mt-0.5">Leads novos por origem, {periodLabel}</p>
          </div>
          {!r ? <Skeletons n={3} /> : (
            <BarList
              emptyText="Nenhum lead novo no período."
              format={(v) => int(v)}
              rows={r.origins.map((o) => ({
                key: o.origin,
                label: o.origin,
                value: o.leads,
                note: r.hasWon ? `${plural(o.won, "venda", "vendas")}` : undefined,
                title: `${o.origin}: ${plural(o.leads, "lead", "leads")}${r.hasWon ? `, ${pct(o.pct)} de conversão` : ""}`,
              }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {r && r.owners.length > 0 ? (
          <Panel aria-labelledby="h-equipe" className="p-5 sm:p-6 flex flex-col gap-5 min-w-0">
            <div>
              <h2 id="h-equipe" className="text-base font-semibold">Equipe</h2>
              <p className="text-[13px] text-muted mt-0.5">{r.hasWon ? `Valor vendido por responsável, ${periodLabel}` : "Valor em aberto com cada responsável agora"}</p>
            </div>
            <BarList
              emptyText="Ninguém na equipe ainda."
              format={brl}
              rows={[...r.owners].sort((a, b) => (r.hasWon ? b.wonValue - a.wonValue : b.openValue - a.openValue)).map((o) => ({
                key: o.id ?? "none",
                label: o.name,
                dot: o.color,
                value: r.hasWon ? o.wonValue : o.openValue,
                note: r.hasWon ? `${plural(o.won, "venda", "vendas")} · ${int(o.open)} em aberto` : `${plural(o.open, "lead", "leads")} · ${int(o.leads)} novos`,
              }))}
            />
          </Panel>
        ) : (
          <Panel aria-labelledby="h-auto" className="p-5 sm:p-6 flex flex-col gap-5 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="h-auto" className="text-base font-semibold">Automação</h2>
                <p className="text-[13px] text-muted mt-0.5">O que rodou sozinho, {periodLabel}</p>
              </div>
              <Link href="/dashboard/gatilhos" className="text-[13px] font-semibold text-accent-fg hover:underline whitespace-nowrap">Ver gatilhos</Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Mini label="Envios agendados feitos" value={tasks.data ? int(sent) : null} />
              <Mini label="Disparos de gatilho" value={r && !fires.isLoading ? int(fireCount) : null} />
              <Mini label="Gatilhos ativos" value={triggers.data ? int(triggers.data.filter((t) => t.is_active).length) : null} />
            </div>
            {r && r.triggers.length > 0 && (
              <BarList emptyText="" format={(v) => plural(v, "disparo", "disparos")}
                rows={r.triggers.slice(0, 4).map((t) => ({ key: t.id, label: t.title, value: t.fires, note: t.problems ? `${t.problems} sem efeito` : undefined }))} />
            )}
          </Panel>
        )}

        <Panel aria-labelledby="h-agenda" className="p-5 sm:p-6 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 id="h-agenda" className="text-base font-semibold">Próximas tarefas</h2>
            <Link href="/dashboard/tarefas" className="text-[13px] font-semibold text-accent-fg hover:underline">Ver tarefas</Link>
          </div>
          {tasks.isLoading ? (
            [0, 1, 2].map((i) => <span key={i} className="skeleton h-12" />)
          ) : upcoming.length === 0 ? (
            <div className="flex items-center gap-3 py-4 text-sm text-muted">
              <CalendarDays className="w-5 h-5 shrink-0" aria-hidden="true" />
              Nenhuma tarefa em aberto. Agende envios pelo card do lead.
            </div>
          ) : (
            upcoming.map((t) => {
              const st = stateLabel(t);
              const day = localDate(t.due_at);
              return (
                <Link key={t.id} href="/dashboard/tarefas" className="flex items-center gap-3 py-2.5 border-b border-line last:border-0 hover:bg-surface -mx-2 px-2 rounded-lg">
                  <div className="w-11 shrink-0 text-center">
                    <div className="text-[11px] uppercase tracking-wide text-muted">
                      {new Date(day + "T12:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                    </div>
                    <div className="font-display text-lg font-bold leading-none tabular-nums">{day.slice(8, 10)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5"><TaskIcon task={t} className="w-3.5 h-3.5 shrink-0 text-muted" /> {t.title}</p>
                    <p className="text-xs text-muted truncate">{[t.lead?.name ?? t.contact, formatDue(t.due_at).split(" ").pop()].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </Link>
              );
            })
          )}
        </Panel>
      </div>
    </div>
  );
}

// ── peças ────────────────────────────────────────────────

interface Delta { diff: number; text: string }

/** Variação em relação ao período anterior; sem base de comparação (anterior = 0) não mostra percentual. */
function change(now: number, before: number): Delta | null {
  if (!before) return now ? { diff: 1, text: "novo" } : null;
  const p = ((now - before) / before) * 100;
  return { diff: p, text: `${Math.abs(p).toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(p) < 10 ? 1 : 0 })}%` };
}

function Kpi({ label, value, note, delta, deltaLabel, spark }: { label: string; value: string | null; note: string; delta?: Delta | null; deltaLabel?: string; spark?: number[] }) {
  const up = !!delta && delta.diff > 0.05;
  const down = !!delta && delta.diff < -0.05;
  const Arrow = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <Panel className="p-4 sm:p-5 flex flex-col gap-2.5 min-w-0">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <div className="flex items-end justify-between gap-2 min-w-0">
        {value == null ? <span className="skeleton h-8 w-24" /> : <span className="font-display text-[26px] sm:text-[30px] leading-none font-bold tracking-tight tabular-nums truncate">{value}</span>}
        {spark && <Sparkline values={spark} className="hidden sm:block" />}
      </div>
      {delta && (
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className={cn("inline-flex items-center gap-0.5 font-semibold rounded-full px-1.5 py-0.5 tabular-nums", up ? "bg-ok-soft text-ok" : down ? "bg-hot-soft text-hot" : "bg-surface text-muted")}>
            <Arrow className="w-3 h-3" aria-hidden="true" />
            <span className="sr-only">{up ? "subiu" : down ? "caiu" : "igual"}</span>
            {delta.text}
          </span>
          <span className="text-muted">{deltaLabel}</span>
        </span>
      )}
      <span className="text-[13px] text-muted">{note}</span>
    </Panel>
  );
}

function Alert({ href, icon: Icon, tone, count, title, hint }: { href: string; icon: typeof Flame; tone: "hot" | "warn" | "accent"; count: number; title: string; hint: string }) {
  const tones = { hot: "bg-hot-soft text-hot", warn: "bg-warn-soft text-warn", accent: "bg-accent-soft text-accent-fg" };
  return (
    <Link href={href} className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-surface transition-colors group">
      <span className={cn("w-10 h-10 rounded-xl grid place-items-center shrink-0", count ? tones[tone] : "bg-surface text-muted")}><Icon className="w-[18px] h-[18px]" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{title}</span>
        <span className="block text-xs text-muted truncate">{count ? hint : "tudo em dia"}</span>
      </span>
      <span className={cn("font-display text-2xl font-bold tabular-nums", !count && "text-muted")}>{int(count)}</span>
      <ArrowRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-surface p-3.5 flex flex-col gap-1.5 min-w-0">
      {value == null ? <span className="skeleton h-7 w-12" /> : <span className="font-display text-2xl font-bold leading-none tabular-nums">{value}</span>}
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function Skeletons({ n }: { n: number }) {
  return <div className="flex flex-col gap-3">{Array.from({ length: n }, (_, i) => <span key={i} className="skeleton h-9" />)}</div>;
}

function Segmented<T extends string | number>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: readonly (readonly [T, string])[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex bg-surface rounded-[10px] p-[3px] gap-0.5">
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-[34px] px-3 rounded-lg text-sm cursor-pointer transition-colors", value === v ? "bg-card text-fg font-semibold shadow-sm" : "text-muted font-medium hover:text-fg")}>
          {text}
        </button>
      ))}
    </div>
  );
}
