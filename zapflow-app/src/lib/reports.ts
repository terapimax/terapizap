// Relatórios do funil: tudo calculado aqui a partir do histórico de etapas (kanban_card_moves),
// dos cards de agora, dos leads e dos disparos de gatilho. Função pura, sem banco: fácil de testar.
import type { ColumnOutcome, KanbanCardMove, KanbanColumn, Lead, Owner, Trigger, TriggerFire } from "@/types";

export const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 0, label: "Tudo" },
] as const;

/** A partir de quantos dias na mesma etapa o lead conta como parado. */
export const STALE_DAYS = 7;

const DAY = 86_400_000;
const LOST_RE = /perd|desist|cancel/i;
const WON_RE = /fech|ganh|vend|conclu/i;

/**
 * Quais etapas são de resultado. Vale o que foi marcado no Kanban; sem nada marcado no quadro,
 * adivinha pelo nome ("Fechados", "Ganhos"… = ganho; "Perdidos", "Desistiu"… = perdido).
 */
export function resolveOutcomes(columns: Pick<KanbanColumn, "id" | "title" | "outcome">[]) {
  const explicit = columns.filter((c) => c.outcome === "won" || c.outcome === "lost");
  if (explicit.length) return { map: new Map(explicit.map((c) => [c.id, c.outcome as ColumnOutcome])), guessed: false };
  const map = new Map<number, ColumnOutcome>();
  for (const c of columns) {
    if (LOST_RE.test(c.title)) map.set(c.id, "lost");
    else if (WON_RE.test(c.title)) map.set(c.id, "won");
  }
  return { map, guessed: map.size > 0 };
}

export interface ReportCard { id: number; lead_id: number; column_id: number; value: number | string }

export interface ReportInput {
  columns: KanbanColumn[];
  /** cards do quadro agora */
  cards: ReportCard[];
  /** histórico do quadro (qualquer ordem) */
  moves: KanbanCardMove[];
  leads: Pick<Lead, "id" | "name" | "origin" | "created_at" | "owner_id">[];
  /** equipe (vazio = ninguém cadastrado: o relatório por responsável não aparece) */
  owners?: Pick<Owner, "id" | "name" | "color">[];
  fires: Pick<TriggerFire, "trigger_id" | "result" | "created_at">[];
  triggers: Pick<Trigger, "id" | "title">[];
  /** 0 = desde sempre */
  days: number;
  now?: Date;
}

export interface StageRow {
  id: number;
  title: string;
  color: string;
  outcome: ColumnOutcome | null;
  /** cards do período que chegaram até esta etapa (ou passaram dela) */
  reached: number;
  pctOfEntered: number | null;
  /** em relação à etapa anterior */
  pctOfPrev: number | null;
  /** cards nesta etapa agora */
  now: number;
  nowValue: number;
  /** tempo médio de quem saiu desta etapa no período (dias); null = ainda sem medida */
  avgDays: number | null;
  measured: number;
  stale: number;
}

export interface StaleCard { cardId: number; leadId: number; name: string; columnId: number; column: string; days: number }

export type Bucket = "day" | "week" | "month";

export interface FunnelReport {
  since: Date | null;
  outcomes: Map<number, ColumnOutcome>;
  guessed: boolean;
  hasWon: boolean;
  newLeads: number;
  /** cards que entraram no quadro no período */
  entered: number;
  won: { count: number; value: number };
  lost: number;
  /** % dos cards do período que já chegaram a uma etapa de ganho */
  conversion: number | null;
  cohortWon: number;
  avgDaysToWin: number | null;
  open: { count: number; value: number };
  stages: StageRow[];
  lostStages: StageRow[];
  stale: StaleCard[];
  origins: { origin: string; leads: number; won: number; pct: number | null }[];
  /** por responsável: leads novos no período, cards em aberto agora e vendas no período (id null = sem responsável) */
  owners: { id: number | null; name: string; color: string; leads: number; open: number; openValue: number; won: number; wonValue: number }[];
  triggers: { id: number; title: string; fires: number; ok: number; problems: number }[];
  bucket: Bucket;
  /** por dia/semana/mês: leads novos (count) e vendas fechadas (won, wonValue) */
  series: { start: Date; label: string; count: number; won: number; wonValue: number }[];
  /** quando começou o histórico de etapas (antes disso não há tempo por etapa) */
  historySince: Date | null;
}

