import { TarefasView } from "./tarefas-view";

export default async function TarefasPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v } = await searchParams;
  return <TarefasView initialView={v === "calendario" ? "calendario" : "lista"} />;
}
