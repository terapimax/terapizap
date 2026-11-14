"use client";

import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();

  return (
    <div
      className={cn(
        "flex flex-col flex-1 min-w-0 h-screen transition-[padding] duration-200",
        sidebarOpen ? "md:pl-60" : "md:pl-[72px]"
      )}
    >
      {children}
    </div>
  );
}
