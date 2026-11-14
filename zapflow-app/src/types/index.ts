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
  created_at: string;
}

export interface Lead {
  id: number;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  product: string | null;
  value: number;
  avatar: string | null;
  last_message: string | null;
  origin: string | null;
  campaign: string | null;
  status: "hot" | "warm" | "cold";
  column_id: number;
  position: number;
  created_at: string;
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
  event: "lead_created" | "lead_moved" | "lead_status_changed" | "appointment_due" | "manual";
  action: "send_message" | "send_audio" | "send_media" | "send_funnel" | "move_lead" | "notify";
  event_config: Record<string, unknown>; // e.g. { column_id: 5, status: "hot" }
  action_config: Record<string, unknown>; // e.g. { message_id: 3, funnel_id: 2 }
  is_active: boolean;
  created_at: string;
}

// Kanban enriched types for rendering
export interface KanbanColumnWithLeads extends KanbanColumn {
  items: Lead[];
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

