"use client";

import { useState } from "react";
import { AlertCircle, Bell, CheckCircle2, Clock, FileText, Filter, Image as ImageIcon, MessageCircle, MessageSquareText, Mic, Pencil, RotateCcw, Trash2, User, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button, Chip } from "@/components/ui/shared";
import { TaskForm, type TaskFormProps } from "@/components/features/task-form";
import { useDeleteTask, useSetTaskStatus } from "@/hooks/use-tasks";
import { CONTENT_META, formatDue, isOpen, renderTemplate, stateLabel, taskState, waLink } from "@/lib/tasks";
import { formatDuration } from "@/lib/audio";
import type { Task } from "@/types";
import { cn } from "@/lib/utils";

/** Ícone da tarefa: sino para lembrete, tipo de conteúdo para envio. */
export function TaskIcon({ task, className }: { task: Pick<Task, "kind" | "content_type">; className?: string }) {
  if (task.kind === "reminder" || !task.content_type) return <Bell className={className} />;
  switch (task.content_type) {
    case "audio": return <Mic className={className} />;
    case "media": return <ImageIcon className={className} />;
    case "document": return <FileText className={className} />;
    case "funnel": return <Filter className={className} />;
    default: return <MessageSquareText className={className} />;
  }
}

/** Linha de tarefa usada nas listas (Tarefas, Agenda, lead). */
export function TaskRow({ task, onOpen, showLead = true, showDate = true }: { task: Task; onOpen: (t: Task) => void; showLead?: boolean; showDate?: boolean }) {
  const st = stateLabel(task);
  const who = task.lead?.name ?? task.contact;
  const state = taskState(task);
  const muted = state === "cancelled";
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className={cn("w-full text-left flex items-center gap-3 p-3 rounded-xl border border-line bg-card hover:border-fg transition-colors cursor-pointer", muted && "opacity-60")}
    >
      <span
        className={cn("w-10 h-10 rounded-xl grid place-items-center shrink-0", task.kind === "send" ? "bg-accent-soft text-accent-fg" : "bg-surface text-fg")}
        style={task.kind === "reminder" ? { boxShadow: `inset 3px 0 0 ${task.color}` } : undefined}
        aria-hidden="true"
      >
        <TaskIcon task={task} className="w-[18px] h-[18px]" />
      </span>
      <span className="flex-1 min-w-0">
        <span className={cn("block text-sm font-semibold truncate", muted && "line-through")}>{task.title}</span>
        <span className="block text-xs text-muted truncate tabular-nums">
          {[showLead && who, showDate && formatDue(task.due_at)].filter(Boolean).join(" · ") || (task.kind === "send" ? "Envio no WhatsApp" : "Lembrete")}
        </span>
      </span>
      <Chip tone={st.tone} className="shrink-0">{st.label}</Chip>
    </button>
  );
}

