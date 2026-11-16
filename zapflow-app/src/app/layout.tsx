import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/providers";
import { BrandProvider } from "@/components/brand";
import { hostBrand } from "@/lib/brand-server";
import { resolveBrand } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

// Título e ícone da aba seguem a marca de quem é dono do endereço (domínio próprio); senão, o padrão.
export async function generateMetadata(): Promise<Metadata> {
  const brand = resolveBrand(await hostBrand());
  return {
    title: brand.custom ? brand.name : `${brand.name} — Automação Inteligente para WhatsApp`,
    description:
      "Gerencie leads, envie mensagens, áudios e mídias no WhatsApp Web com automação inteligente. CRM Kanban e funis de vendas.",
    keywords: ["WhatsApp", "automação", "CRM", "Kanban", "leads", "funil de vendas"],
    ...(brand.iconUrl ? { icons: { icon: brand.iconUrl } } : {}),
  };
}

// Aplica o tema salvo antes da primeira pintura (evita piscar entre claro e escuro).
// Sem escolha salva, segue o tema do sistema (e o acompanha enquanto a página estiver aberta).
const themeInit = `try{var r=document.documentElement,t=localStorage.getItem('zf-theme');if(t==='dark'||t==='light'){r.classList.add(t)}else{var m=matchMedia('(prefers-color-scheme: dark)');var a=function(){if(!localStorage.getItem('zf-theme')){r.classList.toggle('dark',m.matches)}};a();m.addEventListener('change',a)}}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${interTight.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-bg text-fg">
        <Providers>
          <BrandProvider row={await hostBrand()}>{children}</BrandProvider>
        </Providers>
      </body>
    </html>
  );
}
