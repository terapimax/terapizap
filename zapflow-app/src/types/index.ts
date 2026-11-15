// ============================================================
// ZAPFLOW — TypeScript Type Definitions
// ============================================================

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Message {
  id: number;
  user_id: string;
  title: string;
  content: string | null;
  is_favorite: boolean;
  created_at: string;
}

export interface MediaItem {
  id: number;
  user_id: string;
  title: string;
  caption: string | null;
  url: string;
  type: "audio" | "video" | "image" | "document";
  mime_type: string | null;
  size: number | null;
  is_favorite: boolean;
  is_view_once: boolean;
  created_at: string;
}

export interface Funnel {
  id: number;
  user_id: string;
  title: string;
  description: string | null;
  is_favorite: boolean;
  created_at: string;
  items: FunnelItem[];
}

export interface FunnelItem {
  id: number;
  user_id: string;
  funnel_id: number;
  item_id: number;
  type: "message" | "audio" | "midia" | "document";
  delay_minutes: number;
  delay_seconds: number;
  position: number;
  created_at: string;
}

export interface KanbanBoard {
  id: number;
  user_id: string;
  title: string;
  created_at: string;
}

export interface KanbanColumn {
  id: number;
  user_id: string;
  board_id: number;
  title: string;
  color: string;
  position: number;
  /** etapa de entrada: onde caem os leads novos do WhatsApp */
  is_inbox: boolean;
  created_at: string;
}

export type LeadTemp = "hot" | "warm" | "cold";

/** Contato da base de leads. Existe sozinho; o Kanban só aponta para ele. */
export interface Lead {
  id: number;
  user_id: string;
  name: string;
  phone: string | null;
  /** telefone normalizado (só dígitos, com 55), calculado pelo banco; nunca gravar */
  phone_key: string | null;
  email: string | null;
  avatar: string | null;
  last_message: string | null;
  origin: string | null;
  campaign: string | null;
  status: LeadTemp;
  notes: string | null;
  /** conversa do WhatsApp (…@c.us ou …@lid); a extensão reconhece o lead por ela quando o número está escondido */
  wa_id: string | null;
  /** quando o contato mandou a última mensagem (a extensão atualiza) */
  last_contact_at: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string;
  /** etiqueta do WhatsApp Business ligada a esta (a extensão sincroniza as duas) */
  wa_label_id: string | null;
  created_at: string;
}

/** Lead com as etiquetas e os cards (para a lista de Leads e a ficha). */
export interface LeadFull extends Lead {
  lead_tags: { tag_id: number }[];
  kanban_cards: Pick<KanbanCard, "id" | "board_id" | "column_id" | "value" | "product" | "position">[];
}

/** Um lead numa etapa de um quadro. Valor e produto são do negócio, não da pessoa. */
export interface KanbanCard {
  id: number;
  user_id: string;
  lead_id: number;
  board_id: number;
  column_id: number;
  position: number;
  value: number;
  product: string | null;
  created_at: string;
}

export interface KanbanCardWithLead extends KanbanCard {
  lead: Lead & { lead_tags: { tag_id: number }[] };
}

export interface LeadNote {
  id: number;
  user_id: string;
  lead_id: number;
  text: string;
  created_at: string;
}

export type TaskKind = "send" | "reminder";
export type TaskContent = "text" | "audio" | "media" | "document" | "funnel";
export type TaskStatus = "scheduled" | "sending" | "sent" | "failed" | "cancelled" | "done";

export interface TaskOptions {
  /** não envia se o cliente mandar mensagem depois que a tarefa foi criada */
  cancel_on_reply?: boolean;
  /** varia o horário em alguns minutos para parecer humano */
  humanize?: boolean;
  /** duração do áudio exclusivo, em segundos */
  duration?: number;
  /** conversa do WhatsApp (criada pela extensão) e controle do envio automático */
  chat_id?: string;
  created_at_ms?: number;
  claimed_at?: number;
  /** id do compromisso antigo que virou esta tarefa */
  from_appointment?: number;
}

export interface Task {
  id: number;
  user_id: string;
  lead_id: number | null;
  kind: TaskKind;
  title: string;
  due_at: string;
  contact: string | null;
  phone: string | null;
  content_type: TaskContent | null;
  text: string | null;
  media_id: number | null;
  funnel_id: number | null;
  /** áudio exclusivo gravado para esta tarefa */
  file_url: string | null;
  notes: string | null;
  color: string;
  options: TaskOptions;
  status: TaskStatus;
  attempts: number;
  error: string | null;
  finished_at: string | null;
  created_at: string;
  // relações carregadas junto
  lead?: Pick<Lead, "id" | "name" | "phone"> | null;
  media?: Pick<MediaItem, "id" | "title" | "type" | "url" | "caption"> | null;
}

export interface Trigger {
  id: number;
  user_id: string;
  title: string;
  event: "keyword" | "lead_created" | "lead_moved" | "lead_status_changed" | "appointment_due" | "manual";
  action: "send_message" | "send_audio" | "send_media" | "send_document" | "send_funnel" | "move_lead" | "notify";
  event_config: Record<string, unknown>; // e.g. { column_id: 5, status: "hot" }
  action_config: Record<string, unknown>; // e.g. { message_id: 3, funnel_id: 2 }
  is_active: boolean;
  created_at: string;
}

// Kanban enriched types for rendering
export interface KanbanColumnWithCards extends KanbanColumn {
  items: KanbanCardWithLead[];
}

// Navigation
export type NavPage =
  | "inicio"
  | "kanban"
  | "mensagens"
  | "audios"
  | "midias"
  | "documentos"
  | "funis"
  | "gatilhos"
  | "configuracoes";

