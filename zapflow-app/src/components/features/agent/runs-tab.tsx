"use client";

import { Bot, Briefcase, FlaskConical, ScrollText, ThumbsDown, ThumbsUp, Trash2, TriangleAlert, BookOpen } from "lucide-react";
import { useAgentRuns, useClearRuns, useRunFeedback, AI_OLD_DB_MSG } from "@/hooks/use-ai";
import { Button, Chip, EmptyState, Panel } from "@/components/ui/shared";
import { fmtTokens } from "./agent-ui";
import { cn } from "@/lib/utils";
import type { AgentRun } from "@/types";

const SOURCE: Record<AgentRun["source"], { label: string; icon: typeof Bot }> = {
  simulator: { label: "Simulador", icon: FlaskConical },
  copilot: { label: "Copiloto", icon: Bot },
  auto: { label: "Automático", icon: Bot },
  library: { label: "Biblioteca", icon: BookOpen },
  manager: { label: "Gerente", icon: Briefcase },
};

function when(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RunsTab() {
  const { data: runs, isLoading } = useAgentRuns(60);
  const clear = useClearRuns();
  const feedback = useRunFeedback();

  if (isLoading) return <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-16" />)}</div>;
  if (runs === null) return <EmptyState icon={TriangleAlert} title="Falta atualizar o banco" description={AI_OLD_DB_MSG} />;
  if (!runs || runs.length === 0) {
    return <EmptyState icon={ScrollText} title="Nada registrado ainda" description="Cada conversa do simulador, cada análise do copiloto e cada leitura da biblioteca aparece aqui, com o que o agente decidiu e quantos tokens gastou." />;
  }

  const total = runs.reduce((n, r) => ({ i: n.i + r.input_tokens, o: n.o + r.output_tokens, c: n.c + r.cache_read_tokens }), { i: 0, o: 0, c: 0 });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted flex-1 min-w-0">
          Últimos {runs.length} registros: <strong className="text-fg tabular-nums">{fmtTokens(total.i + total.o)}</strong> tokens gastos
          {total.c > 0 && <> ({fmtTokens(total.c)} vieram do cache, que sai bem mais barato)</>}. O valor em reais depende do seu plano com o fornecedor.
        </p>
        <Button variant="ghost" size="sm" onClick={() => { if (window.confirm("Apagar todo o registro do agente?")) clear.mutate(); }}><Trash2 className="w-3.5 h-3.5" /> Limpar</Button>
      </div>
      <Panel className="divide-y divide-line overflow-hidden">
        {runs.map((r) => {
          const S = SOURCE[r.source];
          const acts = Array.isArray(r.actions) ? r.actions.length : 0;
          return (
            <div key={r.id} className="px-4 py-3 flex items-start gap-3">
              <span className="w-9 h-9 rounded-[10px] bg-surface grid place-items-center shrink-0"><S.icon className="w-4 h-4 text-muted" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{S.label}</span>
                  <span className="text-xs text-muted">{when(r.created_at)}</span>
                  {acts > 0 && <Chip>{acts} ação{acts === 1 ? "" : "ões"}</Chip>}
                  {r.error && <Chip tone="hot">Erro</Chip>}
                </div>
                <p className={cn("text-sm mt-0.5 break-words", r.error ? "text-hot" : "text-muted")}>{r.error || r.summary || "—"}</p>
                <p className="text-xs text-muted mt-1 tabular-nums">
                  {r.model ?? "—"} · {fmtTokens(r.input_tokens)} entrada · {fmtTokens(r.output_tokens)} saída{r.cache_read_tokens ? ` · ${fmtTokens(r.cache_read_tokens)} cache` : ""}{r.duration_ms ? ` · ${(r.duration_ms / 1000).toFixed(1).replace(".", ",")} s` : ""}
                </p>
              </div>
              {r.source !== "library" && (
                <span className="flex gap-0.5 shrink-0">
                  <button type="button" aria-label="Boa resposta" aria-pressed={r.feedback === 1} onClick={() => feedback.mutate({ id: r.id, feedback: r.feedback === 1 ? null : 1 })} className={cn("p-1.5 rounded-md hover:bg-surface cursor-pointer text-muted", r.feedback === 1 && "text-ok bg-ok-soft")}><ThumbsUp className="w-4 h-4" /></button>
                  <button type="button" aria-label="Resposta ruim" aria-pressed={r.feedback === -1} onClick={() => feedback.mutate({ id: r.id, feedback: r.feedback === -1 ? null : -1 })} className={cn("p-1.5 rounded-md hover:bg-surface cursor-pointer text-muted", r.feedback === -1 && "text-hot bg-hot-soft")}><ThumbsDown className="w-4 h-4" /></button>
                </span>
              )}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
