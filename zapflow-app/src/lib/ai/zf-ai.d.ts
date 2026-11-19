/** Tipos do núcleo `zf-ai.js` (o JS é compartilhado com a extensão; mantenha os dois em sincronia). */

export type Provider = "anthropic" | "openai";
export type SttProvider = "openai" | "groq";
export type LibKind = "text" | "audio" | "image" | "video" | "document" | "funnel";

export interface LibItem {
  /** referência exata usada pelo agente: msg:12, aud:5, img:3, vid:4, doc:2, fun:1 */
  ref: string;
  id: number;
  kind: LibKind;
  title: string;
  caption?: string | null;
  text?: string | null;
  transcript?: string | null;
  summary?: string | null;
  whenToUse?: string | null;
  tags?: string[];
  steps?: string | null;
  favorite?: boolean;
  createdAt?: string;
}

export interface StageRef { id: number; board_id: number; board: string; title: string; outcome?: "won" | "lost" | null }
export interface TagRef { id: number; name: string; blocking?: boolean }
export interface CatalogRef { name: string; kind: "product" | "service"; priceLabel?: string; duration?: string; description?: string | null }

export interface LeadContext {
  name?: string;
  temperature?: string;
  stage?: string;
  tags?: string[];
  origin?: string | null;
  campaign?: string | null;
  product?: string | null;
  notes?: string | null;
  tasks?: string[];
}

export interface AgentEnv {
  /** modo automático: acrescenta ao prompt as regras de quem responde sem aprovação */
  auto?: boolean;
  /** máximo de mensagens por resposta (padrão 8; automático usa AutoConfig.max_sends) */
  maxSends?: number;
  profile?: Record<string, unknown>;
  library: LibItem[];
  catalog?: CatalogRef[];
  stages?: StageRef[];
  tags?: TagRef[];
  lead?: LeadContext | null;
  now?: Date;
  tz?: string;
  maxLibraryChars?: number;
  sentRefs?: string[];
}

export type AgentAction =
  | { type: "send_text"; text: string }
  | { type: "send_item"; ref: string; kind: LibKind; id: number; title: string; caption?: string }
  | { type: "set_temperature"; value: "hot" | "warm" | "cold"; reason: string }
  | { type: "move_stage"; column_id: number; board_id: number; board: string; title: string; reason: string }
  | { type: "add_tag"; tag_id: number; name: string; reason: string }
  | { type: "create_task"; title: string; due_at: string; kind: "send" | "reminder"; text?: string }
  | { type: "add_note"; text: string }
  | { type: "handoff"; reason: string; summary: string }
  | { type: "suggest_item"; title: string; kind: string; content: string; reason: string };

export interface AutoCfg {
  hours: { enabled: boolean; days: number[]; start: string; end: string };
  outside: "suggest" | "silent";
  delay_min_s: number; delay_max_s: number;
  max_per_hour: number; max_per_lead_day: number;
  pause_owner_min: number; handoff_hours: number;
  handoff_words: string[];
  skip_stage_ids: number[]; skip_tag_ids: number[];
  allow_classify: boolean; allow_tasks: boolean;
  max_sends: number;
}

export type AutoDecision =
  | { ok: true }
  | { ok: false; code: string; reason: string; action: "skip" | "suggest" | "handoff"; word?: string };

/** Linhas do banco que o gerente lê (só os campos usados). */
export interface ManagerRows {
  now?: Date;
  leads: unknown[];
  columns: unknown[];
  boards: unknown[];
  tags: unknown[];
  tasks: unknown[];
}

export interface StaleLead {
  id: number; name: string; days: number; temperature: "hot" | "warm" | "cold"; stage: string | null; value: number;
  last_message: string | null; notes: string | null; tags: string[];
}

export interface ManagerSnapshot {
  agora: string;
  totais: { leads: number; novos_24h: number; novos_7d: number; quentes: number; mornos: number; frios: number; parados_3d_ou_mais: number };
  etapas: { etapa: string; leads: number; quentes: number; valor?: string }[];
  resultados_7d: { vendas: number; valor_vendido: string; perdidos: number };
  tarefas: { abertas: number; atrasadas: number; para_hoje: number; assumir_conversa: number };
  agente_7d: Record<string, number>;
  biblioteca: Record<string, unknown>;
  leads_em_destaque: { ref: string; nome: string; [k: string]: unknown }[];
}

export interface BriefingResult {
  titulo: string;
  resumo: string;
  prioridades: { lead_id: number; nome: string; motivo: string; acao: string }[];
  alertas: string[];
  oportunidades: string[];
  recomendacoes: { texto: string; tipo: "biblioteca" | "funil" | "processo" | "treino" }[];
  usage: Usage;
  model: string;
}

export interface FunnelProposal {
  titulo: string;
  descricao: string;
  passos: { ref: string; kind: LibKind; id: number; title: string; type: "message" | "audio" | "midia" | "document"; delay_minutes: number; motivo: string }[];
  usage: Usage;
  model: string;
}

export interface Runtime {
  provider: Provider;
  key: string;
  modelChat: string;
  modelFast: string;
  stt: { provider: SttProvider; key: string; model: string };
  ready: boolean;
  sttReady: boolean;
  mode: "off" | "copilot" | "auto";
}

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

export interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  run: (input: Record<string, unknown>) => string | { content?: string; isError?: boolean; action?: AgentAction | null } | Promise<string | { content?: string; isError?: boolean; action?: AgentAction | null }>;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface HistoryMessage {
  from_me: boolean;
  by_zapflow?: boolean;
  kind?: string;
  body?: string | null;
  at?: string;
}

export interface RunResult {
  text: string;
  actions: AgentAction[];
  trace: { name: string; input: Record<string, unknown>; result: string; isError: boolean }[];
  usage: Usage;
  stop: "end" | "tool" | "length" | "refusal" | "max_steps";
  model: string;
}

