// Importação de leads por planilha (CSV) e exportação.
// Recebe o cliente do Supabase por parâmetro (como o backup), para dar para testar sem banco.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanbanBoard, KanbanColumn, LeadFull, LeadTemp, Tag } from "@/types";
import {
  FIELD_LABEL, TAG_COLORS, TEMP_LABEL, deaccent, formatPhone, mapHeaders, parseCsv, parseTemp, phoneKey, splitTags, toCsv, type LeadField,
} from "./leads";

export interface ImportRow {
  name: string;
  phone: string | null;
  email: string | null;
  origin: string | null;
  campaign: string | null;
  status: LeadTemp | null;
  notes: string | null;
  tags: string[];
}

export interface ParsedImport {
  rows: ImportRow[];
  /** campos reconhecidos no cabeçalho, na ordem do arquivo */
  fields: LeadField[];
  /** linhas sem nome e sem telefone */
  empty: number;
  /** linhas com o mesmo telefone de uma linha anterior (juntadas) */
  repeated: number;
}

const tagKey = (s: string) => deaccent(s).toLowerCase().trim();

export function parseImport(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("A planilha está vazia ou só tem o cabeçalho.");
  const map = mapHeaders(table[0]);
  if (map.name == null && map.phone == null) {
    throw new Error("Não achei as colunas de nome nem de telefone. O cabeçalho precisa ter “Nome” ou “Telefone”.");
  }
  const cell = (r: string[], f: LeadField) => (map[f] == null ? "" : (r[map[f]!] ?? "").trim());
  const rows: ImportRow[] = [];
  const byKey = new Map<string, ImportRow>();
  let empty = 0;
  let repeated = 0;
  for (const r of table.slice(1)) {
    const phone = cell(r, "phone") || null;
    const name = cell(r, "name") || (phone ? formatPhone(phone) : "");
    if (!name) { empty++; continue; }
    const row: ImportRow = {
      name,
      phone,
      email: cell(r, "email") || null,
      origin: cell(r, "origin") || null,
      campaign: cell(r, "campaign") || null,
      status: parseTemp(cell(r, "status")),
      notes: cell(r, "notes") || null,
      tags: splitTags(cell(r, "tags")),
    };
    const k = phoneKey(phone);
    const prev = k ? byKey.get(k) : undefined;
    if (prev) {
      // mesmo telefone duas vezes no arquivo: junta as etiquetas e completa o que faltar
      repeated++;
      for (const t of row.tags) if (!prev.tags.some((x) => tagKey(x) === tagKey(t))) prev.tags.push(t);
      prev.email ??= row.email; prev.origin ??= row.origin; prev.campaign ??= row.campaign; prev.notes ??= row.notes; prev.status ??= row.status;
      continue;
    }
    if (k) byKey.set(k, row);
    rows.push(row);
  }
  const fields = (Object.keys(map) as LeadField[]).sort((a, b) => map[a]! - map[b]!);
  return { rows, fields, empty, repeated };
}

export interface ImportOptions {
  existing: LeadFull[];
  tags: Tag[];
  /** coloca todos os importados (novos e já existentes) neste quadro/etapa */
  board?: { boardId: number; columnId: number } | null;
}

export interface ImportReport { created: number; updated: number; onBoard: number; failed: string[] }

