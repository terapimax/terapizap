"use client";

import { useMemo, useState } from "react";
import { Brain, Eye, Loader2, Save } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import { buildCatalogRefs, buildLibItems, buildStages, buildTagRefs } from "@/lib/ai/context";
import { useAiSettings, useSaveProfile } from "@/hooks/use-ai";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { useFunnels } from "@/hooks/use-funnels";
import { useAllColumns, useBoards } from "@/hooks/use-kanban";
import { useTags } from "@/hooks/use-leads";
import { useCatalog } from "@/hooks/use-catalog";
import { Button } from "@/components/ui/shared";
import { Field, Section, Segmented, areaCls, inputCls } from "./agent-ui";
import type { AgentProfile } from "@/types";
import { toast } from "sonner";

const TONES: [NonNullable<AgentProfile["tone"]>, string][] = [
  ["amigavel", "Amigável"], ["profissional", "Profissional"], ["descontraido", "Descontraído"], ["consultivo", "Consultivo"],
];
const EMOJIS: [NonNullable<AgentProfile["emoji"]>, string][] = [["nenhum", "Sem emojis"], ["pouco", "Poucos"], ["livre", "À vontade"]];

export function TrainTab() {
  const { data } = useAiSettings();
  const save = useSaveProfile();
  const [draft, setDraft] = useState<AgentProfile>({});
  const [seed, setSeed] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const sig = data ? `${data.settings.updated_at}` : null;
  if (data && seed !== sig) { setSeed(sig); setDraft(data.settings.profile ?? {}); }

  const messages = useMessages();
  const media = useAllMedia();
  const funnels = useFunnels();
  const boards = useBoards();
  const columns = useAllColumns();
  const tags = useTags();
  const catalog = useCatalog();

  const promptPreview = useMemo(() => {
    if (!showPrompt) return "";
    const sys = ZF_AI.buildSystem({
      profile: draft as Record<string, unknown>,
      library: buildLibItems(messages.data ?? [], media.data ?? [], funnels.data ?? []),
      catalog: buildCatalogRefs(catalog.data),
      stages: buildStages(boards.data ?? [], columns.data ?? []),
      tags: buildTagRefs(tags.data ?? []),
      lead: { name: "(nome do lead)" },
      now: new Date(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return sys.map((b) => b.text).join("\n\n———\n\n");
  }, [showPrompt, draft, messages.data, media.data, funnels.data, boards.data, columns.data, tags.data, catalog.data]);

  if (!data) return <span className="skeleton h-72 block" />;

  const set = <K extends keyof AgentProfile>(k: K, v: AgentProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings.profile ?? {});

  async function onSave() {
    const clean: AgentProfile = {};
    for (const [k, v] of Object.entries(draft)) if (typeof v === "string" ? v.trim() : v) (clean as Record<string, unknown>)[k] = typeof v === "string" ? v.trim() : v;
    await save.mutateAsync({ train: clean });
    toast.success("Treino salvo. O agente já usa as novas regras.");
  }

  return (
    <div className="flex flex-col gap-5">
      <Section icon={Brain} title="Sobre o seu negócio" description="O agente fala em nome da sua empresa. Quanto mais ele souber, menos precisa chamar você.">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Nome da empresa" htmlFor="tr-company"><input id="tr-company" className={inputCls} value={draft.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} placeholder="Ex.: Clínica Bem-Estar" /></Field>
          <Field label="Nome do agente" htmlFor="tr-persona" hint="Como ele se apresenta. Pode ser o seu nome ou um nome da equipe."><input id="tr-persona" className={inputCls} value={draft.persona_name ?? ""} onChange={(e) => set("persona_name", e.target.value)} placeholder="Ex.: Clara" /></Field>
        </div>
        <Field label="O que a empresa faz" htmlFor="tr-about" hint="Em poucas linhas: o que vende, para quem, diferenciais, onde fica, como atende.">
          <textarea id="tr-about" rows={4} className={areaCls} value={draft.business_about ?? ""} onChange={(e) => set("business_about", e.target.value)} placeholder="Ex.: Somos uma clínica de massoterapia em Pinheiros (SP). Atendemos adultos com hora marcada, de segunda a sábado…" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Papel do agente" htmlFor="tr-role"><input id="tr-role" className={inputCls} value={draft.role ?? ""} onChange={(e) => set("role", e.target.value)} placeholder="atendente e vendedora" /></Field>
          <Field label="Objetivo principal" htmlFor="tr-goal"><input id="tr-goal" className={inputCls} value={draft.goal ?? ""} onChange={(e) => set("goal", e.target.value)} placeholder="o agendamento de uma sessão" /></Field>
        </div>
      </Section>

      <Section title="Jeito de falar">
        <div className="flex flex-col gap-4">
          <Field label="Tom">
            <Segmented label="Tom" value={draft.tone ?? "amigavel"} onChange={(v) => set("tone", v)} options={TONES} />
          </Field>
          <Field label="Emojis">
            <Segmented label="Emojis" value={draft.emoji ?? "pouco"} onChange={(v) => set("emoji", v)} options={EMOJIS} />
          </Field>
          <Field label="Observações sobre o jeito de falar" htmlFor="tr-tone" hint="Opcional. Ex.: trate por “você”, nunca use “querida”, evite gírias.">
            <input id="tr-tone" className={inputCls} value={draft.tone_notes ?? ""} onChange={(e) => set("tone_notes", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Regras e limites" description="Uma por linha. O agente trata como lei.">
        <div className="grid lg:grid-cols-2 gap-4">
          <Field label="Sempre faça" htmlFor="tr-rules"><textarea id="tr-rules" rows={5} className={areaCls} value={draft.rules ?? ""} onChange={(e) => set("rules", e.target.value)} placeholder={"Sempre oferecer o agendamento no final\nConfirmar o nome completo antes de marcar"} /></Field>
          <Field label="Nunca faça / nunca fale sobre" htmlFor="tr-forb"><textarea id="tr-forb" rows={5} className={areaCls} value={draft.forbidden ?? ""} onChange={(e) => set("forbidden", e.target.value)} placeholder={"Nunca dar desconto sem falar comigo\nNão falar de política nem de concorrentes\nNão prometer resultado médico"} /></Field>
          <Field label="Perguntas para qualificar" htmlFor="tr-qual" hint="Ele faz de forma natural, uma por vez."><textarea id="tr-qual" rows={4} className={areaCls} value={draft.qualification ?? ""} onChange={(e) => set("qualification", e.target.value)} placeholder={"Qual é o seu objetivo?\nJá fez esse tipo de tratamento antes?\nPrefere manhã ou tarde?"} /></Field>
          <Field label="Quando me chamar" htmlFor="tr-hand" hint="Além dos casos óbvios (reclamação, pedido de pessoa)."><textarea id="tr-hand" rows={4} className={areaCls} value={draft.handoff ?? ""} onChange={(e) => set("handoff", e.target.value)} placeholder={"Pedido de orçamento para empresa\nPergunta sobre contraindicação"} /></Field>
        </div>
        <Field label="Horário de atendimento" htmlFor="tr-hours" hint="Se perguntarem, ele informa. Para o automático só responder dentro de um horário, use a aba Automático.">
          <input id="tr-hours" className={inputCls} value={draft.hours_text ?? ""} onChange={(e) => set("hours_text", e.target.value)} placeholder="Segunda a sexta, das 9h às 18h; sábado, das 9h às 13h" />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-3 bg-card/95 backdrop-blur border border-line rounded-2xl p-3 shadow-sm">
        <Button onClick={onSave} disabled={!dirty || save.isPending}>{save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar treino</Button>
        {dirty && <Button variant="ghost" onClick={() => setDraft(data.settings.profile ?? {})}>Descartar</Button>}
        <span className="text-xs text-muted">{dirty ? "Alterações não salvas." : "Tudo salvo."}</span>
        <Button variant="secondary" className="ml-auto" onClick={() => setShowPrompt((v) => !v)}><Eye className="w-4 h-4" /> {showPrompt ? "Esconder" : "Ver o que o agente recebe"}</Button>
      </div>

      {showPrompt && (
        <Section title="O que o agente recebe" description="Este é o texto completo que vai para a IA a cada conversa, com o seu treino e a sua biblioteca. Nada escondido.">
          <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words bg-surface rounded-xl p-4 max-h-[60vh] overflow-auto font-mono">{promptPreview}</pre>
        </Section>
      )}
    </div>
  );
}
