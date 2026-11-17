"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Film, FileText, Image as ImageIcon, Lightbulb, Loader2, MessageSquareText, Mic, PenLine, Reply, Sparkles, Sunrise, TrendingUp, Workflow, X } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import type { FunnelProposal, StaleLead } from "@/lib/ai/zf-ai";
import { buildLibItems, libraryProgress } from "@/lib/ai/context";
import { aiError, useAiRuntime, useLogRun } from "@/hooks/use-ai";
import {
  SUGGESTION_KIND, leadHistories, recentMoves, recentRuns, useCreateProposedFunnel, useLatestBriefing, useResolveSuggestion,
  useSaveBriefing, useScheduleFollowups, useSuggestions,
} from "@/hooks/use-manager";
import { useLeads, useTags } from "@/hooks/use-leads";
import { useAllColumns, useBoards } from "@/hooks/use-kanban";
import { useTasks } from "@/hooks/use-tasks";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { useFunnels } from "@/hooks/use-funnels";
import { Button, Chip, EmptyState, Panel } from "@/components/ui/shared";
import { Field, Section, Segmented, areaCls, fmtTokens, inputCls } from "./agent-ui";
import { cn } from "@/lib/utils";
import type { AgentSuggestion, Briefing } from "@/types";
import { toast } from "sonner";

type Sub = "resumo" | "retomar" | "sugestoes" | "funil";
const TEMP: Record<string, { label: string; tone: "hot" | "warn" | "cold" }> = { hot: { label: "Quente", tone: "hot" }, warm: { label: "Morno", tone: "warn" }, cold: { label: "Frio", tone: "cold" } };
const KIND_ICON: Record<string, typeof Mic> = { text: MessageSquareText, audio: Mic, image: ImageIcon, video: Film, document: FileText };
const KIND_NAME: Record<string, string> = { text: "Texto", audio: "Áudio", image: "Imagem", video: "Vídeo", document: "Documento" };

function waitLabel(min: number) {
  if (!min) return "na hora";
  if (min < 60) return `${min} min depois`;
  if (min < 1440) return `${Math.round(min / 60)} h depois`;
  const d = Math.round(min / 1440);
  return `${d} ${d === 1 ? "dia" : "dias"} depois`;
}

/** Tudo que o gerente precisa ler do banco (já carregado pelas telas do painel). */
function useManagerData() {
  const leads = useLeads();
  const columns = useAllColumns();
  const boards = useBoards();
  const tags = useTags();
  const tasks = useTasks();
  const media = useAllMedia();
  const messages = useMessages();
  const funnels = useFunnels();
  const loading = leads.isLoading || columns.isLoading || boards.isLoading || tags.isLoading || tasks.isLoading;
  return {
    loading,
    rows: { leads: leads.data ?? [], columns: columns.data ?? [], boards: boards.data ?? [], tags: tags.data ?? [], tasks: tasks.data ?? [] },
    media: media.data ?? [], messages: messages.data ?? [], funnels: funnels.data ?? [],
  };
}

export function ManagerTab() {
  const [sub, setSub] = useState<Sub>("resumo");
  const [funnelGoal, setFunnelGoal] = useState("");
  const suggestions = useSuggestions();
  const pending = suggestions.data?.length ?? 0;
  const { rt } = useAiRuntime();

  if (!rt.ready) return <EmptyState icon={Sparkles} title="Conecte a IA primeiro" description="O gerente usa a sua chave (aba Conexão) para analisar a operação." />;

  return (
    <div className="flex flex-col gap-5">
      <Segmented<Sub> label="Seções do gerente" value={sub} onChange={setSub}
        options={[["resumo", "Resumo do dia"], ["retomar", "Retomar conversas"], ["sugestoes", pending ? `Sugestões (${pending})` : "Sugestões"], ["funil", "Montar funil"]]} />
      {sub === "resumo" && <BriefingPanel onFunnel={(g) => { setFunnelGoal(g); setSub("funil"); }} onSuggestions={() => setSub("sugestoes")} />}
      {sub === "retomar" && <FollowupPanel />}
      {sub === "sugestoes" && <SuggestionsPanel />}
      {sub === "funil" && <FunnelPanel key={funnelGoal} initialGoal={funnelGoal} />}
    </div>
  );
}

