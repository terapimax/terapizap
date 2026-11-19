"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ImageUp, Loader2, Palette, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BRAND_KEY, BrandIcon, BrandLogo, MarkTile, useBrandRow } from "@/components/brand";
import { DomainSettings } from "@/components/features/domain-settings";
import { DEFAULT_BRAND_NAME, resolveBrand, type BrandRow } from "@/lib/brand";
import { ACCENT_PRESETS, DEFAULT_ACCENT, DEFAULT_MARK, MARKS, accentCss, accentPalette, cleanAccent, cleanMark, type MarkId } from "@/lib/brand-kit";
import { Button } from "@/components/ui/shared";
import { cn } from "@/lib/utils";

const supabase = createClient();
const BUCKET = "campaign_files";
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const MAX_BYTES = 1024 * 1024;

const inputCls =
  "w-full h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg transition-colors";

type Kind = "logo" | "icon";

function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem.")); };
    img.src = url;
  });
}

const storagePath = (url: string | null) => (url?.includes(`/${BUCKET}/`) ? url.split(`/${BUCKET}/`)[1]?.split("?")[0] : undefined);

/** Caixa de envio de uma imagem da marca (logotipo horizontal ou ícone quadrado). */
function ImageSlot({ kind, url, busy, onPick, onClear }: { kind: Kind; url: string | null; busy: boolean; onPick: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const wide = kind === "logo";
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div>
        <p className="text-sm font-semibold">{wide ? "Logotipo horizontal" : "Ícone quadrado"}</p>
        <p className="text-xs text-muted mt-0.5">
          {wide
            ? "Opcional. Substitui o ícone + nome no menu aberto. Ideal: 600 × 160 px, fundo transparente."
            : "Aparece com o menu recolhido, na extensão e na aba do navegador. Ideal: 256 × 256 px."}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2.5">
        {/* fundo quadriculado claro/escuro: mostra se a imagem funciona nos dois temas */}
        <div className={cn("rounded-xl border border-line overflow-hidden grid grid-cols-2 shrink-0", wide ? "w-full max-w-[232px] h-16" : "w-32 h-16")}>
          {(["#ffffff", "#0b0b0d"] as const).map((bg) => (
            <div key={bg} className="grid place-items-center p-2 min-w-0" style={{ background: bg }}>
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="max-w-full max-h-12 object-contain" />
              ) : (
                <ImageUp className="w-4 h-4" style={{ color: bg === "#ffffff" ? "#a3a3ad" : "#5d5d66" }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageUp className="w-3.5 h-3.5" />} {url ? "Trocar" : "Enviar imagem"}
          </Button>
          {url && (
            <Button size="sm" variant="ghost" className="hover:text-hot" onClick={onClear}><Trash2 className="w-3.5 h-3.5" /> Remover</Button>
          )}
        </div>
      </div>
      <input ref={input} type="file" accept={TYPES.join(",")} className="sr-only" tabIndex={-1} aria-label={wide ? "Enviar logotipo horizontal" : "Enviar ícone quadrado"}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
    </div>
  );
}

export function BrandingSettings() {
  const saved = useBrandRow();
  const row = saved.data ?? null;
  // o formulário recomeça do que está salvo sempre que a marca salva muda
  return (
    <div className="flex flex-col gap-6">
      <BrandingForm key={[row?.name, row?.logo_url, row?.icon_url, row?.mark, row?.accent].join("|")} row={row} />
      <DomainSettings />
    </div>
  );
}

function BrandingForm({ row }: { row: BrandRow | null }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(row?.name ?? "");
  const [logo, setLogo] = useState<string | null>(row?.logo_url ?? null);
  const [icon, setIcon] = useState<string | null>(row?.icon_url ?? null);
  const [mark, setMark] = useState<MarkId>(cleanMark(row?.mark));
  const [accent, setAccent] = useState<string | null>(cleanAccent(row?.accent));
  const [uploading, setUploading] = useState<Kind | null>(null);
  // arquivos enviados nesta visita e ainda não salvos (para limpar se a pessoa trocar de ideia)
  const fresh = useRef<Set<string>>(new Set());

  const draft = resolveBrand({ name, logo_url: logo, icon_url: icon, mark, accent });
  const accentDirty = accent !== cleanAccent(row?.accent);
  const dirty = name.trim() !== (row?.name ?? "") || logo !== (row?.logo_url ?? null) || icon !== (row?.icon_url ?? null)
    || mark !== cleanMark(row?.mark) || accentDirty;
  const needsIcon = !!logo && !icon;

  const pick = async (kind: Kind, file: File) => {
    if (!TYPES.includes(file.type)) return toast.error("Use uma imagem PNG, JPG, WebP ou SVG.");
    if (file.size > MAX_BYTES) return toast.error("A imagem passa de 1 MB. Use uma versão menor.");
    try {
      if (file.type !== "image/svg+xml") {
        const { w, h } = await imageSize(file);
        const ratio = w / h;
        if (kind === "icon" && (ratio < 0.9 || ratio > 1.1)) return toast.error("O ícone precisa ser quadrado (mesma largura e altura).");
        if (kind === "logo" && ratio < 1.3) return toast.error("O logotipo precisa ser horizontal (mais largo que alto). Para imagem quadrada, use o ícone.");
        if (kind === "icon" && w < 64) return toast.error("O ícone está pequeno demais. Use pelo menos 64 × 64 px.");
      }
      setUploading(kind);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${user.id}/branding/${kind}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      if (up.error) throw up.error;
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      fresh.current.add(url);
      (kind === "logo" ? setLogo : setIcon)(url);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível enviar a imagem.");
    } finally {
      setUploading(null);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");
      const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
      const { error } = await supabase.from("branding").upsert(
        { user_id: user.id, name: clean || null, logo_url: logo, icon_url: icon, mark: mark === DEFAULT_MARK ? null : mark, accent, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw new Error(/branding/i.test(error.message) && /exist|schema cache|not find/i.test(error.message) ? "Rode o supabase/setup.sql de novo no Supabase para ativar a marca própria." : error.message);
      // apaga do armazenamento o que deixou de ser usado
      const keep = new Set([logo, icon]);
      const unused = [row?.logo_url ?? null, row?.icon_url ?? null, ...fresh.current].filter((u) => u && !keep.has(u)).map((u) => storagePath(u)).filter((p): p is string => !!p);
      if (unused.length) await supabase.storage.from(BUCKET).remove(unused);
      fresh.current.clear();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: BRAND_KEY });
      router.refresh();
      toast.success("Marca salva. A extensão passa a usar a mesma ao abrir o WhatsApp Web.");
    },
    onError: (e) => toast.error((e as Error).message || "Não foi possível salvar."),
  });

  const reset = () => { setName(""); setLogo(null); setIcon(null); setMark(DEFAULT_MARK); setAccent(null); };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="brand-name" className="text-xs font-medium text-muted">Nome da empresa</label>
        <input id="brand-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_BRAND_NAME} className={inputCls} />
        <p className="text-xs text-muted">Aparece no menu, na tela de login, na aba do navegador e na extensão. Vazio = {DEFAULT_BRAND_NAME}.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ImageSlot kind="logo" url={logo} busy={uploading === "logo"} onPick={(f) => pick("logo", f)} onClear={() => setLogo(null)} />
        <ImageSlot kind="icon" url={icon} busy={uploading === "icon"} onPick={(f) => pick("icon", f)} onClear={() => setIcon(null)} />
      </div>

      {needsIcon && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-warn-soft text-warn p-3 text-sm">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          Envie também o ícone quadrado: é ele que aparece quando o menu está recolhido e no botão da extensão.
        </p>
      )}

      <MarkPicker value={mark} name={draft.name} hasImage={!!icon} onChange={setMark} />
      <AccentPicker value={accent} onChange={setAccent} />
      {/* enquanto escolhe, o painel inteiro já mostra a cor nova (some ao sair sem salvar) */}
      {accentDirty && <style data-brand-preview dangerouslySetInnerHTML={{ __html: accentCss(accent ?? DEFAULT_ACCENT) }} />}

      {/* prévia: o menu aberto e o recolhido, lado a lado */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Prévia do menu</span>
        <div className="flex flex-wrap gap-3">
          <div className="w-60 max-w-full rounded-xl border border-line bg-bg">
            <div className="flex items-center gap-2.5 h-16 px-5 min-w-0"><BrandLogo brand={draft} /></div>
            <div className="px-3 pb-3 flex flex-col gap-1.5" aria-hidden="true">
              <span className="h-8 rounded-[10px] bg-surface" /><span className="h-8 rounded-[10px] bg-surface/50" />
            </div>
          </div>
          <div className="w-[72px] rounded-xl border border-line bg-bg">
            <div className="grid place-items-center h-16"><BrandIcon brand={draft} /></div>
            <div className="px-3 pb-3 flex flex-col gap-1.5" aria-hidden="true">
              <span className="h-8 rounded-[10px] bg-surface" /><span className="h-8 rounded-[10px] bg-surface/50" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!dirty || needsIcon || save.isPending || !!uploading}>
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Salvar marca
        </Button>
        {(name || logo || icon || accent || mark !== DEFAULT_MARK) && <Button variant="ghost" onClick={reset}>Voltar ao padrão</Button>}
        {dirty && !needsIcon && <span className="text-xs text-muted">Alterações ainda não salvas.</span>}
      </div>
    </>
  );
}

