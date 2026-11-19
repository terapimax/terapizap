// Backup e restauração de tudo do usuário: tabelas + arquivos do Storage.
// Recebe o cliente do Supabase por parâmetro (facilita testar sem banco real).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BACKUP_APP, BACKUP_VERSION, COLUMNS, TABLES, emptyTables, fileExtFromMime,
  type BackupSource, type Manifest, type Row, type TableName, type Tables,
} from "./format";
import { phoneKey } from "../leads";
import { ZipWriter, readZip } from "./zip";
import { fromZapVoice, isZapVoiceBackup } from "./zapvoice";

export const BUCKET = "campaign_files";

export interface Progress { label: string; done: number; total: number }
type OnProgress = (p: Progress) => void;

export function storagePath(url?: string | null) {
  return url?.includes(`/${BUCKET}/`) ? decodeURIComponent(url.split(`/${BUCKET}/`)[1].split("?")[0]) : null;
}

/** Tabelas que bancos antigos ainda não têm (backup segue sem elas). */
const OPTIONAL = new Set<TableName>(["owners", "catalog_items", "campaigns", "campaign_items", "card_items"]);

async function fetchAll(db: SupabaseClient, table: TableName): Promise<Row[]> {
  const out: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select("*").order("id", { ascending: true }).range(from, from + page - 1);
    if (error && OPTIONAL.has(table) && ["42P01", "PGRST205"].includes(error.code)) return out;
    if (error) throw new Error(`Não foi possível ler ${table}: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < page) return out;
  }
}

async function readAllTables(db: SupabaseClient, onProgress?: OnProgress) {
  const tables = emptyTables();
  for (let i = 0; i < TABLES.length; i++) {
    onProgress?.({ label: "Lendo seus dados", done: i, total: TABLES.length });
    tables[TABLES[i]] = await fetchAll(db, TABLES[i]);
  }
  return tables;
}

/** Roda tarefas com no máximo `n` ao mesmo tempo. */
async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

/* ============================== BACKUP ============================== */

export interface BackupResult { blob: Blob; filename: string; files: number; failedFiles: string[] }

export async function createBackup(db: SupabaseClient, opts: { includeFiles: boolean }, onProgress?: OnProgress): Promise<BackupResult> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Entre na sua conta para fazer o backup.");

  const tables = await readAllTables(db, onProgress);
  const zip = new ZipWriter();
  const files: Record<string, string> = {};
  const failedFiles: string[] = [];

  if (opts.includeFiles) {
    const urls = [...new Set([
      ...tables.media_library.map((m) => m.url as string),
      ...tables.tasks.map((t) => t.file_url as string | null),
    ].filter((u): u is string => !!u))];
    const titleOf = new Map(tables.media_library.map((m) => [m.url as string, String(m.title)]));
    let done = 0;
    // Baixa até 3 por vez, mas grava no zip em ordem.
    const blobs: (Blob | null)[] = new Array(urls.length).fill(null);
    await pool(urls, 3, async (url, i) => {
      try {
        const path = storagePath(url);
        let blob: Blob | null = null;
        if (path) {
          const { data, error } = await db.storage.from(BUCKET).download(path);
          if (!error) blob = data;
        }
        if (!blob) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          blob = await res.blob();
        }
        blobs[i] = blob;
      } catch {
        failedFiles.push(titleOf.get(url) ?? url);
      }
      onProgress?.({ label: "Baixando arquivos", done: ++done, total: urls.length });
    });
    for (let i = 0; i < urls.length; i++) {
      const blob = blobs[i];
      if (!blob) continue;
      const fromUrl = /\.([a-z0-9]{1,5})(?:\?|$)/i.exec(urls[i])?.[1]?.toLowerCase();
      const name = `files/${String(i + 1).padStart(4, "0")}.${fromUrl || fileExtFromMime(blob.type)}`;
      onProgress?.({ label: "Montando o arquivo de backup", done: i, total: urls.length });
      await zip.add(name, blob);
      files[urls[i]] = name;
      blobs[i] = null;
    }
  }

  const manifest: Manifest = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    account: user.email ?? null,
    tables,
    files,
  };
  await zip.add("manifest.json", JSON.stringify(manifest));
  await zip.add("LEIA-ME.txt", "Backup do ZapFlow.\r\nPara restaurar: painel > Configurações > Backup e restauração > Restaurar backup, e escolha este arquivo .zip.\r\nNão é preciso descompactar.\r\n");

  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    blob: zip.finish(),
    filename: `zapflow-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`,
    files: Object.keys(files).length,
    failedFiles,
  };
}

/* ========================== ABRIR ARQUIVO ========================== */

/**
 * Backup da versão 1: o lead ficava preso a uma etapa (column_id, position, value, product).
 * Vira lead + card, como no banco novo.
 */
export function upgradeTables(tables: Tables) {
  if (tables.kanban_cards.length || !tables.leads.some((l) => l.column_id != null)) return tables;
  const boardOf = new Map(tables.kanban_columns.map((c) => [Number(c.id), Number(c.board_id)]));
  let id = 1;
  for (const l of tables.leads) {
    const board = boardOf.get(Number(l.column_id));
    if (board == null) continue;
    tables.kanban_cards.push({
      id: id++, lead_id: l.id, board_id: board, column_id: l.column_id, position: l.position ?? 0,
      value: l.value ?? 0, product: l.product ?? null, created_at: l.created_at,
    });
  }
  return tables;
}

function fromManifest(m: Manifest, getZipFile?: (path: string) => Promise<Blob | null>, sizes?: Map<string, number>): BackupSource {
  const tables = emptyTables();
  for (const t of TABLES) tables[t] = Array.isArray(m.tables?.[t]) ? (m.tables[t] as Row[]) : [];
  upgradeTables(tables);
  const files = m.files ?? {};
  let filesBytes = 0;
  for (const path of Object.values(files)) filesBytes += sizes?.get(path) ?? 0;
  return {
    kind: "zapflow",
    label: "Backup do ZapFlow",
    created_at: m.created_at ?? null,
    tables,
    filesBytes,
    notes: [],
    hasFile: (url) => !!getZipFile && !!files[url],
    getFile: async (url) => (getZipFile && files[url] ? getZipFile(files[url]) : null),
  };
}

export async function openBackup(file: File): Promise<BackupSource> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const entries = await readZip(file);
    const man = [...entries.values()].find((e) => e.name === "manifest.json" || e.name.endsWith("/manifest.json"));
    if (!man) throw new Error("Este .zip não é um backup do ZapFlow (falta o manifest.json).");
    const prefix = man.name.slice(0, -"manifest.json".length);
    const m = JSON.parse(await (await man.read()).text()) as Manifest;
    if (m.app !== BACKUP_APP) throw new Error("Este .zip não é um backup do ZapFlow.");
    const sizes = new Map([...entries.values()].map((e) => [e.name.slice(prefix.length), e.size]));
    return fromManifest(m, async (path) => { const e = entries.get(prefix + path); return e ? e.read() : null; }, sizes);
  }

  let j: unknown;
  try {
    j = JSON.parse(await file.text());
  } catch {
    throw new Error("Não consegui ler o arquivo. Escolha o .zip do ZapFlow ou o .json do ZapVoice.");
  }
  if (isZapVoiceBackup(j)) return fromZapVoice(j);
  if (j && typeof j === "object" && (j as Manifest).app === BACKUP_APP) return fromManifest(j as Manifest);
  throw new Error("Arquivo não reconhecido. Escolha o .zip do ZapFlow ou o .json do ZapVoice.");
}

/**
 * O que "Substituir" pode apagar: só os grupos que o arquivo traz. Um backup só de mídias (como o do
 * ZapVoice) troca as mensagens e as mídias e NUNCA encosta em leads, Kanban, funis, gatilhos ou tarefas.
 */
export const REPLACE_GROUPS: { label: string; tables: TableName[] }[] = [
  { label: "mensagens", tables: ["messages"] },
  { label: "mídias", tables: ["media_library"] },
  { label: "funis", tables: ["funnels", "funnel_items"] },
  { label: "gatilhos", tables: ["triggers"] },
  { label: "leads, Kanban, etiquetas e responsáveis", tables: ["leads", "lead_tags", "kanban_cards", "card_items", "kanban_columns", "kanban_boards", "tags", "owners"] },
  { label: "produtos, serviços e campanhas", tables: ["catalog_items", "campaigns", "campaign_items"] },
  { label: "tarefas", tables: ["tasks", "appointments"] },
];

export function replaceScope(tables: Tables) {
  const groups = REPLACE_GROUPS.filter((g) => g.tables.some((t) => (tables[t]?.length ?? 0) > 0));
  return { groups, tables: new Set<TableName>(groups.flatMap((g) => g.tables)) };
}

export function summarize(s: BackupSource) {
  const m = s.tables.media_library;
  return [
    { label: "Mensagens", n: s.tables.messages.length },
    { label: "Áudios", n: m.filter((x) => x.type === "audio").length },
    { label: "Imagens e vídeos", n: m.filter((x) => x.type === "image" || x.type === "video").length },
    { label: "Documentos", n: m.filter((x) => x.type === "document").length },
    { label: "Funis", n: s.tables.funnels.length },
    { label: "Gatilhos", n: s.tables.triggers.length },
    { label: "Leads", n: s.tables.leads.length },
    { label: "Etiquetas", n: s.tables.tags.length },
    { label: "Responsáveis", n: s.tables.owners.length },
    { label: "Produtos e serviços", n: s.tables.catalog_items.length },
    { label: "Campanhas", n: s.tables.campaigns.length },
    { label: "Quadros do Kanban", n: s.tables.kanban_boards.length },
    { label: "Cards no Kanban", n: s.tables.kanban_cards.length },
    { label: "Tarefas", n: s.tables.tasks.length },
    { label: "Agenda antiga", n: s.tables.appointments.length },
  ];
}

/* ============================ RESTAURAR ============================ */

export type RestoreMode = "merge" | "replace";

export interface RestoreReport {
  ok: boolean;
  mode: RestoreMode;
  added: Partial<Record<TableName, number>>;
  reused: Partial<Record<TableName, number>>;
  problems: string[];
  /** substituir: o que havia antes foi apagado? */
  replaced: boolean;
  confirmationPending?: boolean;
}

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const ms = (v: unknown) => { const t = Date.parse(String(v ?? "")); return Number.isNaN(t) ? String(v ?? "") : String(t); };

const KEYS: Record<TableName, ((r: Row) => string) | null> = {
  messages: (r) => `${norm(r.title)}|${norm(r.content)}`,
  media_library: (r) => `${r.type}|${norm(r.title)}`,
  funnels: (r) => norm(r.title),
  funnel_items: null, // vem junto com o funil
  kanban_boards: (r) => norm(r.title),
  kanban_columns: (r) => `${r.board_id}|${norm(r.title)}`,
  tags: (r) => norm(r.name),
  owners: (r) => norm(r.name),
  // o banco não aceita dois com o mesmo nome (sem diferenciar maiúsculas e espaços)
  catalog_items: (r) => norm(String(r.name ?? "").replace(/\s+/g, " ")),
  campaigns: (r) => norm(String(r.name ?? "").replace(/\s+/g, " ")),
  campaign_items: (r) => `${r.campaign_id}|${r.item_id}`,
  // mesmo telefone = mesmo lead (o banco não aceita repetido); sem telefone, pelo nome
  leads: (r) => phoneKey(r.phone as string) ?? (r.wa_id ? `wa:${r.wa_id}` : `${norm(r.name)}|${digits(r.phone)}`),
  lead_tags: (r) => `${r.lead_id}|${r.tag_id}`,
  kanban_cards: (r) => `${r.lead_id}|${r.board_id}`,
  card_items: (r) => `${r.card_id}|${norm(r.name)}`,
  triggers: (r) => `${norm(r.title)}|${r.event}|${r.action}`,
  appointments: (r) => `${norm(r.title)}|${r.date}|${r.time}|${norm(r.contact)}`,
  tasks: (r) => `${norm(r.title)}|${ms(r.due_at)}|${digits(r.phone)}`,
};

/** Tabelas em que o banco não aceita repetido (telefone, nome da etiqueta, lead+quadro…). */
const UNIQUE = new Set<TableName>(["tags", "owners", "catalog_items", "campaigns", "campaign_items", "leads", "lead_tags", "kanban_cards"]);

const LABEL: Record<TableName, string> = {
  messages: "mensagem", media_library: "arquivo", funnels: "funil", funnel_items: "passo de funil",
  kanban_boards: "quadro", kanban_columns: "etapa", tags: "etiqueta", owners: "responsável", catalog_items: "produto ou serviço", campaigns: "campanha", campaign_items: "item de campanha", card_items: "item do card", leads: "lead", lead_tags: "etiqueta de lead", kanban_cards: "card do Kanban", triggers: "gatilho", appointments: "compromisso", tasks: "tarefa",
};

function pick(table: TableName, r: Row, uid: string) {
  const o: Record<string, unknown> = { user_id: uid };
  for (const c of COLUMNS[table]) if (r[c] !== undefined) o[c] = r[c];
  return o;
}

export async function restoreBackup(db: SupabaseClient, src: BackupSource, mode: RestoreMode, onProgress?: OnProgress): Promise<RestoreReport> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Entre na sua conta para restaurar.");
  const uid = user.id;

  const report: RestoreReport = { ok: false, mode, added: {}, reused: {}, problems: [], replaced: false };
  const before = await readAllTables(db, onProgress);
  const maps = Object.fromEntries(TABLES.map((t) => [t, new Map<number, number>()])) as Record<TableName, Map<number, number>>;
  // Cada id negativo aponta para a posição de uma inclusão anterior na mesma transação.
  const plan: { table: TableName; row: Record<string, unknown> }[] = [];
  const uploaded: string[] = [];
  let failures = 0;

  // No modo "juntar", reaproveita o que já existe com o mesmo nome (dá para rodar de novo sem duplicar).
  // Tabelas com regra de "não repetir" no banco reaproveitam sempre (até no "substituir", que grava
  // tudo antes de apagar o antigo); o que for reaproveitado não é apagado depois.
  const existing = Object.fromEntries(TABLES.map((t) => {
    const key = KEYS[t];
    const m = new Map<string, number>();
    if ((mode === "merge" || UNIQUE.has(t)) && key) for (const r of before[t]) { const k = key(r); if (!m.has(k)) m.set(k, r.id); }
    return [t, m];
  })) as Record<TableName, Map<string, number>>;
  const reusedIds = Object.fromEntries(TABLES.map((t) => [t, new Set<number>()])) as Record<TableName, Set<number>>;
  /** repetidos dentro do próprio backup: id antigo -> id antigo do primeiro igual */
  const aliases = Object.fromEntries(TABLES.map((t) => [t, [] as [number, number][]])) as Record<TableName, [number, number][]>;

  const count = (bucket: "added" | "reused", t: TableName, n = 1) => { report[bucket][t] = (report[bucket][t] ?? 0) + n; };
  const problem = (msg: string) => { failures++; if (report.problems.length < 50) report.problems.push(msg); };

  async function writeRows(t: TableName, rows: Record<string, unknown>[], check: string): Promise<Row[]> {
    if (mode === "replace") return rows.map((row) => {
      plan.push({ table: t, row });
      return { ...row, id: -plan.length };
    });
    const { data, error } = await db.from(t).insert(rows).select(`id, ${check}`);
    if (error) throw new Error(`Falha ao gravar ${LABEL[t]}: ${error.message}`);
    return (data ?? []) as unknown as Row[];
  }

  /** Insere em lotes e liga id antigo -> id novo pela ordem (conferida pelo campo `check`). */
  async function insertRows(t: TableName, rows: { old: number; row: Record<string, unknown> }[], check: string, label: string) {
    const size = 200;
    for (let i = 0; i < rows.length; i += size) {
      onProgress?.({ label, done: i, total: rows.length });
      const chunk = rows.slice(i, i + size);
      const got = await writeRows(t, chunk.map((c) => c.row), check);
      if (got.length !== chunk.length) throw new Error(`Falha ao gravar ${LABEL[t]}: o banco devolveu ${got.length} de ${chunk.length}.`);
      got.forEach((g, k) => {
        if (String(g[check] ?? "") !== String(chunk[k].row[check] ?? "")) throw new Error(`Falha ao ligar ${LABEL[t]} (ordem diferente do esperado).`);
        maps[t].set(chunk[k].old, g.id);
      });
      count("added", t, chunk.length);
    }
    for (const [dup, first] of aliases[t]) { const id = maps[t].get(first); if (id != null) maps[t].set(dup, id); }
  }

  /** Separa o que já existe (reaproveita) do que precisa ser criado. */
  function split(t: TableName, rows: Row[], build: (r: Row) => Record<string, unknown> | null) {
    const toInsert: { old: number; row: Record<string, unknown> }[] = [];
    const key = KEYS[t];
    const pending = new Map<string, number>();
    for (const r of rows) {
      const row = build(r);
      if (!row) continue;
      // a chave usa os ids já trocados (ex.: etapa = quadro novo + nome)
      const k = key ? key({ ...r, ...row, id: r.id } as Row) : null;
      const found = k != null ? existing[t].get(k) : undefined;
      if (found != null) { maps[t].set(r.id, found); reusedIds[t].add(found); count("reused", t); continue; }
      if (k != null && UNIQUE.has(t)) {
        const first = pending.get(k);
        if (first != null) { aliases[t].push([r.id, first]); continue; }
        pending.set(k, r.id);
      }
      toInsert.push({ old: r.id, row });
    }
    return toInsert;
  }

  async function uploadFile(url: string, mime: unknown, folder: string): Promise<string | null> {
    const blob = await src.getFile(url);
    if (!blob) return null;
    const type = (typeof mime === "string" && mime) || blob.type || "application/octet-stream";
    const path = `${uid}/${folder}${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${fileExtFromMime(type)}`;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: true });
      if (!error) { uploaded.push(path); return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
      lastErr = error.message;
      if (/exceed|too large|payload/i.test(lastErr)) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    throw new Error(/exceed|too large|payload/i.test(lastErr) ? "arquivo maior que o limite do Supabase" : lastErr);
  }

  const T = src.tables;
  try {
    // 1. Mensagens
    await insertRows("messages", split("messages", T.messages, (r) => pick("messages", r, uid)), "title", "Gravando mensagens");

    // 2. Biblioteca (envia cada arquivo e grava em seguida — se parar no meio, o que entrou fica)
    const media = split("media_library", T.media_library, (r) => pick("media_library", r, uid));
    let done = 0;
    await pool(media, 3, async ({ old, row }) => {
      try {
        const url = String(row.url ?? "");
        if (src.hasFile(url)) {
          const newUrl = await uploadFile(url, row.mime_type, "");
          if (!newUrl) throw new Error("arquivo não encontrado no backup");
          row.url = newUrl;
        } else if (!/^https?:\/\//.test(url)) {
          throw new Error("arquivo não veio no backup");
        }
        const [saved] = await writeRows("media_library", [row], "title");
        maps.media_library.set(old, saved.id);
        count("added", "media_library");
      } catch (e) {
        problem(`“${row.title}”: ${(e as Error).message}`);
      }
      onProgress?.({ label: "Enviando áudios, mídias e documentos", done: ++done, total: media.length });
    });

    // 3. Funis + passos
    const funnelsNew = split("funnels", T.funnels, (r) => pick("funnels", r, uid));
    const newFunnelOld = new Set(funnelsNew.map((f) => f.old));
    await insertRows("funnels", funnelsNew, "title", "Gravando funis");
    const steps: { old: number; row: Record<string, unknown> }[] = [];
    for (const r of T.funnel_items) {
      if (!newFunnelOld.has(Number(r.funnel_id))) continue; // funil reaproveitado: mantém os passos de lá
      const funnel = maps.funnels.get(Number(r.funnel_id));
      const item = (r.type === "message" ? maps.messages : maps.media_library).get(Number(r.item_id));
      if (funnel == null) continue;
      if (item == null) { problem(`Um passo de funil ficou de fora: o ${r.type === "message" ? "texto" : "arquivo"} dele não foi restaurado.`); continue; }
      steps.push({ old: r.id, row: { ...pick("funnel_items", r, uid), funnel_id: funnel, item_id: item } });
    }
    await insertRows("funnel_items", steps, "position", "Gravando passos dos funis");

    // 4. Quadros -> etapas -> leads
    await insertRows("kanban_boards", split("kanban_boards", T.kanban_boards, (r) => pick("kanban_boards", r, uid)), "title", "Gravando quadros");
    await insertRows("kanban_columns", split("kanban_columns", T.kanban_columns, (r) => {
      const board = maps.kanban_boards.get(Number(r.board_id));
      return board == null ? null : { ...pick("kanban_columns", r, uid), board_id: board };
    }), "title", "Gravando etapas");
    await insertRows("tags", split("tags", T.tags, (r) => pick("tags", r, uid)), "name", "Gravando etiquetas");
    await insertRows("owners", split("owners", T.owners, (r) => pick("owners", r, uid)), "name", "Gravando responsáveis");
    // catálogo e campanhas antes dos leads: o banco liga o lead à campanha pelo nome
    await insertRows("catalog_items", split("catalog_items", T.catalog_items, (r) => pick("catalog_items", r, uid)), "name", "Gravando produtos e serviços");
    await insertRows("campaigns", split("campaigns", T.campaigns, (r) => pick("campaigns", r, uid)), "name", "Gravando campanhas");
    await insertRows("campaign_items", split("campaign_items", T.campaign_items, (r) => {
      const campaign = maps.campaigns.get(Number(r.campaign_id));
      const item = maps.catalog_items.get(Number(r.item_id));
      return campaign == null || item == null ? null : { ...pick("campaign_items", r, uid), campaign_id: campaign, item_id: item };
    }), "campaign_id", "Gravando itens das campanhas");
    await insertRows("leads", split("leads", T.leads, (r) => {
      const row = pick("leads", r, uid);
      // responsável: troca pelo id novo (backup antigo, sem responsáveis, nem manda o campo)
      if (r.owner_id != null) row.owner_id = maps.owners.get(Number(r.owner_id)) ?? null;
      else delete row.owner_id;
      return row;
    }), "name", "Gravando leads");
    await insertRows("lead_tags", split("lead_tags", T.lead_tags, (r) => {
      const lead = maps.leads.get(Number(r.lead_id));
      const tag = maps.tags.get(Number(r.tag_id));
      return lead == null || tag == null ? null : { ...pick("lead_tags", r, uid), lead_id: lead, tag_id: tag };
    }), "lead_id", "Gravando etiquetas dos leads");
    let orphanCards = 0;
    await insertRows("kanban_cards", split("kanban_cards", T.kanban_cards, (r) => {
      const lead = maps.leads.get(Number(r.lead_id));
      const board = maps.kanban_boards.get(Number(r.board_id));
      const col = maps.kanban_columns.get(Number(r.column_id));
      if (lead == null || board == null || col == null) { orphanCards++; return null; }
      return { ...pick("kanban_cards", r, uid), lead_id: lead, board_id: board, column_id: col };
    }), "lead_id", "Gravando o Kanban");
    await insertRows("card_items", split("card_items", T.card_items, (r) => {
      const card = maps.kanban_cards.get(Number(r.card_id));
      if (card == null) return null;
      // item apagado do catálogo (ou fora do backup) continua no card, só sem ligação
      const item = r.item_id == null ? null : maps.catalog_items.get(Number(r.item_id)) ?? null;
      return { ...pick("card_items", r, uid), card_id: card, item_id: item };
    }), "name", "Gravando produtos e serviços dos cards");
    if (orphanCards) problem(`${orphanCards} card(s) do Kanban ficaram de fora porque o quadro ou a etapa deles não está no backup. Os leads foram restaurados.`);

    // 5. Gatilhos (os ids dentro da configuração apontam para os itens novos)
    const remap = (cfg: unknown) => {
      const c = { ...((cfg && typeof cfg === "object" ? cfg : {}) as Record<string, unknown>) };
      const fix = (k: string, m: Map<number, number>) => { if (c[k] != null) c[k] = m.get(Number(c[k])) ?? null; };
      fix("column_id", maps.kanban_columns);
      fix("message_id", maps.messages);
      fix("media_id", maps.media_library);
      fix("funnel_id", maps.funnels);
      fix("tag_id", maps.tags);
      return c;
    };
    await insertRows("triggers", split("triggers", T.triggers, (r) => ({
      ...pick("triggers", r, uid), event_config: remap(r.event_config), action_config: remap(r.action_config),
    })), "title", "Gravando gatilhos");

    // 6. Agenda antiga
    await insertRows("appointments", split("appointments", T.appointments, (r) => pick("appointments", r, uid)), "title", "Gravando agenda");

    // 7. Tarefas (com o áudio exclusivo de cada uma)
    const tasks = split("tasks", T.tasks, (r) => {
      const m = (map: Map<number, number>, v: unknown) => (v == null ? null : map.get(Number(v)) ?? null);
      return {
        ...pick("tasks", r, uid),
        lead_id: m(maps.leads, r.lead_id),
        media_id: m(maps.media_library, r.media_id),
        funnel_id: m(maps.funnels, r.funnel_id),
        status: r.status === "sending" ? "scheduled" : r.status,
      };
    });
    done = 0;
    for (const t of tasks) {
      const url = t.row.file_url as string | null;
      if (url && src.hasFile(url)) {
        try { t.row.file_url = await uploadFile(url, "audio/ogg", "tasks/"); }
        catch (e) { t.row.file_url = null; problem(`Áudio da tarefa “${t.row.title}”: ${(e as Error).message}`); }
      }
      onProgress?.({ label: "Enviando áudios das tarefas", done: ++done, total: tasks.length });
    }
    await insertRows("tasks", tasks, "title", "Gravando tarefas");

    // 8. Substituir: só agora apaga o que havia antes (e só se nada falhou)
    if (mode === "replace") {
      if (failures) throw new Error(`${failures} item(ns) falharam. Nada do que você tinha foi apagado.`);
      const keep = new Set(uploaded);
      const replacing = replaceScope(T).tables;
      const newUrls = new Set([
        ...T.media_library.map((r) => storagePath(r.url as string)),
        ...T.tasks.map((r) => storagePath(r.file_url as string)),
        ...(!replacing.has("media_library") ? before.media_library.map((r) => storagePath(r.url as string)) : []),
        ...(!replacing.has("tasks") ? before.tasks.map((r) => storagePath(r.file_url as string)) : []),
      ]);
      const oldPaths = [
        ...(replacing.has("media_library") ? before.media_library.map((r) => storagePath(r.url as string)) : []),
        ...(replacing.has("tasks") ? before.tasks.map((r) => storagePath(r.file_url as string)) : []),
      ].filter((p): p is string => !!p && p.startsWith(uid + "/") && !keep.has(p) && !newUrls.has(p));
      const snapshot = Object.fromEntries([...replacing].map((t) => [t, before[t].map((r) => r.id)]));
      const keepIds = Object.fromEntries([...replacing].map((t) => [t, [...reusedIds[t]]]));
      onProgress?.({ label: "Confirmando a substituição no banco", done: 0, total: 1 });
      // Sem resposta não dá para saber se houve commit. Preserve os arquivos nesse caso.
      report.confirmationPending = true;
      const { error, status } = await db.rpc("zf_replace_backup", { p_rows: plan, p_snapshot: snapshot, p_keep: keepIds });
      if (error) {
        if (error.code === "PGRST202") {
          report.confirmationPending = false;
          throw new Error("Atualize o banco com supabase/setup.sql para usar a substituição segura.");
        }
        if (status > 0 && (/^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d+$/.test(error.code))) {
          report.confirmationPending = false;
        }
        throw new Error(error.message);
      }
      report.confirmationPending = false;
      report.replaced = true;
      for (let k = 0; k < oldPaths.length; k += 100) {
        try {
          const { error: cleanupError } = await db.storage.from(BUCKET).remove(oldPaths.slice(k, k + 100));
          if (cleanupError) throw cleanupError;
        } catch {
          report.problems.push("Dados restaurados. Alguns arquivos antigos continuam no armazenamento.");
          break;
        }
      }
    }

    report.ok = failures === 0;
    return report;
  } catch (e) {
    if (mode === "replace" && !report.replaced) {
      if (!report.confirmationPending) {
        for (let k = 0; k < uploaded.length; k += 100) {
          try { await db.storage.from(BUCKET).remove(uploaded.slice(k, k + 100)); } catch { /* arquivo sem referência */ }
        }
      }
      report.added = {};
      report.reused = {};
    }
    report.problems.unshift((e as Error).message);
    report.ok = false;
    return report;
  }
}
