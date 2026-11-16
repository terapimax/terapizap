"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsLeft, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { MAIN_NAV, SETTINGS_NAV, isNavActive, type NavItem } from "./nav-items";
import { useTasks } from "@/hooks/use-tasks";
import { attentionCount } from "@/lib/tasks";
import { BrandLogo } from "@/components/brand";

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, mobileSidebarOpen, closeMobileSidebar } = useAppStore();
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await createClient().auth.signOut();
    } finally {
      router.push("/auth/login");
    }
  };

  const collapsed = !sidebarOpen;
  const tasks = useTasks();
  const badges: Record<string, number> = { "/dashboard/tarefas": tasks.data ? attentionCount(tasks.data) : 0 };

  const link = (item: NavItem) => {
    const active = isNavActive(item, pathname);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={closeMobileSidebar}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 h-10 px-3 rounded-[10px] text-sm transition-colors",
          active ? "bg-surface text-fg font-semibold" : "text-muted font-medium hover:bg-surface hover:text-fg",
          collapsed && "md:justify-center md:px-0"
        )}
      >
        <span className="relative shrink-0">
          <Icon className="w-[18px] h-[18px]" />
          {!!badges[item.href] && collapsed && <span className="hidden md:block absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />}
        </span>
        <span className={cn("truncate", collapsed && "md:hidden")}>{item.label}</span>
        {!!badges[item.href] && (
          <span className={cn("ml-auto min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold grid place-items-center tabular-nums", collapsed && "md:hidden")}
            aria-label={`${badges[item.href]} pendentes`}>
            {badges[item.href]}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {mobileSidebarOpen && <div className="fixed inset-0 z-40 bg-scrim md:hidden" onClick={closeMobileSidebar} aria-hidden="true" />}

      <aside
        aria-label="Menu principal"
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-bg border-r border-line",
          "transition-[width,transform] duration-200 ease-out",
          collapsed ? "md:w-[72px]" : "md:w-60",
          "w-64",
          mobileSidebarOpen ? "translate-x-0" : "max-md:-translate-x-full"
        )}
      >
        <div className={cn("flex items-center gap-2.5 h-16 px-5 shrink-0 min-w-0", collapsed && "md:justify-center md:px-0")}>
          {/* marca da conta: logotipo horizontal (ou ícone + nome); recolhido, só o ícone quadrado */}
          <BrandLogo collapsed={collapsed} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">{MAIN_NAV.map(link)}</nav>

        <div className="px-3 pb-3 flex flex-col gap-0.5">
          {link(SETTINGS_NAV)}
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              "hidden md:flex items-center gap-3 h-10 px-3 rounded-[10px] text-sm font-medium text-muted hover:bg-surface hover:text-fg transition-colors cursor-pointer",
              collapsed && "justify-center px-0"
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            <ChevronsLeft className={cn("w-[18px] h-[18px] shrink-0 transition-transform", collapsed && "rotate-180")} />
            <span className={cn(collapsed && "hidden")}>Recolher</span>
          </button>
          <div className={cn("mt-2 pt-3 border-t border-line flex items-center gap-2.5 px-1", collapsed && "md:flex-col md:px-0")}>
            <span className="w-8 h-8 rounded-full bg-surface border border-line grid place-items-center text-xs font-semibold shrink-0">AD</span>
            <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
              <p className="text-[13px] font-semibold leading-tight truncate">Minha conta</p>
              <p className="text-xs text-muted flex items-center gap-1.5">
                <span className="w-[7px] h-[7px] rounded-full bg-ok" aria-hidden="true" />
                Online
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              title="Sair"
              className="h-8 w-8 grid place-items-center rounded-lg text-muted hover:text-hot hover:bg-hot-soft transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
