import { AgentView, type AgentTab } from "@/components/features/agent/agent-view";

const TABS: AgentTab[] = ["conexao", "treino", "biblioteca", "simulador", "automatico", "gerente", "registro"];

export default async function AgentePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  return <AgentView initialTab={TABS.includes(aba as AgentTab) ? (aba as AgentTab) : "conexao"} />;
}
