// Marca do painel (white label). Sem nada configurado, vale o nome padrão — que também pode ser
// trocado para a instalação inteira pela variável NEXT_PUBLIC_BRAND_NAME.
export const DEFAULT_BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "ZapFlow";

/** Linha da tabela `branding` (só o que a tela usa). */
export interface BrandRow {
  name: string | null;
  logo_url: string | null;
  icon_url: string | null;
  custom_domain?: string | null;
}

export interface Brand {
  name: string;
  /** logotipo horizontal: quando existe, substitui ícone + nome */
  logoUrl: string | null;
  /** ícone quadrado: menu recolhido, extensão e aba do navegador */
  iconUrl: string | null;
  domain: string | null;
  /** a conta trocou o nome ou subiu imagens (false = marca padrão, com o raio) */
  custom: boolean;
}

export function resolveBrand(row: BrandRow | null | undefined): Brand {
  const name = row?.name?.trim() || DEFAULT_BRAND_NAME;
  const logoUrl = row?.logo_url || null;
  const iconUrl = row?.icon_url || null;
  return { name, logoUrl, iconUrl, domain: row?.custom_domain || null, custom: !!(logoUrl || iconUrl || name !== DEFAULT_BRAND_NAME) };
}

/**
 * "https://Painel.Empresa.com.br/dashboard" -> "painel.empresa.com.br".
 * Devolve "" para vazio e null para o que não é um domínio válido.
 */
export function cleanDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!d) return "";
  if (d.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null;
  if (/(^|\.)(vercel\.app|localhost)$/.test(d)) return null;
  return d;
}

/** Registro de DNS que o dono do domínio precisa criar (Vercel). */
export function dnsRecordFor(domain: string): { type: "A" | "CNAME"; name: string; value: string } {
  const parts = domain.split(".");
  // domínio raiz (empresa.com ou empresa.com.br) usa A; subdomínio (painel.empresa.com.br) usa CNAME
  const brTwoLevel = /\.(com|net|org|art|eco|blog|app|dev|adv|eng|med|odo|psc|tur|ind|inf|imb|far|srv|tv|wiki)\.br$/.test(domain);
  const apex = parts.length === (brTwoLevel ? 3 : 2);
  return apex
    ? { type: "A", name: "@", value: "76.76.21.21" }
    : { type: "CNAME", name: parts.slice(0, parts.length - (brTwoLevel ? 3 : 2)).join("."), value: "cname.vercel-dns.com" };
}
