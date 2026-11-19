"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Copy, Globe, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { BRAND_KEY } from "@/components/brand";
import { Button } from "@/components/ui/shared";
import { cleanDomain } from "@/lib/brand";
import { fetchDomainStatus } from "@/lib/domain-client";
import type { DomainInfo } from "@/lib/domain-status";

const DOMAIN_KEY = ["branding-domain"] as const;

function resultFor(info?: DomainInfo) {
  switch (info?.status) {
    case "connected":
      return { title: "Conectado", detail: "O endereço já abre este painel por uma conexão segura." };
    case "manual":
      return { title: "Domínio salvo · conexão pendente", detail: "Ainda não foi possível abrir este painel pelo endereço. Na Vercel, abra o projeto e entre em Settings → Domains. Confira o destino do DNS e o registro TXT, se solicitado. Copie esses dados para o provedor do domínio." };
    case "pending":
      return info.verification?.length
        ? { title: "Aguardando confirmação de propriedade", detail: "Crie o registro TXT indicado no provedor do domínio. Depois de salvar, clique em Verificar novamente." }
        : { title: "Aguardando o DNS", detail: "Confira o registro indicado pela Vercel no provedor do domínio. O painel verifica a conexão novamente enquanto esta tela está aberta." };
    case "https":
      return { title: "Aguardando conexão segura", detail: "A Vercel confirmou o DNS. O acesso ao painel por HTTPS ainda está pendente. A emissão do certificado pode levar alguns minutos." };
    case "error":
      return { title: "Falha na conexão", detail: info.message || "Não foi possível confirmar o domínio na hospedagem." };
    default:
      return { title: "Nenhum domínio configurado", detail: "" };
  }
}