interface Stay { col: number; start: number; end: number | null; seeded: boolean; value: number }

const OK_RESULTS = new Set(["envio agendado", "movido", "aviso criado"]);
const num = (v: unknown) => Number(v) || 0;
const t = (iso: string) => new Date(iso).getTime();

export function buildReport(input: ReportInput): FunnelReport {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const since = input.days > 0 ? startOfDay(new Date(nowMs - (input.days - 1) * DAY)) : null;
  const sinceMs = since ? since.getTime() : -Infinity;
  const inPeriod = (ms: number) => ms >= sinceMs && ms <= nowMs + 60_000;

  const columns = [...input.columns].sort((a, b) => a.position - b.position || a.id - b.id);
  const colById = new Map(columns.map((c) => [c.id, c]));
  const { map: outcomes, guessed } = resolveOutcomes(columns);
  const isWon = (col: number | null) => col != null && outcomes.get(col) === "won";
  const isLost = (col: number | null) => col != null && outcomes.get(col) === "lost";
  const pipeline = columns.filter((c) => !isLost(c.id));
  const pipeIdx = new Map(pipeline.map((c, i) => [c.id, i]));

  // histórico por card, em ordem
  const byCard = new Map<string, KanbanCardMove[]>();
  for (const m of input.moves) {
    const k = m.card_id != null ? `c${m.card_id}` : `l${m.lead_id}`;
    const list = byCard.get(k);
    if (list) list.push(m);
    else byCard.set(k, [m]);
  }
  let historyStart = Infinity;
  const cards: { key: string; cardId: number | null; leadId: number; entry: number | null; stays: Stay[] }[] = [];
  for (const [key, list] of byCard) {
    list.sort((a, b) => t(a.at) - t(b.at) || a.id - b.id);
    const stays: Stay[] = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.seeded) historyStart = Math.min(historyStart, t(m.at));
      if (m.to_column_id == null) continue;
      const next = list[i + 1];
      stays.push({ col: m.to_column_id, start: t(m.at), end: next ? t(next.at) : null, seeded: m.seeded, value: num(m.value) });
    }
    const first = list[0];
    cards.push({ key, cardId: first.card_id, leadId: first.lead_id, entry: first.from_column_id == null && first.to_column_id != null ? t(first.at) : null, stays });
  }

  // os cards do período (entraram no quadro dentro dele)
  const cohort = cards.filter((c) => c.entry != null && inPeriod(c.entry));
  const reachedIdx = (c: (typeof cards)[number]) => Math.max(-1, ...c.stays.map((s) => pipeIdx.get(s.col) ?? -1));
  const maxIdx = cohort.map(reachedIdx);
  const cohortWonCards = cohort.filter((c) => c.stays.some((s) => isWon(s.col)));
  // tempo até a venda (só quem tem a data certa de entrada na etapa de ganho)
  const winDays: number[] = [];
  for (const c of cohortWonCards) {
    const s = c.stays.find((x) => isWon(x.col))!;
    if (!s.seeded) winDays.push(Math.max(0, (s.start - c.entry!) / DAY));
  }

  // vendas e perdas no período (entrou numa etapa de ganho/perda vindo de fora dela)
  const wonCards = new Map<string, number>();
  const wonAt = new Map<string, number>();
  const wonLeadOf = new Map<string, number>();
  const lostCards = new Set<string>();
  for (const c of cards) {
    let prev: number | null = null;
    for (const s of c.stays) {
      if (isWon(s.col) && !isWon(prev) && inPeriod(s.start)) { wonCards.set(c.key, s.value); wonLeadOf.set(c.key, c.leadId); wonAt.set(c.key, s.start); }
      if (isLost(s.col) && !isLost(prev) && inPeriod(s.start)) lostCards.add(c.key);
      prev = s.col;
    }
  }

  // agora
  const lastStay = new Map<number, Stay>();
  for (const c of cards) if (c.cardId != null && c.stays.length) lastStay.set(c.cardId, c.stays[c.stays.length - 1]);
  const leadName = new Map(input.leads.map((l) => [l.id, l.name]));
  const stale: StaleCard[] = [];
  for (const card of input.cards) {
    if (outcomes.has(card.column_id)) continue;
    const s = lastStay.get(card.id);
    if (!s || s.seeded || s.col !== card.column_id) continue;
    const days = (nowMs - s.start) / DAY;
    if (days >= STALE_DAYS) stale.push({ cardId: card.id, leadId: card.lead_id, name: leadName.get(card.lead_id) ?? "Lead", columnId: card.column_id, column: colById.get(card.column_id)?.title ?? "", days });
  }
  stale.sort((a, b) => b.days - a.days);

  const stageRow = (c: KanbanColumn, i: number | null, prevReached: number | null): StageRow => {
    const reached = i == null ? cohort.filter((x) => x.stays.some((s) => s.col === c.id)).length : maxIdx.filter((m) => m >= i).length;
    const durations = cards.flatMap((x) => x.stays).filter((s) => s.col === c.id && !s.seeded && s.end != null && inPeriod(s.end)).map((s) => (s.end! - s.start) / DAY);
    const here = input.cards.filter((x) => x.column_id === c.id);
    return {
      id: c.id,
      title: c.title,
      color: c.color,
      outcome: outcomes.get(c.id) ?? null,
      reached,
      pctOfEntered: cohort.length ? (reached / cohort.length) * 100 : null,
      pctOfPrev: prevReached ? (reached / prevReached) * 100 : null,
      now: here.length,
      nowValue: here.reduce((a, x) => a + num(x.value), 0),
      avgDays: durations.length ? durations.reduce((a, d) => a + d, 0) / durations.length : null,
      measured: durations.length,
      stale: stale.filter((s) => s.columnId === c.id).length,
    };
  };
  const stages: StageRow[] = [];
  pipeline.forEach((c, i) => stages.push(stageRow(c, i, i > 0 ? stages[i - 1].reached : null)));
  const lostStages = columns.filter((c) => isLost(c.id)).map((c) => stageRow(c, null, null));

  const openCards = input.cards.filter((c) => !outcomes.has(c.column_id));

  // leads novos e origens
  const newLeads = input.leads.filter((l) => inPeriod(t(l.created_at)));
  const wonLeads = new Set(cards.filter((c) => c.stays.some((s) => isWon(s.col))).map((c) => c.leadId));
  const originMap = new Map<string, { leads: number; won: number }>();
  for (const l of newLeads) {
    const o = l.origin?.trim() || "Sem origem";
    const cur = originMap.get(o) ?? { leads: 0, won: 0 };
    cur.leads++;
    if (wonLeads.has(l.id)) cur.won++;
    originMap.set(o, cur);
  }
  let origins = [...originMap].map(([origin, v]) => ({ origin, ...v })).sort((a, b) => b.leads - a.leads || a.origin.localeCompare(b.origin));
  if (origins.length > 6) {
    const rest = origins.slice(5);
    origins = [...origins.slice(0, 5), { origin: "Outras", leads: rest.reduce((a, r) => a + r.leads, 0), won: rest.reduce((a, r) => a + r.won, 0) }];
  }

  // por responsável
  const ownerOf = new Map(input.leads.map((l) => [l.id, l.owner_id ?? null]));
  const ownerRows = (input.owners?.length ? [...input.owners, { id: null, name: "Sem responsável", color: "var(--muted)" }] : []).map((o) => ({
    id: o.id as number | null, name: o.name, color: o.color, leads: 0, open: 0, openValue: 0, won: 0, wonValue: 0,
  }));
  if (ownerRows.length) {
    const known = new Set(ownerRows.map((o) => o.id));
    const row = (leadId: number) => { const id = ownerOf.get(leadId) ?? null; return ownerRows.find((o) => o.id === (known.has(id) ? id : null))!; };
    for (const l of newLeads) row(l.id).leads++;
    for (const c of openCards) { const r = row(c.lead_id); r.open++; r.openValue += num(c.value); }
    for (const [key, value] of wonCards) { const r = row(wonLeadOf.get(key)!); r.won++; r.wonValue += value; }
  }

  // gatilhos
  const trigTitle = new Map(input.triggers.map((x) => [x.id, x.title]));
  const trig = new Map<number, { fires: number; ok: number }>();
  for (const f of input.fires) {
    if (!inPeriod(t(f.created_at)) || !trigTitle.has(f.trigger_id)) continue;
    const cur = trig.get(f.trigger_id) ?? { fires: 0, ok: 0 };
    cur.fires++;
    if (OK_RESULTS.has(f.result)) cur.ok++;
    trig.set(f.trigger_id, cur);
  }

  // leads novos ao longo do tempo
  const firstLead = input.leads.reduce((m, l) => Math.min(m, t(l.created_at)), Infinity);
  const from = since ?? (Number.isFinite(firstLead) ? startOfDay(new Date(firstLead)) : startOfDay(now));
  const spanDays = (nowMs - from.getTime()) / DAY;
  const bucket: Bucket = spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";
  const series = buckets(from, now, bucket).map((start) => ({ start, label: bucketLabel(start, bucket), count: 0, won: 0, wonValue: 0 }));
  const bucketOf = (ms: number) => {
    for (let i = series.length - 1; i >= 0; i--) if (ms >= series[i].start.getTime()) return series[i];
    return series[0];
  };
  for (const l of newLeads) { const b = bucketOf(t(l.created_at)); if (b) b.count++; }
  for (const [key, value] of wonCards) { const b = bucketOf(wonAt.get(key)!); if (b) { b.won++; b.wonValue += value; } }

  return {
    since,
    outcomes,
    guessed,
    hasWon: [...outcomes.values()].includes("won"),
    newLeads: newLeads.length,
    entered: cohort.length,
    won: { count: wonCards.size, value: [...wonCards.values()].reduce((a, v) => a + v, 0) },
    lost: lostCards.size,
    conversion: cohort.length ? (cohortWonCards.length / cohort.length) * 100 : null,
    cohortWon: cohortWonCards.length,
    avgDaysToWin: winDays.length ? winDays.reduce((a, d) => a + d, 0) / winDays.length : null,
    open: { count: openCards.length, value: openCards.reduce((a, c) => a + num(c.value), 0) },
    stages,
    lostStages,
    stale,
    origins: origins.map((o) => ({ ...o, pct: o.leads ? (o.won / o.leads) * 100 : null })),
    owners: ownerRows.filter((o) => o.id != null || o.leads || o.open || o.won),
    triggers: [...trig].map(([id, v]) => ({ id, title: trigTitle.get(id)!, fires: v.fires, ok: v.ok, problems: v.fires - v.ok })).sort((a, b) => b.fires - a.fires),
    bucket,
    series,
    historySince: Number.isFinite(historyStart) ? new Date(historyStart) : null,
  };
}

