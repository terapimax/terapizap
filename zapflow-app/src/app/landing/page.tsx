import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hostBrand } from "@/lib/brand-server";
import { resolveBrand } from "@/lib/brand";
import LandingExperience from "./landing-experience";

export const metadata: Metadata = {
  title: "ZapFlow | Seu WhatsApp. Em outro ritmo.",
  description: "Menos tarefas repetidas, mais espaço para vender. Conecte mensagens, áudios, funis, CRM e agenda à sua operação no WhatsApp Web com o ZapFlow.",
};

export default async function LandingPage() {
  const brand = resolveBrand(await hostBrand());
  // Keep upstream styles scoped to the landing, including during client navigation.
  const engineCss = await readFile(path.join(process.cwd(), "public/landing/scrollcraft.css"), "utf8");
  return <><style>{`@scope (.zapflow-landing) { ${engineCss} }`}</style><LandingExperience brandName={brand.name} /></>;
}
