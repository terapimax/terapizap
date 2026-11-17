"use client";

import { useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Clock, Gauge, Hand, Loader2, Power, Save, ShieldCheck, Zap } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import { libraryProgress } from "@/lib/ai/context";
import { useAiRuntime, useSaveAiSettings, useSaveProfile } from "@/hooks/use-ai";
import { useAllMedia } from "@/hooks/use-media";
import { useMessages } from "@/hooks/use-messages";
import { useAllColumns, useBoards } from "@/hooks/use-kanban";
import { useTags } from "@/hooks/use-leads";
import { Button, Chip } from "@/components/ui/shared";
import { Field, Section, Segmented, areaCls, inputCls } from "./agent-ui";
import { cn } from "@/lib/utils";
import type { AutoConfig } from "@/types";
import { toast } from "sonner";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[var(--fg)] cursor-pointer shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted leading-relaxed mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

function NumField({ id, label, value, onChange, min, max, unit, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; min: number; max: number; unit: string; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex items-center gap-2">
        <input id={id} type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ""} className={cn(inputCls, "max-w-[110px] tabular-nums")}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </Field>
  );
}

function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("h-8 px-3 rounded-full border text-sm cursor-pointer transition-colors", on ? "bg-fg text-bg border-fg font-semibold" : "border-line text-muted hover:text-fg hover:bg-surface")}>
      {children}
    </button>
  );
}

