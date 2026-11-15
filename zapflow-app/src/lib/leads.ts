// Regras de leads usadas no painel inteiro (lista, Kanban, importação, backup).

import type { Lead, LeadTemp, Tag } from "@/types";

/**
 * Telefone normalizado: só dígitos, sem zeros à esquerda, com 55 quando falta o DDI.
 * É a MESMA regra da coluna `leads.phone_key` no banco e da extensão (phoneToChatId).
 * Menos de 10 dígitos = sem chave (não dá para saber o DDD).
 */
export function phoneKey(phone?: string | null): string | null {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? "55" + d : d;
}

/** Link do WhatsApp para o telefone, ou null. */
export function waLink(phone?: string | null) {
  const k = phoneKey(phone);
  return k ? `https://wa.me/${k}` : null;
}

/** (11) 98765-4321 para números do Brasil; o resto fica como veio. */
export function formatPhone(phone?: string | null) {
  const k = phoneKey(phone);
  if (!k || !k.startsWith("55") || (k.length !== 12 && k.length !== 13)) return phone ?? "";
  const ddd = k.slice(2, 4);
  const n = k.slice(4);
  return `(${ddd}) ${n.slice(0, n.length - 4)}-${n.slice(-4)}`;
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const TEMP_LABEL: Record<LeadTemp, string> = { hot: "Quente", warm: "Morno", cold: "Frio" };

export function parseTemp(v: string): LeadTemp | null {
  const s = deaccent(v).toLowerCase().trim();
  if (/^(quente|hot)/.test(s)) return "hot";
  if (/^(morno|warm)/.test(s)) return "warm";
  if (/^(frio|cold)/.test(s)) return "cold";
  return null;
}

export const ORIGINS = ["Instagram", "Facebook", "Google", "Indicação", "Site", "WhatsApp", "E-mail", "Outros"];

/** Cores das etiquetas (as mesmas nos dois temas; o texto fica com a cor do tema). */
export const TAG_COLORS = ["#6b7280", "#d1236f", "#b42318", "#c2410c", "#9a5b00", "#0e7a4f", "#0f766e", "#1d4ed8", "#6b21a8", "#be185d"];

/** Erro do banco em português para quem usa. */
export function leadErrorMessage(e: unknown) {
  const err = e as { code?: string; message?: string; details?: string };
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`;
  if (err?.code === "23505" && /phone/i.test(text)) return "Já existe um lead com este telefone.";
  if (err?.code === "23505" && /tags/i.test(text)) return "Já existe uma etiqueta com este nome.";
  if (err?.code === "23505" && /lead_id, board_id|kanban_cards/i.test(text)) return "Este lead já está neste quadro.";
  if (err?.code === "42703" || /column .* does not exist|schema cache/i.test(text))
    return "O banco ainda está na versão antiga. Rode o supabase/setup.sql de novo no Supabase.";
  return err?.message || "Erro desconhecido";
}

export const deaccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* ============================== CSV ============================== */

/** Lê CSV com vírgula, ponto e vírgula ou tab (detecta pela 1ª linha), com aspas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => first.split(c).length - 1;
  const sep = [";", ",", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** CSV com ponto e vírgula e BOM: abre certo no Excel em português. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

export type LeadField = "name" | "phone" | "email" | "origin" | "campaign" | "status" | "tags" | "notes";

export const FIELD_LABEL: Record<LeadField, string> = {
  name: "Nome", phone: "Telefone", email: "E-mail", origin: "Origem", campaign: "Campanha",
  status: "Temperatura", tags: "Etiquetas", notes: "Observações",
};

const HEADER_ALIASES: Record<LeadField, RegExp> = {
  name: /^(nome|name|contato|cliente|nome completo|full name)$/,
  phone: /^(telefone|phone|celular|whatsapp|numero|fone|tel|mobile|telefone 1|phone 1 - value)$/,
  email: /^(e-?mail|email 1 - value)$/,
  origin: /^(origem|origin|fonte|source)$/,
  campaign: /^(campanha|campaign)$/,
  status: /^(temperatura|status|temp)$/,
  tags: /^(etiquetas?|tags?|labels?|marcadores?)$/,
  notes: /^(observacoes|observacao|obs|notas?|notes?)$/,
};

/** Descobre qual coluna do CSV é qual campo, pelo nome do cabeçalho. */
export function mapHeaders(header: string[]): Partial<Record<LeadField, number>> {
  const out: Partial<Record<LeadField, number>> = {};
  header.forEach((h, i) => {
    const n = deaccent(h).toLowerCase().trim();
    for (const f of Object.keys(HEADER_ALIASES) as LeadField[]) {
      if (out[f] == null && HEADER_ALIASES[f].test(n)) { out[f] = i; break; }
    }
  });
  return out;
}

/** Etiquetas de uma célula: "VIP, Orçamento | Retorno". */
export const splitTags = (v: string) => v.split(/[,|/]/).map((t) => t.trim()).filter(Boolean);

export function tagsOf(lead: { lead_tags?: { tag_id: number }[] }, tags: Tag[]) {
  const ids = new Set((lead.lead_tags ?? []).map((t) => t.tag_id));
  return tags.filter((t) => ids.has(t.id));
}

/** Campos do lead que o formulário grava (phone_key é do banco e nunca vai junto). */
export type LeadInput = Pick<Lead, "name" | "phone" | "email" | "origin" | "campaign" | "status" | "notes">;

export function cleanLeadInput(v: Partial<LeadInput>): Partial<LeadInput> {
  const o: Partial<LeadInput> = {};
  const txt = (s: string | null | undefined) => (s == null ? null : s.trim() || null);
  if (v.name !== undefined) o.name = (v.name ?? "").trim();
  if (v.phone !== undefined) o.phone = txt(v.phone);
  if (v.email !== undefined) o.email = txt(v.email);
  if (v.origin !== undefined) o.origin = txt(v.origin);
  if (v.campaign !== undefined) o.campaign = txt(v.campaign);
  if (v.notes !== undefined) o.notes = txt(v.notes);
  if (v.status !== undefined) o.status = v.status;
  return o;
}
