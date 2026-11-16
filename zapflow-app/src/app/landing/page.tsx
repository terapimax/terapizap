import Link from "next/link";
import { ArrowRight, Calendar, Filter, Image as ImageIcon, MessageSquareText, Mic, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { BrandLogo } from "@/components/brand";
import { hostBrand } from "@/lib/brand-server";
import { resolveBrand } from "@/lib/brand";

export const metadata = {
  description: "Envie mensagens, áudios, imagens e documentos com um clique no WhatsApp Web, com “digitando…” e “gravando áudio…” antes de cada envio. Leads e funis no mesmo lugar.",
};

const features = [
  { icon: MessageSquareText, title: "Mensagens prontas", text: "Guarde seus textos e envie com um clique, direto na conversa aberta." },
  { icon: Mic, title: "Áudios de voz", text: "Grave na hora ou envie um arquivo. Convertemos para o formato de mensagem de voz do WhatsApp." },
  { icon: ImageIcon, title: "Mídias e documentos", text: "Imagens, vídeos, PDFs e planilhas organizados em uma biblioteca com busca e favoritos." },
  { icon: Users, title: "Leads por etapa", text: "Acompanhe cada contato do primeiro “oi” ao fechamento, com valor e temperatura." },
  { icon: Filter, title: "Funis de mensagens", text: "Monte sequências de mensagens, áudios e arquivos com o tempo de espera entre cada passo." },
  { icon: Calendar, title: "Agenda", text: "Compromissos e retornos organizados por dia, ao lado dos seus leads." },
];

const steps = [
  { title: "Monte sua biblioteca", text: "Cadastre mensagens, áudios, imagens e documentos no painel." },
  { title: "Instale a extensão", text: "Ela abre ao lado do WhatsApp Web e mostra sua biblioteca em qualquer conversa." },
  { title: "Envie com um clique", text: "O contato vê “digitando…” ou “gravando áudio…” antes de cada envio." },
];

export default async function LandingPage() {
  const brand = resolveBrand(await hostBrand());
  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="sticky top-0 z-30 bg-bg/95 border-b border-line">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-5 h-16">
          <span className="flex items-center gap-3 mr-auto min-w-0"><BrandLogo size={36} textClassName="text-lg" /></span>
          <ThemeToggle />
          <Link href="/auth/login" className="h-10 px-4 rounded-[10px] text-sm font-semibold inline-flex items-center hover:bg-surface transition-colors">Entrar</Link>
          <Link href="/auth/login" className="h-10 px-4 rounded-[10px] bg-primary text-on-primary text-sm font-semibold inline-flex items-center hover:opacity-90 transition-opacity">Criar conta</Link>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-5 pt-16 pb-14 md:pt-24 md:pb-20">
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] max-w-3xl">
            Atenda no WhatsApp sem perder tempo.
          </h1>
          <p className="text-lg md:text-xl text-muted max-w-2xl mt-5 leading-relaxed">
            Envie mensagens, áudios, imagens e documentos com um clique. O contato vê “digitando…” ou “gravando áudio…” antes de cada envio, como numa conversa de verdade.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link href="/auth/login" className="h-12 px-6 rounded-[10px] bg-primary text-on-primary font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity">
              Criar conta <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link href="#como-funciona" className="h-12 px-6 rounded-[10px] border border-line font-semibold inline-flex items-center hover:bg-surface transition-colors">Como funciona</Link>
          </div>
        </section>

        <section aria-labelledby="recursos" className="bg-surface">
          <div className="max-w-6xl mx-auto px-5 py-16">
            <h2 id="recursos" className="text-3xl font-bold tracking-tight mb-10">Tudo que você usa no dia a dia</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <div key={title} className="bg-card border border-line rounded-2xl p-6 flex flex-col gap-3">
                  <span className="w-10 h-10 rounded-[10px] bg-surface grid place-items-center"><Icon className="w-5 h-5" aria-hidden="true" /></span>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" aria-labelledby="como" className="max-w-6xl mx-auto px-5 py-16">
          <h2 id="como" className="text-3xl font-bold tracking-tight mb-10">Como funciona</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="w-9 h-9 rounded-full bg-primary text-on-primary grid place-items-center text-sm font-semibold shrink-0 tabular-nums">{i + 1}</span>
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{s.title}</h3>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="max-w-6xl mx-auto px-5 pb-20">
          <div className="rounded-2xl bg-[#0b0b0d] text-[#f4f4f6] p-8 md:p-12 flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Comece agora</h2>
              <p className="text-[#a3a3ad] mt-1.5">Crie sua conta e monte sua biblioteca em poucos minutos.</p>
            </div>
            <Link href="/auth/login" className="h-12 px-6 rounded-[10px] bg-white text-[#0b0b0d] font-semibold inline-flex items-center gap-2 hover:opacity-90 transition-opacity self-start md:self-auto">
              Criar conta <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 py-6 text-sm text-muted flex flex-wrap items-center justify-between gap-2">
          <span>{brand.name} · Automação para WhatsApp Web</span>
          <span>{brand.name} não é afiliado ao WhatsApp nem à Meta.</span>
        </div>
      </footer>
    </div>
  );
}