export function DomainSettings() {
  const qc = useQueryClient();
  const [edited, setEdited] = useState<string | null>(null);
  const [validation, setValidation] = useState("");
  const [checking, setChecking] = useState(false);
  const info = useQuery({
    queryKey: DOMAIN_KEY,
    queryFn: ({ signal }) => fetchDomainStatus(undefined, signal),
    refetchOnMount: "always",
    refetchInterval: ({ state }) => ["pending", "manual", "https"].includes(state.data?.status ?? "") ? 30_000 : false,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (change: { domain: string; action?: "verify" }) => fetchDomainStatus(change),
    onMutate: () => qc.cancelQueries({ queryKey: DOMAIN_KEY }),
    onSuccess: async (data, change) => {
      await qc.cancelQueries({ queryKey: DOMAIN_KEY });
      qc.setQueryData(DOMAIN_KEY, data);
      setEdited(null);
      if (!change.action) void qc.invalidateQueries({ queryKey: BRAND_KEY });
    },
  });
  const data = info.data;
  const current = data?.domain ?? "";
  const value = edited ?? current;
  const typed = cleanDomain(value);
  const same = !!current && current === typed;
  const retryConnect = same && data?.automatic && data.status === "error";
  const busy = save.isPending || checking || (!data && info.isFetching);
  const error = validation || save.error?.message || info.error?.message;

  async function recheck() {
    setChecking(true);
    try { await info.refetch(); } finally { setChecking(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setValidation("");
    save.reset();
    if (typed === null) {
      setValidation("Informe um endereço válido, como painel.suaempresa.com.br.");
    } else if (same && !retryConnect) {
      if (data?.automatic && data.verification?.length) save.mutate({ domain: current, action: "verify" });
      else void recheck();
    } else if (typed || current) {
      save.mutate({ domain: typed });
    }
  }

  let { title, detail } = resultFor(data);
  if (error) {
    title = "Não foi possível confirmar o domínio";
    detail = error;
  }
  if (busy) {
    title = !data && info.isFetching ? "Consultando o domínio…" : "Verificando a conexão…";
    if (save.isPending && !save.variables?.action) title = save.variables?.domain ? "Salvando e verificando o domínio…" : "Removendo domínio…";
    detail = "";
  } else if (!error && data?.status === "none" && save.isSuccess && save.variables?.domain === "") {
    title = "Domínio removido";
  }
  const failed = !!error || data?.status === "error";
  const connected = data?.status === "connected" && !failed && !busy;
  const Icon = busy ? Loader2 : failed ? TriangleAlert : connected ? CheckCircle2 : current ? Clock : Globe;
  const records = data?.status === "pending" ? [...(data.record ? [data.record] : []), ...(data.verification ?? [])] : [];
  const attempted = save.isPending ? save.variables?.domain : save.isError ? save.variables?.domain : undefined;
  const displayDomain = attempted ?? (validation ? value.trim() : current);

  return (
    <section id="dominio-proprio" aria-labelledby="domain-heading" className="flex flex-col gap-4 pt-6 border-t border-line scroll-mt-6">
      <div>
        <h3 id="domain-heading" className="font-sans text-sm font-semibold tracking-normal flex items-center gap-2"><Globe className="w-4 h-4" aria-hidden="true" /> Domínio próprio</h3>
        <p className="text-sm text-muted mt-0.5">Use o endereço da sua empresa para abrir o painel e a tela de login com a sua marca.</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <label htmlFor="brand-domain" className="sr-only">Domínio</label>
        <input id="brand-domain" value={value} onChange={(event) => { setEdited(event.target.value); setValidation(""); save.reset(); }}
          placeholder="painel.suaempresa.com.br" inputMode="url" autoComplete="off" spellCheck={false}
          aria-describedby="domain-status" aria-invalid={!!validation} disabled={!data || save.isPending}
          className="flex-1 min-w-0 basis-52 h-10 px-3 rounded-[10px] bg-card border border-line text-sm text-fg placeholder:text-muted outline-none focus:border-fg" />
        {info.isError && !data ? (
          <Button variant="secondary" onClick={() => void recheck()} disabled={busy}>Tentar novamente</Button>
        ) : (
          <Button type="submit" variant="secondary" disabled={busy || (!current && !value.trim())}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {retryConnect ? "Tentar conectar" : same ? "Verificar novamente" : current && !value.trim() ? "Remover domínio" : "Conectar"}
          </Button>
        )}
      </form>
      <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
        <div id="domain-status" role="status" aria-live="polite" aria-atomic="true">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Icon className={`w-4 h-4 shrink-0 ${busy ? "animate-spin text-muted" : failed ? "text-hot" : connected ? "text-ok" : "text-muted"}`} aria-hidden="true" />
            <span className="font-semibold">{title}</span>
            {displayDomain && <span className="break-all text-muted">{displayDomain}</span>}
          </div>
          {detail && <p className="mt-1.5 text-sm text-muted">{detail}</p>}
        </div>
        {!busy && !failed && current && (connected || data?.status === "https" || data?.status === "manual") && (
          <a href={`https://${current}/auth/login`} target="_blank" rel="noreferrer" className="self-start text-sm text-accent-fg font-semibold hover:underline">{connected ? "Abrir painel" : "Testar login pelo domínio"}</a>
        )}
        {!busy && !error && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Registros de DNS indicados pela Vercel</caption>
              <thead><tr className="text-left text-xs text-muted">
                <th scope="col" className="pb-1.5 pr-3">Tipo</th><th scope="col" className="pb-1.5 pr-3">Nome</th><th scope="col" className="pb-1.5">Valor</th>
              </tr></thead>
              <tbody>{records.map((r) => (
                <tr key={r.type + r.name + r.value} className="border-t border-line">
                  <td className="py-2 pr-3 font-semibold">{r.type}</td><td className="py-2 pr-3 font-mono break-all">{r.name}</td>
                  <td className="py-2"><button type="button" title="Copiar valor" className="inline-flex items-center gap-1.5 font-mono break-all text-left cursor-pointer hover:text-accent-fg"
                    onClick={() => navigator.clipboard?.writeText(r.value).then(() => toast.success("Copiado"), () => toast.error("Selecione e copie o valor do registro."))}>
                    {r.value}<Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  </button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {connected && <p className="text-xs text-muted">Se o cadastro usa confirmação por e-mail, inclua <code>{`https://${current}/**`}</code> em Authentication → URL Configuration no Supabase.</p>}
      </div>
    </section>
  );
}
