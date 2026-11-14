"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LIBRARY_TABS, routeMeta } from "./nav-items";

export function Header() {
  const { toggleMobileSidebar } = useAppStore();
  const pathname = usePathname();
  const meta = routeMeta(pathname);
  const inLibrary = LIBRARY_TABS.some((t) => pathname.startsWith(t.href));

  return (
    <header className="shrink-0 bg-bg border-b border-line px-4 sm:px-8">
      <div className="flex items-center gap-3 min-h-[76px] py-3">
        <button
          type="button"
          onClick={toggleMobileSidebar}
          aria-label="Abrir menu"
          className="md:hidden h-10 w-10 -ml-2 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold leading-tight truncate">{meta.title}</h1>
          {meta.description && <p className="text-sm text-muted truncate hidden sm:block">{meta.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("zf:open-palette"))}
          className="hidden sm:flex items-center gap-2 h-10 pl-3 pr-2 w-56 lg:w-72 rounded-[10px] bg-surface text-muted text-sm cursor-pointer hover:text-fg transition-colors"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span className="flex-1 text-left">Ir para…</span>
          <kbd className="text-[11px] border border-line rounded-md px-1.5 py-0.5">Ctrl K</kbd>
        </button>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("zf:open-palette"))}
          aria-label="Ir para"
          className="sm:hidden h-10 w-10 grid place-items-center rounded-[10px] text-muted hover:text-fg hover:bg-surface cursor-pointer"
        >
          <Search className="w-5 h-5" />
        </button>
        <ThemeToggle />
      </div>

      {inLibrary && (
        <nav aria-label="Seções da biblioteca" className="flex gap-6 -mb-px overflow-x-auto hide-scrollbar">
          {LIBRARY_TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 py-3 text-sm border-b-2 whitespace-nowrap transition-colors",
                  active ? "border-fg text-fg font-semibold" : "border-transparent text-muted font-medium hover:text-fg"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
