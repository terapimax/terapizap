"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Copy, Globe, ImageUp, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BRAND_KEY, BrandIcon, BrandLogo, useBrandRow } from "@/components/brand";
import { DEFAULT_BRAND_NAME, cleanDomain, resolveBrand, type BrandRow } from "@/lib/brand";
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
      <BrandingForm key={[row?.name, row?.logo_url, row?.icon_url].join("|")} row={row} />
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
  const [uploading, setUploading] = useState<Kind | null>(null);
  // arquivos enviados nesta visita e ainda não salvos (para limpar se a pessoa trocar de ideia)
  const fresh = useRef<Set<string>>(new Set());

  const draft = resolveBrand({ name, logo_url: logo, icon_url: icon });
  const dirty = name.trim() !== (row?.name ?? "") || logo !== (row?.logo_url ?? null) || icon !== (row?.icon_url ?? null);
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
        { user_id: user.id, name: clean || null, logo_url: logo, icon_url: icon, updated_at: new Date().toISOString() },
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

  const reset = () => { setName(""); setLogo(null); setIcon(null); };

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
        {(name || logo || icon) && <Button variant="ghost" onClick={reset}>Voltar ao padrão</Button>}
        {dirty && !needsIcon && <span className="text-xs text-muted">Alterações ainda não salvas.</span>}
      </div>
    </>
  );
}

// ── Domínio próprio ──────────────────────────────────────

interface DomainInfo {
  domain: string | null;
  automatic: boolean;
  status: "none" | "connected" | "pending" | "manual" | "error";
  record?: { type: string; name: string; value: string };
  verification?: { type: string; name: string; value: string }[];
  message?: string;
  error?: string;
}

function DomainSettings() {
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["branding-domain"],
    queryFn: async () => {
      const res = await fetch("/api/domain", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as DomainInfo;
      if (!res.ok) throw new Error(data.error || "Não foi possível consultar o domínio.");
      return data;
    },
    // enquanto o DNS não propaga, confere sozinho de tempos em tempos
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 30_000 : false),
    retry: false,
  });
  const current = info.data?.domain ?? "";
  // null = a pessoa ainda não mexeu no campo: mostra o domínio salvo
  const [edited, setEdited] = useState<string | null>(null);
  const value = edited ?? current;
  const setValue = setEdited;

  const save = useMutation({
    mutationFn: async (domain: string) => {
      const res = await fetch("/api/domain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const data = (await res.json().catch(() => ({}))) as DomainInfo;
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar o domínio.");
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["branding-domain"], data);
      setEdited(null);
      qc.invalidateQueries({ queryKey: BRAND_KEY });
      if (!data.domain) toast.success("Domínio removido");
      else if (data.status === "connected") toast.success("Domínio conectado");
      else if (data.status === "error") toast.error(data.message || "A hospedagem recusou o domínio.");
      else toast.success("Domínio salvo. Falta apontar o DNS (veja abaixo).");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const typed = cleanDomain(value);
  const d = info.data;
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success("Copiado"), () => {});
  const records = d?.domain && d.status !== "connected" ? [...(d.record ? [d.record] : []), ...(d.verification ?? [])] : [];

  return (
    <div className="flex flex-col gap-4 pt-6 border-t border-line">
      <div>
        <h3 className="font-sans text-sm font-semibold tracking-normal flex items-center gap-2"><Globe className="w-4 h-4" aria-hidden="true" /> Domínio próprio</h3>
        <p className="text-sm text-muted mt-0.5">Abra o painel pelo endereço da sua empresa (ex.: painel.suaempresa.com.br). A tela de login já aparece com a sua marca.</p>
      </div>

      {info.isError ? (
        <p className="text-sm text-muted">{(info.error as Error).message}</p>
      ) : (
        <>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (typed === null) return toast.error("Domínio inválido. Exemplo: painel.suaempresa.com.br"); save.mutate(typed); }}>
            <label htmlFor="brand-domain" className="sr-only">Domínio</label>
            <input id="brand-domain" value={value} onChange={(e) => setValue(e.target.value)} placeholder="painel.suaempresa.com.br" inputMode="url" autoComplete="off" spellCheck={false}
              className={cn(inputCls, "flex-1 min-w-[220px]")} disabled={info.isLoading} />
            <Button type="submit" variant="secondary" disabled={info.isLoading || save.isPending || (typed ?? value) === current}>
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {current && !value.trim() ? "Remover domínio" : "Conectar"}
            </Button>
          </form>

          {d?.domain && (
            <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {d.status === "connected" ? (
                  <><CheckCircle2 className="w-4 h-4 text-ok" aria-hidden="true" /><span className="font-semibold">Conectado</span><a href={`https://${d.domain}`} target="_blank" rel="noreferrer" className="text-accent-fg font-semibold hover:underline">{d.domain}</a></>
                ) : d.status === "error" ? (
                  <><TriangleAlert className="w-4 h-4 text-hot" aria-hidden="true" /><span className="font-semibold">{d.message}</span></>
                ) : (
                  <><Clock className="w-4 h-4 text-warn" aria-hidden="true" /><span className="font-semibold">{d.status === "manual" ? "Salvo. Falta ligar na hospedagem e no DNS" : "Aguardando o DNS"}</span><span className="text-muted">{d.domain}</span></>
                )}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => info.refetch()} disabled={info.isFetching}>
                  <RefreshCw className={cn("w-3.5 h-3.5", info.isFetching && "animate-spin")} /> Conferir
                </Button>
              </div>

              {records.length > 0 && (
                <>
                  <p className="text-sm text-muted">
                    {d.status === "manual" && <>1. Na Vercel, abra o projeto do painel &gt; Settings &gt; Domains e adicione <b className="text-fg">{d.domain}</b>.<br />2. </>}
                    No site onde o domínio foi registrado (Registro.br, GoDaddy, Hostinger, Cloudflare…), crie {records.length > 1 ? "estes registros" : "este registro"} de DNS. Pode levar de minutos a algumas horas para valer.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[420px]">
                      <thead>
                        <tr className="text-left text-xs text-muted">
                          <th scope="col" className="font-medium pb-1.5 pr-3">Tipo</th>
                          <th scope="col" className="font-medium pb-1.5 pr-3">Nome</th>
                          <th scope="col" className="font-medium pb-1.5">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.type + r.name} className="border-t border-line">
                            <td className="py-2 pr-3 font-semibold">{r.type}</td>
                            <td className="py-2 pr-3 font-mono text-[13px] break-all">{r.name}</td>
                            <td className="py-2">
                              <button type="button" onClick={() => copy(r.value)} title="Copiar" className="inline-flex items-center gap-1.5 font-mono text-[13px] break-all text-left cursor-pointer hover:text-accent-fg">
                                {r.value} <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {d.status === "connected" && (
                <p className="text-xs text-muted">A extensão passa a abrir o painel por este endereço. Se você usa confirmação de e-mail no cadastro, inclua {`https://${d.domain}/**`} nas URLs de redirecionamento do Supabase (Authentication &gt; URL Configuration).</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
