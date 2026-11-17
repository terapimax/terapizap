"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, ChevronDown, FileText, Hand, Lightbulb, ListChecks, Loader2, RotateCcw, Send, StickyNote, Tag, ThumbsDown, ThumbsUp, Thermometer, Columns3, FlaskConical } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import type { AgentAction, HistoryMessage, LibItem, RunResult, Usage } from "@/lib/ai/zf-ai";
import { buildCatalogRefs, buildLibItems, buildStages, buildTagRefs } from "@/lib/ai/context";
import { useAiRuntime, useLogRun, useRunFeedback } from "@/hooks/use-ai";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { useFunnels } from "@/hooks/use-funnels";
import { useAllColumns, useBoards } from "@/hooks/use-kanban";
import { useTags } from "@/hooks/use-leads";
import { useCatalog } from "@/hooks/use-catalog";
import { Button, Chip, EmptyState, Panel } from "@/components/ui/shared";
import { Field, areaCls, fmtTokens, inputCls } from "./agent-ui";
import { cn } from "@/lib/utils";
import type { MediaItem } from "@/types";
import { toast } from "sonner";

interface ClientMsg { id: number; role: "client"; text: string; at: string }
interface AgentTurn {
  id: number;
  role: "agent";
  at: string;
  actions: AgentAction[];
  note: string;
  trace: RunResult["trace"];
  usage: Usage;
  ms: number;
  stop: RunResult["stop"];
  runId?: number;
  feedback?: -1 | 1 | null;
  error?: string;
}
type Entry = ClientMsg | AgentTurn;

const STARTERS = ["Oi, vi o anúncio de vocês. Como funciona?", "Quanto custa?", "Quero marcar para sábado de manhã", "Achei caro, tem desconto?", "Obrigado, vou pensar"];
const TEMP_LABEL = { hot: "Quente", warm: "Morna", cold: "Fria" } as const;
const TEMP_TONE = { hot: "hot", warm: "warn", cold: "cold" } as const;

const firstName = (n: string) => (n.trim().split(/\s+/)[0] ?? "");

/** O que cada item enviado vira no histórico que o agente enxerga na próxima rodada. */
function historyOf(entries: Entry[], lib: Map<string, LibItem>, leadName: string): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const e of entries) {
    if (e.role === "client") { out.push({ from_me: false, kind: "text", body: e.text, at: e.at }); continue; }
    for (const a of e.actions) {
      if (a.type === "send_text") out.push({ from_me: true, by_zapflow: true, kind: "text", body: a.text.replace(/\{nome\}/gi, firstName(leadName)), at: e.at });
      else if (a.type === "send_item") {
        const it = lib.get(a.ref);
        const k = a.kind === "audio" || a.kind === "image" || a.kind === "video" || a.kind === "document" ? a.kind : "text";
        out.push({ from_me: true, by_zapflow: true, kind: k, body: k === "text" ? (it?.text ?? a.title) : a.title, at: e.at });
      }
    }
  }
  return out;
}

