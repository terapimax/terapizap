"use client";

import { useState } from "react";
import { AlertCircle, Bot, Check, Circle, Power, Sparkles } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import { libraryProgress } from "@/lib/ai/context";
import { AI_OLD_DB_MSG, useAiRuntime, useSaveAiSettings } from "@/hooks/use-ai";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { Button, Chip, EmptyState, Panel } from "@/components/ui/shared";
import { Segmented } from "./agent-ui";
import { ConnectionTab } from "./connection-tab";
import { TrainTab } from "./train-tab";
import { LibraryTab } from "./library-tab";
import { SimulatorTab } from "./simulator-tab";
import { AutoTab } from "./auto-tab";
import { ManagerTab } from "./manager-tab";
import { RunsTab } from "./runs-tab";
import { cn } from "@/lib/utils";
import type { AgentMode } from "@/types";

export type AgentTab = "conexao" | "treino" | "biblioteca" | "simulador" | "automatico" | "gerente" | "registro";
const TABS: [AgentTab, string][] = [["conexao", "Conexão"], ["treino", "Treinar"], ["biblioteca", "Biblioteca"], ["simulador", "Simulador"], ["automatico", "Automático"], ["gerente", "Gerente"], ["registro", "Registro"]];

const MODE_TEXT: Record<AgentMode, string> = {
  off: "Desligado: o agente não analisa nem sugere nada na extensão.",
  copilot: "Copiloto: quando chega mensagem, o agente sugere a resposta e a classificação. Você aprova com um clique.",
  auto: "Automático: o agente responde sozinho aos seus leads, com “digitando…”, dentro das travas da aba Automático.",
};

export function AgentView({ initialTab }: { initialTab: AgentTab }) {
  const [tab, setTab] = useState<AgentTab>(initialTab);
  const { rt, data, isLoading } = useAiRuntime();
  const save = useSaveAiSettings();
  const media = useAllMedia();
  const messages = useMessages();

  const go = (t: AgentTab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "conexao") url.searchParams.delete("aba"); else url.searchParams.set("aba", t);
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  };

  if (isLoading || !data) return <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-24" />)}</div>;
  if (data.oldDb) return <EmptyState icon={AlertCircle} title="Falta atualizar o banco" description={AI_OLD_DB_MSG} />;

  const s = data.settings;
  const prog = libraryProgress(media.data ?? [], messages.data ?? []);
  const readTotal = prog.media.total + prog.texts.total;
  const readDone = prog.media.done + prog.texts.done;
  const trained = !!(s.profile.business_name || s.profile.business_about || s.profile.rules);

  const steps = [
    { id: "conexao" as const, label: "Conectar a IA", done: rt.ready, hint: rt.ready ? `${ZF_AI.PROVIDERS[rt.provider].label} · ${rt.modelChat}` : "Cole a sua chave" },
    { id: "treino" as const, label: "Treinar o agente", done: trained, hint: trained ? "Perfil preenchido" : "Conte sobre o negócio e as regras" },
    { id: "biblioteca" as const, label: "Ler a biblioteca", done: readTotal > 0 && readDone === readTotal, hint: readTotal ? `${readDone} de ${readTotal} lidos` : "Biblioteca vazia" },
    { id: "simulador" as const, label: "Testar no simulador", done: false, hint: "Converse como um cliente" },
  ];

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <Panel className="p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-11 h-11 rounded-2xl bg-accent-soft grid place-items-center shrink-0"><Bot className="w-5 h-5 text-accent-fg" /></span>
          <div className="min-w-0 flex-1 basis-56">
            <h2 className="font-semibold flex items-center gap-2 flex-wrap">
              Agente de vendas
              {s.mode === "off" ? <Chip>Desligado</Chip> : <Chip tone="ok"><Sparkles className="w-3 h-3" /> {s.mode === "copilot" ? "Copiloto ligado" : "Automático ligado"}</Chip>}
            </h2>
            <p className="text-sm text-muted mt-0.5 leading-relaxed">{MODE_TEXT[s.mode] || MODE_TEXT.off}</p>
          </div>
          <Segmented<AgentMode> label="Modo do agente" value={s.mode}
            onChange={(m) => {
              if (m !== "off" && !rt.ready) { go("conexao"); return; }
              if (m === "auto") { go("automatico"); return; }   // ligar o automático passa pela confirmação e pelas travas
              save.mutate({ mode: m });
            }}
            options={[["off", "Desligado"], ["copilot", "Copiloto"], ["auto", "Automático"]]} />
          {s.mode === "auto" && <Button variant="danger" onClick={() => save.mutate({ mode: "copilot" })} disabled={save.isPending}><Power className="w-4 h-4" /> Pausar tudo</Button>}
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Passo a passo">
          {steps.map((st, i) => (
            <li key={st.id}>
              <button type="button" onClick={() => go(st.id)}
                className={cn("w-full text-left rounded-xl border px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors", tab === st.id ? "border-fg bg-surface" : "border-line hover:bg-surface")}>
                <span className={cn("w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0", st.done ? "bg-ok-soft text-ok" : "bg-surface text-muted")}>
                  {st.done ? <Check className="w-3.5 h-3.5" /> : i + 1 > 9 ? <Circle className="w-3 h-3" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{st.label}</span>
                  <span className="block text-xs text-muted truncate">{st.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Panel>

      <Segmented<AgentTab> label="Seções do agente" value={tab} onChange={go} options={TABS} />

      {tab === "conexao" && <ConnectionTab />}
      {tab === "treino" && <TrainTab />}
      {tab === "biblioteca" && <LibraryTab />}
      {tab === "simulador" && <SimulatorTab goTo={go} />}
      {tab === "automatico" && <AutoTab />}
      {tab === "gerente" && <ManagerTab />}
      {tab === "registro" && <RunsTab />}
    </div>
  );
}
