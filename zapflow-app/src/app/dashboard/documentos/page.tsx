"use client";

import { AlertCircle } from "lucide-react";
import { useDocumentos } from "@/hooks/use-media";
import { MediaManager } from "@/components/features/media-manager";
import { EmptyState } from "@/components/ui/shared";

export default function DocumentosPage() {
  const { data = [], isLoading, isError } = useDocumentos();
  if (isError) {
    return <EmptyState icon={AlertCircle} title="Não foi possível carregar seus documentos" description="O banco de dados não respondeu. Recarregue a página." />;
  }
  return <MediaManager kind="document" items={data} isLoading={isLoading} />;
}