export async function runImport(db: SupabaseClient, rows: ImportRow[], opts: ImportOptions, onProgress?: (done: number, total: number) => void): Promise<ImportReport> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");
  const user_id = user.id;
  const report: ImportReport = { created: 0, updated: 0, onBoard: 0, failed: [] };
  const total = rows.length;
  let done = 0;
  const tick = (n = 1) => { done += n; onProgress?.(Math.min(done, total), total); };

  // 1. Etiquetas: usa as que já existem pelo nome e cria as que faltam.
  const tagIds = new Map(opts.tags.map((t) => [tagKey(t.name), t.id]));
  const missing = new Map<string, string>();
  for (const r of rows) for (const t of r.tags) if (!tagIds.has(tagKey(t)) && !missing.has(tagKey(t))) missing.set(tagKey(t), t);
  let colorIdx = opts.tags.length;
  for (const [k, name] of missing) {
    const { data, error } = await db.from("tags").insert({ name, color: TAG_COLORS[++colorIdx % TAG_COLORS.length], user_id }).select("id").single();
    if (error) { report.failed.push(`Etiqueta “${name}”: ${error.message}`); continue; }
    tagIds.set(k, (data as { id: number }).id);
  }

  // 2. Separa novos de já existentes (pelo telefone).
  const existingByKey = new Map(opts.existing.filter((l) => l.phone_key).map((l) => [l.phone_key!, l]));
  const toCreate: ImportRow[] = [];
  const links: { lead_id: number; tag_id: number }[] = [];
  const touched: number[] = [];
  const linkTags = (leadId: number, names: string[]) => {
    for (const n of names) { const id = tagIds.get(tagKey(n)); if (id) links.push({ lead_id: leadId, tag_id: id }); }
  };

  for (const r of rows) {
    const k = phoneKey(r.phone);
    const ex = k ? existingByKey.get(k) : undefined;
    if (!ex) { toCreate.push(r); continue; }
    // já existe: só completa o que está vazio (nunca apaga nem troca o que você já escreveu)
    const patch: Record<string, unknown> = {};
    if (!ex.email && r.email) patch.email = r.email;
    if (!ex.origin && r.origin) patch.origin = r.origin;
    if (!ex.campaign && r.campaign) patch.campaign = r.campaign;
    if (!ex.notes && r.notes) patch.notes = r.notes;
    const have = new Set(ex.lead_tags.map((t) => t.tag_id));
    const newTags = r.tags.filter((n) => { const id = tagIds.get(tagKey(n)); return id && !have.has(id); });
    if (Object.keys(patch).length) {
      const { error } = await db.from("leads").update(patch).eq("id", ex.id);
      if (error) report.failed.push(`${r.name}: ${error.message}`);
    }
    if (Object.keys(patch).length || newTags.length) report.updated++;
    linkTags(ex.id, newTags);
    touched.push(ex.id);
    tick();
  }

  // 3. Cria os novos em lotes; se um lote falhar, tenta um por um para salvar o resto.
  const rowOf = (r: ImportRow) => ({
    user_id, name: r.name, phone: r.phone, email: r.email, origin: r.origin, campaign: r.campaign, notes: r.notes, status: r.status ?? "warm",
  });
  for (let i = 0; i < toCreate.length; i += 200) {
    const chunk = toCreate.slice(i, i + 200);
    const { data, error } = await db.from("leads").insert(chunk.map(rowOf)).select("id");
    if (!error && data && data.length === chunk.length) {
      (data as { id: number }[]).forEach((d, j) => { linkTags(d.id, chunk[j].tags); touched.push(d.id); });
      report.created += chunk.length;
    } else {
      for (const r of chunk) {
        const one = await db.from("leads").insert(rowOf(r)).select("id").single();
        if (one.error) { report.failed.push(`${r.name}: ${one.error.code === "23505" ? "telefone já cadastrado" : one.error.message}`); continue; }
        const id = (one.data as { id: number }).id;
        linkTags(id, r.tags);
        touched.push(id);
        report.created++;
      }
    }
    tick(chunk.length);
  }

  // 4. Etiquetas dos leads.
  for (let i = 0; i < links.length; i += 500) {
    const { error } = await db.from("lead_tags").upsert(links.slice(i, i + 500).map((l) => ({ ...l, user_id })), { onConflict: "lead_id,tag_id", ignoreDuplicates: true });
    if (error) report.failed.push(`Etiquetas: ${error.message}`);
  }

  // 5. Kanban (só quem ainda não está no quadro).
  if (opts.board && touched.length) {
    const { boardId, columnId } = opts.board;
    const onBoard = new Set<number>();
    for (let i = 0; i < touched.length; i += 300) {
      const { data } = await db.from("kanban_cards").select("lead_id").eq("board_id", boardId).in("lead_id", touched.slice(i, i + 300));
      for (const d of data ?? []) onBoard.add(d.lead_id as number);
    }
    const { data: last } = await db.from("kanban_cards").select("position").eq("column_id", columnId).order("position", { ascending: false }).limit(1);
    let pos = last?.[0] ? Number(last[0].position) + 1 : 0;
    const cards = [...new Set(touched)].filter((id) => !onBoard.has(id)).map((lead_id) => ({ lead_id, board_id: boardId, column_id: columnId, position: pos++, user_id }));
    for (let i = 0; i < cards.length; i += 300) {
      const { error } = await db.from("kanban_cards").insert(cards.slice(i, i + 300));
      if (error) report.failed.push(`Kanban: ${error.message}`);
      else report.onBoard += Math.min(300, cards.length - i);
    }
  }

  return report;
}

/** Planilha com os leads (abre direto no Excel). Também serve para importar de volta. */
export function exportCsv(leads: LeadFull[], tags: Tag[], boards: KanbanBoard[], columns: KanbanColumn[]) {
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const boardName = new Map(boards.map((b) => [b.id, b.title]));
  const colName = new Map(columns.map((c) => [c.id, c.title]));
  const header = [FIELD_LABEL.name, FIELD_LABEL.phone, FIELD_LABEL.email, FIELD_LABEL.origin, FIELD_LABEL.campaign, FIELD_LABEL.status, FIELD_LABEL.tags, "Kanban", "Valor", FIELD_LABEL.notes, "Criado em"];
  const rows = leads.map((l) => [
    l.name,
    l.phone ?? "",
    l.email ?? "",
    l.origin ?? "",
    l.campaign ?? "",
    TEMP_LABEL[l.status] ?? "",
    l.lead_tags.map((t) => tagName.get(t.tag_id)).filter(Boolean).join(", "),
    l.kanban_cards.map((c) => `${boardName.get(c.board_id) ?? "Quadro"}: ${colName.get(c.column_id) ?? "?"}`).join(" | "),
    l.kanban_cards.reduce((a, c) => a + (Number(c.value) || 0), 0) || "",
    l.notes ?? "",
    new Date(l.created_at).toLocaleString("pt-BR"),
  ]);
  return toCsv([header, ...rows]);
}

export function downloadText(text: string, filename: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
