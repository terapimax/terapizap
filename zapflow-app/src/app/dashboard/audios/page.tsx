"use client";

import { AlertCircle } from "lucide-react";
import { useAudios } from "@/hooks/use-media";
import { MediaManager } from "@/components/features/media-manager";
import { EmptyState } from "@/components/ui/shared";

export default function AudiosPage() {
  const { data = [], isLoading, isError } = useAudios();
  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar seus áudios" description="O banco de dados não respondeu. Recarregue a página." />;
  }
  return <MediaManager kind="audio" items={data} isLoading={isLoading} />;
}
