// Ícones vetoriais da marca e a paleta derivada da cor da marca.
// A extensão tem uma cópia igual em extension/brand-kit.js — ao mudar aqui, mude lá também.

/** Ícones que a conta pode escolher para o quadradinho da marca (traço 24×24, cor = texto sobre a cor da marca). */
export const MARKS = {
  bolt: { label: "Raio", svg: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
  heart: { label: "Coração", svg: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' },
  star: { label: "Estrela", svg: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>' },
  sparkles: { label: "Brilho", svg: '<path d="M11 3c.6 4.7 2.3 6.4 7 7-4.7.6-6.4 2.3-7 7-.6-4.7-2.3-6.4-7-7 4.7-.6 6.4-2.3 7-7z"/><path d="M19 15v6M16 18h6"/>' },
  flame: { label: "Chama", svg: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
  rocket: { label: "Foguete", svg: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>' },
  crown: { label: "Coroa", svg: '<path d="M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.27-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.27 3.67a1 1 0 0 0 1.52-.3z"/><path d="M5 21h14"/>' },
  gem: { label: "Diamante", svg: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20"/>' },
  leaf: { label: "Folha", svg: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>' },
  flower: { label: "Flor", svg: '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/>' },
  sun: { label: "Sol", svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>' },
  smile: { label: "Sorriso", svg: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>' },
  chat: { label: "Conversa", svg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>' },
  target: { label: "Alvo", svg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' },
  bag: { label: "Sacola", svg: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>' },
  home: { label: "Casa", svg: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>' },
} as const;

export type MarkId = keyof typeof MARKS | "letter";
export const DEFAULT_MARK: MarkId = "bolt";

export function cleanMark(v: string | null | undefined): MarkId {
  return v === "letter" || (v && Object.prototype.hasOwnProperty.call(MARKS, v)) ? (v as MarkId) : DEFAULT_MARK;
}

/** O <svg> do ícone, pronto para virar texto (favicon) ou innerHTML. */
export function markSvg(id: keyof typeof MARKS, size: number, color = "currentColor") {
  const w = id === "bolt" ? 2.4 : 2.2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MARKS[id].svg}</svg>`;
}

// ── Cor da marca ─────────────────────────────────────────

/** Rosa padrão (o mesmo do globals.css). */
export const DEFAULT_ACCENT = "#d1236f";

/** Sugestões na tela de Configurações. */
export const ACCENT_PRESETS = [
  { hex: "#d1236f", label: "Rosa" },
  { hex: "#dc2626", label: "Vermelho" },
  { hex: "#ea580c", label: "Laranja" },
  { hex: "#ca8a04", label: "Mostarda" },
  { hex: "#16a34a", label: "Verde" },
  { hex: "#0d9488", label: "Verde-água" },
  { hex: "#0284c7", label: "Azul-céu" },
  { hex: "#2563eb", label: "Azul" },
  { hex: "#4f46e5", label: "Índigo" },
  { hex: "#7c3aed", label: "Roxo" },
  { hex: "#a16207", label: "Caramelo" },
  { hex: "#111113", label: "Preto" },
];

export function cleanAccent(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase();
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(s);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return "#" + h;
}

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const PAGE_DARK: RGB = [11, 11, 13]; // --bg do tema escuro
const INK = "#111113";

const toRgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lum = (c: RGB) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: RGB, b: RGB) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t)) as RGB;

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
/** Clareia (dir 1) ou escurece (dir -1) até ter o contraste pedido com o fundo. */
function shade(c: RGB, bg: RGB, ratio: number, dir: 1 | -1): RGB {
  const [h, s, l0] = toHsl(c);
  let out = c;
  for (let l = l0; contrast(out, bg) < ratio && l >= 0 && l <= 1; l += dir * 0.01) out = fromHsl(h, s, Math.max(0, Math.min(1, l)));
  return out;
}
const onColor = (c: RGB) => (contrast(c, WHITE) >= 3 ? "#ffffff" : INK);

export interface AccentTokens { accent: string; fg: string; soft: string; on: string; deep: string }

/**
 * A partir de uma cor só, as variações que as telas usam, nos dois temas:
 * accent (fundos, pontos), fg (texto colorido, com contraste de leitura), soft (fundo clarinho),
 * on (texto sobre a cor: branco, ou quase preto se a cor for clara) e deep (fim do degradê).
 */
export function accentPalette(hex: string): { light: AccentTokens; dark: AccentTokens } {
  const base = toRgb(hex);
  const [h, s, l] = toHsl(base);
  const deep = toHex(fromHsl(h - 25, s, Math.max(0.18, l * 0.78)));
  const darkAccent = shade(base, PAGE_DARK, 4.5, 1);
  return {
    light: { accent: toHex(base), fg: toHex(shade(base, WHITE, 4.8, -1)), soft: toHex(mix(base, WHITE, 0.12)), on: onColor(base), deep },
    dark: { accent: toHex(darkAccent), fg: toHex(shade(base, PAGE_DARK, 6.5, 1)), soft: toHex(mix(base, PAGE_DARK, 0.24)), on: onColor(darkAccent), deep },
  };
}

/** CSS que troca o rosa pela cor da marca no painel (mesmos seletores do globals.css). */
export function accentCss(hex: string): string {
  const p = accentPalette(hex);
  const vars = (t: AccentTokens) => `--accent:${t.accent};--accent-fg:${t.fg};--accent-soft:${t.soft};--on-accent:${t.on};`;
  return `:root{${vars(p.light)}}@media (prefers-color-scheme: dark){:root:not(.light){${vars(p.dark)}}}:root.dark{${vars(p.dark)}}`;
}