export class ZfAiError extends Error {
  kind: "auth" | "model" | "quota" | "rate" | "network" | "server" | "bad_request" | "too_large" | "refusal" | "parse" | "config" | "abort" | "other";
  status?: number;
  detail?: string;
}

export interface EnrichInput {
  kind: LibKind;
  title: string;
  caption?: string | null;
  text?: string | null;
  transcript?: string | null;
  image?: { mime: string; data: string };
  document?: { mime?: string; data: string; name?: string };
}

export interface EnrichResult { summary: string; when_to_use: string; tags: string[]; content: string; usage: Usage; model: string }

export interface ZfAiApi {
  PROVIDERS: Record<Provider, { id: Provider; label: string; keyUrl: string; keyHint: string; defaults: { chat: string; fast: string }; suggestions: string[] }>;
  STT: Record<SttProvider, { id: SttProvider; label: string; base: string; keyUrl: string; defaultModel: string; models: string[] }>;
  KIND_LABEL: Record<LibKind, string>;
  REF_PREFIX: Record<LibKind, string>;
  ACTION_LABEL: Record<AgentAction["type"], string>;
  ZfAiError: typeof ZfAiError;
  parseJsonLoose(text: string): unknown;
  deaccent(s: unknown): string;
  norm(s: unknown): string;
  clip(s: unknown, n: number): string;
  listModels(o: { provider: Provider; key: string; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<{ id: string; label: string }[]>;
  pickDefaultModels(provider: Provider, models: ({ id: string } | string)[]): { chat: string; fast: string };
  runAgent(o: {
    provider: Provider; key: string; model: string;
    system: { text: string; cache?: boolean }[];
    messages: unknown[];
    tools: ToolDef[];
    maxSteps?: number; maxTokens?: number; fetchFn?: FetchFn; signal?: AbortSignal; timeoutMs?: number;
    onStep?: (s: { step: number; trace: RunResult["trace"] }) => void;
  }): Promise<RunResult>;
  refOf(kind: LibKind, id: number): string;
  resolveRuntime(s: Record<string, unknown> | null | undefined): Runtime;
  libraryFromRows(rows: { messages?: unknown[]; media?: unknown[]; funnels?: unknown[] }): LibItem[];
  stagesFromRows(boards: unknown[], columns: unknown[]): StageRef[];
  tagsFromRows(tags: unknown[]): TagRef[];
  catalogFromRows(items: unknown[] | null | undefined): CatalogRef[];
  buildLibraryIndex(items: LibItem[], opts?: { maxChars?: number }): string;
  searchLibrary(items: LibItem[], query: string, opts?: { kinds?: LibKind[]; limit?: number }): LibItem[];
  itemDetail(it: LibItem): string;
  buildSystem(env: AgentEnv): { text: string; cache?: boolean }[];
  buildTurnMessage(history: HistoryMessage[], extra?: string): string;
  formatConversation(history: HistoryMessage[]): string;
  makeAgentTools(env: AgentEnv): ToolDef[];
  enrichItem(o: { provider: Provider; key: string; model: string; item: EnrichInput; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<EnrichResult>;
  AUTO_DEFAULTS: AutoCfg;
  normalizeAuto(raw: unknown): AutoCfg;
  inAutoHours(auto: unknown, date?: Date): boolean;
  handoffWordHit(auto: unknown, text: string | null | undefined): string | null;
  pickDelayMs(auto: unknown, rnd?: number): number;
  autoDecision(ctx: {
    auto: unknown; now?: Date; chatId: string;
    lead?: { paused_until?: string | null; tag_ids?: number[]; column_ids?: number[] };
    history: { from_me: boolean; by_zapflow?: boolean; kind?: string; body?: string | null; t?: number }[];
    counts?: { hour?: number; leadDay?: number };
    triggerReplyAt?: number;
  }): AutoDecision;
  autoAllows(auto: unknown, action: { type: string }): boolean;
  staleLeads(rows: ManagerRows, opts?: { days?: number; maxDays?: number; limit?: number }): StaleLead[];
  buildManagerSnapshot(rows: ManagerRows & { runs?: unknown[]; moves?: unknown[]; suggestions?: unknown[]; library?: Record<string, number>; tz?: string }): ManagerSnapshot;
  runBriefing(o: { provider: Provider; key: string; model: string; snapshot: ManagerSnapshot; profile?: Record<string, unknown>; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<BriefingResult>;
  normalizeBriefing(c?: { auto?: unknown; hour?: unknown } | null): { auto: boolean; hour: number };
  /** Gera o resumo do dia sozinho (uma vez por dia). `sb` = cliente Supabase da conta; `settings` = linha de ai_settings. */
  autoBriefing(o: { sb: unknown; settings: unknown; now?: Date; tz?: string; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<
    { skipped: "off" | "early" | "done" | "old-db" } | { ok: true; titulo: string; briefing: unknown; model: string }
  >;
  writeFollowups(o: { provider: Provider; key: string; model: string; leads: (StaleLead & { history?: HistoryMessage[] })[]; profile?: Record<string, unknown>; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<{ mensagens: { lead_id: number; texto: string; motivo: string }[]; usage: Usage; model: string }>;
  proposeFunnel(o: { provider: Provider; key: string; model: string; library: LibItem[]; goal?: string; stats?: unknown; profile?: Record<string, unknown>; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<FunnelProposal>;
  transcribe(o: { provider?: SttProvider; key: string; model?: string; file: Blob; filename?: string; language?: string | null; prompt?: string; fetchFn?: FetchFn; signal?: AbortSignal }): Promise<string>;
}

declare const ZF_AI: ZfAiApi;
export default ZF_AI;