// ── Símbolo e cor ────────────────────────────────────────

const MARK_IDS = [...(Object.keys(MARKS) as (keyof typeof MARKS)[]), "letter"] as MarkId[];

function MarkPicker({ value, name, hasImage, onChange }: { value: MarkId; name: string; hasImage: boolean; onChange: (m: MarkId) => void }) {
  return (
    <fieldset className="flex flex-col gap-2 min-w-0">
      <legend className="text-sm font-semibold">Símbolo</legend>
      <p className="text-xs text-muted">
        {hasImage
          ? "Como você enviou um ícone quadrado, ele aparece no lugar do símbolo. O símbolo continua na aba lateral da extensão no WhatsApp."
          : "Aparece no quadradinho da marca: menu, login, aba do navegador e extensão."}
      </p>
      <div role="radiogroup" aria-label="Símbolo da marca" className="flex flex-wrap gap-1">
        {MARK_IDS.map((id) => {
          const on = value === id;
          const label = id === "letter" ? "Inicial do nome" : MARKS[id as keyof typeof MARKS].label;
          return (
            <button key={id} type="button" role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => onChange(id)}
              className={cn("p-1 rounded-xl border-2 cursor-pointer transition-colors", on ? "border-fg" : "border-transparent hover:border-line")}>
              <MarkTile brand={{ mark: id, name }} size={34} />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function AccentPicker({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  const current = value ?? DEFAULT_ACCENT;
  const preset = ACCENT_PRESETS.some((p) => p.hex === current);
  // texto digitado no campo do código (null = mostra a cor atual)
  const [typing, setTyping] = useState<string | null>(null);
  const pick = (h: string) => onChange(h === DEFAULT_ACCENT ? null : h);
  const light = accentPalette(current).light.on !== "#ffffff";
  return (
    <fieldset className="flex flex-col gap-2 min-w-0">
      <legend className="text-sm font-semibold flex items-center gap-2"><Palette className="w-4 h-4" aria-hidden="true" /> Cor da marca</legend>
      <p className="text-xs text-muted">
        Substitui o rosa nos botões de destaque, contadores, gráficos, links e no quadradinho da marca, no painel e na extensão.
        Os tons do tema escuro e dos textos se ajustam sozinhos para continuar legíveis.
      </p>
      <div role="radiogroup" aria-label="Cor da marca" className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((p) => {
          const on = current === p.hex;
          return (
            <button key={p.hex} type="button" role="radio" aria-checked={on} aria-label={p.label} title={p.label} onClick={() => pick(p.hex)}
              className={cn("w-8 h-8 rounded-full grid place-items-center cursor-pointer ring-offset-2 ring-offset-bg transition-shadow shadow-[inset_0_0_0_1px_rgba(128,128,128,0.4)]", on ? "ring-2 ring-fg" : "hover:ring-2 hover:ring-line")}
              style={{ background: p.hex, color: accentPalette(p.hex).light.on }}>
              {on && <Check className="w-4 h-4" aria-hidden="true" />}
            </button>
          );
        })}
        <label title="Escolher outra cor"
          className={cn("relative w-8 h-8 rounded-full grid place-items-center cursor-pointer ring-offset-2 ring-offset-bg overflow-hidden", !preset ? "ring-2 ring-fg" : "hover:ring-2 hover:ring-line")}
          style={{ background: !preset ? current : "conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)", color: accentPalette(current).light.on }}>
          {!preset && <Check className="w-4 h-4" aria-hidden="true" />}
          <span className="sr-only">Outra cor</span>
          <input type="color" value={current} onChange={(e) => pick(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        </label>
        <label htmlFor="brand-accent" className="sr-only">Código da cor (hexadecimal)</label>
        <input id="brand-accent" value={typing ?? current} maxLength={7} spellCheck={false} autoComplete="off"
          onChange={(e) => { setTyping(e.target.value); const c = cleanAccent(e.target.value); if (c) pick(c); }}
          onBlur={() => setTyping(null)}
          className={cn(inputCls, "w-[104px] h-8 font-mono text-[13px] uppercase")} />
      </div>
      {/* amostra: os lugares onde a cor aparece */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3" aria-hidden="true">
        <span className="h-8 px-3 rounded-[10px] bg-accent text-on-accent text-sm font-semibold inline-flex items-center">Botão de destaque</span>
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-on-accent text-[11px] font-semibold grid place-items-center tabular-nums">3</span>
        <span className="text-sm font-semibold text-accent-fg">Link em destaque</span>
        <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-fg text-xs font-semibold">Etiqueta</span>
      </div>
      {light && <p className="text-xs text-muted">Cor clara: o texto sobre ela fica escuro para continuar legível.</p>}
    </fieldset>
  );
}