// ── datas ─────────────────────────────────────────────────

export function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfBucket(d: Date, b: Bucket) {
  const x = startOfDay(d);
  if (b === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // segunda-feira
  if (b === "month") x.setDate(1);
  return x;
}
function nextBucket(d: Date, b: Bucket) {
  const x = new Date(d);
  if (b === "day") x.setDate(x.getDate() + 1);
  else if (b === "week") x.setDate(x.getDate() + 7);
  else x.setMonth(x.getMonth() + 1);
  return x;
}
function buckets(from: Date, to: Date, b: Bucket) {
  const out: Date[] = [];
  for (let d = startOfBucket(from, b); d <= to && out.length < 400; d = nextBucket(d, b)) out.push(d);
  return out;
}
function bucketLabel(d: Date, b: Bucket) {
  if (b === "month") return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "").replace(" de ", "/");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── formatação ────────────────────────────────────────────

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pct = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 }) + "%");

/** 0,4 -> "10 h"; 2,25 -> "2,3 dias"; 1 -> "1 dia" */
export function formatDays(d: number | null) {
  if (d == null) return "—";
  if (d < 1 / 24) return "menos de 1 h";
  if (d < 1) return `${Math.round(d * 24)} h`;
  const r = Math.round(d * 10) / 10;
  return `${r.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${r === 1 ? "dia" : "dias"}`;
}
