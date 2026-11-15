"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Info, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { useTriggers, useCreateTrigger, useUpdateTrigger, useDeleteTrigger } from "@/hooks/use-triggers";
import { useMessages } from "@/hooks/use-messages";
import { useAllMedia } from "@/hooks/use-media";
import { useFunnels } from "@/hooks/use-funnels";
import { useBoards, useBoardData } from "@/hooks/use-kanban";
import { Modal } from "@/components/ui/modal";
import { Button, EmptyState, Panel, SearchInput } from "@/components/ui/shared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LibraryPicker } from "@/components/features/media-preview";
import type { MediaItem, Message, Trigger } from "@/types";

type EventKey = Trigger["event"];
type ActionKey = Trigger["action"];

const EVENTS: Record<EventKey, string> = {
  keyword: "O contato escrever uma palavra-chave",
  lead_created: "Um lead novo for criado",
  lead_moved: "Um lead mudar de etapa",
  lead_status_changed: "A temperatura de um lead mudar",
  appointment_due: "Chegar a hora de uma tarefa",
  manual: "Eu disparar manualmente",
};

const ACTIONS: Record<ActionKey, string> = {
  send_message: "Enviar uma mensagem",
  send_audio: "Enviar um áudio",
  send_media: "Enviar uma imagem ou vídeo",
  send_document: "Enviar um documento",
  send_funnel: "Iniciar um funil",
  move_lead: "Mover o lead para uma etapa",
  notify: "Me avisar",
};

const TEMPS = { hot: "Quente", warm: "Morno", cold: "Frio" } as const;

/** Ações que a extensão consegue fazer sozinha ao receber uma palavra-chave. */
const KEYWORD_ACTIONS: ActionKey[] = ["send_message", "send_audio", "send_media", "send_document", "send_funnel"];

const MATCHES = {
  contains: "Tiver a palavra (em qualquer parte)",
  exact: "For exatamente a palavra",
  starts: "Começar com a palavra",
} as const;
type MatchKey = keyof typeof MATCHES;

/** Quanto esperar para responder de novo a mesma conversa. 0 = toda vez, -1 = uma vez só. */
const COOLDOWNS: [number, string][] = [
  [0, "Toda vez (no máximo 1 por minuto)"],
  [1, "No máximo 1 vez por hora"],
  [24, "No máximo 1 vez por dia"],
  [168, "No máximo 1 vez por semana"],
  [-1, "Só uma vez por conversa"],
];