export function AutoTab() {
  const { data, rt } = useAiRuntime();
  const saveProfile = useSaveProfile();
  const saveSettings = useSaveAiSettings();
  const media = useAllMedia();
  const messages = useMessages();
  const boards = useBoards();
  const columns = useAllColumns();
  const tags = useTags();

  const [draft, setDraft] = useState<AutoConfig>(() => ZF_AI.normalizeAuto(null) as AutoConfig);
  const [words, setWords] = useState("");
  const [seed, setSeed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);

  const s = data?.settings;
  const sig = s ? s.updated_at : null;
  if (s && seed !== sig) {
    const cfg = ZF_AI.normalizeAuto(s.profile.auto) as AutoConfig;
    setSeed(sig);
    setDraft(cfg);
    setWords(cfg.handoff_words.join("\n"));
  }

  if (!s) return <span className="skeleton h-72 block" />;

  const saved = ZF_AI.normalizeAuto(s.profile.auto) as AutoConfig;
  const current = ZF_AI.normalizeAuto({ ...draft, handoff_words: words.split(/\n|,/).map((w) => w.trim()).filter(Boolean) }) as AutoConfig;
  const dirty = JSON.stringify(current) !== JSON.stringify(saved);
  const set = <K extends keyof AutoConfig>(k: K, v: AutoConfig[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setHours = (patch: Partial<AutoConfig["hours"]>) => setDraft((d) => ({ ...d, hours: { ...d.hours, ...patch } }));
  const toggleId = (k: "skip_stage_ids" | "skip_tag_ids", id: number) => setDraft((d) => ({ ...d, [k]: d[k].includes(id) ? d[k].filter((x) => x !== id) : [...d[k], id] }));

  const isAuto = s.mode === "auto";
  const prog = libraryProgress(media.data ?? [], messages.data ?? []);
  const readTotal = prog.media.total + prog.texts.total;
  const readDone = prog.media.done + prog.texts.done;
  const trained = !!(s.profile.business_name || s.profile.business_about || s.profile.rules);

  async function onSave() {
    await saveProfile.mutateAsync({ auto: current });
    toast.success("Travas salvas. A extensão passa a usá-las em até 1 minuto.");
  }

  async function turnOn() {
    await saveSettings.mutateAsync({ mode: "auto" });
    setConfirming(false);
    setUnderstood(false);
    toast.success("Piloto automático ligado. Deixe o WhatsApp Web aberto com a extensão.");
  }

  const checks: { ok: boolean; text: string; block?: boolean }[] = [
    { ok: rt.ready, block: true, text: rt.ready ? "IA conectada" : "Conecte a IA (aba Conexão)" },
    { ok: trained, text: trained ? "Agente treinado" : "Treine o agente: sem isso ele responde de forma genérica" },
    { ok: readTotal > 0 && readDone === readTotal, text: readTotal ? `Biblioteca lida (${readDone} de ${readTotal})` : "Biblioteca vazia: o agente não terá o que enviar" },
    { ok: rt.sttReady, text: rt.sttReady ? "Transcrição de áudio pronta" : "Sem transcrição: áudio do cliente chama você em vez de ser respondido" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Section icon={Zap} title="Piloto automático"
        description="O agente responde sozinho aos seus leads, com “digitando…”, dentro das travas abaixo. Funciona enquanto o WhatsApp Web estiver aberto com a extensão."
        aside={isAuto ? <Chip tone="ok">Ligado</Chip> : <Chip>{s.mode === "copilot" ? "Copiloto" : "Desligado"}</Chip>}>
        {isAuto ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-ok-soft p-4">
            <CheckCircle2 className="w-5 h-5 text-ok shrink-0" />
            <p className="text-sm flex-1 basis-60 leading-relaxed">O agente está respondendo sozinho. Se algo sair do controle, <strong>Pausar tudo</strong> volta para o modo copiloto na hora (também existe um botão igual no cartão do agente, dentro do WhatsApp).</p>
            <Button variant="danger" onClick={() => saveSettings.mutate({ mode: "copilot" })} disabled={saveSettings.isPending}><Power className="w-4 h-4" /> Pausar tudo</Button>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2" aria-label="Antes de ligar">
              {checks.map((c) => (
                <li key={c.text} className="flex items-center gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="w-4 h-4 text-ok shrink-0" /> : <AlertTriangle className={cn("w-4 h-4 shrink-0", c.block ? "text-hot" : "text-warn")} />}
                  <span className={c.ok ? "" : "text-muted"}>{c.text}</span>
                </li>
              ))}
            </ul>
            {!confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => setConfirming(true)} disabled={!rt.ready || dirty}><Zap className="w-4 h-4" /> Ligar o piloto automático</Button>
                {dirty && <span className="text-xs text-muted">Salve as travas antes de ligar.</span>}
                {!rt.ready && <span className="text-xs text-muted">Conecte a IA primeiro.</span>}
              </div>
            ) : (
              <div className="rounded-xl border border-line p-4 flex flex-col gap-3" role="group" aria-label="Confirmar">
                <p className="text-sm leading-relaxed"><strong>Antes de ligar:</strong> a partir de agora o agente envia mensagens aos seus clientes <strong>sem você aprovar</strong>. Ele só responde quem escreve primeiro, nunca em grupos, e para quando você assume a conversa. Mesmo assim, confira o Simulador e acompanhe o Registro nos primeiros dias.</p>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="w-4 h-4 mt-0.5 accent-[var(--fg)] cursor-pointer" />
                  <span>Entendi que o agente vai responder sozinho aos meus clientes.</span>
                </label>
                <div className="flex gap-2">
                  <Button onClick={turnOn} disabled={!understood || saveSettings.isPending}>{saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Ligar agora</Button>
                  <Button variant="ghost" onClick={() => { setConfirming(false); setUnderstood(false); }}>Cancelar</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <Section icon={Clock} title="Horário de atendimento" description="Fora dele, o agente não responde sozinho.">
        <Toggle id="au-hours" checked={draft.hours.enabled} onChange={(v) => setHours({ enabled: v })} label="Só responder dentro do horário" hint="Desligado, ele responde a qualquer hora do dia ou da noite." />
        {draft.hours.enabled && (
          <div className="flex flex-col gap-4">
            <Field label="Dias">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {DAYS.map((d, i) => (
                  <ChipToggle key={d} on={draft.hours.days.includes(i)} onClick={() => setHours({ days: draft.hours.days.includes(i) ? draft.hours.days.filter((x) => x !== i) : [...draft.hours.days, i].sort() })}>{d}</ChipToggle>
                ))}
              </div>
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label="Das" htmlFor="au-start"><input id="au-start" type="time" className={cn(inputCls, "max-w-[130px]")} value={draft.hours.start} onChange={(e) => e.target.value && setHours({ start: e.target.value })} /></Field>
              <Field label="Até" htmlFor="au-end" hint="Se for antes do início, vale até o dia seguinte."><input id="au-end" type="time" className={cn(inputCls, "max-w-[130px]")} value={draft.hours.end} onChange={(e) => e.target.value && setHours({ end: e.target.value })} /></Field>
            </div>
            <Field label="Fora do horário">
              <Segmented label="Fora do horário" value={draft.outside} onChange={(v) => set("outside", v)} options={[["suggest", "Deixar a sugestão para eu aprovar"], ["silent", "Ficar quieto"]]} />
            </Field>
            {draft.hours.days.length === 0 && <p className="text-sm text-warn flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Nenhum dia marcado: o agente nunca responde sozinho.</p>}
          </div>
        )}
      </Section>

      <Section icon={Gauge} title="Ritmo e limites" description="Protegem o seu número do WhatsApp e o seu bolso (cada resposta usa a sua IA).">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NumField id="au-dmin" label="Esperar no mínimo" unit="segundos" min={0} max={600} value={draft.delay_min_s} onChange={(n) => set("delay_min_s", n)} hint="Antes de responder, como gente: sorteia entre o mínimo e o máximo." />
          <NumField id="au-dmax" label="Esperar no máximo" unit="segundos" min={0} max={900} value={draft.delay_max_s} onChange={(n) => set("delay_max_s", n)} />
          <NumField id="au-sends" label="Mensagens por resposta" unit="no máx." min={1} max={8} value={draft.max_sends} onChange={(n) => set("max_sends", n)} />
          <NumField id="au-hour" label="Respostas por hora" unit="no total" min={1} max={200} value={draft.max_per_hour} onChange={(n) => set("max_per_hour", n)} hint="Somando todas as conversas." />
          <NumField id="au-day" label="Respostas por dia, por lead" unit="no máx." min={1} max={100} value={draft.max_per_lead_day} onChange={(n) => set("max_per_lead_day", n)} hint="Evita ficar conversando com robô ou insistir demais." />
          <NumField id="au-owner" label="Quando você responde na mão" unit="min de pausa" min={5} max={1440} value={draft.pause_owner_min} onChange={(n) => set("pause_owner_min", n)} hint="O agente fica quieto nessa conversa pelo tempo indicado." />
        </div>
      </Section>

      <Section icon={Hand} title="Quando ele chama você" description="Nestes casos ele NÃO responde: cria um lembrete em Tarefas (“Assumir conversa”) e fica quieto neste lead.">
        <Field label="Palavras e frases do cliente que chamam você" htmlFor="au-words" hint="Uma por linha. Ignora maiúsculas e acentos, e procura a palavra inteira.">
          <textarea id="au-words" rows={7} className={areaCls} value={words} onChange={(e) => setWords(e.target.value)} />
        </Field>
        <NumField id="au-hand" label="Depois de chamar você, ficar quieto por" unit="horas" min={1} max={168} value={draft.handoff_hours} onChange={(n) => set("handoff_hours", n)} hint="Naquele lead. Você pode retomar antes, pelo cartão do agente no WhatsApp." />
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted">O que ele pode fazer sozinho, além de responder</p>
          <Toggle id="au-class" checked={draft.allow_classify} onChange={(v) => set("allow_classify", v)} label="Classificar" hint="Mudar temperatura, etapa do Kanban e etiquetas." />
          <Toggle id="au-tasks" checked={draft.allow_tasks} onChange={(v) => set("allow_tasks", v)} label="Criar tarefas e lembretes" hint="Inclui mensagens agendadas para o cliente." />
        </div>
      </Section>

      <Section icon={Ban} title="Onde ele nunca responde sozinho" description="Leads nestas etapas ou com estas etiquetas ficam só com você (o agente ainda pode sugerir se você pedir).">
        <Field label="Etapas do Kanban">
          {(columns.data ?? []).length === 0 ? <p className="text-sm text-muted">Você ainda não tem etapas.</p> : (
            <div className="flex flex-col gap-3">
              {(boards.data ?? []).map((b) => {
                const cols = (columns.data ?? []).filter((c) => c.board_id === b.id);
                if (!cols.length) return null;
                return (
                  <div key={b.id} className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">{b.title}</span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={`Etapas de ${b.title}`}>
                      {cols.map((c) => <ChipToggle key={c.id} on={draft.skip_stage_ids.includes(c.id)} onClick={() => toggleId("skip_stage_ids", c.id)}>{c.title}</ChipToggle>)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Field>
        <Field label="Etiquetas" hint="Etiquetas de “ignorar” já bloqueiam o agente por padrão e nem aparecem aqui.">
          {(tags.data ?? []).filter((t) => !t.is_blocking).length === 0 ? <p className="text-sm text-muted">Você ainda não tem etiquetas.</p> : (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Etiquetas">
              {(tags.data ?? []).filter((t) => !t.is_blocking).map((t) => <ChipToggle key={t.id} on={draft.skip_tag_ids.includes(t.id)} onClick={() => toggleId("skip_tag_ids", t.id)}>{t.name}</ChipToggle>)}
            </div>
          )}
        </Field>
      </Section>

      <Section icon={ShieldCheck} title="Garantias que não dá para desligar">
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-muted leading-relaxed list-disc pl-5">
          <li>Só responde quem escreve primeiro. Nunca dispara mensagem em massa.</li>
          <li>Nunca em grupos, status ou canais, nem em leads com etiqueta de “ignorar”.</li>
          <li>Se você digitar na conversa, ele para (pelo tempo escolhido acima).</li>
          <li>Se chegar mensagem nova enquanto ele pensa, descarta a resposta e analisa de novo.</li>
          <li>Antes de cada envio ele confere se o piloto ainda está ligado e se os limites permitem.</li>
          <li>Duas janelas do WhatsApp abertas não respondem o mesmo lead em dobro.</li>
          <li>Áudio que não deu para ouvir chama você, em vez de responder no escuro.</li>
          <li>Na dúvida (preço, desconto, prazo que não está escrito), ele passa para você.</li>
          <li>Se perguntarem, ele não nega ser um assistente virtual.</li>
          <li>Tudo fica no Registro, com 👍 e 👎 para você ensinar.</li>
        </ul>
      </Section>

      <div className="flex flex-wrap items-center gap-3 sticky bottom-3 bg-card/95 backdrop-blur border border-line rounded-2xl p-3 shadow-sm">
        <Button onClick={onSave} disabled={!dirty || saveProfile.isPending}>{saveProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar travas</Button>
        {dirty && <Button variant="ghost" onClick={() => { setDraft(saved); setWords(saved.handoff_words.join("\n")); }}>Descartar</Button>}
        <span className="text-xs text-muted">{dirty ? "Alterações não salvas." : "Tudo salvo."}</span>
      </div>
    </div>
  );
}
