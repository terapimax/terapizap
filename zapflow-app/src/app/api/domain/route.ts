// Domínio próprio da conta (white label).
// GET  -> situação do domínio salvo.   POST { domain } -> salva (ou remove, com "") e liga na Vercel.
//
// Ligação automática: precisa das variáveis VERCEL_TOKEN e VERCEL_PROJECT_ID (e VERCEL_TEAM_ID, se o
// projeto for de um time) na hospedagem. Sem elas o domínio fica salvo e a tela mostra o passo manual
// (Vercel > Settings > Domains > Add).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanDomain, dnsRecordFor } from "@/lib/brand";

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const TEAM = process.env.VERCEL_TEAM_ID;

type Status = "none" | "connected" | "pending" | "manual" | "error";
interface DomainInfo {
  domain: string | null;
  /** a hospedagem está configurada para ligar domínios sozinha */
  automatic: boolean;
  status: Status;
  record?: { type: string; name: string; value: string };
  /** registro extra que a Vercel pede quando o domínio já é usado em outra conta dela */
  verification?: { type: string; name: string; value: string }[];
  message?: string;
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
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> };
}

async function describe(domain: string | null): Promise<DomainInfo> {
  const automatic = !!(TOKEN && PROJECT);
  if (!domain) return { domain: null, automatic, status: "none" };
  const record = dnsRecordFor(domain);
  if (!automatic) return { domain, automatic, status: "manual", record };
  try {
    const project = await vercel(`/v9/projects/${PROJECT}/domains/${domain}`);
    if (project.status === 404) return { domain, automatic, status: "error", record, message: "O domínio ainda não foi adicionado à hospedagem. Clique em Salvar de novo." };
    if (!project.ok) return { domain, automatic, status: "error", record, message: "A hospedagem não respondeu. Tente de novo em instantes." };
    const verification = Array.isArray(project.body.verification)
      ? (project.body.verification as { type: string; domain: string; value: string }[]).map((v) => ({ type: v.type, name: v.domain, value: v.value }))
      : undefined;
    const config = await vercel(`/v6/domains/${domain}/config`);
    const pointed = config.ok && config.body.misconfigured === false;
    const verified = project.body.verified !== false;
    return { domain, automatic, status: pointed && verified ? "connected" : "pending", record, verification: verified ? undefined : verification };
  } catch {
    return { domain, automatic, status: "error", record, message: "A hospedagem não respondeu. Tente de novo em instantes." };
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

  const body = (await request.json().catch(() => ({}))) as { domain?: unknown };
  const domain = cleanDomain(typeof body.domain === "string" ? body.domain : "");
  if (domain === null) return NextResponse.json({ error: "Domínio inválido. Exemplo: painel.suaempresa.com.br" }, { status: 400 });

  const before = await supabase.from("branding").select("custom_domain").maybeSingle();
  if (before.error) return NextResponse.json({ error: "Rode o supabase/setup.sql de novo no Supabase para ativar a marca própria." }, { status: 500 });
  const old = before.data?.custom_domain ?? null;
  const next = domain || null;

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
