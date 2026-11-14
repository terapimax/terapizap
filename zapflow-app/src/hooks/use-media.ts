"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { MediaItem } from "@/types";
import { toast } from "sonner";

const supabase = createClient();

type MediaType = "audio" | "image" | "video" | "document";

function useMediaByType(type: MediaType | MediaType[], queryKey: string) {
  const types = Array.isArray(type) ? type : [type];
  return useQuery({
    queryKey: ["media", queryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library")
        .select("*")
        .in("type", types)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MediaItem[];
    },
  });
}

export function useAudios() {
  return useMediaByType("audio", "audios");
}

export function useMidias() {
  return useMediaByType(["image", "video"], "midias");
}

export function useDocumentos() {
  return useMediaByType("document", "documentos");
}

export function useAllMedia() {
  return useQuery({
    queryKey: ["media", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_library")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MediaItem[];
    },
  });
}

export function useUploadMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      title: string;
      caption?: string;
      type: MediaType;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Upload file to storage
      const fileExt = input.file.name.split(".").pop();
      const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("campaign_files")
        .upload(filePath, input.file, { contentType: input.file.type });
      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from("campaign_files")
        .getPublicUrl(filePath);

      // 3. Insert metadata
      const { data, error } = await supabase
        .from("media_library")
        .insert({
          user_id: user.id,
          title: input.title,
          caption: input.caption || null,
          url: urlData.publicUrl,
          type: input.type,
          mime_type: input.file.type,
          size: input.file.size,
          is_favorite: false,
          is_view_once: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as MediaItem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Arquivo enviado!");
    },
    onError: (e) => toast.error(`Erro no upload: ${e.message}`),
  });
}

export function useUpdateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MediaItem> & { id: number }) => {
      const { error } = await supabase.from("media_library").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: MediaItem) => {
      // 1. Delete from DB
      const { error } = await supabase.from("media_library").delete().eq("id", item.id);
      if (error) throw error;

      // 2. Delete from storage
      if (item.url?.includes("campaign_files")) {
        const path = item.url.split("/campaign_files/")[1];
        if (path) await supabase.storage.from("campaign_files").remove([path]);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Removido!");
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });
}
