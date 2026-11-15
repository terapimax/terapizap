"use client";

import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { useRealtimeSync } from "@/hooks/use-realtime";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();
  useRealtimeSync();

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
