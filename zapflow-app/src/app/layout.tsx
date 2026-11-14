import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/providers";
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

export const metadata: Metadata = {
  title: "ZapFlow — Automação Inteligente para WhatsApp",
  description:
    "Gerencie leads, envie mensagens, áudios e mídias no WhatsApp Web com automação inteligente. CRM Kanban e funis de vendas.",
  keywords: ["WhatsApp", "automação", "CRM", "Kanban", "leads", "funil de vendas"],
};

// Aplica o tema salvo antes da primeira pintura (evita piscar entre claro e escuro).
// Sem escolha salva, segue o tema do sistema (e o acompanha enquanto a página estiver aberta).
const themeInit = `try{var r=document.documentElement,t=localStorage.getItem('zf-theme');if(t==='dark'||t==='light'){r.classList.add(t)}else{var m=matchMedia('(prefers-color-scheme: dark)');var a=function(){if(!localStorage.getItem('zf-theme')){r.classList.toggle('dark',m.matches)}};a();m.addEventListener('change',a)}}catch(e){}`;

export default function RootLayout({
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
