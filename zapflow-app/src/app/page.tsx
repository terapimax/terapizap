import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "./landing/page";
import { hostBrand } from "@/lib/brand-server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/dashboard");
  }

  // Domínio próprio de uma conta: é o painel daquela empresa, então vai direto para o login
  // (a página de apresentação é a do produto, não a do cliente).
  if (await hostBrand()) {
    redirect("/auth/login");
  }

  return <LandingPage />;
}
