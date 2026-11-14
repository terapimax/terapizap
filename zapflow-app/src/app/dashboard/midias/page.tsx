"use client";

import { AlertCircle } from "lucide-react";
import { useMidias } from "@/hooks/use-media";
import { MediaManager } from "@/components/features/media-manager";
import { EmptyState } from "@/components/ui/shared";

export default function MidiasPage() {
  const { data = [], isLoading, isError } = useMidias();
  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar suas mídias" description="O banco de dados não respondeu. Recarregue a página." />;
  }
  return <MediaManager kind="media" items={data} isLoading={isLoading} />;
}