/* ================================================================ resumo do dia */

function BriefingPanel({ onFunnel, onSuggestions }: { onFunnel: (goal: string) => void; onSuggestions: () => void }) {
  const { rt, data } = useAiRuntime();
  const d = useManagerData();
  const latest = useLatestBriefing();
  const saveBriefing = useSaveBriefing();
  const logRun = useLogRun();
  const suggestions = useSuggestions();
  const [busy, setBusy] = useState(false);

  if (latest.data?.oldDb) return <EmptyState icon={AlertTriangle} title="Falta atualizar o banco" description="Rode o supabase/setup.sql de novo no Supabase para ativar o Gerente." />;

  async function generate() {
    setBusy(true);
    const t0 = new Date().getTime();
    try {
      const [runs, moves] = await Promise.all([recentRuns(7), recentMoves(7)]);
      const prog = libraryProgress(d.media, d.messages);
      const total = prog.media.total + prog.texts.total;
      const snap = ZF_AI.buildManagerSnapshot({
        ...d.rows, now: new Date(), runs, moves, suggestions: suggestions.data ?? [],
        library: { itens: total, nao_lidos_pela_ia: total - prog.media.done - prog.texts.done },
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      } as Parameters<typeof ZF_AI.buildManagerSnapshot>[0]);
      const r = await ZF_AI.runBriefing({ provider: rt.provider, key: rt.key, model: rt.modelChat, snapshot: snap, profile: data?.settings.profile as Record<string, unknown> });
      const { usage, model, ...briefing } = r;
      await saveBriefing.mutateAsync({ briefing, model, totais: { ...snap.totais, atrasadas: snap.tarefas.atrasadas, vendas_7d: snap.resultados_7d.vendas } });
      logRun.mutate({ source: "manager", provider: rt.provider, model, input_tokens: usage.input, output_tokens: usage.output, cache_read_tokens: usage.cacheRead, duration_ms: new Date().getTime() - t0, summary: `Resumo do dia: ${briefing.titulo}` });
    } catch (e) {
      toast.error(aiError(e));
    } finally {
      setBusy(false);
    }
  }

  const rep = latest.data?.report;
  const b: Briefing | null = rep?.content?.briefing ?? null;
  const tot = rep?.content?.totais ?? {};
  const when = rep ? new Date(rep.created_at) : null;
  const isToday = when ? when.toDateString() === new Date().toDateString() : false;

  return (
    <div className="flex flex-col gap-5">
      <Section icon={Sunrise} title="Resumo do dia"
        description="O gerente olha leads, Kanban, tarefas e o que o agente fez na semana, e diz onde focar hoje."
        aside={<Button onClick={generate} disabled={busy || d.loading}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {b ? "Gerar de novo" : "Gerar resumo"}</Button>}>
        {busy && <p className="text-sm text-muted flex items-center gap-2" role="status"><Loader2 className="w-4 h-4 animate-spin" /> Analisando a operação…</p>}
        {!b && !busy && <p className="text-sm text-muted">Nenhum resumo ainda. Gere um ao começar o dia (usa a sua IA, uma chamada).</p>}
        {b && (
          <div className="flex flex-col gap-5" aria-label="Resumo">
            <div>
              <p className="text-xs text-muted">{isToday ? "Hoje" : "Gerado em"} {when?.toLocaleString("pt-BR", { dateStyle: isToday ? undefined : "short", timeStyle: "short" })}{!isToday && " · gere de novo para atualizar"}</p>
              <h3 className="text-lg font-semibold mt-1">{b.titulo}</h3>
              {b.resumo && <p className="text-sm text-muted mt-1 leading-relaxed">{b.resumo}</p>}
            </div>
            {Object.keys(tot).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([["leads", "Leads"], ["quentes", "Quentes"], ["parados_3d_ou_mais", "Parados 3+ dias"], ["atrasadas", "Tarefas atrasadas"], ["vendas_7d", "Vendas na semana"]] as const).map(([k, l]) => (
                  <div key={k} className="rounded-xl bg-surface px-3 py-2.5">
                    <p className="text-xs text-muted">{l}</p>
                    <p className="text-xl font-semibold tabular-nums">{tot[k] ?? 0}</p>
                  </div>
                ))}
              </div>
            )}
            {b.prioridades.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Prioridades</h4>
                <ol className="flex flex-col gap-2">
                  {b.prioridades.map((p, i) => (
                    <li key={p.lead_id} className="rounded-xl border border-line px-4 py-3 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-accent-soft text-accent-fg text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/dashboard/leads?lead=${p.lead_id}`} className="font-semibold hover:underline">{p.nome}</Link>
                        <p className="text-sm text-muted leading-relaxed">{p.motivo}</p>
                        {p.acao && <p className="text-sm mt-1 flex items-start gap-1.5"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-accent-fg" /> {p.acao}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              {b.alertas.length > 0 && (
                <div className="rounded-xl bg-warn-soft p-4">
                  <h4 className="text-sm font-semibold text-warn flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Atenção</h4>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm list-disc pl-5">{b.alertas.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
              {b.oportunidades.length > 0 && (
                <div className="rounded-xl bg-ok-soft p-4">
                  <h4 className="text-sm font-semibold text-ok flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Oportunidades</h4>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm list-disc pl-5">{b.oportunidades.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
            </div>
            {b.recomendacoes.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Recomendações</h4>
                {b.recomendacoes.map((r) => (
                  <div key={r.texto} className="rounded-xl bg-surface px-4 py-3 flex flex-wrap items-center gap-3">
                    <Lightbulb className="w-4 h-4 text-accent-fg shrink-0" />
                    <p className="text-sm flex-1 basis-60">{r.texto}</p>
                    {r.tipo === "funil" && <Button size="sm" variant="secondary" onClick={() => onFunnel(r.texto)}><Workflow className="w-3.5 h-3.5" /> Montar este funil</Button>}
                    {r.tipo === "biblioteca" && <Button size="sm" variant="secondary" onClick={onSuggestions}>Ver sugestões</Button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ============================================================ retomar conversas */

function FollowupPanel() {
  const { rt, data } = useAiRuntime();
  const d = useManagerData();
  const logRun = useLogRun();
  const schedule = useScheduleFollowups();
  const [days, setDays] = useState(3);
  const [picked, setPicked] = useState<number[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, { texto: string; motivo: string }>>({});
  const [writing, setWriting] = useState(false);

  const stale: StaleLead[] = useMemo(
    () => ZF_AI.staleLeads({ ...d.rows, now: new Date() } as Parameters<typeof ZF_AI.staleLeads>[0], { days, limit: 30 }),
    [d.rows, days],
  );
  const byId = useMemo(() => new Map(d.rows.leads.map((l) => [l.id, l])), [d.rows.leads]);

  if (d.loading) return <span className="skeleton h-60 block" />;

  const selected = (picked ?? stale.slice(0, 5).map((l) => l.id)).filter((id) => stale.some((l) => l.id === id));
  const toggle = (id: number) => setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const ready = selected.filter((id) => drafts[id]?.texto.trim());

  async function write() {
    const target = stale.filter((l) => selected.includes(l.id)).slice(0, 10);
    if (!target.length) return;
    setWriting(true);
    const t0 = new Date().getTime();
    try {
      const hist = await leadHistories(target.map((l) => l.id));
      const r = await ZF_AI.writeFollowups({
        provider: rt.provider, key: rt.key, model: rt.modelChat, profile: data?.settings.profile as Record<string, unknown>,
        leads: target.map((l) => ({ ...l, history: (hist.get(l.id) ?? []).map((m) => ({ from_me: m.from_me, by_zapflow: m.by_zapflow, kind: m.kind, body: m.body, at: m.at })) })),
      });
      setDrafts((cur) => { const n = { ...cur }; for (const m of r.mensagens) n[m.lead_id] = { texto: m.texto, motivo: m.motivo }; return n; });
      const missing = target.length - r.mensagens.length;
      if (missing > 0) toast(`${missing} lead(s) ficaram sem mensagem. Escreva você ou tente de novo.`);
      logRun.mutate({ source: "manager", provider: rt.provider, model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output, cache_read_tokens: r.usage.cacheRead, duration_ms: new Date().getTime() - t0, summary: `Mensagens de retomada para ${r.mensagens.length} lead(s)` });
    } catch (e) {
      toast.error(aiError(e));
    } finally {
      setWriting(false);
    }
  }

  async function doSchedule() {
    const items = ready.map((id) => {
      const l = byId.get(id);
      return l ? { lead: { id: l.id, name: l.name, phone: l.phone, wa_id: l.wa_id }, text: drafts[id].texto } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    if (!items.length) return;
    if (!window.confirm(`Agendar ${items.length} ${items.length === 1 ? "mensagem" : "mensagens"}? A extensão envia uma por vez, a primeira em ~2 min e as outras a cada 4–8 min, com "digitando…". Se o cliente responder antes, aquele envio é cancelado.`)) return;
    await schedule.mutateAsync(items);
    setDrafts((cur) => { const n = { ...cur }; for (const it of items) delete n[it.lead.id]; return n; });
    setPicked(null);
  }

  return (
    <Section icon={Reply} title="Retomar conversas paradas"
      description="Leads em etapas abertas que não respondem há alguns dias. O gerente escreve uma mensagem personalizada para cada um, a partir da conversa; você revisa e agenda."
      aside={
        <label className="flex items-center gap-2 text-sm text-muted shrink-0">
          Parados há
          <select aria-label="Parados há quantos dias" className={cn(inputCls, "w-auto h-9 pr-8 cursor-pointer")} value={days} onChange={(e) => { setDays(Number(e.target.value)); setPicked(null); }}>
            {[2, 3, 5, 7, 14, 30].map((n) => <option key={n} value={n}>{n}+ dias</option>)}
          </select>
        </label>
      }>
      {stale.length === 0 ? (
        <p className="text-sm text-muted py-4">Nenhum lead parado há {days}+ dias em etapa aberta. Leads ganhos, perdidos, com etiqueta de ignorar ou que já têm envio agendado ficam de fora.</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line overflow-hidden" aria-label="Leads parados">
            {stale.map((l) => {
              const on = selected.includes(l.id);
              const t = TEMP[l.temperature];
              const dr = drafts[l.id];
              return (
                <li key={l.id} className={cn("px-4 py-3 flex flex-col gap-2", on && "bg-surface/60")}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggle(l.id)} aria-label={`Incluir ${l.name}`} className="w-4 h-4 mt-1 accent-[var(--fg)] cursor-pointer shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{l.name}</span>
                        {t && <Chip tone={t.tone}>{t.label}</Chip>}
                        <span className="text-xs text-muted">{l.days} {l.days === 1 ? "dia" : "dias"} sem responder{l.stage ? ` · ${l.stage}` : ""}</span>
                      </span>
                      {(l.last_message || l.notes) && <span className="block text-sm text-muted truncate">{l.last_message ? `Última: “${l.last_message}”` : l.notes}</span>}
                    </span>
                  </label>
                  {on && dr && (
                    <div className="pl-7 flex flex-col gap-1">
                      <textarea aria-label={`Mensagem para ${l.name}`} rows={2} className={areaCls} value={dr.texto} onChange={(e) => setDrafts((cur) => ({ ...cur, [l.id]: { ...cur[l.id], texto: e.target.value } }))} />
                      {dr.motivo && <p className="text-xs text-muted">{dr.motivo}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={ready.length ? "secondary" : "primary"} onClick={write} disabled={writing || !selected.length}>
              {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />} {Object.keys(drafts).length ? "Escrever de novo" : "Escrever mensagens"} ({Math.min(selected.length, 10)})
            </Button>
            <Button onClick={doSchedule} disabled={!ready.length || schedule.isPending}>
              {schedule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Agendar {ready.length || ""} envio{ready.length === 1 ? "" : "s"}
            </Button>
            <span className="text-xs text-muted basis-full sm:basis-auto">No máximo 10 por vez. {"{nome}"} vira o primeiro nome do cliente.</span>
          </div>
        </>
      )}
    </Section>
  );
}

/* ================================================================== sugestões */

function SuggestionRow({ s }: { s: AgentSuggestion }) {
  const resolve = useResolveSuggestion();
  const [title, setTitle] = useState(s.title);
  const [content, setContent] = useState(s.content ?? "");
  const isText = s.kind === "texto";
  return (
    <li className="px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone="accent">{SUGGESTION_KIND[s.kind] ?? s.kind}</Chip>
        {s.times > 1 && <Chip tone="warn">pedida {s.times}x</Chip>}
        <span className="text-xs text-muted">{new Date(s.updated_at).toLocaleDateString("pt-BR")}</span>
        {s.lead_id && <Link href={`/dashboard/leads?lead=${s.lead_id}`} className="text-xs text-muted hover:text-fg underline">ver o lead</Link>}
      </div>
      <Field label="Título" htmlFor={`sg-t-${s.id}`}><input id={`sg-t-${s.id}`} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label={isText ? "Texto pronto" : "Roteiro do que gravar ou produzir"} htmlFor={`sg-c-${s.id}`} hint={s.reason ? `Por quê: ${s.reason}` : undefined}>
        <textarea id={`sg-c-${s.id}`} rows={3} className={areaCls} value={content} onChange={(e) => setContent(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {isText
          ? <Button size="sm" onClick={() => resolve.mutate({ s, action: "text", title, content })} disabled={resolve.isPending}><Check className="w-3.5 h-3.5" /> Criar texto pronto</Button>
          : <Button size="sm" onClick={() => resolve.mutate({ s, action: "task", title, content })} disabled={resolve.isPending}><CalendarClock className="w-3.5 h-3.5" /> Lembrete para gravar</Button>}
        <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ s, action: "dismiss" })} disabled={resolve.isPending}><X className="w-3.5 h-3.5" /> Descartar</Button>
      </div>
    </li>
  );
}

function SuggestionsPanel() {
  const q = useSuggestions();
  if (q.isLoading) return <span className="skeleton h-40 block" />;
  if (q.data === null) return <EmptyState icon={AlertTriangle} title="Falta atualizar o banco" description="Rode o supabase/setup.sql de novo no Supabase para ativar as sugestões." />;
  const list = q.data ?? [];
  return (
    <Section icon={Lightbulb} title="Sugestões para a biblioteca"
      description="Quando um cliente pergunta algo que a biblioteca não cobre, o agente anota aqui. As que se repetem sobem para o topo.">
      {list.length === 0
        ? <p className="text-sm text-muted py-4">Nada por enquanto. Conforme o copiloto e o automático conversam, as lacunas da biblioteca aparecem aqui.</p>
        : <ul className="flex flex-col divide-y divide-line rounded-xl border border-line overflow-hidden" aria-label="Sugestões">{list.map((s) => <SuggestionRow key={s.id} s={s} />)}</ul>}
    </Section>
  );
}

/* ================================================================ montar funil */

const GOALS = ["Boas-vindas para quem acabou de chegar", "Reengajar quem pediu preço e sumiu", "Pós-venda: agradecer e pedir indicação"];

function FunnelPanel({ initialGoal }: { initialGoal: string }) {
  const { rt, data } = useAiRuntime();
  const d = useManagerData();
  const logRun = useLogRun();
  const create = useCreateProposedFunnel();
  const [goal, setGoal] = useState(initialGoal);
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState<FunnelProposal | null>(null);
  const [title, setTitle] = useState("");
  const [createdId, setCreatedId] = useState<number | null>(null);

  const library = useMemo(() => buildLibItems(d.messages, d.media, d.funnels), [d.messages, d.media, d.funnels]);

  async function propose() {
    setBusy(true);
    setCreatedId(null);
    const t0 = new Date().getTime();
    try {
      const r = await ZF_AI.proposeFunnel({ provider: rt.provider, key: rt.key, model: rt.modelChat, library, goal, profile: data?.settings.profile as Record<string, unknown> });
      setProp(r);
      setTitle(r.titulo);
      logRun.mutate({ source: "manager", provider: rt.provider, model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output, cache_read_tokens: r.usage.cacheRead, duration_ms: new Date().getTime() - t0, summary: `Funil proposto: ${r.titulo} (${r.passos.length} passos)` });
    } catch (e) {
      toast.error(aiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doCreate() {
    if (!prop) return;
    const id = await create.mutateAsync({ titulo: title, descricao: prop.descricao, passos: prop.passos });
    setCreatedId(id);
  }

  const unread = library.filter((i) => i.kind !== "text" && i.kind !== "funnel" && !i.summary && !i.transcript).length;

  return (
    <Section icon={Workflow} title="Montar funil" description="Diga o objetivo e o gerente monta uma sequência com os itens da sua biblioteca, com as esperas entre eles. Nada é criado até você aprovar.">
      <Field label="Objetivo do funil" htmlFor="fn-goal">
        <textarea id="fn-goal" rows={2} className={areaCls} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex.: reengajar quem pediu preço e sumiu" />
      </Field>
      <div className="flex flex-wrap gap-2" aria-label="Ideias de objetivo">
        {GOALS.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} className="h-8 px-3 rounded-full border border-line text-sm text-muted hover:text-fg hover:bg-surface cursor-pointer">{g}</button>)}
      </div>
      {unread > 0 && <p className="text-xs text-warn">{unread} item(ns) da biblioteca ainda não foram lidos pela IA: o gerente só vê o título deles.</p>}
      <div><Button onClick={propose} disabled={busy || !goal.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {prop ? "Propor outro" : "Propor funil"}</Button></div>

      {prop && (
        <Panel className="p-4 flex flex-col gap-4" aria-label="Funil proposto">
          <Field label="Nome do funil" htmlFor="fn-title"><input id="fn-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          {prop.descricao && <p className="text-sm text-muted">{prop.descricao}</p>}
          <ol className="flex flex-col gap-2">
            {prop.passos.map((s, i) => {
              const KI = KIND_ICON[s.kind] ?? MessageSquareText;
              return (
                <li key={s.ref} className="flex items-start gap-3 rounded-xl bg-surface px-3 py-2.5">
                  <span className="w-6 h-6 rounded-full bg-card text-xs font-bold grid place-items-center shrink-0">{i + 1}</span>
                  <KI className="w-4 h-4 mt-1 text-muted shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><strong>{s.title}</strong> <span className="text-muted">· {KIND_NAME[s.kind]} · {waitLabel(s.delay_minutes)}</span></p>
                    {s.motivo && <p className="text-xs text-muted">{s.motivo}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            {createdId
              ? <><Chip tone="ok"><Check className="w-3 h-3" /> Funil criado</Chip><Link href="/dashboard/funis" className="text-sm underline">Abrir em Funis</Link></>
              : <Button onClick={doCreate} disabled={create.isPending || !title.trim()}>{create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Criar este funil</Button>}
            <span className="text-xs text-muted">{fmtTokens(prop.usage.input + prop.usage.output)} tokens</span>
          </div>
        </Panel>
      )}
    </Section>
  );
}
