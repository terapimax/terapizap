import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { selectOwnBrand, type BrandRow } from "@/lib/brand";

/**
 * Marca de quem é dono do endereço que está sendo acessado (domínio próprio).
 * Serve para a tela de login e para o título da aba, quando ainda não há ninguém logado.
 * Endereço padrão (localhost, *.vercel.app) ou banco na versão antiga = null (marca padrão).
 */
export const hostBrand = cache(async (): Promise<BrandRow | null> => {
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!host || host === "localhost" || /^[\d.]+$/.test(host) || host.endsWith(".vercel.app")) return null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/zf_brand_for_host`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_host: host }),
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as BrandRow[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
});

/** Marca da conta logada (a linha dela em `branding`); null = ainda não personalizou. */
export const ownBrand = cache(async (): Promise<BrandRow | null> => {
  try {
    return await selectOwnBrand(await createClient());
  } catch {
    return null;
  }
});
