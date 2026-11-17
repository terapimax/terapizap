import {
  Home,
  Users,
  BookOpen,
  Filter,
  Zap,
  Settings,
  MessageSquareText,
  Mic,
  Image,
  FileText,
  ListChecks,
  Columns3,
  BarChart3,
  Package,
  Bot,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Rotas extras que também deixam este item ativo */
  match?: string[];
  description: string;
}

export const LIBRARY_TABS: NavItem[] = [
  { href: "/dashboard/mensagens", label: "Mensagens", icon: MessageSquareText, description: "Textos prontos para enviar" },
  { href: "/dashboard/audios", label: "Áudios", icon: Mic, description: "Áudios enviados como mensagem de voz" },
  { href: "/dashboard/midias", label: "Mídias", icon: Image, description: "Imagens e vídeos" },
  { href: "/dashboard/documentos", label: "Documentos", icon: FileText, description: "PDFs e outros arquivos" },
];

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: Home, description: "Visão geral do seu desempenho" },
  { href: "/dashboard/leads", label: "Leads", icon: Users, description: "Sua base de contatos, com etiquetas, importação e exportação" },
  { href: "/dashboard/kanban", label: "Kanban", icon: Columns3, description: "Seus leads por etapa do funil de vendas" },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3, description: "Conversão, tempo em cada etapa, origem dos leads e gatilhos" },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: ListChecks, description: "Envios agendados e lembretes, em lista ou calendário" },
  { href: "/dashboard/catalogo", label: "Catálogo", icon: Package, description: "Produtos, serviços e campanhas para escolher no card do lead" },
  {
    href: "/dashboard/mensagens",
    label: "Biblioteca",
    icon: BookOpen,
    match: LIBRARY_TABS.map((t) => t.href),
    description: "Mensagens, áudios, mídias e documentos",
  },
  { href: "/dashboard/funis", label: "Funis", icon: Filter, description: "Sequências com digitando e gravando automáticos" },
  { href: "/dashboard/gatilhos", label: "Gatilhos", icon: Zap, description: "Automações disparadas por eventos" },
  { href: "/dashboard/agente", label: "Agente", icon: Bot, description: "Seu vendedor de IA: conecte, treine, teste e acompanhe" },
];

export const SETTINGS_NAV: NavItem = {
  href: "/dashboard/configuracoes",
  label: "Configurações",
  icon: Settings,
  description: "Preferências da conta",
};

export function isNavActive(item: NavItem, pathname: string) {
  if (item.href === "/dashboard") return pathname === "/dashboard";
  const routes = item.match ?? [item.href];
  return routes.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

export function routeMeta(pathname: string): { title: string; description: string } {
  const lib = LIBRARY_TABS.find((t) => pathname.startsWith(t.href));
  if (lib) return { title: "Biblioteca", description: "Mensagens, áudios, mídias e documentos para enviar com um clique" };
  const all = [...MAIN_NAV, SETTINGS_NAV];
  const hit = all.find((i) => isNavActive(i, pathname));
  return hit ? { title: hit.label === "Início" ? "Visão geral" : hit.label, description: hit.description } : { title: "Painel", description: "" };
}
