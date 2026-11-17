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
  /** o que a IA entendeu (colunas novas: bancos antigos não têm) */
  ai_when_to_use?: string | null;
  ai_tags?: string[] | null;
  ai_at?: string | null;
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
  /** transcrição (áudio/vídeo) ou texto lido do arquivo (imagem/documento) */
  ai_transcript?: string | null;
  ai_summary?: string | null;
  ai_when_to_use?: string | null;
  ai_tags?: string[] | null;
  /** null = ainda não lido pela IA */
  ai_status?: "done" | "error" | "skipped" | null;
  ai_error?: string | null;
  ai_at?: string | null;
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
  /** etapa de resultado: venda fechada (won) ou perdido (lost); vale para os relatórios */
  outcome?: ColumnOutcome | null;
  created_at: string;
}

export type ColumnOutcome = "won" | "lost";

/** Histórico do funil: cada vez que um card entra no quadro, muda de etapa ou sai (to_column_id = null). */
export interface KanbanCardMove {
  id: number;
  card_id: number | null;
  lead_id: number;
  board_id: number;
  from_column_id: number | null;
  to_column_id: number | null;
  value: number | string;
  /** card que já existia quando o histórico começou (ou veio de backup): a data é a de criação, não a da entrada na etapa */
  seeded: boolean;
  at: string;
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
  /** nome da campanha (o banco mantém igual ao cadastro; vale como texto para planilhas e extensão) */
  campaign: string | null;
  /** campanha cadastrada (banco antigo não tem a coluna) */
  campaign_id?: number | null;
  status: LeadTemp;
  notes: string | null;
  /** conversa do WhatsApp (…@c.us ou …@lid); a extensão reconhece o lead por ela quando o número está escondido */
  wa_id: string | null;
  /** quando o contato mandou a última mensagem (a extensão atualiza) */
  last_contact_at: string | null;
  /** quem atende este lead (Responsáveis) */
  owner_id?: number | null;
  created_at: string;
}

/** Marca da conta (white label): uma linha por conta. */
export interface Branding {
  user_id: string;
  name: string | null;
  logo_url: string | null;
  icon_url: string | null;
  custom_domain: string | null;
  updated_at: string;
}

/** Pessoa da equipe que atende leads. Quem está no rodízio recebe os leads novos, um de cada vez. */
export interface Owner {
  id: number;
  user_id: string;
  name: string;
  color: string;
  in_rotation: boolean;
  last_assigned_at: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string;
  /** etiqueta do WhatsApp Business ligada a esta (a extensão sincroniza as duas) */
  wa_label_id: string | null;
  /** "ignorar": quem tem não vira lead pelo WhatsApp, não entra no Kanban e não guarda histórico */
  is_blocking: boolean;
  created_at: string;
}

