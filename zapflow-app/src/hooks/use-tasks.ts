"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Lead, Task } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

const SELECT = "*, lead:leads(id,name,phone), media:media_library(id,title,type,url,caption)";
const BUCKET = "campaign_files";

export type LeadLite = Pick<Lead, "id" | "name" | "phone">;

/** Campos que o formulário grava; o resto (status, tentativas…) tem padrão no banco. */
export type TaskInput = Pick<
  Task,
  "lead_id" | "kind" | "title" | "due_at" | "contact" | "phone" | "content_type" | "text" | "media_id" | "funnel_id" | "notes" | "color" | "options"
> & { file_url?: string | null };

function storagePath(url?: string | null) {
  return url?.includes(`/${BUCKET}/`) ? url.split(`/${BUCKET}/`)[1] : null;
}

async function removeFile(url?: string | null) {
  const path = storagePath(url);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select(SELECT).order("due_at", { ascending: true });
      if (error) throw error;
      return data as Task[];
    },
    // a extensão muda o status das tarefas; atualiza sozinho de tempos em tempos
    refetchInterval: 60_000,
  });
}

/** Lista enxuta de leads para escolher em "Nova tarefa". */
export function useLeadsLite(enabled = true) {
  return useQuery({
    queryKey: ["leads-lite"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,name,phone").order("name");
      if (error) throw error;
      return data as LeadLite[];
    },
  });
}

/**
 * Cria ou edita uma tarefa. `audio` = áudio exclusivo novo (já em OGG/Opus);
 * ao trocar ou remover o áudio exclusivo, o arquivo antigo é apagado.
 */
export function useSaveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input, audio, previousFileUrl, leadPhone }: {
      id?: number;
      input: TaskInput;
      audio?: Blob | null;
      previousFileUrl?: string | null;
      /** telefone digitado no formulário para um lead que não tinha */
      leadPhone?: { leadId: number; phone: string } | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Entre de novo.");

      if (leadPhone) {
        const { error } = await supabase.from("leads").update({ phone: leadPhone.phone }).eq("id", leadPhone.leadId);
        if (error) throw error;
      }

      const row: TaskInput = { ...input };
      if (audio) {
        const path = `${user.id}/tasks/${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, audio, { contentType: "audio/ogg" });
        if (error) throw error;
        row.file_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }

      if (id) {
        // editar = reagendar: volta para "agendada" mesmo se tinha falhado
        const { error } = await supabase.from("tasks").update({ ...row, status: "scheduled", error: null, finished_at: null }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert({ ...row, user_id: user.id });
        if (error) throw error;
      }

      // file_url undefined = manteve o áudio; null = removeu; outro link = trocou
      if (previousFileUrl && row.file_url !== undefined && row.file_url !== previousFileUrl) await removeFile(previousFileUrl);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      if (v.leadPhone) {
        qc.invalidateQueries({ queryKey: ["kanban"] });
        qc.invalidateQueries({ queryKey: ["leads-lite"] });
      }
      toast.success(v.id ? "Tarefa atualizada" : v.input.kind === "send" ? "Envio agendado" : "Lembrete criado");
    },
    onError: (e) => toast.error(`Não foi possível salvar: ${e.message}`),
  });
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Task["status"] }) => {
      const final = status !== "scheduled" && status !== "sending";
      const { error } = await supabase
        .from("tasks")
        .update({ status, finished_at: final ? new Date().toISOString() : null, ...(status === "scheduled" ? { error: null } : {}) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Pick<Task, "id" | "file_url">) => {
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      await removeFile(task.file_url);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Tarefa excluída"); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

/** Apaga os áudios exclusivos das tarefas de um lead (antes de excluir o lead). */
export async function removeLeadTaskFiles(leadId: number) {
  const { data } = await supabase.from("tasks").select("file_url").eq("lead_id", leadId).not("file_url", "is", null);
  const paths = (data ?? []).map((t) => storagePath(t.file_url)).filter(Boolean) as string[];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