/** "preço, valor , quanto custa" → ["preço", "valor", "quanto custa"] */
const parseKeywords = (v: string) => Array.from(new Set(v.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean)));
const keywordsOf = (t: Trigger | null) => {
  const k = t?.event_config.keywords;
  return Array.isArray(k) ? k.map(String) : typeof k === "string" ? parseKeywords(k) : [];
};
const matchOf = (t: Trigger | null): MatchKey => {
  const m = String(t?.event_config.match ?? "");
  return m in MATCHES ? (m as MatchKey) : "contains";
};

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export default function GatilhosPage() {
  const { data: triggers = [], isLoading, isError } = useTriggers();
  const createT = useCreateTrigger();
  const updateT = useUpdateTrigger();
  const deleteT = useDeleteTrigger();
  const { data: messages = [] } = useMessages();
  const { data: media = [] } = useAllMedia();
  const { data: funnels = [] } = useFunnels();
  const { data: boards = [] } = useBoards();
  const { data: columns = [] } = useBoardData(boards[0]?.id ?? null);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Trigger | "new" | null>(null);
  const [toDelete, setToDelete] = useState<Trigger | null>(null);

  const lookups = useMemo(() => ({
    message: (id: number) => messages.find((m) => m.id === id)?.title,
    media: (id: number) => media.find((m) => m.id === id)?.title,
    funnel: (id: number) => funnels.find((f) => f.id === id)?.title,
    column: (id: number) => columns.find((c) => c.id === id)?.title,
  }), [messages, media, funnels, columns]);

  const when = (t: Trigger) => {
    if (t.event === "keyword") {
      const words = keywordsOf(t);
      if (!words.length) return EVENTS.keyword;
      const shown = words.slice(0, 3).map((w) => `“${w}”`).join(", ");
      return `O contato escrever ${shown}${words.length > 3 ? ` e mais ${words.length - 3}` : ""}`;
    }
    if (t.event === "lead_moved") {
      const c = num(t.event_config.column_id);
      return c ? `Um lead entrar em “${lookups.column(c) ?? "etapa removida"}”` : EVENTS.lead_moved;
    }
    if (t.event === "lead_status_changed") {
      const s = String(t.event_config.status ?? "") as keyof typeof TEMPS;
      return TEMPS[s] ? `A temperatura virar ${TEMPS[s].toLowerCase()}` : EVENTS.lead_status_changed;
    }
    return EVENTS[t.event];
  };

  const then = (t: Trigger) => {
    const c = t.action_config;
    const gone = "item removido";
    switch (t.action) {
      case "send_message": return `Enviar a mensagem “${lookups.message(num(c.message_id)) ?? gone}”`;
      case "send_audio": return `Enviar o áudio “${lookups.media(num(c.media_id)) ?? gone}”`;
      case "send_media":
      case "send_document": return `Enviar “${lookups.media(num(c.media_id)) ?? gone}”`;
      case "send_funnel": return `Iniciar o funil “${lookups.funnel(num(c.funnel_id)) ?? gone}”`;
      case "move_lead": return `Mover para “${lookups.column(num(c.column_id)) ?? "etapa removida"}”`;
      default: return ACTIONS.notify;
    }
  };

  const q = search.trim().toLowerCase();
  const shown = triggers.filter((t) => !q || t.title.toLowerCase().includes(q));

  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar seus gatilhos" description="O banco de dados não respondeu. Recarregue a página." />;
  }

  const addButton = <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Novo gatilho</Button>;

  return (
    <div className="flex flex-col gap-5 animate-fade-in max-w-[1100px] w-full mx-auto">
      <div className="flex gap-3 p-4 rounded-xl bg-warn-soft text-warn text-sm" role="note">
        <Info className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          <b className="font-semibold">Gatilhos de palavra-chave respondem sozinhos enquanto o WhatsApp Web estiver aberto com a extensão.</b>{" "}
          Os de lead (criado, mudou de etapa ou de temperatura) ficam salvos, mas ainda não disparam.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar gatilhos" />
        <span className="text-sm text-muted tabular-nums">{triggers.length} {triggers.length === 1 ? "gatilho" : "gatilhos"}</span>
        <div className="ml-auto">{addButton}</div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <span key={i} className="skeleton h-[84px]" />)}</div>
      ) : shown.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Zap}
            title={triggers.length === 0 ? "Nenhum gatilho ainda" : "Nada encontrado"}
            description={triggers.length === 0 ? "Crie regras do tipo “quando isso acontecer, faça aquilo”. Exemplo: quando o contato escrever “preço”, enviar a mensagem com a tabela." : `Nenhum resultado para “${search}”.`}
            action={triggers.length === 0 ? addButton : undefined}
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-line overflow-hidden" aria-label="Lista de gatilhos">
          {shown.map((t) => (
            <div key={t.id} className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition-colors">
              <button type="button" onClick={() => setEditing(t)} className="flex-1 min-w-0 text-left cursor-pointer">
                <p className={cn("text-sm font-semibold truncate", !t.is_active && "text-muted")}>{t.title}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  <span><span className="text-xs uppercase tracking-wide">Quando</span> {when(t)}</span>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{then(t)}</span>
                </p>
              </button>
              <label className="relative w-10 h-6 shrink-0 cursor-pointer" title={t.is_active ? "Ativo" : "Pausado"}>
                <input
                  type="checkbox"
                  checked={t.is_active}
                  onChange={() => updateT.mutate({ id: t.id, is_active: !t.is_active })}
                  aria-label={`${t.is_active ? "Pausar" : "Ativar"} ${t.title}`}
                  className="peer absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
                <span className="absolute inset-0 rounded-full bg-line peer-checked:bg-primary transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
                <span className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white peer-checked:translate-x-4 peer-checked:bg-on-primary transition-transform shadow-sm" />
              </label>
              <button type="button" aria-label={`Excluir ${t.title}`} onClick={() => setToDelete(t)} className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </Panel>
      )}

      {editing && (
        <TriggerForm
          key={editing === "new" ? "new" : editing.id}
          trigger={editing === "new" ? null : editing}
          saving={createT.isPending || updateT.isPending}
          data={{ messages, media, funnels, columns }}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            if (editing === "new") await createT.mutateAsync({ ...v, is_active: true });
            else await updateT.mutateAsync({ id: editing.id, ...v });
            setEditing(null);
          }}
        />
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Excluir “${toDelete?.title ?? ""}”?`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setToDelete(null)}>Manter</Button>
          <Button variant="danger" onClick={() => { if (toDelete) deleteT.mutate(toDelete.id); setToDelete(null); }}>Excluir</Button>
        </>}
      >
        <p className="text-sm text-muted">Isso não pode ser desfeito.</p>
      </Modal>
    </div>
  );
}

// ── Formulário ──────────────────────────────────────────────

interface FormData {
  messages: Message[];
  media: MediaItem[];
  funnels: { id: number; title: string }[];
  columns: { id: number; title: string }[];
}

function Select({ id, label, value, onChange, children }: { id: string; label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>{children}</select>
    </div>
  );
}

function TriggerForm({ trigger, data, saving, onClose, onSave }: {
  trigger: Trigger | null; data: FormData; saving: boolean; onClose: () => void;
  onSave: (v: Pick<Trigger, "title" | "event" | "action" | "event_config" | "action_config">) => Promise<void>;
}) {
  const [title, setTitle] = useState(trigger?.title ?? "");
  const [event, setEvent] = useState<EventKey>(trigger?.event ?? "keyword");
  const [keywords, setKeywords] = useState(keywordsOf(trigger).join(", "));
  const [match, setMatch] = useState<MatchKey>(matchOf(trigger));
  const [cooldown, setCooldown] = useState(trigger?.event_config.cooldown_hours != null ? Number(trigger.event_config.cooldown_hours) : 24);
  const [action, setAction] = useState<ActionKey>(trigger?.action ?? "send_message");
  const [evColumn, setEvColumn] = useState(num(trigger?.event_config.column_id));
  const [evStatus, setEvStatus] = useState(String(trigger?.event_config.status ?? ""));
  const [itemId, setItemId] = useState(num(trigger?.action_config.message_id ?? trigger?.action_config.media_id ?? trigger?.action_config.funnel_id ?? trigger?.action_config.column_id));

  const options =
    action === "send_message" ? data.messages
    : action === "send_audio" ? data.media.filter((m) => m.type === "audio")
    : action === "send_media" ? data.media.filter((m) => m.type === "image" || m.type === "video")
    : action === "send_document" ? data.media.filter((m) => m.type === "document")
    : action === "send_funnel" ? data.funnels
    : action === "move_lead" ? data.columns
    : [];
  const needsItem = action !== "notify";
  const fromLibrary = action === "send_message" || action === "send_audio" || action === "send_media" || action === "send_document";
  const itemLabel = { send_message: "Mensagem", send_audio: "Áudio", send_media: "Imagem ou vídeo", send_document: "Documento", send_funnel: "Funil", move_lead: "Etapa", notify: "" }[action];
  const isKeyword = event === "keyword";
  const actionKeys = isKeyword ? KEYWORD_ACTIONS : (Object.keys(ACTIONS) as ActionKey[]);
  const changeEvent = (v: EventKey) => {
    setEvent(v);
    if (v === "keyword" && !KEYWORD_ACTIONS.includes(action)) { setAction("send_message"); setItemId(0); }
  };

  const submit = () => {
    if (!title.trim()) return toast.error("Dê um nome ao gatilho.");
    const words = parseKeywords(keywords);
    if (isKeyword && !words.length) return toast.error("Escreva pelo menos uma palavra-chave.");
    if (needsItem && !itemId) return toast.error(`Escolha ${action === "move_lead" ? "a etapa" : action === "send_funnel" ? "o funil" : action === "send_message" ? "a mensagem" : "o item"} da ação.`);
    const key = { send_message: "message_id", send_audio: "media_id", send_media: "media_id", send_document: "media_id", send_funnel: "funnel_id", move_lead: "column_id", notify: "" }[action];
    onSave({
      title: title.trim(),
      event,
      action,
      event_config: isKeyword ? { keywords: words, match, cooldown_hours: cooldown }
        : event === "lead_moved" && evColumn ? { column_id: evColumn } : event === "lead_status_changed" && evStatus ? { status: evStatus } : {},
      action_config: needsItem ? { [key]: itemId } : {},
    });
  };

  return (
    <Modal open onClose={onClose} title={trigger ? "Editar gatilho" : "Novo gatilho"}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar</Button>
      </>}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="t-title" className="text-xs font-medium text-muted">Nome</label>
          <input id="t-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Tabela de preços" className={inputCls} />
        </div>

        <section className="flex flex-col gap-3" aria-label="Quando">
          <h4 className="font-sans text-sm font-semibold tracking-normal">Quando</h4>
          <Select id="t-event" label="Isto acontecer" value={event} onChange={(v) => changeEvent(v as EventKey)}>
            {(Object.keys(EVENTS) as EventKey[]).map((k) => <option key={k} value={k}>{EVENTS[k]}</option>)}
          </Select>
          {isKeyword && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="t-kw" className="text-xs font-medium text-muted">Palavras-chave</label>
                <input id="t-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="preço, valor, quanto custa" className={inputCls} />
                <p className="text-xs text-muted">Separe por vírgula. Maiúsculas e acentos não importam: “preço” também vale para “PRECO”.</p>
              </div>
              <Select id="t-match" label="Quando a mensagem" value={match} onChange={(v) => setMatch(v as MatchKey)}>
                {(Object.keys(MATCHES) as MatchKey[]).map((k) => <option key={k} value={k}>{MATCHES[k]}</option>)}
              </Select>
              <Select id="t-cool" label="Responder a mesma conversa" value={cooldown} onChange={(v) => setCooldown(Number(v))}>
                {COOLDOWNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <p className="text-xs text-muted">Só em conversas individuais (nunca em grupos), com o WhatsApp Web aberto e a extensão ligada.</p>
            </>
          )}
          {event === "lead_moved" && (
            <Select id="t-ev-col" label="Etapa de destino" value={evColumn} onChange={(v) => setEvColumn(Number(v))}>
              <option value={0}>Qualquer etapa</option>
              {data.columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          )}
          {event === "lead_status_changed" && (
            <Select id="t-ev-status" label="Nova temperatura" value={evStatus} onChange={setEvStatus}>
              <option value="">Qualquer temperatura</option>
              {Object.entries(TEMPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-label="Então">
          <h4 className="font-sans text-sm font-semibold tracking-normal">Então</h4>
          <Select id="t-action" label="Fazer isto" value={action} onChange={(v) => { setAction(v as ActionKey); setItemId(0); }}>
            {actionKeys.map((k) => <option key={k} value={k}>{ACTIONS[k]}</option>)}
          </Select>
          {fromLibrary ? (
            <LibraryPicker
              key={action}
              id="t-item"
              label={itemLabel}
              items={action === "send_message" ? data.messages : (options as MediaItem[])}
              value={itemId || null}
              onChange={(id) => setItemId(id ?? 0)}
              empty="Nada disponível ainda. Crie primeiro na Biblioteca."
            />
          ) : needsItem && (
            <>
              <Select id="t-item" label={itemLabel} value={itemId} onChange={(v) => setItemId(Number(v))}>
                <option value={0} disabled>Escolha…</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </Select>
              {options.length === 0 && <p className="text-xs text-muted">Nada disponível ainda. Crie primeiro na Biblioteca{action === "send_funnel" ? " ou em Funis" : action === "move_lead" ? " ou em Leads" : ""}.</p>}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
