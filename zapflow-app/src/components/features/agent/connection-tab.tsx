"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Mic, ShieldCheck, TriangleAlert } from "lucide-react";
import ZF_AI from "@/lib/ai/zf-ai";
import type { Provider, SttProvider } from "@/lib/ai/zf-ai";
import { maskKey } from "@/lib/ai/runtime";
import { useAiSettings, useSaveAiSettings } from "@/hooks/use-ai";
import { Button, Chip } from "@/components/ui/shared";
import { Field, Section, Segmented, inputCls } from "./agent-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ModelOpt = { id: string; label: string };

export function ConnectionTab() {
  const { data } = useAiSettings();
  const save = useSaveAiSettings();
  const s = data?.settings;

  const [provider, setProvider] = useState<Provider>("anthropic");
  const [keyInput, setKeyInput] = useState("");
  const [models, setModels] = useState<ModelOpt[]>([]);
  const [chat, setChat] = useState("");
  const [fast, setFast] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [sttProvider, setSttProvider] = useState<SttProvider>("openai");
  const [sttKeyInput, setSttKeyInput] = useState("");
  const [sttModel, setSttModel] = useState("");

  // preenche o formulário quando os dados chegam do banco (e de novo se eles mudarem)
  const [seed, setSeed] = useState<string | null>(null);
  const sig = s ? `${s.updated_at}|${s.provider}` : null;
  if (s && seed !== sig) {
    setSeed(sig);
    setProvider(s.provider);
    setChat(s.model_chat ?? "");
    setFast(s.model_fast ?? "");
    setSttProvider(s.stt_provider);
    setSttModel(s.stt_model ?? "");
    setKeyInput("");
    setSttKeyInput("");
  }

  if (!s) return <div className="flex flex-col gap-3">{[0, 1].map((i) => <span key={i} className="skeleton h-40" />)}</div>;

  const p = ZF_AI.PROVIDERS[provider];
  const savedKey = provider === "anthropic" ? s.anthropic_key : s.openai_key;
  const keyField = provider === "anthropic" ? "anthropic_key" : "openai_key";
  const stt = ZF_AI.STT[sttProvider];
  const sttUsesMain = sttProvider === "openai" && !!s.openai_key && !sttKeyInput.trim() && !s.stt_key;
  const sttSavedKey = s.stt_key ?? (sttProvider === "openai" ? s.openai_key : null);

  const chatOptions = models.length ? models.map((m) => m.id) : p.suggestions;

  async function testAndSave() {
    const key = keyInput.trim() || (savedKey ?? "");
    if (!key) { setTestMsg({ ok: false, text: "Cole a chave primeiro." }); return; }
    setTesting(true);
    setTestMsg(null);
    try {
      const list = await ZF_AI.listModels({ provider, key });
      setModels(list);
      const picked = ZF_AI.pickDefaultModels(provider, list);
      const nextChat = chat && list.some((m) => m.id === chat) ? chat : picked.chat;
      const nextFast = fast && list.some((m) => m.id === fast) ? fast : picked.fast;
      setChat(nextChat);
      setFast(nextFast);
      await save.mutateAsync({ provider, [keyField]: key, model_chat: nextChat, model_fast: nextFast });
      setKeyInput("");
      setTestMsg({ ok: true, text: `Conexão funcionando. ${list.length} modelos disponíveis nesta chave.` });
    } catch (e) {
      setTestMsg({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function saveModels() {
    await save.mutateAsync({ provider, model_chat: chat, model_fast: fast });
    toast.success("Modelos salvos.");
  }

  async function saveStt() {
    const patch: Record<string, unknown> = { stt_provider: sttProvider, stt_model: sttModel };
    if (sttKeyInput.trim()) patch.stt_key = sttKeyInput.trim();
    // trocar de fornecedor de voz descarta a chave do outro (cada serviço tem a sua)
    else if (sttProvider !== s!.stt_provider) patch.stt_key = null;
    await save.mutateAsync(patch);
    setSttKeyInput("");
    toast.success("Transcrição salva.");
  }

  async function removeKey() {
    if (!window.confirm(`Apagar a chave ${p.label} desta conta? O agente para de funcionar até você colar outra.`)) return;
    await save.mutateAsync({ [keyField]: null, mode: "off" });
    setTestMsg(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <Section icon={KeyRound} title="Cérebro do agente"
        description="Escolha quem vai pensar e responder. Você usa a SUA conta: o custo vai direto para o fornecedor, sem intermediário.">
        <div className="grid sm:grid-cols-2 gap-3">
          {(Object.values(ZF_AI.PROVIDERS)).map((x) => (
            <button key={x.id} type="button" aria-pressed={provider === x.id} onClick={() => { setProvider(x.id); setModels([]); setTestMsg(null); setChat(""); setFast(""); }}
              className={cn("text-left rounded-2xl border p-4 transition-colors cursor-pointer", provider === x.id ? "border-fg bg-surface" : "border-line hover:border-fg/50")}>
              <span className="flex items-center gap-2 font-semibold">{x.label}
                {(x.id === "anthropic" ? s.anthropic_key : s.openai_key) && <Chip tone="ok"><CheckCircle2 className="w-3 h-3" /> Chave salva</Chip>}
              </span>
              <span className="block text-xs text-muted mt-1 leading-relaxed">
                {x.id === "anthropic" ? "Modelos Claude. Ótimos em seguir regras e conversar em português; leem imagens e PDFs." : "Modelos GPT. Leem imagens e PDFs e também transcrevem áudio com a mesma chave."}
              </span>
            </button>
          ))}
        </div>

        <Field label={`Chave da ${p.label}`} htmlFor="ai-key"
          hint={<>Crie em <a className="underline inline-flex items-center gap-0.5" href={p.keyUrl} target="_blank" rel="noreferrer">{p.keyUrl.replace("https://", "")} <ExternalLink className="w-3 h-3" /></a>. Ela fica guardada só na sua conta e nunca aparece de novo aqui.</>}>
          <div className="flex flex-col sm:flex-row gap-2">
            <input id="ai-key" type="password" autoComplete="off" spellCheck={false} className={inputCls}
              placeholder={savedKey ? `Salva: ${maskKey(savedKey)} — cole outra para trocar` : p.keyHint}
              value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setTestMsg(null); }} />
            <Button onClick={testAndSave} disabled={testing || (!keyInput.trim() && !savedKey)}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {keyInput.trim() ? "Salvar e testar" : "Testar conexão"}
            </Button>
          </div>
        </Field>
        {testMsg && (
          <p role="status" className={cn("text-sm flex items-start gap-2", testMsg.ok ? "text-ok" : "text-hot")}>
            {testMsg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />}{testMsg.text}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Modelo principal" htmlFor="ai-chat" hint="Conversa com o lead e decide as ações. Quanto mais capaz, melhor o atendimento (e mais caro).">
            <input id="ai-chat" list="ai-chat-models" className={inputCls} value={chat} onChange={(e) => setChat(e.target.value)} placeholder={p.defaults.chat} />
            <datalist id="ai-chat-models">{chatOptions.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label="Modelo rápido" htmlFor="ai-fast" hint="Lê e resume a biblioteca e faz tarefas simples. Um modelo menor (“mini”, “haiku”) é mais barato.">
            <input id="ai-fast" list="ai-fast-models" className={inputCls} value={fast} onChange={(e) => setFast(e.target.value)} placeholder={p.defaults.fast} />
            <datalist id="ai-fast-models">{chatOptions.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={saveModels} disabled={save.isPending || !savedKey}>Salvar modelos</Button>
          {savedKey && <Button variant="ghost" onClick={removeKey}>Apagar chave</Button>}
          {!savedKey && <span className="text-xs text-muted">Salve a chave antes de escolher os modelos.</span>}
        </div>
      </Section>

      <Section icon={Mic} title="Transcrição de áudio"
        description={provider === "anthropic"
          ? "O Claude não ouve áudio. Para ele entender os áudios dos clientes e os da sua biblioteca, a transcrição usa outro serviço (barato: centavos por hora de áudio)."
          : "Com a chave da OpenAI você já transcreve áudio. Se preferir, use o Groq, que costuma ser mais barato."}>
        <Segmented<SttProvider> label="Serviço de transcrição" value={sttProvider} onChange={(v) => { setSttProvider(v); setSttModel(""); setSttKeyInput(""); }}
          options={(Object.values(ZF_AI.STT)).map((x) => [x.id, x.label] as [SttProvider, string])} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Modelo de transcrição" htmlFor="stt-model">
            <input id="stt-model" list="stt-models" className={inputCls} value={sttModel} onChange={(e) => setSttModel(e.target.value)} placeholder={stt.defaultModel} />
            <datalist id="stt-models">{stt.models.map((m) => <option key={m} value={m} />)}</datalist>
          </Field>
          <Field label={sttUsesMain ? "Chave (usando a da OpenAI acima)" : `Chave do ${stt.label.split(" ")[0]}`} htmlFor="stt-key"
            hint={<>{sttUsesMain ? "Deixe em branco para reaproveitar a chave da OpenAI. " : ""}Crie em <a className="underline" href={stt.keyUrl} target="_blank" rel="noreferrer">{stt.keyUrl.replace("https://", "")}</a>.</>}>
            <input id="stt-key" type="password" autoComplete="off" spellCheck={false} className={inputCls}
              placeholder={sttSavedKey ? `Salva: ${maskKey(sttSavedKey)}` : sttProvider === "groq" ? "gsk_…" : "sk-…"}
              value={sttKeyInput} onChange={(e) => setSttKeyInput(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={saveStt} disabled={save.isPending}>Salvar transcrição</Button>
          {sttSavedKey && sttProvider === s.stt_provider
            ? <Chip tone="ok"><CheckCircle2 className="w-3 h-3" /> Pronta para transcrever</Chip>
            : <Chip tone="warn"><TriangleAlert className="w-3 h-3" /> {sttKeyInput.trim() || sttProvider !== s.stt_provider ? "Salve para valer" : "Sem chave: áudios e vídeos não serão lidos"}</Chip>}
        </div>
      </Section>

      <p className="text-xs text-muted leading-relaxed px-1">
        <strong className="text-fg">Privacidade:</strong> o painel e a extensão falam direto com o fornecedor que você escolheu, usando a sua chave. Para o agente responder, o texto da conversa, o conteúdo da sua biblioteca e o nome do lead são enviados a esse fornecedor — nada passa por servidor do ZapFlow. Telefones não são enviados.
      </p>
    </div>
  );
}
