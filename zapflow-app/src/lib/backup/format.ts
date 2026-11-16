// Formato do backup do ZapFlow e a forma comum que a restauração usa
// (tanto para backup do ZapFlow quanto para o que vem do ZapVoice).

export const BACKUP_APP = "zapflow";
/** 2 = leads separados do Kanban (cards) + etiquetas. A versão 1 é convertida ao abrir. */
export const BACKUP_VERSION = 2;

/** Tabelas na ordem em que são restauradas (quem é referenciado vem antes). */
export const TABLES = [
  "messages",
  "media_library",
  "funnels",
  "funnel_items",
  "kanban_boards",
  "kanban_columns",
  "tags",
  "leads",
  "lead_tags",
  "kanban_cards",
  "triggers",
  "appointments",
  "tasks",
] as const;
export type TableName = (typeof TABLES)[number];

/** Colunas gravadas na restauração (id e user_id são sempre novos). */
export const COLUMNS: Record<TableName, string[]> = {
  messages: ["title", "content", "is_favorite", "created_at"],
  media_library: ["title", "caption", "url", "type", "mime_type", "size", "is_favorite", "is_view_once", "created_at"],
  funnels: ["title", "description", "is_favorite", "created_at"],
  funnel_items: ["funnel_id", "item_id", "type", "delay_minutes", "delay_seconds", "position", "created_at"],
  kanban_boards: ["title", "created_at"],
  kanban_columns: ["board_id", "title", "color", "position", "outcome", "created_at"],
  tags: ["name", "color", "created_at"],
  leads: ["name", "phone", "email", "avatar", "last_message", "origin", "campaign", "status", "notes", "wa_id", "last_contact_at", "created_at"],
  lead_tags: ["lead_id", "tag_id", "created_at"],
  kanban_cards: ["lead_id", "board_id", "column_id", "position", "value", "product", "created_at"],
  triggers: ["title", "event", "action", "event_config", "action_config", "is_active", "created_at"],
  appointments: ["title", "contact", "phone", "date", "time", "color", "notes", "status", "created_at"],
  tasks: ["lead_id", "kind", "title", "due_at", "contact", "phone", "content_type", "text", "media_id", "funnel_id", "file_url", "notes", "color", "options", "status", "attempts", "error", "finished_at", "created_at"],
};

export type Row = Record<string, unknown> & { id: number };
export type Tables = Record<TableName, Row[]>;

export function emptyTables(): Tables {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Tables;
}

/** manifest.json dentro do .zip */
export interface Manifest {
  app: typeof BACKUP_APP;
  version: number;
  created_at: string;
  account?: string | null;
  tables: Tables;
  /** link original do arquivo -> caminho dentro do .zip */
  files: Record<string, string>;
}

/** O que a restauração recebe, venha de onde vier. */
export interface BackupSource {
  kind: "zapflow" | "zapvoice";
  label: string;
  created_at?: string | null;
  tables: Tables;
  /** devolve o arquivo de um link do backup, ou null se ele não veio no backup */
  getFile(url: string): Promise<Blob | null>;
  hasFile(url: string): boolean;
  filesBytes: number;
  /** avisos sobre partes do backup que não têm equivalente aqui */
  notes: string[];
}

export function fileExtFromMime(mime: string | null | undefined, fallback = "bin") {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  const map: Record<string, string> = {
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/webm": "webm",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/3gpp": "3gp",
    "application/pdf": "pdf", "text/plain": "txt",
  };
  if (map[m]) return map[m];
  const sub = m.split("/")[1];
  return sub && /^[a-z0-9]{1,5}$/.test(sub) ? sub : fallback;
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}
