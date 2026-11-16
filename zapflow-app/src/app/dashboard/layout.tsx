import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CommandPalette } from "@/components/layout/command-palette";
import { BrandHead, BrandProvider } from "@/components/brand";
import { hostBrand, ownBrand } from "@/lib/brand-server";
import { brandFavicon, resolveBrand } from "@/lib/brand";
import type { Metadata } from "next";

// Dentro do painel vale a marca da conta logada (Configurações > Marca).
export async function generateMetadata(): Promise<Metadata> {
  const brand = resolveBrand((await ownBrand()) ?? (await hostBrand()));
  return { title: brand.name, ...(brandFavicon(brand) ? { icons: { icon: brandFavicon(brand)! } } : {}) };
}

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
    <BrandProvider row={await ownBrand()} own>
      <BrandHead />
      <div className="flex h-screen bg-bg text-fg overflow-hidden">
        <Sidebar />
        <DashboardShell>
          <Header />
          <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col">{children}</main>
        </DashboardShell>
        <CommandPalette />
      </div>
    </BrandProvider>
  );
}
