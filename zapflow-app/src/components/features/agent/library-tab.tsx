"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, FileText, Film, Image as ImageIcon, Loader2, MessageSquareText, Mic, RotateCcw, Sparkles, Square } from "lucide-react";
import { libraryProgress } from "@/lib/ai/context";
import { ZERO_USAGE, isAbort, isFatal, isRate, readMediaSafe, readText, sumUsage } from "@/lib/ai/enrich";
import type { Usage } from "@/lib/ai/zf-ai";
import { aiError, saveLibraryPatch, useAiRuntime, useInvalidateLibrary, useLogRun } from "@/hooks/use-ai";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { Modal } from "@/components/ui/modal";
import { Button, Chip, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { Field, areaCls, fmtTokens, inputCls } from "./agent-ui";
import { cn } from "@/lib/utils";
import type { MediaItem, Message } from "@/types";
import { toast } from "sonner";

type Kind = "text" | "audio" | "image" | "video" | "document";
type Status = "done" | "error" | "skipped" | "pending";

interface Row {
  key: string;
  kind: Kind;
  id: number;
  title: string;
  status: Status;
  summary: string;
  when: string;
  tags: string[];
  transcript: string;
  error: string;
  media?: MediaItem;
  msg?: Message;
}

const KIND_META: Record<Kind, { label: string; icon: typeof Mic }> = {
  text: { label: "Texto", icon: MessageSquareText },
  audio: { label: "Áudio", icon: Mic },
  image: { label: "Imagem", icon: ImageIcon },
  video: { label: "Vídeo", icon: Film },
  document: { label: "Documento", icon: FileText },
};
const STATUS_META: Record<Status, { label: string; tone: "ok" | "hot" | "neutral" | "warn" }> = {
  done: { label: "Lido", tone: "ok" }, error: { label: "Erro", tone: "hot" }, skipped: { label: "Ignorado", tone: "neutral" }, pending: { label: "Pendente", tone: "warn" },
};

const selectCls = "h-10 pl-3 pr-8 rounded-[10px] border border-line bg-card text-sm cursor-pointer outline-none focus:border-fg max-w-full";

function toRows(media: MediaItem[], messages: Message[]): Row[] {
  const m: Row[] = media.map((i) => ({
    key: `m${i.id}`, kind: i.type, id: i.id, title: i.title,
    status: (i.ai_status ?? "pending") as Status,
    summary: i.ai_summary ?? "", when: i.ai_when_to_use ?? "", tags: i.ai_tags ?? [], transcript: i.ai_transcript ?? "", error: i.ai_error ?? "", media: i,
  }));
  const t: Row[] = messages.map((i) => ({
    key: `t${i.id}`, kind: "text", id: i.id, title: i.title,
    status: i.ai_at ? "done" : "pending",
    summary: (i.content ?? "").slice(0, 160), when: i.ai_when_to_use ?? "", tags: i.ai_tags ?? [], transcript: "", error: "", msg: i,
  }));
  return [...m, ...t];
}

interface RunState { total: number; done: number; errors: number; skipped: number; current: string; usage: Usage; pausedUntil: number; note: string }

const RATE_MAX_STRIKES = 4;   // pausas seguidas por limite do fornecedor antes de desistir (o resto fica pendente)
const PACE_MS = 600;          // folga entre um item e outro

export function LibraryTab() {
  const media = useAllMedia();
  const messages = useMessages();
  const { rt, data } = useAiRuntime();
  const invalidate = useInvalidateLibrary();
  const logRun = useLogRun();

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [status, setStatus] = useState<"" | Status>("");
  const [open, setOpen] = useState<Row | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const rows = useMemo(() => toRows(media.data ?? [], messages.data ?? []), [media.data, messages.data]);
  const prog = useMemo(() => libraryProgress(media.data ?? [], messages.data ?? []), [media.data, messages.data]);

  if (media.isLoading || messages.isLoading || !data) return <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-16" />)}</div>;

  const needsStt = (r: Row) => r.kind === "audio" || r.kind === "video";
  // pendentes + os que deram erro antes (ex.: limite do fornecedor): "Ler" tenta todos de novo
  const pendingRows = rows.filter((r) => r.status === "pending" || r.status === "error");
  const retryErrors = pendingRows.filter((r) => r.status === "error").length;
  const skippedForVoice = pendingRows.filter((r) => needsStt(r) && !rt.sttReady);
  const runnable = pendingRows.filter((r) => !(needsStt(r) && !rt.sttReady));
  const total = prog.media.total + prog.texts.total;
  const doneCount = prog.media.done + prog.texts.done;

  const nq = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!kind || r.kind === kind) && (!status || r.status === status) && (!nq || r.title.toLowerCase().includes(nq) || r.summary.toLowerCase().includes(nq) || r.when.toLowerCase().includes(nq)))
    .sort((a, b) => ({ error: 0, pending: 1, done: 2, skipped: 3 }[a.status] - { error: 0, pending: 1, done: 2, skipped: 3 }[b.status]) || a.title.localeCompare(b.title, "pt-BR"));

  async function readOne(r: Row, signal: AbortSignal): Promise<{ usage: Usage; skipped: boolean }> {
    if (r.media) {
      const { patch, usage } = await readMediaSafe(r.media, rt, signal);
      await saveLibraryPatch("media_library", r.id, patch as unknown as Record<string, unknown>);
      return { usage, skipped: patch.ai_status === "skipped" };
    }
    const { patch, usage } = await readText(r.msg as Message, rt, signal);
    await saveLibraryPatch("messages", r.id, patch as unknown as Record<string, unknown>);
    return { usage, skipped: false };
  }

  async function readMany(targets: Row[]) {
    if (!rt.ready) { toast.error("Conecte a IA primeiro, na aba Conexão."); return; }
    if (!targets.length) return;
    const c = new AbortController();
    ctl.current = c;
    const state: RunState = { total: targets.length, done: 0, errors: 0, skipped: 0, current: "", usage: ZERO_USAGE, pausedUntil: 0, note: "" };
    setRun({ ...state });
    const queue = [...targets];
    let fatal: Error | null = null;
    let stopped: string | null = null;   // o fornecedor seguiu limitando: para e deixa o resto pendente
    let allowed = 2;                     // 2 ao mesmo tempo; cai para 1 na primeira reclamação de limite
    let cooldownUntil = 0;
    let strikes = 0;
    const started = Date.now();
    const wait = (ms: number) => new Promise<void>((res) => {
      const t = setTimeout(res, ms);
      c.signal.addEventListener("abort", () => { clearTimeout(t); res(); }, { once: true });
    });
    const worker = async (w: number) => {
      while (queue.length && !c.signal.aborted && !fatal && !stopped) {
        if (w >= allowed) return;
        const pause = cooldownUntil - Date.now();
        if (pause > 0) {
          state.pausedUntil = cooldownUntil;
          setRun({ ...state });
          await wait(pause);
          state.pausedUntil = 0;
          continue;
        }
        const r = queue.shift() as Row;
        state.current = r.title;
        setRun({ ...state });
        try {
          const res = await readOne(r, c.signal);
          state.usage = sumUsage(state.usage, res.usage);
          if (res.skipped) state.skipped++;
          strikes = 0;
          state.note = "";
        } catch (e) {
          if (isAbort(e)) break;
          if (isFatal(e)) { fatal = e as Error; c.abort(); break; }
          if (isRate(e)) {
            // não é defeito do item: volta para a fila, todo mundo pausa e segue um por vez
            queue.unshift(r);
            strikes++;
            allowed = 1;
            if (strikes >= RATE_MAX_STRIKES) { stopped = (e as Error).message; break; }
            const asked = (e as { waitMs?: number }).waitMs ?? 0;
            cooldownUntil = Math.max(cooldownUntil, Date.now() + Math.min(120000, Math.max(asked + 1000, 15000 * strikes)));
            state.note = (e as Error).message;
            setRun({ ...state });
            continue;
          }
          state.errors++;
          if (state.errors === 1) toast.error(aiError(e));
        }
        state.done++;
        setRun({ ...state });
        if (queue.length) await wait(PACE_MS);
      }
    };
    await Promise.all([worker(0), worker(1)]);
    ctl.current = null;
    invalidate();
    const cancelled = c.signal.aborted && !fatal;
    const read = state.done - state.errors - state.skipped;
    setRun(null);
    if (state.done > 0 || fatal || stopped) {
      logRun.mutate({
        source: "library", provider: rt.provider, model: rt.modelFast, input_tokens: state.usage.input, output_tokens: state.usage.output, cache_read_tokens: state.usage.cacheRead,
        duration_ms: Date.now() - started,
        summary: `Leu ${read} de ${targets.length} itens da biblioteca${state.errors ? ` (${state.errors} com erro)` : ""}${state.skipped ? ` (${state.skipped} ignorado${state.skipped === 1 ? "" : "s"})` : ""}`,
        error: fatal ? (fatal as Error).message : stopped,
      });
    }
    if (fatal) toast.error((fatal as Error).message);
    else if (stopped) toast.error(`Parei depois de ler ${read}: ${stopped} Os ${queue.length} restantes continuam pendentes; tente de novo mais tarde.`, { duration: 15000 });
    else if (cancelled) toast(`Parei depois de ${state.done} de ${targets.length}.`);
    else toast.success(`Pronto: ${read} ${read === 1 ? "item lido" : "itens lidos"}${state.errors ? `, ${state.errors} com erro` : ""}${state.skipped ? `, ${state.skipped} ignorado${state.skipped === 1 ? "" : "s"}` : ""}.`);
  }

  function readAllPending() {
    const voice = runnable.filter(needsStt).length;
    const msg = `A IA vai ler ${runnable.length} ${runnable.length === 1 ? "item" : "itens"}${voice ? ` (${voice} de áudio/vídeo para transcrever)` : ""}${retryErrors ? `, incluindo ${retryErrors} que deram erro antes` : ""}. Isso usa créditos da SUA conta no fornecedor. Continuar?`;
    if (window.confirm(msg)) readMany(runnable);
  }

  if (total === 0) {
    return <EmptyState icon={BookOpen} title="A biblioteca está vazia" description="Cadastre textos, áudios, mídias e documentos em Biblioteca. Depois volte aqui para a IA ler tudo e aprender quando usar cada item." />;
  }

  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-accent-fg" /> A IA já leu {doneCount} de {total} itens</h2>
            <p className="text-sm text-muted mt-0.5 leading-relaxed">
              Ela transcreve áudios e vídeos, descreve imagens e lê PDFs e textos para saber o que cada item diz e <strong className="text-fg">quando usar</strong>. Nada é alterado nos seus arquivos.
            </p>
          </div>
          {run ? (
            <Button variant="danger" onClick={() => ctl.current?.abort()}><Square className="w-4 h-4" /> Parar</Button>
          ) : (
            <Button onClick={readAllPending} disabled={!runnable.length || !rt.ready}>
              <Sparkles className="w-4 h-4" /> {runnable.length ? (retryErrors ? `Ler ${runnable.length} (${retryErrors} com erro)` : `Ler ${runnable.length} pendente${runnable.length === 1 ? "" : "s"}`) : "Nada pendente"}
            </Button>
          )}
        </div>
        <div className="h-2 rounded-full bg-surface overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Itens lidos">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        {run && (
          <p className="text-sm text-muted flex items-center gap-2" role="status">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span className="truncate">
              {run.pausedUntil
                ? <>Pausa pedida pelo fornecedor: retomo às {new Date(run.pausedUntil).toLocaleTimeString("pt-BR")} ({run.done} de {run.total} feitos)</>
                : <>Lendo {Math.min(run.done + 1, run.total)} de {run.total}: <strong className="text-fg">{run.current}</strong></>}
            </span>
            <span className="ml-auto shrink-0 tabular-nums">{fmtTokens(run.usage.input + run.usage.output)} tokens</span>
          </p>
        )}
        {run && run.note && <p className="text-xs text-warn leading-relaxed" role="status">{run.note}</p>}
        {!rt.ready && <p className="text-sm text-warn flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> Conecte a IA na aba Conexão para ler a biblioteca.</p>}
        {rt.ready && skippedForVoice.length > 0 && (
          <p className="text-sm text-warn flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {skippedForVoice.length} áudio(s)/vídeo(s) ficam de fora: falta a chave de transcrição (aba Conexão).</p>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar na biblioteca" className="sm:w-72" />
        <select aria-label="Tipo" className={selectCls} value={kind} onChange={(e) => setKind(e.target.value as "" | Kind)}>
          <option value="">Todos os tipos</option>
          {(Object.keys(KIND_META) as Kind[]).map((k) => <option key={k} value={k}>{KIND_META[k].label}s</option>)}
        </select>
        <select aria-label="Situação" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as "" | Status)}>
          <option value="">Qualquer situação</option>
          <option value="pending">Pendentes ({prog.media.pending + prog.texts.pending})</option>
          <option value="done">Lidos</option>
          <option value="error">Com erro ({prog.media.error})</option>
          <option value="skipped">Ignorados ({prog.media.skipped})</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">Nada encontrado com esses filtros.</p>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden">
          {shown.map((r) => {
            const KI = KIND_META[r.kind].icon;
            const st = STATUS_META[r.status];
            return (
              <button key={r.key} type="button" onClick={() => setOpen(r)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-surface transition-colors">
                <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0"><KI className="w-4 h-4 text-muted" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{r.title}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </span>
                  <span className={cn("block text-sm truncate", r.status === "error" ? "text-hot" : "text-muted")}>
                    {r.status === "error" || r.status === "skipped" ? r.error || "—" : r.when ? `Quando usar: ${r.when}` : r.summary || "Ainda não lido pela IA"}
                  </span>
                </span>
                <span className="hidden sm:block text-xs text-muted shrink-0">{KIND_META[r.kind].label}</span>
              </button>
            );
          })}
        </Panel>
      )}

      {open && <ItemSheet key={open.key} row={open} busy={!!run} onClose={() => setOpen(null)} onReread={async () => { await readMany([open]); setOpen(null); }} />}
    </div>
  );
}