/** Mensagem guardada no histórico do lead (a extensão grava, se o histórico estiver ligado). */
export interface LeadMessage {
  id: number;
  user_id: string;
  lead_id: number;
  wa_msg_id: string;
  from_me: boolean;
  by_zapflow: boolean;
  kind: "text" | "audio" | "image" | "video" | "document" | "sticker" | "location" | "contact";
  body: string | null;
  at: string;
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

export type CatalogKind = "product" | "service";
/** fixed = preço fechado; from = "a partir de"; quote = sob consulta */
export type PriceMode = "fixed" | "from" | "quote";

/** Produto ou serviço do catálogo. */
export interface CatalogItem {
  id: number;
  user_id: string;
  kind: CatalogKind;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  price_mode: PriceMode;
  /** serviços: duração do atendimento, em minutos */
  duration_min: number | null;
  is_active: boolean;
  created_at: string;
}

/** Campanha de onde o lead veio. */
export interface Campaign {
  id: number;
  user_id: string;
  name: string;
  channel: string | null;
  starts_on: string | null;
  ends_on: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  /** itens que a campanha oferece */
  campaign_items?: { item_id: number }[];
}

/** Produto ou serviço dentro de um card (nome e preço copiados na hora). */
export interface CardItem {
  id: number;
  user_id: string;
  card_id: number;
  /** null = o item foi apagado do catálogo (o negócio continua) */
  item_id: number | null;
  name: string;
  quantity: number;
  unit_price: number;
  position: number;
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
  event: "keyword" | "lead_created" | "lead_moved" | "lead_status_changed" | "tag_added" | "lead_stale" | "appointment_due" | "manual";
  action: "send_message" | "send_audio" | "send_media" | "send_document" | "send_funnel" | "move_lead" | "notify";
  event_config: Record<string, unknown>; // e.g. { column_id: 5, status: "hot" }
  action_config: Record<string, unknown>; // e.g. { message_id: 3, funnel_id: 2 }
  is_active: boolean;
  created_at: string;
}

// Kanban enriched types for rendering
/** Registro de cada vez que um gatilho de lead disparou (e o que aconteceu). */
export interface TriggerFire {
  id: number;
  trigger_id: number;
  lead_id: number;
  event: string;
  result: string;
  task_id: number | null;
  created_at: string;
  lead?: { name: string } | null;
}

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


/* ============================ AGENTE DE IA ============================ */

export type AiProvider = "anthropic" | "openai";
export type AiSttProvider = "openai" | "groq";
/** off = desligado · copilot = sugere e você aprova · auto = responde sozinho, dentro das travas de AutoConfig */
export type AgentMode = "off" | "copilot" | "auto";

/** Travas do piloto automático (guardadas em ai_settings.profile.auto; a regra mora em zf-ai.js: normalizeAuto). */
export interface AutoConfig {
  hours: { enabled: boolean; days: number[]; start: string; end: string };
  outside: "suggest" | "silent";
  delay_min_s: number;
  delay_max_s: number;
  max_per_hour: number;
  max_per_lead_day: number;
  pause_owner_min: number;
  handoff_hours: number;
  handoff_words: string[];
  skip_stage_ids: number[];
  skip_tag_ids: number[];
  allow_classify: boolean;
  allow_tasks: boolean;
  max_sends: number;
}

/** Treino do agente (guardado em ai_settings.profile). Tudo opcional. */
export interface AgentProfile {
  business_name?: string;
  business_about?: string;
  persona_name?: string;
  role?: string;
  goal?: string;
  tone?: "amigavel" | "profissional" | "descontraido" | "consultivo";
  tone_notes?: string;
  emoji?: "nenhum" | "pouco" | "livre";
  rules?: string;
  forbidden?: string;
  qualification?: string;
  handoff?: string;
  hours_text?: string;
  /** Travas do automático. Quem grava é a aba Automático; o Treino só preserva. */
  auto?: Partial<AutoConfig>;
}

export interface AiSettings {
  user_id: string;
  provider: AiProvider;
  model_chat: string | null;
  model_fast: string | null;
  anthropic_key: string | null;
  openai_key: string | null;
  stt_provider: AiSttProvider;
  stt_model: string | null;
  stt_key: string | null;
  mode: AgentMode;
  profile: AgentProfile;
  updated_at: string;
}

/** Registro do que o agente fez. */
export interface AgentRun {
  id: number;
  user_id: string;
  lead_id: number | null;
  source: "simulator" | "copilot" | "auto" | "library" | "manager";
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  duration_ms: number | null;
  summary: string | null;
  actions: unknown[];
  error: string | null;
  feedback: -1 | 1 | null;
  created_at: string;
}

/** Sugestão de item novo para a biblioteca (vem sozinha do registro do agente). */
export interface AgentSuggestion {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  content: string | null;
  reason: string | null;
  lead_id: number | null;
  times: number;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
  updated_at: string;
}

/** Resumo do dia montado pelo gerente. */
export interface Briefing {
  titulo: string;
  resumo: string;
  prioridades: { lead_id: number; nome: string; motivo: string; acao: string }[];
  alertas: string[];
  oportunidades: string[];
  recomendacoes: { texto: string; tipo: "biblioteca" | "funil" | "processo" | "treino" }[];
}

export interface AgentReport {
  id: number;
  user_id: string;
  kind: "briefing";
  content: { briefing: Briefing; totais?: Record<string, number>; model?: string };
  created_at: string;
}
