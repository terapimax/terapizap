// Marca do painel (white label). Sem nada configurado, vale o nome padrão — que também pode ser
// trocado para a instalação inteira pela variável NEXT_PUBLIC_BRAND_NAME.
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ACCENT, DEFAULT_MARK, accentPalette, cleanAccent, cleanMark, markSvg, type MarkId } from "./brand-kit";

export const DEFAULT_BRAND_NAME =process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "ZapFlow";

/** Colunas de `branding` que o painel e a extensão leem. */
export const BRAND_COLUMNS = "name, logo_url, icon_url, mark, accent, custom_domain";
const OLD_BRAND_COLUMNS = "name, logo_url, icon_url, custom_domain";

/**
 * A linha de marca da conta logada. Se o banco ainda não tem as colunas novas (setup.sql não foi
 * rodado de novo), lê as antigas para não perder nome e logotipos. null = sem marca / sem tabela.
 */
export async function selectOwnBrand(sb: SupabaseClient): Promise<BrandRow | null> {
  let res = await sb.from("branding").select(BRAND_COLUMNS).maybeSingle();
  if (res.error && /mark|accent|column/i.test(res.error.message)) res = await sb.from("branding").select(OLD_BRAND_COLUMNS).maybeSingle();
  if (res.error) return null;
  return (res.data as BrandRow | null) ?? null;
}

/** Linha da tabela `branding` (só o que a tela usa). */
export interface BrandRow {
  name: string | null;
  logo_url: string | null;
  icon_url: string | null;
  /** ícone vetorial (MARKS) ou "letter" = inicial do nome; vazio = raio */
  mark?: string | null;
  /** cor da marca (#rrggbb); vazio = rosa padrão */
  accent?: string | null;
  custom_domain?: string | null;
}

export interface Brand {
  name: string;
  /** logotipo horizontal: quando existe, substitui ícone + nome */
  logoUrl: string | null;
  /** ícone quadrado enviado: menu recolhido, cabeçalho da extensão e aba do navegador */
  iconUrl: string | null;
  /** ícone vetorial do quadradinho quando não há imagem (e sempre na aba lateral da extensão) */
  mark: MarkId;
  /** cor da marca; null = rosa padrão */
  accent: string | null;
  domain: string | null;
  /** a conta mudou alguma coisa da marca (false = marca padrão) */
  custom: boolean;
}

export function resolveBrand(row: BrandRow | null | undefined): Brand {
  const name = row?.name?.trim() || DEFAULT_BRAND_NAME;
  const logoUrl = row?.logo_url || null;
  const iconUrl = row?.icon_url || null;
  const mark = cleanMark(row?.mark);
  const accent = cleanAccent(row?.accent);
  return {
    name, logoUrl, iconUrl, mark, accent, domain: row?.custom_domain || null,
    custom: !!(logoUrl || iconUrl || accent || mark !== DEFAULT_MARK || name !== DEFAULT_BRAND_NAME),
  };
}

/** Ícone da aba do navegador quando a conta não enviou imagem: o ícone vetorial na cor da marca. */
export function brandFavicon(brand: Brand): string | null {
  if (brand.iconUrl) return brand.iconUrl;
  if (!brand.accent && brand.mark === DEFAULT_MARK) return null; // padrão: favicon.ico
  const p = accentPalette(brand.accent ?? DEFAULT_ACCENT).light;
  const inner = brand.mark === "letter"
    ? `<text x="16" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="${p.on}">${escapeXml(brand.name.trim().charAt(0).toUpperCase())}</text>`
    : `<g transform="translate(6.5 6.5) scale(0.7917)">${markSvg(brand.mark, 24, p.on)}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${p.accent}"/>${inner}</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * "https://Painel.Empresa.com.br/dashboard" -> "painel.empresa.com.br".
 * Devolve "" para vazio e null para o que não é um domínio válido.
 */
export function cleanDomain(input: string): string | null {
  if (!input.trim()) return "";
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (d.length > 253 || !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d)) return null;
  if (!/[a-z]/.test(d.slice(d.lastIndexOf(".") + 1))) return null;
  if (/(^|\.)(vercel\.app|localhost)$/.test(d)) return null;
  return d;
}
