"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { resolveBrand, type Brand, type BrandRow } from "@/lib/brand";
import { cn } from "@/lib/utils";

const supabase = createClient();

/** `own` = dentro do painel (conta logada): a marca é a linha da conta e pode mudar em Configurações. */
const BrandContext = createContext<{ row: BrandRow | null; own: boolean }>({ row: null, own: false });

/** O servidor já manda a marca certa (do domínio ou da conta), então nada pisca ao carregar. */
export function BrandProvider({ row, own = false, children }: { row: BrandRow | null; own?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ row, own }), [row, own]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export const BRAND_KEY = ["branding"];

export async function fetchOwnBrand(): Promise<BrandRow | null> {
  const { data, error } = await supabase.from("branding").select("name, logo_url, icon_url, custom_domain").maybeSingle();
  if (error) return null; // banco na versão antiga: marca padrão
  return (data as BrandRow | null) ?? null;
}

/** A linha crua da conta (para a tela de Configurações). */
export function useBrandRow() {
  const ctx = useContext(BrandContext);
  return useQuery({ queryKey: BRAND_KEY, queryFn: fetchOwnBrand, enabled: ctx.own, initialData: ctx.own ? ctx.row : undefined, staleTime: 5 * 60_000 });
}

export function useBrand(): Brand {
  const ctx = useContext(BrandContext);
  const q = useBrandRow();
  const row = ctx.own ? (q.data ?? null) : ctx.row;
  return useMemo(() => resolveBrand(row), [row]);
}

/** Raio padrão num quadrado rosa — ou, com nome próprio e sem ícone, a inicial do nome. */
function DefaultMark({ brand, size }: { brand: Brand; size: number }) {
  return (
    <span className="rounded-lg bg-accent text-white grid place-items-center shrink-0 font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {brand.custom ? (
        brand.name.trim().charAt(0).toUpperCase()
      ) : (
        <svg width={size * 0.53} height={size * 0.53} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      )}
    </span>
  );
}

/** Ícone quadrado da marca (menu recolhido, telas pequenas). */
export function BrandIcon({ size = 30, brand: given, className }: { size?: number; brand?: Brand; className?: string }) {
  const ctxBrand = useBrand();
  const brand = given ?? ctxBrand;
  const [failed, setFailed] = useState<string | null>(null);
  if (brand.iconUrl && failed !== brand.iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={brand.iconUrl} alt="" width={size} height={size} onError={() => setFailed(brand.iconUrl)}
        className={cn("rounded-lg object-contain shrink-0", className)} style={{ width: size, height: size }} />
    );
  }
  return <DefaultMark brand={brand} size={size} />;
}

/**
 * Marca completa: o logotipo horizontal, se a conta subiu um; senão ícone + nome.
 * `collapsed` (menu recolhido no computador) mostra só o ícone quadrado.
 */
export function BrandLogo({ collapsed = false, size = 30, height, textClassName, brand: given }: {
  collapsed?: boolean;
  size?: number;
  /** altura do logotipo horizontal (padrão: um pouco maior que o ícone) */
  height?: number;
  textClassName?: string;
  brand?: Brand;
}) {
  const ctxBrand = useBrand();
  const brand = given ?? ctxBrand;
  const [failed, setFailed] = useState<string | null>(null);
  const h = height ?? Math.round(size * 1.2);
  const wide = brand.logoUrl && failed !== brand.logoUrl;
  return (
    <>
      {wide ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl!} alt={brand.name} onError={() => setFailed(brand.logoUrl)}
            className={cn("object-contain object-left min-w-0", collapsed && "md:hidden")} style={{ height: h, maxWidth: Math.round(h * 5.2) }} />
          <span className={cn("hidden", collapsed && "md:contents")}><BrandIcon size={size} brand={brand} /></span>
        </>
      ) : (
        <>
          <BrandIcon size={size} brand={brand} />
          <span className={cn("font-display text-[17px] font-bold tracking-tight truncate", textClassName, collapsed && "md:hidden")}>{brand.name}</span>
        </>
      )}
    </>
  );
}

/** Mantém o nome da aba e o ícone do navegador iguais à marca, inclusive logo depois de salvar. */
export function BrandHead() {
  const brand = useBrand();
  useEffect(() => {
    document.title = brand.name;
    if (!brand.iconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.dataset.brand = "1";
      document.head.appendChild(link);
    }
    link.href = brand.iconUrl;
  }, [brand.name, brand.iconUrl]);
  return null;
}
