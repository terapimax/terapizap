"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { brandFavicon, resolveBrand, selectOwnBrand, type Brand, type BrandRow } from "@/lib/brand";
import { MARKS, accentCss } from "@/lib/brand-kit";
import { cn } from "@/lib/utils";

const supabase = createClient();

/** `own` = dentro do painel (conta logada): a marca é a linha da conta e pode mudar em Configurações. */
const BrandContext = createContext<{ row: BrandRow | null; own: boolean }>({ row: null, own: false });

/** O servidor já manda a marca certa (do domínio ou da conta), então nada pisca ao carregar. */
export function BrandProvider({ row, own = false, children }: { row: BrandRow | null; own?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ row, own }), [row, own]);
  return <BrandContext.Provider value={value}><BrandStyle />{children}</BrandContext.Provider>;
}

/**
 * Troca o rosa padrão pela cor da marca em todas as telas. Vai no HTML que o servidor manda,
 * então a cor certa já aparece na primeira pintura (sem piscar rosa).
 */
function BrandStyle() {
  const { accent } = useBrand();
  if (!accent) return null;
  return <style data-brand-accent dangerouslySetInnerHTML={{ __html: accentCss(accent) }} />;
}

export const BRAND_KEY = ["branding"];

export async function fetchOwnBrand(): Promise<BrandRow | null> {
  return selectOwnBrand(supabase);
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

/** Ícone vetorial escolhido (raio, coração, estrela…) ou a inicial do nome, num quadrado na cor da marca. */
export function MarkTile({ brand, size }: { brand: Pick<Brand, "mark" | "name">; size: number }) {
  return (
    <span className="rounded-lg bg-accent text-on-accent grid place-items-center shrink-0 font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">
      {brand.mark === "letter" ? (
        brand.name.trim().charAt(0).toUpperCase()
      ) : (
        <svg width={size * 0.53} height={size * 0.53} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={brand.mark === "bolt" ? 2.4 : 2.2}
          strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: MARKS[brand.mark].svg }} />
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
  return <MarkTile brand={brand} size={size} />;
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
  const favicon = brandFavicon(brand);
  useEffect(() => {
    document.title = brand.name;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"][data-brand]');
    if (!favicon) { link?.remove(); return; }
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.dataset.brand = "1";
      document.head.appendChild(link);
    }
    link.href = favicon;
  }, [brand.name, favicon]);
  return null;
}