function ItemSheet({ row, busy, onClose, onReread }: { row: Row; busy: boolean; onClose: () => void; onReread: () => void }) {
  const invalidate = useInvalidateLibrary();
  const { rt } = useAiRuntime();
  const [summary, setSummary] = useState(row.summary);
  const [when, setWhen] = useState(row.when);
  const [tags, setTags] = useState(row.tags.join(", "));
  const [transcript, setTranscript] = useState(row.transcript);
  const [saving, setSaving] = useState(false);
  const isMedia = !!row.media;
  const KI = KIND_META[row.kind].icon;

  async function onSave() {
    setSaving(true);
    try {
      const tagList = Array.from(new Set(tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 12);
      if (isMedia) {
        await saveLibraryPatch("media_library", row.id, { ai_summary: summary.trim() || null, ai_when_to_use: when.trim() || null, ai_tags: tagList, ai_transcript: transcript.trim() || null, ai_status: "done", ai_error: null, ai_at: new Date().toISOString() });
      } else {
        await saveLibraryPatch("messages", row.id, { ai_when_to_use: when.trim() || null, ai_tags: tagList, ai_at: new Date().toISOString() });
      }
      invalidate();
      toast.success("Salvo.");
      onClose();
    } catch (e) {
      toast.error(aiError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={row.title} description={`${KIND_META[row.kind].label} da biblioteca`}
      footer={
        <>
          <Button variant="secondary" onClick={onReread} disabled={busy || !rt.ready}><RotateCcw className="w-4 h-4" /> {row.status === "pending" ? "Ler com IA" : "Reler com IA"}</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Salvar</Button>
        </>
      }>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted flex items-center gap-2"><KI className="w-4 h-4" /> O que a IA entendeu deste item. Você pode corrigir: o agente usa exatamente o que estiver aqui.</p>
        {row.status === "error" && <p className="text-sm text-hot flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {row.error}</p>}
        {row.kind === "text" && <Field label="Texto da mensagem"><p className="text-sm bg-surface rounded-[10px] p-3 whitespace-pre-wrap max-h-40 overflow-auto">{row.msg?.content}</p></Field>}
        {isMedia && <Field label="Resumo" htmlFor="it-sum"><textarea id="it-sum" rows={2} className={areaCls} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>}
        <Field label="Quando usar" htmlFor="it-when" hint="Em que situação da conversa o agente deve enviar isto."><textarea id="it-when" rows={2} className={areaCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Palavras-chave" htmlFor="it-tags" hint="Separadas por vírgula."><input id="it-tags" className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        {isMedia && (
          <Field label={row.kind === "audio" || row.kind === "video" ? "Transcrição" : "Conteúdo lido"} htmlFor="it-tr" hint="Corrija nomes e valores se a transcrição errou algo importante.">
            <textarea id="it-tr" rows={7} className={areaCls} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