export function SimulatorTab({ goTo }: { goTo: (tab: "conexao" | "biblioteca") => void }) {
  const { rt, data } = useAiRuntime();
  const messages = useMessages();
  const media = useAllMedia();
  const funnels = useFunnels();
  const boards = useBoards();
  const columns = useAllColumns();
  const tags = useTags();
  const catalog = useCatalog();
  const logRun = useLogRun();
  const feedback = useRunFeedback();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [leadName, setLeadName] = useState("Marina Costa");
  const [busy, setBusy] = useState(false);
  const seq = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const libItems = useMemo(() => buildLibItems(messages.data ?? [], media.data ?? [], funnels.data ?? []), [messages.data, media.data, funnels.data]);
  const libMap = useMemo(() => new Map(libItems.map((i) => [i.ref, i])), [libItems]);
  const mediaById = useMemo(() => new Map((media.data ?? []).map((m) => [m.id, m])), [media.data]);
  const stages = useMemo(() => buildStages(boards.data ?? [], columns.data ?? []), [boards.data, columns.data]);
  const tagRefs = useMemo(() => buildTagRefs(tags.data ?? []), [tags.data]);
  const catalogRefs = useMemo(() => buildCatalogRefs(catalog.data), [catalog.data]);

  // o que o agente "decidiu" até agora sobre este lead de teste
  const state = useMemo(() => {
    let temp: keyof typeof TEMP_LABEL | null = null;
    let stage: string | null = null;
    const tagNames: string[] = [];
    const notes: string[] = [];
    const tasks: string[] = [];
    let handoff = false;
    for (const e of entries) {
      if (e.role !== "agent") continue;
      for (const a of e.actions) {
        if (a.type === "set_temperature") temp = a.value;
        else if (a.type === "move_stage") stage = `${a.board} › ${a.title}`;
        else if (a.type === "add_tag" && !tagNames.includes(a.name)) tagNames.push(a.name);
        else if (a.type === "add_note") notes.push(a.text);
        else if (a.type === "create_task") tasks.push(a.title);
        else if (a.type === "handoff") handoff = true;
      }
    }
    return { temp, stage, tagNames, notes, tasks, handoff };
  }, [entries]);

  // o agente só pode conversar depois de enxergar tudo (biblioteca, etapas, etiquetas, catálogo)
  const loading = [messages, media, funnels, boards, columns, tags, catalog].some((q) => q.isLoading);

  if (!data) return <span className="skeleton h-72 block" />;
  if (!rt.ready) {
    return (
      <EmptyState icon={FlaskConical} title="Conecte a IA para testar"
        description="O simulador conversa com o agente de verdade, usando a sua chave. Nada é enviado a clientes: é só um teste."
        action={<Button onClick={() => goTo("conexao")}>Ir para Conexão</Button>} />
    );
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || loading) return;
    const now = new Date().toISOString();
    const client: ClientMsg = { id: seq.current++, role: "client", text: t, at: now };
    const after = [...entries, client];
    setEntries(after);
    setDraft("");
    setBusy(true);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);

    const sentRefs = after.flatMap((e) => (e.role === "agent" ? e.actions.filter((a): a is Extract<AgentAction, { type: "send_item" }> => a.type === "send_item").map((a) => a.ref) : []));
    const env = {
      profile: data!.settings.profile as Record<string, unknown>,
      library: libItems, catalog: catalogRefs, stages, tags: tagRefs, now: new Date(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sentRefs,
      lead: { name: leadName.trim() || "Cliente", temperature: state.temp ? TEMP_LABEL[state.temp].toLowerCase() : undefined, stage: state.stage ?? undefined, tags: state.tagNames, notes: state.notes.join(" | ") || undefined, tasks: state.tasks },
    };
    const started = new Date().getTime();
    try {
      const res = await ZF_AI.runAgent({
        provider: rt.provider, key: rt.key, model: rt.modelChat,
        system: ZF_AI.buildSystem(env),
        messages: [{ role: "user", content: ZF_AI.buildTurnMessage(historyOf(after, libMap, leadName)) }],
        tools: ZF_AI.makeAgentTools(env),
      });
      const ms = new Date().getTime() - started;
      const turn: AgentTurn = { id: seq.current++, role: "agent", at: new Date().toISOString(), actions: res.actions, note: res.text, trace: res.trace, usage: res.usage, ms, stop: res.stop };
      setEntries((cur) => [...cur, turn]);
      logRun.mutateAsync({
        source: "simulator", provider: rt.provider, model: res.model, input_tokens: res.usage.input, output_tokens: res.usage.output, cache_read_tokens: res.usage.cacheRead,
        duration_ms: ms, summary: res.text.slice(0, 300), actions: res.actions as unknown[],
      }).then((runId) => setEntries((cur) => cur.map((e) => (e.id === turn.id ? { ...e, runId } : e)))).catch(() => {});
    } catch (e) {
      const msg = (e as Error).message || "Falha ao falar com a IA.";
      setEntries((cur) => [...cur, { id: seq.current++, role: "agent", at: new Date().toISOString(), actions: [], note: "", trace: [], usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, ms: new Date().getTime() - started, stop: "end", error: msg }]);
      toast.error(msg);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }

  function reset() {
    if (entries.length && !window.confirm("Começar uma nova conversa de teste?")) return;
    setEntries([]);
    setDraft("");
  }

  function rate(turn: AgentTurn, value: -1 | 1) {
    const next = turn.feedback === value ? null : value;
    setEntries((cur) => cur.map((e) => (e.id === turn.id ? { ...e, feedback: next } : e)));
    if (turn.runId) feedback.mutate({ id: turn.runId, feedback: next });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
      <Panel className="flex flex-col overflow-hidden min-h-[60vh]">
        <div className="px-4 py-3 border-b border-line flex items-center gap-3 bg-surface/50">
          <FlaskConical className="w-4 h-4 text-muted shrink-0" />
          <p className="text-sm text-muted flex-1 min-w-0">Teste de verdade, mas <strong className="text-fg">nada é enviado</strong> a ninguém. Use {rt.provider === "anthropic" ? "Claude" : "OpenAI"} · <span className="font-mono text-xs">{rt.modelChat}</span></p>
          <Button variant="ghost" size="sm" onClick={reset} disabled={busy || !entries.length}><RotateCcw className="w-3.5 h-3.5" /> Nova conversa</Button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex flex-col gap-4 max-h-[62vh]" aria-live="polite">
          {entries.length === 0 && (
            <div className="m-auto text-center max-w-sm py-10">
              <Bot className="w-8 h-8 text-muted mx-auto mb-3" />
              <p className="font-semibold">Converse como se fosse um cliente</p>
              <p className="text-sm text-muted mt-1 mb-4">Veja o que o agente responde, qual item da biblioteca escolhe e como classifica o lead.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => <button key={s} type="button" disabled={loading} onClick={() => send(s)} className="px-3 py-1.5 rounded-full border border-line text-xs hover:bg-surface cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{s}</button>)}
              </div>
            </div>
          )}
          {entries.map((e) => (e.role === "client"
            ? <div key={e.id} className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-surface px-3.5 py-2 text-sm whitespace-pre-wrap">{e.text}</div>
            : <AgentBlock key={e.id} turn={e} libMap={libMap} mediaById={mediaById} leadName={leadName} onRate={(v) => rate(e, v)} />))}
          {busy && <div className="self-start text-sm text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> O agente está pensando…</div>}
          <div ref={endRef} />
        </div>

        <form className="border-t border-line p-3 flex gap-2 items-end" onSubmit={(ev) => { ev.preventDefault(); send(draft); }}>
          <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Mensagem do cliente"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
            placeholder={loading ? "Carregando a biblioteca…" : "Escreva como o cliente…"} disabled={loading} className={cn(areaCls, "min-h-10 max-h-32 resize-none")} />
          <Button type="submit" disabled={busy || loading || !draft.trim()}><Send className="w-4 h-4" /> Enviar</Button>
        </form>
      </Panel>

      <aside className="flex flex-col gap-4">
        <Panel className="p-4 flex flex-col gap-3">
          <Field label="Nome do lead de teste" htmlFor="sim-name"><input id="sim-name" className={inputCls} value={leadName} onChange={(e) => setLeadName(e.target.value)} /></Field>
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-xs font-medium text-muted">O que o agente concluiu</p>
            <div className="flex items-center gap-2"><Thermometer className="w-4 h-4 text-muted" />{state.temp ? <Chip tone={TEMP_TONE[state.temp]}>{TEMP_LABEL[state.temp]}</Chip> : <span className="text-muted">Sem temperatura ainda</span>}</div>
            <div className="flex items-center gap-2"><Columns3 className="w-4 h-4 text-muted" />{state.stage ? <span className="font-medium">{state.stage}</span> : <span className="text-muted">Sem etapa ainda</span>}</div>
            {state.tagNames.length > 0 && <div className="flex items-center gap-2 flex-wrap"><Tag className="w-4 h-4 text-muted" />{state.tagNames.map((t) => <Chip key={t}>{t}</Chip>)}</div>}
            {state.tasks.length > 0 && <div className="flex items-start gap-2"><ListChecks className="w-4 h-4 text-muted mt-0.5" /><span>{state.tasks.join("; ")}</span></div>}
            {state.notes.length > 0 && <div className="flex items-start gap-2"><StickyNote className="w-4 h-4 text-muted mt-0.5" /><span className="text-muted">{state.notes.join(" · ")}</span></div>}
            {state.handoff && <Chip tone="warn"><Hand className="w-3 h-3" /> Pediu para você assumir</Chip>}
          </div>
        </Panel>
        <p className="text-xs text-muted leading-relaxed px-1">
          O agente só usa o que está na sua <button type="button" className="underline cursor-pointer" onClick={() => goTo("biblioteca")}>biblioteca lida pela IA</button>. Se ele errar, corrija o item ou o treino e teste de novo.
          {libItems.length === 0 && " (Sua biblioteca está vazia.)"}
        </p>
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------- */

function AgentBlock({ turn, libMap, mediaById, leadName, onRate }: { turn: AgentTurn; libMap: Map<string, LibItem>; mediaById: Map<number, MediaItem>; leadName: string; onRate: (v: -1 | 1) => void }) {
  const [open, setOpen] = useState(false);
  if (turn.error) {
    return <div className="self-start max-w-[85%] rounded-2xl bg-hot-soft text-hot px-3.5 py-2 text-sm flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {turn.error}</div>;
  }
  const sends = turn.actions.filter((a) => a.type === "send_text" || a.type === "send_item");
  const inner = turn.actions.filter((a) => a.type !== "send_text" && a.type !== "send_item");
  return (
    <div className="self-start max-w-[92%] flex flex-col gap-2">
      {sends.map((a, i) => <SendBubble key={i} action={a} libMap={libMap} mediaById={mediaById} leadName={leadName} />)}
      {sends.length === 0 && <div className="rounded-2xl border border-dashed border-line px-3.5 py-2 text-sm text-muted">O agente decidiu não enviar nada.</div>}
      {inner.length > 0 && (
        <div className="rounded-xl bg-accent-soft/50 border border-line px-3 py-2 flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Ações internas</p>
          {inner.map((a, i) => <InnerAction key={i} action={a} />)}
        </div>
      )}
      {turn.stop === "refusal" && <p className="text-xs text-warn">A IA recusou responder a esta mensagem. Chame o cliente você mesmo.</p>}
      {turn.stop === "length" && <p className="text-xs text-warn">A resposta foi cortada por tamanho.</p>}
      {turn.stop === "max_steps" && <p className="text-xs text-warn">O agente atingiu o limite de passos.</p>}
      <div className="flex items-center gap-1 flex-wrap text-xs text-muted">
        {turn.note && <span className="italic basis-full">“{turn.note}”</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 hover:text-fg cursor-pointer" aria-expanded={open}>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} /> Como decidiu
        </button>
        <span>· {fmtTokens(turn.usage.input + turn.usage.output)} tokens{turn.usage.cacheRead ? ` (${fmtTokens(turn.usage.cacheRead)} em cache)` : ""} · {(turn.ms / 1000).toFixed(1).replace(".", ",")} s</span>
        <span className="ml-auto flex gap-0.5">
          <button type="button" aria-label="Boa resposta" aria-pressed={turn.feedback === 1} onClick={() => onRate(1)} className={cn("p-1.5 rounded-md hover:bg-surface cursor-pointer", turn.feedback === 1 && "text-ok bg-ok-soft")}><ThumbsUp className="w-3.5 h-3.5" /></button>
          <button type="button" aria-label="Resposta ruim" aria-pressed={turn.feedback === -1} onClick={() => onRate(-1)} className={cn("p-1.5 rounded-md hover:bg-surface cursor-pointer", turn.feedback === -1 && "text-hot bg-hot-soft")}><ThumbsDown className="w-3.5 h-3.5" /></button>
        </span>
      </div>
      {open && (
        <div className="rounded-xl border border-line bg-surface/60 p-3 text-xs flex flex-col gap-2">
          {turn.trace.length === 0 && <p className="text-muted">Nenhuma ferramenta usada.</p>}
          {turn.trace.map((t, i) => (
            <div key={i}>
              <p className="font-mono font-semibold">{t.name}<span className="font-normal text-muted"> {JSON.stringify(t.input).slice(0, 200)}</span></p>
              <p className={cn("whitespace-pre-wrap break-words", t.isError ? "text-hot" : "text-muted")}>→ {t.result.slice(0, 400)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SendBubble({ action, libMap, mediaById, leadName }: { action: AgentAction; libMap: Map<string, LibItem>; mediaById: Map<number, MediaItem>; leadName: string }) {
  const bubble = "rounded-2xl rounded-bl-md bg-accent-soft text-fg px-3.5 py-2 text-sm whitespace-pre-wrap break-words";
  if (action.type === "send_text") return <div className={bubble}>{action.text.replace(/\{nome\}/gi, firstName(leadName))}</div>;
  if (action.type !== "send_item") return null;
  const it = libMap.get(action.ref);
  const m = it && it.kind !== "text" && it.kind !== "funnel" ? mediaById.get(it.id) : undefined;
  const label = (kind: string) => (kind === "audio" ? "Áudio" : kind === "image" ? "Imagem" : kind === "video" ? "Vídeo" : kind === "document" ? "Documento" : kind === "funnel" ? "Funil" : "Texto pronto");
  return (
    <div className={cn(bubble, "flex flex-col gap-2 min-w-[220px]")}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label(action.kind)} · {action.title}</span>
      {action.kind === "text" && <span>{(it?.text ?? "").replace(/\{nome\}/gi, firstName(leadName))}</span>}
      {action.kind === "audio" && m && <audio controls preload="none" src={m.url} className="w-full max-w-[280px] h-9" />}
      {action.kind === "image" && m && (
        // eslint-disable-next-line @next/next/no-img-element -- prévia de arquivo do próprio usuário (URL do Supabase)
        <img src={m.url} alt={action.title} className="rounded-xl max-h-52 object-cover" />
      )}
      {action.kind === "video" && m && <video controls preload="none" src={m.url} className="rounded-xl max-h-52" />}
      {action.kind === "document" && m && <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 underline"><FileText className="w-4 h-4" /> Abrir documento</a>}
      {action.kind === "funnel" && <span className="text-muted">{it?.steps}</span>}
      {action.caption && <span>{action.caption}</span>}
    </div>
  );
}

function InnerAction({ action }: { action: AgentAction }) {
  const row = (Icon: typeof Tag, body: React.ReactNode, why?: string) => (
    <p className="text-sm flex items-start gap-2"><Icon className="w-4 h-4 mt-0.5 text-muted shrink-0" /><span>{body}{why && <span className="text-muted"> — {why}</span>}</span></p>
  );
  switch (action.type) {
    case "set_temperature": return row(Thermometer, <>Temperatura: <strong>{TEMP_LABEL[action.value]}</strong></>, action.reason);
    case "move_stage": return row(Columns3, <>Mover para <strong>{action.board} › {action.title}</strong></>, action.reason);
    case "add_tag": return row(Tag, <>Etiqueta <strong>{action.name}</strong></>, action.reason);
    case "create_task": return row(ListChecks, <>{action.kind === "send" ? "Mensagem agendada" : "Lembrete"}: <strong>{action.title}</strong> · {new Date(action.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</>);
    case "add_note": return row(StickyNote, <>Anotação: {action.text}</>);
    case "handoff": return row(Hand, <><strong>Chamar o dono</strong>: {action.reason}{action.summary ? ` — ${action.summary}` : ""}</>);
    case "suggest_item": return row(Lightbulb, <>Sugere criar {action.kind}: <strong>{action.title}</strong></>, action.reason);
    default: return null;
  }
}
