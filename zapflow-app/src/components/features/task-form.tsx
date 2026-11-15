"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Loader2, Mic, RotateCcw, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/shared";
import { AudioInput, type AudioInputValue } from "@/components/features/audio-input";
import { LibraryPicker } from "@/components/features/media-preview";
import { useMessages } from "@/hooks/use-messages";
import { useAudios, useDocumentos, useMidias } from "@/hooks/use-media";
import { useLeadsLite, useSaveTask, type LeadLite, type TaskInput } from "@/hooks/use-tasks";
import {
  CONTENT_META, addDays, localDate, localTime, outsideBusinessHours, renderTemplate, toDateStr, toDueISO, validPhone,
} from "@/lib/tasks";
import { formatDuration } from "@/lib/audio";
import type { Task, TaskContent, TaskKind } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";
const COLORS = ["#d1236f", "#1d4ed8", "#0e7a4f", "#9a5b00", "#b42318", "#6b21a8", "#0f766e", "#111113"];
const CONTENTS: TaskContent[] = ["text", "audio", "media", "document"];

export interface TaskFormProps {
  /** tarefa a editar */
  task?: Task | null;
  /** lead fixo (quando aberto pelo card) */
  lead?: LeadLite | null;
  /** dia sugerido (YYYY-MM-DD) */
  date?: string;
  kind?: TaskKind;
  onClose: () => void;
}

