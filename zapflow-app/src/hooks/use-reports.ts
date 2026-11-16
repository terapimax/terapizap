"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { KanbanCardMove, TriggerFire } from "@/types";
import { startOfDay } from "@/lib/reports";

const supabase = createClient();

/** Lê tudo em páginas de 1000 (o limite do Supabase por consulta). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000 || out.length >= 50_000) return out;
  }
}

/**
 * Histórico de etapas do quadro (para os relatórios). Fica sob a chave "kanban":
 * mover um card (aqui, na extensão ou por gatilho) já recarrega os relatórios.
 */
export function useCardMoves(boardId: number | null) {
  return useQuery({
    queryKey: ["kanban", "moves", boardId],
    enabled: !!boardId,
    queryFn: () =>
      readAll<KanbanCardMove>((from, to) =>
        supabase.from("kanban_card_moves").select("*").eq("board_id", boardId!).order("at", { ascending: true }).order("id", { ascending: true }).range(from, to)
      ),
  });
}

/** Disparos de gatilho dos últimos `days` dias, contando hoje (0 = todos). */
export function useFiresSince(days: number) {
  return useQuery({
    queryKey: ["trigger-fires", "days", days],
    queryFn: () => {
      const iso = days > 0 ? startOfDay(new Date(Date.now() - (days - 1) * 86_400_000)).toISOString() : null;
      return readAll<TriggerFire>((from, to) => {
        let q = supabase.from("trigger_fires").select("id, trigger_id, lead_id, event, result, task_id, created_at");
        if (iso) q = q.gte("created_at", iso);
        return q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      });
    },
  });
}
