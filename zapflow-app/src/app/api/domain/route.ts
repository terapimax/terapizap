// Domínio próprio da conta (white label).
// GET  -> situação do domínio salvo.   POST { domain } -> salva (ou remove, com "") e liga na Vercel.
//
// Ligação automática: precisa das variáveis VERCEL_TOKEN e VERCEL_PROJECT_ID (e VERCEL_TEAM_ID, se o
// projeto for de um time) na hospedagem. Sem elas o domínio fica salvo e a tela mostra o passo manual
// (Vercel > Settings > Domains > Add).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanDomain } from "@/lib/brand";
import { domainProject, type DomainInfo } from "@/lib/domain-status";

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID;

interface VercelDomainResponse {
  apexName?: string;
  verified?: boolean;
  verification?: { type: string; domain: string; value: string }[];
  misconfigured?: boolean;
  recommendedCNAME?: { rank: number; value: string }[];
  recommendedIPv4?: { rank: number; value: string[] }[];
  error?: { code?: string; message?: string };
}

async function vercel(path: string, init?: RequestInit) {
  const url = `https://api.vercel.com${path}${TEAM ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(TEAM)}` : ""}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: body as VercelDomainResponse };
}

function dnsName(host: string, apex?: string) {
  if (host === apex) return "@";
  return apex && host.endsWith(`.${apex}`) ? host.slice(0, -(apex.length + 1)) : host;
}

async function describe(domain: string | null, verify = false): Promise<DomainInfo> {
  const automatic = !!(TOKEN && PROJECT);
  const base = { domain, automatic, project: domainProject };
  if (!domain) return { domain: null, automatic, status: "none" };
  if (!automatic) return { ...base, status: "manual" };
  const unavailable: DomainInfo = { ...base, status: "error", message: "Não foi possível consultar a Vercel. Tente verificar novamente." };
  try {
    const path = `/v9/projects/${PROJECT}/domains/${encodeURIComponent(domain)}`;
    let project = await vercel(path);
    if (project.status === 404) return { ...base, status: "error", message: "O domínio está salvo. Clique em Tentar conectar para adicioná-lo ao projeto na Vercel." };
    if (!project.ok) return unavailable;
    if (verify && project.body.verified === false) {
      const result = await vercel(`${path}/verify`, { method: "POST" });
      if (result.ok) project = result;
      else if (result.status !== 400 && result.status !== 409) return unavailable;
    }
    const { apexName, verified } = project.body;
    const verification = verified === false ? project.body.verification?.map((v) => ({
      type: v.type, name: dnsName(v.domain, apexName), value: v.value,
    })) : undefined;
    const config = await vercel(`/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(PROJECT!)}`);
    if (!config.ok && !verification?.length) return unavailable;
    const apex = domain === apexName;
    const value = apex
      ? config.body.recommendedIPv4?.find((r) => r.rank === 1)?.value[0]
      : config.body.recommendedCNAME?.find((r) => r.rank === 1)?.value;
    const record = value && apexName ? { type: apex ? "A" : "CNAME", name: dnsName(domain, apexName), value } : undefined;
    return { ...base, status: verified === true && config.body.misconfigured === false ? "connected" : "pending", record, verification };
  } catch {
    return unavailable;
  }
}

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });
  const { data, error } = await supabase.from("branding").select("custom_domain").maybeSingle();
  if (error) return NextResponse.json({ error: "Rode o supabase/setup.sql de novo no Supabase para ativar a marca própria." }, { status: 500 });
  return NextResponse.json(await describe(data?.custom_domain ?? null));
}

export async function POST(request: Request) {
  // só aceita pedidos vindos do próprio painel
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host.split(",")[0].trim()) {
    return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
  }
  const { supabase, user } = await currentUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Entre de novo." }, { status: 401 });

  const body = await request.json().catch(() => null) as { domain?: unknown; action?: unknown } | null;
  const domain = typeof body?.domain === "string" ? cleanDomain(body.domain) : null;
  if (domain === null) return NextResponse.json({ error: "Domínio inválido. Exemplo: painel.suaempresa.com.br" }, { status: 400 });

  const before = await supabase.from("branding").select("custom_domain").maybeSingle();
  if (before.error) return NextResponse.json({ error: "Rode o supabase/setup.sql de novo no Supabase para ativar a marca própria." }, { status: 500 });
  const old = before.data?.custom_domain ?? null;
  const next = domain || null;
  if (body?.action === "verify") {
    if (!old || old !== next) return NextResponse.json({ error: "O domínio salvo mudou. Atualize a página para conferir." }, { status: 409 });
    return NextResponse.json(await describe(old, true));
  }

  if (old !== next) {
    const { error } = await supabase.from("branding").upsert({ user_id: user.id, custom_domain: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      const taken = error.code === "23505";
      return NextResponse.json({ error: taken ? "Este domínio já está em uso por outra conta." : "Não foi possível salvar o domínio." }, { status: taken ? 409 : 500 });
    }
  }

  if (TOKEN && PROJECT) {
    try {
      if (old && old !== next) await vercel(`/v9/projects/${PROJECT}/domains/${old}`, { method: "DELETE" });
      if (next) {
        const add = await vercel(`/v10/projects/${PROJECT}/domains`, { method: "POST", body: JSON.stringify({ name: next }) });
        const code = (add.body.error as { code?: string } | undefined)?.code;
        // já estar neste projeto não é erro (salvar de novo só confere a situação)
        if (!add.ok && code !== "domain_already_in_use" && add.status !== 409) {
          const msg = (add.body.error as { message?: string } | undefined)?.message;
          return NextResponse.json({ ...(await describe(next)), status: "error", message: msg ? `A hospedagem recusou o domínio: ${msg}` : "A hospedagem recusou o domínio." });
        }
      }
    } catch {
      return NextResponse.json({ ...(await describe(next)), status: "error", message: "Domínio salvo, mas a hospedagem não respondeu. Tente de novo em instantes." });
    }
  }
  return NextResponse.json(await describe(next));
}