function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {htmlFor ? <label htmlFor={htmlFor} className="text-xs font-medium text-muted">{label}</label> : <span className="text-xs font-medium text-muted">{label}</span>}
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string, React.ComponentType<{ className?: string }>?][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 p-1 rounded-xl bg-surface" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, text, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-9 rounded-[9px] text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors px-2 min-w-0",
            value === v ? "bg-card text-fg shadow-sm font-semibold" : "text-muted hover:text-fg"
          )}
        >
          {Icon && <Icon className="w-4 h-4 shrink-0" />}
          <span className="truncate">{text}</span>
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex gap-3 items-start cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[var(--fg)] cursor-pointer" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function TaskForm({ task, lead: fixedLead, date, kind: initialKind, onClose }: TaskFormProps) {
  const editing = !!task;
  const save = useSaveTask();
  const messages = useMessages();
  const audios = useAudios();
  const midias = useMidias();
  const docs = useDocumentos();
  const leads = useLeadsLite(!fixedLead);

  const now = new Date();
  const defaultTime = task ? localTime(task.due_at) : "09:00";
  const [kind, setKind] = useState<TaskKind>(task?.kind ?? initialKind ?? "send");
  const [leadId, setLeadId] = useState<number | null>(task?.lead_id ?? fixedLead?.id ?? null);
  const [contact, setContact] = useState(task?.contact ?? "");
  const [phoneFix, setPhoneFix] = useState("");
  const [day, setDay] = useState(task ? localDate(task.due_at) : date ?? toDateStr(addDays(now, 1)));
  const [time, setTime] = useState(defaultTime);
  const [content, setContent] = useState<TaskContent>(task?.content_type && task.content_type !== "funnel" ? task.content_type : "text");
  const [text, setText] = useState(task?.text ?? "");
  const [audioSource, setAudioSource] = useState<"library" | "exclusive">(task?.file_url ? "exclusive" : "library");
  const [mediaId, setMediaId] = useState<number | null>(task?.media_id ?? null);
  const [recording, setRecording] = useState<AudioInputValue | null>(null);
  const [keepAudio, setKeepAudio] = useState(!!task?.file_url);
  const [title, setTitle] = useState(task?.kind === "reminder" ? task.title : "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [color, setColor] = useState(task?.color ?? COLORS[0]);
  const [cancelOnReply, setCancelOnReply] = useState(task?.options?.cancel_on_reply ?? true);
  const [humanize, setHumanize] = useState(task?.options?.humanize ?? true);

  const leadOptions = useMemo(() => leads.data ?? [], [leads.data]);
  const lead: LeadLite | null = fixedLead ?? (task?.lead as LeadLite | undefined) ?? leadOptions.find((l) => l.id === leadId) ?? null;
  const needsPhone = kind === "send" && !!lead && !validPhone(lead.phone);
  const firstName = lead?.name.trim().split(/\s+/)[0];

  const mediaList = content === "audio" ? audios.data : content === "media" ? midias.data : content === "document" ? docs.data : [];
  const picked = (mediaList ?? []).find((m) => m.id === mediaId) ?? null;

  const quick: [string, Date][] = [["Amanhã", addDays(now, 1)], ["Em 3 dias", addDays(now, 3)], ["Em 1 semana", addDays(now, 7)]];

  const autoTitle = () => {
    if (content === "text") return text.trim() ? `Texto: ${renderTemplate(text.trim(), lead?.name).slice(0, 40)}` : "Texto";
    if (content === "audio" && audioSource === "exclusive") return "Áudio exclusivo";
    return `${CONTENT_META[content].label}: ${picked?.title ?? ""}`.trim();
  };

  const submit = () => {
    const due = toDueISO(day, time);
    if (!day || !time) return toast.error("Escolha o dia e o horário.");

    if (kind === "reminder") {
      if (!title.trim()) return toast.error("Diga o que precisa ser feito.");
      if (!lead && !contact.trim() && !editing) {
        // lembrete solto é permitido, mas sem lead pedimos ao menos um nome
        return toast.error("Escolha um lead ou escreva com quem é.");
      }
    } else {
      if (!lead) return toast.error("Escolha para qual lead enviar.");
      if (needsPhone && !validPhone(phoneFix)) return toast.error(`Informe o WhatsApp de ${lead.name} com DDD.`);
      if (new Date(due).getTime() < Date.now() - 60_000) return toast.error("Escolha um horário no futuro.");
      if (content === "text" && !text.trim()) return toast.error("Escreva a mensagem.");
      if (content === "audio" && audioSource === "exclusive" && !recording && !keepAudio) return toast.error("Grave o áudio ou envie um arquivo.");
      if ((content !== "text" && !(content === "audio" && audioSource === "exclusive")) && !mediaId) return toast.error("Escolha o item da biblioteca.");
    }

    const isSend = kind === "send";
    const exclusive = isSend && content === "audio" && audioSource === "exclusive";
    const input: TaskInput = {
      kind,
      lead_id: lead?.id ?? null,
      contact: lead ? null : contact.trim() || null,
      phone: null,
      due_at: due,
      title: isSend ? autoTitle() : title.trim(),
      content_type: isSend ? content : null,
      text: isSend && content === "text" ? text.trim() : null,
      media_id: isSend && !exclusive && content !== "text" ? mediaId : null,
      funnel_id: null,
      notes: notes.trim() || null,
      color,
      options: isSend
        ? { cancel_on_reply: cancelOnReply, humanize, ...(exclusive ? { duration: recording?.duration ?? task?.options?.duration } : {}) }
        : {},
    };
    // áudio exclusivo: novo arquivo, mantém o atual (undefined) ou remove (null)
    if (!exclusive) input.file_url = null;
    else if (!recording) delete input.file_url;

    save.mutate(
      {
        id: task?.id,
        input,
        audio: exclusive ? recording?.blob ?? null : null,
        previousFileUrl: task?.file_url ?? null,
        leadPhone: needsPhone && lead ? { leadId: lead.id, phone: phoneFix.trim() } : null,
      },
      { onSuccess: onClose }
    );
  };

  const timeWarning = kind === "send" && time && outsideBusinessHours(time);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Editar tarefa" : kind === "send" ? "Agendar envio" : "Novo lembrete"}
      description={fixedLead ? `Para ${fixedLead.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? "Salvar" : kind === "send" ? "Agendar envio" : "Criar lembrete"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!editing && (
          <Segmented
            label="Tipo de tarefa"
            value={kind}
            onChange={setKind}
            options={[["send", "Enviar no WhatsApp", Send], ["reminder", "Só lembrete", Bell]]}
          />
        )}

        {/* Para quem */}
        {!fixedLead && (
          <div className="grid grid-cols-1 gap-4">
            <Field label="Lead" htmlFor="t-lead">
              <select id="t-lead" className={inputCls} value={leadId ?? ""} onChange={(e) => setLeadId(e.target.value ? Number(e.target.value) : null)} disabled={editing && !!task?.lead_id}>
                <option value="">{kind === "send" ? "Escolha um lead" : "Nenhum (escrever o nome)"}</option>
                {leadOptions.map((l) => <option key={l.id} value={l.id}>{l.name}{l.phone ? ` · ${l.phone}` : ""}</option>)}
                {task?.lead && !leadOptions.some((l) => l.id === task.lead!.id) && <option value={task.lead.id}>{task.lead.name}</option>}
              </select>
            </Field>
            {kind === "reminder" && !lead && (
              <Field label="Com quem" htmlFor="t-contact">
                <input id="t-contact" className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Nome da pessoa ou empresa" />
              </Field>
            )}
          </div>
        )}

        {needsPhone && lead && (
          <Field label={`WhatsApp de ${lead.name}`} htmlFor="t-phone" hint="O lead está sem telefone. Vamos salvar este número no cadastro dele.">
            <input id="t-phone" type="tel" className={inputCls} value={phoneFix} onChange={(e) => setPhoneFix(e.target.value)} placeholder="(11) 98765-4321" />
          </Field>
        )}

        {/* Quando */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia" htmlFor="t-day">
              <input id="t-day" type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            <Field label="Horário" htmlFor="t-time">
              <input id="t-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {quick.map(([label, d]) => {
              const on = toDateStr(d) === day;
              return (
                <button key={label} type="button" onClick={() => setDay(toDateStr(d))}
                  className={cn("h-7 px-2.5 rounded-full border text-xs font-medium cursor-pointer transition-colors", on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
                  {label}
                </button>
              );
            })}
          </div>
          {timeWarning && (
            <p className="flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> Fora do horário comercial (8h às 20h). Mensagens nesse horário costumam incomodar.
            </p>
          )}
        </div>

        {kind === "send" ? (
          <>
            {/* O que enviar */}
            <Field label="O que enviar">
              <div className="grid grid-cols-4 gap-1.5">
                {CONTENTS.map((c) => {
                  const Icon = CONTENT_META[c].icon;
                  const on = content === c;
                  return (
                    <button key={c} type="button" aria-pressed={on} onClick={() => { setContent(c); setMediaId(null); }}
                      className={cn("h-16 rounded-xl border flex flex-col items-center justify-center gap-1 text-xs font-medium cursor-pointer transition-colors",
                        on ? "border-fg bg-surface text-fg" : "border-line text-muted hover:text-fg")}>
                      <Icon className="w-5 h-5" />
                      {c === "media" ? "Mídia" : CONTENT_META[c].label}
                    </button>
                  );
                })}
              </div>
            </Field>

            {content === "text" && (
              <div className="flex flex-col gap-3">
                {(messages.data?.length ?? 0) > 0 && (
                  <Field label="Usar uma mensagem pronta" htmlFor="t-msg">
                    <select id="t-msg" className={inputCls} value="" onChange={(e) => {
                      const m = messages.data?.find((x) => x.id === Number(e.target.value));
                      if (m) setText(m.content ?? "");
                    }}>
                      <option value="">Escolher da biblioteca…</option>
                      {messages.data!.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Mensagem" htmlFor="t-text" hint={<>Escreva <code className="px-1 rounded bg-surface">{"{nome}"}</code> para usar o primeiro nome do lead.</>}>
                  <textarea id="t-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Oi {nome}, tudo bem? Passando para..."
                    className="w-full px-3 py-2.5 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg resize-y" />
                </Field>
                {text.trim() && /\{nome/i.test(text) && lead && (
                  <div className="rounded-xl bg-surface p-3">
                    <p className="text-xs text-muted mb-1">Como {firstName} vai receber</p>
                    <p className="text-sm whitespace-pre-wrap">{renderTemplate(text, lead.name)}</p>
                  </div>
                )}
              </div>
            )}

            {content === "audio" && (
              <div className="flex flex-col gap-3">
                <Segmented
                  label="Origem do áudio"
                  value={audioSource}
                  onChange={(v) => { setAudioSource(v); setMediaId(null); }}
                  options={[["library", "Da biblioteca"], ["exclusive", `Exclusivo${firstName ? " p/ " + firstName : ""}`]]}
                />
                {audioSource === "library" ? (
                  <LibraryPicker id="t-audio" label="Áudio da biblioteca" items={audios.data} loading={audios.isLoading} value={mediaId} onChange={setMediaId} empty="Nenhum áudio na biblioteca ainda. Adicione na Biblioteca." />
                ) : keepAudio && task?.file_url ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <p className="text-sm font-medium flex items-center gap-1.5"><Mic className="w-4 h-4" /> Áudio gravado{task.options?.duration ? ` · ${formatDuration(task.options.duration)}` : ""}</p>
                    <audio src={task.file_url} controls className="w-full h-10" />
                    <Button variant="secondary" size="sm" className="self-start" onClick={() => setKeepAudio(false)}><RotateCcw className="w-3.5 h-3.5" /> Gravar outro</Button>
                  </div>
                ) : (
                  <>
                    <AudioInput onChange={setRecording} />
                    <p className="text-xs text-muted">Este áudio fica guardado só nesta tarefa, sem ir para a biblioteca. Uma boa ideia é falar o nome do cliente.</p>
                  </>
                )}
              </div>
            )}

            {(content === "media" || content === "document") && (
              <LibraryPicker
                key={content}
                id="t-media"
                label={content === "media" ? "Foto ou vídeo da biblioteca" : "Documento da biblioteca"}
                items={content === "media" ? midias.data : docs.data}
                loading={content === "media" ? midias.isLoading : docs.isLoading}
                value={mediaId}
                onChange={setMediaId}
                empty={`${content === "media" ? "Nenhuma imagem ou vídeo na biblioteca ainda." : "Nenhum documento na biblioteca ainda."} Adicione na Biblioteca.`}
              />
            )}

            <div className="flex flex-col gap-3 pt-1">
              <Check checked={cancelOnReply} onChange={setCancelOnReply} title="Cancelar se o cliente responder antes" hint="Se ele mandar mensagem antes do horário, o envio não acontece." />
              <Check checked={humanize} onChange={setHumanize} title="Variar alguns minutos no horário" hint="Envia entre 0 e 4 minutos depois do marcado, para não parecer robô." />
            </div>
          </>
        ) : (
          <>
            <Field label="O que fazer" htmlFor="t-title">
              <input id="t-title" data-autofocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Ligar para confirmar o pedido" />
            </Field>
            <fieldset>
              <legend className="text-xs font-medium text-muted mb-1.5">Cor na agenda</legend>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                    className={cn("w-7 h-7 rounded-full cursor-pointer border-2", color === c ? "border-fg" : "border-transparent")}
                    style={{ backgroundColor: c, boxShadow: "inset 0 0 0 2px var(--card)" }} />
                ))}
              </div>
            </fieldset>
          </>
        )}

        <Field label="Observações (só você vê)" htmlFor="t-notes">
          <textarea id="t-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg resize-y" />
        </Field>
      </div>
    </Modal>
  );
}
