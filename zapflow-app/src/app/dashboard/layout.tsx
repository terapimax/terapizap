import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CommandPalette } from "@/components/layout/command-palette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Validação local do token (sem ida e volta ao Supabase); o proxy já renovou a sessão se preciso.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen bg-bg text-fg overflow-hidden">
      <Sidebar />
      <DashboardShell>
        <Header />
        <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col">{children}</main>
      </DashboardShell>
      <CommandPalette />
    </div>
  );
}
