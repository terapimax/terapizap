import { FileText, Filter, Image as ImageIcon, MessageSquareText, Mic } from "lucide-react";
import type { Task, TaskContent, TaskStatus } from "@/types";

/** Estado mostrado na tela. "overdue" não existe no banco: é uma tarefa agendada cujo horário passou. */
export type TaskState = TaskStatus | "overdue";

type Tone = "neutral" | "ok" | "warn" | "hot" | "cold" | "accent";

export const STATE_META: Record<TaskState, { label: string; tone: Tone }> = {
  scheduled: { label: "Agendada", tone: "cold" },
  overdue: { label: "Atrasada", tone: "warn" },
  sending: { label: "Enviando", tone: "accent" },
  sent: { label: "Enviada", tone: "ok" },
  failed: { label: "Falhou", tone: "hot" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  done: { label: "Feita", tone: "ok" },
};

/** Envios ganham alguns minutos de folga antes de contar como atrasados (variação humana). */
const SEND_GRACE_MS = 5 * 60 * 1000;

export function taskState(t: Pick<Task, "status" | "due_at" | "kind">, now = Date.now()): TaskState {
  if (t.status !== "scheduled") return t.status;
  const grace = t.kind === "send" ? SEND_GRACE_MS : 0;
  return new Date(t.due_at).getTime() + grace < now ? "overdue" : "scheduled";
}

export function stateLabel(t: Pick<Task, "status" | "due_at" | "kind">, now = Date.now()) {
  const st = taskState(t, now);
  if (st === "scheduled" && t.kind === "reminder") return { ...STATE_META.scheduled, label: "Pendente" };
  return STATE_META[st];
}

export const isOpen = (t: Pick<Task, "status">) => t.status === "scheduled" || t.status === "sending";
export const isFinal = (t: Pick<Task, "status">) => !isOpen(t);

export const CONTENT_META: Record<TaskContent, { label: string; icon: typeof Mic }> = {
  text: { label: "Texto", icon: MessageSquareText },
  audio: { label: "Áudio", icon: Mic },
  media: { label: "Imagem ou vídeo", icon: ImageIcon },
  document: { label: "Documento", icon: FileText },
  funnel: { label: "Funil", icon: Filter },
};


/** Troca {nome} pelo primeiro nome e {nome_completo} pelo nome inteiro do lead. */
export function renderTemplate(text: string, name?: string | null) {
  const full = (name || "").trim();
  const first = full.split(/\s+/)[0] || "";
  return text.replace(/\{nome_completo\}/gi, full).replace(/\{nome\}/gi, first);
}

// ── Datas (sempre no fuso do navegador) ─────────────────

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDate = (iso: string) => toDateStr(new Date(iso));
export const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const toDueISO = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

export function addDays(base: Date, days: number) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
}

/** "Hoje 14:00", "Amanhã 09:00", "Ontem 18:30", "seg., 23/11 14:00" */
export function formatDue(iso: string, now = new Date()) {
  const day = localDate(iso);
  const time = localTime(iso);
  if (day === toDateStr(now)) return `Hoje ${time}`;
  if (day === toDateStr(addDays(now, 1))) return `Amanhã ${time}`;
  if (day === toDateStr(addDays(now, -1))) return `Ontem ${time}`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" });
  return `${wd} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}${sameYear ? "" : "/" + d.getFullYear()} ${time}`;
}

/** Título de grupo: "Hoje", "Amanhã", "segunda-feira, 24 de novembro" */
export function dayHeading(dateStr: string, now = new Date()) {
  if (dateStr === toDateStr(now)) return "Hoje";
  if (dateStr === toDateStr(addDays(now, 1))) return "Amanhã";
  if (dateStr === toDateStr(addDays(now, -1))) return "Ontem";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

export const phoneDigits = (phone?: string | null) => (phone || "").replace(/\D/g, "");
export const validPhone = (phone?: string | null) => phoneDigits(phone).length >= 10;
export function waLink(phone?: string | null) {
  const d = phoneDigits(phone);
  return d ? `https://wa.me/${d.length <= 11 ? "55" + d : d}` : null;
}

/** Horário comercial sugerido para envios: 8h às 20h. */
export function outsideBusinessHours(time: string) {
  const h = Number(time.slice(0, 2));
  return h < 8 || h >= 20;
}

/** Número no menu: atrasadas, com falha e as que ainda faltam hoje. */
export function attentionCount(tasks: Pick<Task, "status" | "due_at" | "kind">[], now = new Date()) {
  const today = toDateStr(now);
  return tasks.filter((t) => {
    const st = taskState(t, now.getTime());
    return st === "overdue" || st === "failed" || (st === "scheduled" && localDate(t.due_at) === today);
  }).length;
}
