"use client";

import { useState } from "react";
import { initials } from "@/lib/leads";
import { cn } from "@/lib/utils";

/**
 * Foto de perfil do lead (a extensão guarda uma cópia pequena em leads.avatar).
 * Sem foto, ou se a imagem não carregar: as iniciais, como antes.
 * O tamanho e o corpo da letra vêm do className (ex.: "w-8 h-8 text-xs").
 */
export function LeadAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [bad, setBad] = useState<string | null>(null);
  const url = src && /^https:\/\//.test(src) && bad !== src ? src : null;
  return (
    <span
      className={cn("rounded-full bg-surface border border-line grid place-items-center font-semibold shrink-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura já reduzida (96 px) no Supabase; o otimizador do Next não ajudaria
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBad(url)} className="w-full h-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