function TaskDetail({ task, onClose, onEdit }: { task: Task; onClose: () => void; onEdit: () => void }) {
  const setStatus = useSetTaskStatus();
  const del = useDeleteTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const state = taskState(task);
  const st = stateLabel(task);
  const isSend = task.kind === "send";
  const phone = task.lead?.phone ?? task.phone;
  const link = waLink(phone);
  const audioUrl = task.file_url ?? (task.media?.type === "audio" ? task.media.url : null);
  const close = () => { setConfirmDelete(false); onClose(); };

  const footer = confirmDelete ? (
    <>
      <span className="text-sm mr-auto">Excluir esta tarefa?</span>
      <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Manter</Button>
      <Button variant="danger" onClick={() => del.mutate(task, { onSuccess: close })}>Excluir</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" size="icon" aria-label="Excluir tarefa" title="Excluir" className="mr-auto hover:text-hot" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="w-4 h-4" />
      </Button>
      {isOpen(task) ? (
        <>
          {isSend ? (
            <Button variant="secondary" onClick={() => setStatus.mutate({ id: task.id, status: "cancelled" })}><XCircle className="w-4 h-4" /> Cancelar envio</Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus.mutate({ id: task.id, status: "done" })}><CheckCircle2 className="w-4 h-4" /> Marcar como feita</Button>
          )}
          <Button onClick={onEdit}><Pencil className="w-4 h-4" /> {state === "overdue" ? "Reagendar" : "Editar"}</Button>
        </>
      ) : state === "failed" ? (
        <Button onClick={onEdit}><RotateCcw className="w-4 h-4" /> Reagendar</Button>
      ) : state === "cancelled" || state === "done" ? (
        <Button variant="secondary" onClick={() => setStatus.mutate({ id: task.id, status: "scheduled" })}><RotateCcw className="w-4 h-4" /> Reabrir</Button>
      ) : (
        <Button variant="secondary" onClick={close}>Fechar</Button>
      )}
    </>
  );

  return (
    <Modal open onClose={close} title={task.title} description={isSend ? `Envio de ${CONTENT_META[task.content_type ?? "text"].label.toLowerCase()} no WhatsApp` : "Lembrete"} footer={footer}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={st.tone}>{st.label}</Chip>
          <span className="text-sm text-muted flex items-center gap-1.5 tabular-nums"><Clock className="w-4 h-4" /> {formatDue(task.due_at)}</span>
        </div>

        {state === "overdue" && isSend && (
          <p className="text-sm rounded-xl bg-warn-soft text-warn p-3">
            O horário passou e o envio não aconteceu. Isso acontece quando o WhatsApp Web não está aberto com a extensão. Reagende ou cancele.
          </p>
        )}
        {state === "failed" && (
          <p className="text-sm rounded-xl bg-hot-soft text-hot p-3 flex gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {task.error || "O envio falhou."}
          </p>
        )}

        {(task.lead || task.contact) && (
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="w-10 h-10 rounded-full bg-surface grid place-items-center shrink-0"><User className="w-4 h-4 text-muted" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{task.lead?.name ?? task.contact}</p>
              <p className="text-xs text-muted tabular-nums">{phone || "Sem telefone"}</p>
            </div>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-[10px] border border-line text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-surface">
                <MessageCircle className="w-4 h-4" /> Abrir
              </a>
            )}
          </div>
        )}

        {isSend && (
          <section aria-label="Conteúdo" className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-muted">O que será enviado</h4>
            {task.content_type === "text" && (
              <p className="text-sm whitespace-pre-wrap rounded-xl bg-surface p-4">{renderTemplate(task.text ?? "", task.lead?.name)}</p>
            )}
            {task.content_type === "audio" && (
              audioUrl ? (
                <div className="rounded-xl bg-surface p-3 flex flex-col gap-2">
                  <p className="text-sm font-medium">
                    {task.file_url ? "Áudio exclusivo" : task.media?.title}
                    {task.options?.duration ? <span className="text-muted font-normal"> · {formatDuration(task.options.duration)}</span> : null}
                  </p>
                  <audio src={audioUrl} controls className="w-full h-10" />
                </div>
              ) : <MissingItem />
            )}
            {(task.content_type === "media" || task.content_type === "document") && (
              task.media ? (
                <div className="rounded-xl bg-surface p-3 flex flex-col gap-2">
                  <p className="text-sm font-medium">{task.media.title}</p>
                  {task.media.type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={task.media.url} alt={task.media.title} className="max-h-48 rounded-lg object-contain self-start" />
                  )}
                  {task.media.type === "video" && <video src={task.media.url} controls className="max-h-48 rounded-lg self-start" />}
                  {task.media.caption && <p className="text-xs text-muted whitespace-pre-wrap break-words">Legenda: {task.media.caption}</p>}
                </div>
              ) : <MissingItem />
            )}
            <ul className="text-xs text-muted flex flex-col gap-1 mt-1">
              {task.options?.cancel_on_reply && <li>• Cancela se o cliente responder antes</li>}
              {task.options?.humanize && <li>• Horário varia alguns minutos para parecer humano</li>}
            </ul>
          </section>
        )}

        {task.notes && (
          <section className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium text-muted">Observações</h4>
            <p className="text-sm whitespace-pre-wrap">{task.notes}</p>
          </section>
        )}
      </div>
    </Modal>
  );
}

function MissingItem() {
  return <p className="text-sm rounded-xl bg-hot-soft text-hot p-3">O item da biblioteca foi excluído. Edite a tarefa e escolha outro.</p>;
}

type FormState = Omit<TaskFormProps, "onClose">;
export type OpenNew = (opts?: FormState) => void;

/**
 * Controla os painéis de tarefa de uma tela: `openNew` abre o formulário,
 * `openTask` abre os detalhes; renderize `sheets` em qualquer lugar da tela.
 */
export function useTaskSheets(tasks: Task[]) {
  const [form, setForm] = useState<FormState | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = tasks.find((t) => t.id === detailId) ?? null;

  const sheets = (
    <>
      {detail && !form && (
        <TaskDetail task={detail} onClose={() => setDetailId(null)} onEdit={() => setForm({ task: detail })} />
      )}
      {form && <TaskForm key={form.task?.id ?? "new"} {...form} onClose={() => setForm(null)} />}
    </>
  );

  return {
    openNew: (opts: FormState = {}) => { setDetailId(null); setForm(opts); },
    openTask: (t: Task) => setDetailId(t.id),
    sheets,
  };
}
