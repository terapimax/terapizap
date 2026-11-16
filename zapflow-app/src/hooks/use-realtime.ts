"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const KEYS: Record<string, string[][]> = {
  leads: [["leads"], ["kanban"], ["leads-lite"]],
  kanban_cards: [["kanban"], ["leads"]],
  lead_tags: [["leads"], ["kanban"]],
  tasks: [["tasks"]],
  lead_messages: [["lead-messages"]],
  trigger_fires: [["trigger-fires"]],
};

/**
 * Tempo real: quando a extensão (ou outra aba) cria ou muda leads, cards, etiquetas ou tarefas,
 * o painel recarrega só o que mudou, sem precisar de F5. Lead novo vindo do WhatsApp avisa na tela.
 * As mudanças chegam pelo Supabase Realtime, que respeita as regras de acesso (cada um só vê os seus).
 */
export function useRealtimeSync() {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // junta várias mudanças seguidas (ex.: lead + card + etiqueta) numa recarga só
    const schedule = (table: string) => {
      pending.add(table);
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const seen = new Set<string>();
        for (const t of pending) for (const k of KEYS[t] ?? []) {
          if (seen.has(k[0])) continue;
          seen.add(k[0]);
          qc.invalidateQueries({ queryKey: k });
        }
        pending.clear();
      }, 400);
    };

    const channel = supabase.channel("zapflow-sync");
    for (const table of Object.keys(KEYS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        schedule(table);
        const row = payload.new as { id?: number; name?: string; origin?: string } | undefined;
        // "Me avisar" de um gatilho de lead: lembrete criado agora
        const task = payload.new as { kind?: string; title?: string; options?: { from_trigger?: number } } | undefined;
        if (table === "tasks" && payload.eventType === "INSERT" && task?.kind === "reminder" && task.options?.from_trigger) {
          toast(`⚡ ${task.title ?? "Gatilho disparou"}`, { action: { label: "Ver", onClick: () => router.push("/dashboard/tarefas") } });
        }
        if (table === "leads" && payload.eventType === "INSERT" && row?.origin === "WhatsApp") {
          toast.success(`Novo lead do WhatsApp: ${row.name ?? "contato"}`, {
            action: row.id ? { label: "Abrir", onClick: () => router.push(`/dashboard/leads?lead=${row.id}`) } : undefined,
          });
        }
      });
    }
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") console.warn("ZapFlow: tempo real indisponível (o painel continua funcionando; atualize a página para ver novidades).");
    });

    // Gatilhos de "lead parado numa etapa": não há servidor conferindo sozinho, então o painel
    // pede a conferência ao abrir e a cada 10 min (a extensão faz o mesmo; o banco evita repetir).
    // Banco na versão antiga (função ainda não criada): desiste em silêncio.
    let staleOff = false;
    const checkStale = async () => {
      if (staleOff || document.hidden) return;
      const { error } = await supabase.rpc("zf_check_stale");
      if (error) staleOff = true;
    };
    const staleFirst = setTimeout(checkStale, 6000);
    const staleTimer = setInterval(checkStale, 10 * 60_000);

    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(staleFirst);
      clearInterval(staleTimer);
      supabase.removeChannel(channel);
    };
  }, [qc, router]);
}
