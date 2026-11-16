"use client";

import Link from "next/link";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, AudioLines, BookOpen, CalendarDays, Check, CheckCheck, ChevronRight, Clock3, Columns3, FileText, Filter, LayoutGrid, Menu, MessageCircle, MessageSquareText, Mic, MousePointer2, Package, Plus, RotateCcw, Send, ShieldCheck, TrendingUp, Users, X, Zap } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import WhiteLabelSection from "./white-label-section";
import s from "./landing.module.css";

type Engine = { mount: (root: HTMLElement) => { destroy: () => void; layout: () => void } };
declare global { interface Window { ScrollCraft?: Engine } }
const signup = "/auth/login?mode=register";
const stages = [
  { title: "Conecte", subtitle: "O primeiro oi já encontra você pronto.", description: "Abra a conversa e tenha seus textos, áudios e materiais à mão. A resposta certa, sem procurar em pastas ou reescrever tudo.", column: "Novo contato", tag: "Primeiro contato", message: "Oi, Marina! Que bom ter você por aqui. Como posso ajudar?", task: "Conhecer a necessidade", icon: MessageCircle },
  { title: "Conduza", subtitle: "Cada conversa tem um próximo passo.", description: "Organize o lead no Kanban e use sequências de mensagens, áudios e documentos. Defina os intervalos e mantenha o contexto do atendimento.", column: "Em negociação", tag: "Proposta enviada", message: "Separei a proposta com as opções que conversamos. Posso te explicar?", task: "Retornar sobre a proposta", icon: Filter },
  { title: "Acompanhe", subtitle: "Uma visão clara até o fechamento.", description: "Atualize a etapa, registre tarefas e acompanhe os resultados. Você sabe onde cada oportunidade está e o que precisa de atenção.", column: "Fechado", tag: "Etapa atualizada", message: "Tudo certo, Marina! Vamos organizar os próximos passos por aqui.", task: "Agendar o próximo atendimento", icon: CheckCheck },
];
const toolkit = [
  { title: "Biblioteca", icon: BookOpen, heading: "Sua melhor resposta. Sempre à mão.", text: "Organize os textos, áudios, imagens e documentos que fazem parte do seu atendimento. Encontre e envie direto na conversa aberta.", points: ["Mensagens prontas para reutilizar", "Áudios no formato de mensagem de voz", "Mídias, PDFs e documentos organizados"], items: [{ icon: MessageSquareText, title: "Boas-vindas", detail: "Mensagem · Atendimento" }, { icon: Mic, title: "Apresentação do serviço", detail: "Áudio · Apresentação" }, { icon: FileText, title: "Proposta comercial.pdf", detail: "Documento · Vendas" }] },
  { title: "Funis e gatilhos", icon: Zap, heading: "Uma sequência pensada. Menos repetição.", text: "Combine mensagens, áudios e arquivos em uma sequência. Configure os intervalos entre os passos e os gatilhos da sua operação.", points: ["Sequências com diferentes tipos de conteúdo", "Tempo de espera entre cada passo", "Indicadores de digitando e gravando áudio"], items: [{ icon: MessageSquareText, title: "Mensagem de apresentação", detail: "Primeiro passo" }, { icon: Clock3, title: "Intervalo configurado", detail: "O ritmo que você define" }, { icon: FileText, title: "Envio da apresentação", detail: "Próximo passo do funil" }] },
  { title: "CRM e catálogo", icon: Columns3, heading: "Contatos com contexto. Vendas com direção.", text: "Veja suas oportunidades por etapa, organize informações do lead e associe os produtos ou serviços da sua oferta.", points: ["Kanban para acompanhar cada oportunidade", "Etiquetas, valor e temperatura do lead", "Catálogo de produtos, serviços e campanhas"], items: [{ icon: Users, title: "Marina Costa", detail: "Lead de exemplo · Em negociação" }, { icon: Package, title: "Consultoria inicial", detail: "Serviço associado ao lead" }, { icon: Columns3, title: "Próximo passo definido", detail: "Tudo no contexto do contato" }] },
  { title: "Agenda e relatórios", icon: CalendarDays, heading: "Seu dia organizado. Sua operação visível.", text: "Centralize os retornos e acompanhe o caminho dos seus leads. Use a visão da operação para decidir onde colocar sua atenção.", points: ["Tarefas em lista ou calendário", "Retornos vinculados aos contatos", "Conversão, origem e tempo por etapa"], items: [{ icon: CalendarDays, title: "Retorno da proposta", detail: "Tarefa de exemplo · Hoje" }, { icon: TrendingUp, title: "Conversão por etapa", detail: "Visão do funil comercial" }, { icon: Users, title: "Origem dos leads", detail: "Entenda de onde vêm as oportunidades" }] },
];
const faqs = [
  ["O que é o ZapFlow?", "É uma plataforma para organizar e agilizar sua operação no WhatsApp Web. Você prepara mensagens, áudios e arquivos no painel, usa sequências de atendimento e acompanha leads, tarefas e resultados no mesmo ambiente."],
  ["Posso usar a identidade visual da minha marca?", "Sim. Com o white label, você personaliza nome, logotipo, ícone e cores para deixar a operação com a identidade da sua empresa ou do seu cliente. A marca acompanha o painel e a extensão. Você também pode conectar um domínio próprio, mediante configuração do domínio e do DNS."],
  ["Preciso trocar meu número de WhatsApp?", "Não. A extensão funciona junto ao WhatsApp Web no navegador, usando a conta que você já conectou. Seu atendimento continua nas suas conversas."],
  ["Preciso saber programar?", "Não. Você cadastra seus conteúdos no painel, monta os passos dos funis e organiza os contatos por etapas. A extensão leva essa biblioteca para o lado da conversa."],
  ["Funciona no celular?", "O painel pode ser acessado pelo navegador e se adapta a telas menores. O envio pela extensão acontece no computador, em um navegador compatível com a extensão e com o WhatsApp Web aberto."],
  ["Os envios funcionam com o computador desligado?", "Os envios da extensão dependem do navegador em funcionamento, da extensão ativa e do WhatsApp Web conectado. Mantenha esse ambiente disponível durante a execução das sequências e dos envios agendados."],
  ["Por onde eu começo?", "Crie sua conta, organize os primeiros conteúdos na biblioteca e configure a extensão no computador. Depois, abra o WhatsApp Web para usar seus materiais em uma conversa."],
];
function SignupButton({ light = false }: { light?: boolean }) {
  return <Link href={signup} className={`${s.button} ${light ? s.buttonLight : s.buttonPink}`}>Criar minha conta <ArrowUpRight size={18} aria-hidden="true" /></Link>;
}
function Waveform() {
  return <span className={s.waveform} aria-hidden="true">{[12, 22, 16, 30, 20, 34, 14, 24, 32, 18, 26, 36, 22, 14, 28, 20, 34, 16, 24, 12, 28, 18, 32, 14].map((h, i) => <i key={i} style={{ height: h }} />)}</span>;
}
function ChatDemo({ brandName }: { brandName: string }) {
  const [tab, setTab] = useState(0);
  const [sent, setSent] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const templates = ["Oi, Marina! Tudo bem? Vou te ajudar a encontrar a melhor opção.", "Claro! Vou separar uma proposta com o que você precisa."];
  const send = () => setSent((items) => [...items.slice(-3), tab === 0 ? selected : tab + 1]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [sent]);
  return <div className={s.demoScene}>
    <div className={s.sceneGrid} data-sc-parallax="-0.35" aria-hidden="true" />
    <div className={s.demoFrame}>
      <div className={s.windowBar}><span className={s.windowDots} aria-hidden="true"><i /><i /><i /></span><span><ShieldCheck size={12} /> Seu espaço de atendimento</span><span className={s.sampleLabel}>DEMO</span></div>
      <div className={s.demoBody}>
        <div className={s.chat}>
          <div className={s.contactHeader}><span className={s.avatar}>MC</span><span><strong>Marina Costa</strong><small>Conversa de exemplo</small></span><MessageCircle size={18} /></div>
          <div className={s.chatMessages} ref={scrollRef} role="log" aria-label="Conversa de demonstração" aria-live="polite">
            <span className={s.today}>Hoje</span>
            <div className={s.incoming}>Olá! Gostaria de saber mais sobre os serviços.<small>10:42</small></div>
            <div className={s.outgoing}>Oi, Marina! Claro, vamos conversar.<small>10:42 <CheckCheck size={13} /></small></div>
            <div className={s.incoming}>Pode me enviar uma apresentação?<small>10:43</small></div>
            {sent.map((kind, i) => <div key={`${i}-${kind}`} className={s.outgoing}>{kind < 2 ? templates[kind] : kind === 2 ? <span className={s.audioMessage}><Mic size={17} /><Waveform /><span>Áudio de apresentação</span></span> : "Apresentação + proposta: sequência adicionada à demonstração."}<small>Agora <CheckCheck size={13} /></small></div>)}
          </div>
          <div className={s.chatComposer}><MessageSquareText size={16} /><span>Use a biblioteca ao lado</span><ArrowRight size={16} /></div>
        </div>
        <div className={s.library}>
          <div className={s.libraryBrand}><Zap size={17} fill="currentColor" />{brandName}<span>Extensão</span></div>
          <h3>Uma resposta.<br />Um clique.</h3>
          <div className={s.demoTabs} role="group" aria-label="Tipo de conteúdo da demonstração">{["Textos", "Áudios", "Funis"].map((t, i) => <button key={t} onClick={() => setTab(i)} aria-pressed={tab === i}>{t}</button>)}</div>
          <div className={s.libraryContent}>
            {tab === 0 ? <>{["Boas-vindas", "Enviar proposta"].map((t, i) => <button className={s.template} key={t} onClick={() => setSelected(i)} aria-pressed={selected === i}><MessageSquareText size={15} /><span>{t}<small>{i === 0 ? "Atendimento" : "Comercial"}</small></span>{selected === i && <Check size={14} />}</button>)}<p className={s.templatePreview}>{templates[selected]}</p></> : tab === 1 ? <div className={s.audioTemplate}><span className={s.audioIcon}><Mic size={24} /></span><strong>Apresentação</strong><Waveform /><small>Exemplo de mensagem de voz</small></div> : <ol className={s.funnelTemplate}><li><MessageCircle size={14} /> Boas-vindas</li><li><Clock3 size={14} /> Intervalo definido</li><li><FileText size={14} /> Apresentação</li></ol>}
          </div>
          <button className={s.sendButton} onClick={send}>Experimentar envio <Send size={14} /></button>
          <button className={s.resetDemo} disabled={!sent.length} onClick={() => setSent([])}><RotateCcw size={11} /> Reiniciar exemplo</button>
        </div>
      </div>
    </div>
    <div className={s.floatingAudio} data-sc-parallax="0.5"><span className={s.audioIcon}><AudioLines size={23} /></span><span><strong>Sua voz. Seu jeito.</strong><small>Áudios prontos para a conversa</small></span><CheckCheck size={19} /></div>
    <div className={s.floatingTag} data-sc-parallax="-0.55"><span><Check size={13} /></span>Menos copiar e colar.</div>
    <p className={s.demoCaption}><MousePointer2 size={13} /> Experimente acima. Dados fictícios, nenhum envio real.</p>
  </div>;
}
function LeadJourney() {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const [canPin, setCanPin] = useState(false);
  useEffect(() => {
    const media = matchMedia("(min-width: 900px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)");
    const sync = () => setCanPin(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!canPin) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const section = ref.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (84 - rect.top) / (section.offsetHeight - innerHeight)));
      section.style.setProperty("--journey-progress", String(p));
      const next = Math.min(2, Math.floor(p * 3));
      if (activeRef.current !== next) { activeRef.current = next; setActive(next); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update(); addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); };
  }, [canPin]);
  function select(i: number) {
    setActive(i); activeRef.current = i;
    if (canPin && ref.current) {
      const el = ref.current;
      window.scrollTo({ top: scrollY + el.getBoundingClientRect().top - 84 + (el.offsetHeight - innerHeight) * ((i + 0.35) / 3), behavior: "instant" });
    }
  }
  const stage = stages[active];
  return <section id="como-funciona" ref={ref} className={`${s.journey} ${canPin ? s.journeyPinned : ""}`} aria-labelledby="journey-title" data-sc-act="flow">
    <div className={s.journeyInner}>
      <div className={s.journeyHeading}><div><span className={s.eyebrow}>DO PRIMEIRO OI AO PRÓXIMO PASSO</span><h2 id="journey-title">Uma conversa puxa outra.<br /><span>O resto, você organiza aqui.</span></h2></div><p>Conteúdo, relacionamento e rotina.<br />Finalmente na mesma direção.</p></div>
      <div className={s.journeyLayout}>
        <div className={s.journeyNav} role="group" aria-label="Etapas do atendimento">{stages.map((item, i) => <button key={item.title} aria-pressed={active === i} onClick={() => select(i)} className={active === i ? s.stageActive : ""}><span className={s.stageNumber}>0{i + 1}</span><span><strong>{item.title}</strong><span>{item.subtitle}</span></span><ChevronRight size={18} /></button>)}<p className={s.journeyDescription}>{stage.description}</p></div>
        <div className={s.board} data-sc-verify-state={`stage-${active}`}>
          <div className={s.boardHeader}><span><Columns3 size={16} /> Seu funil de vendas</span><span className={s.sampleLabel}>EXEMPLO INTERATIVO</span></div>
          <div className={s.boardColumns}>{stages.map((item, i) => <div key={item.column} className={active === i ? s.columnActive : ""}><span className={s.columnTitle}><i />{item.column}<small>{active === i ? 1 : 0}</small></span><div className={s.columnPlaceholder} aria-hidden="true" /></div>)}</div>
          <div className={s.movingLead} style={{ "--lead-column": active } as CSSProperties}><div><span className={s.avatar}>MC</span><span><strong>Marina Costa</strong><small>Consultoria inicial</small></span></div><span className={s.leadTag}>{stage.tag}</span><span className={s.leadFooter}><MessageCircle size={12} /> WhatsApp <span>Exemplo</span></span></div>
          <div className={s.boardContext}><span className={s.contextIcon}><stage.icon size={20} /></span><div><small>NA CONVERSA</small><p>{stage.message}</p></div><CheckCheck size={18} /></div>
          <div className={s.boardTask}><CalendarDays size={15} /><span>{stage.task}</span><span>Próxima tarefa</span></div>
          <div className={s.boardProgress} aria-hidden="true"><i /></div>
        </div>
      </div>
      <p className={s.journeyNote}><ShieldCheck size={14} /> Você define os conteúdos, os intervalos e as etapas. O controle continua com você.</p>
    </div>
  </section>;
}
function Toolkit() {
  const [active, setActive] = useState(0);
  const tool = toolkit[active];
  return <section id="recursos" className={`${s.section} ${s.tools}`} data-sc-act="flow" aria-labelledby="tools-title">
    <div className={s.container}>
      <div className={s.sectionHeading}><h2 id="tools-title">Menos abas abertas.<br />Mais operação fluindo.</h2><p>As ferramentas que você usa todos os dias,<br className={s.desktopBreak} /> trabalhando juntas.</p></div>
      <div className={s.toolTabs} role="group" aria-label="Explorar recursos">{toolkit.map((t, i) => <button key={t.title} aria-pressed={active === i} onClick={() => setActive(i)}><t.icon size={18} />{t.title}</button>)}</div>
      <div className={s.toolPanel}>
        <div className={s.toolCopy} key={tool.title}><span className={s.toolIcon}><tool.icon size={25} /></span><h3>{tool.heading}</h3><p>{tool.text}</p><ul>{tool.points.map(p => <li key={p}><Check size={16} />{p}</li>)}</ul><Link href={signup} className={s.textLink}>Criar minha conta <ArrowRight size={17} /></Link></div>
        <div className={s.toolVisual} data-sc-reveal="up" data-sc-reveal-at="0.05 0.32"><div className={s.resourceWindow}><div className={s.resourceHeading}><span><tool.icon size={18} />{tool.title}</span><span className={s.sampleLabel}>EXEMPLO</span></div>{tool.items.map((item, i) => <div className={s.resourceRow} key={item.title}><span><item.icon size={20} /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div>{active === 1 ? <span className={s.resourceIndex}>{i + 1}</span> : <Check size={15} />}</div>)}<div className={s.resourceFooter}><CheckCheck size={14} /> Tudo no contexto do seu atendimento.</div></div><span className={s.visualStamp}><Zap size={15} fill="currentColor" /> Menos atrito. Mais fluxo.</span></div>
      </div>
    </div>
  </section>;
}
export default function LandingExperience({ brandName }: { brandName: string }) {
  const root = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<Engine["mount"]> | null>(null);
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mount = useCallback(() => {
    if (root.current && window.ScrollCraft && !engine.current) engine.current = window.ScrollCraft.mount(root.current);
  }, []);
  useEffect(() => { mount(); return () => { engine.current?.destroy(); engine.current = null; }; }, [mount]);
  useEffect(() => {
    if (!menu) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenu(false); menuButton.current?.focus(); } };
    addEventListener("keydown", escape); return () => removeEventListener("keydown", escape);
  }, [menu]);
  return <div ref={root} className={`zapflow-landing ${s.root}`}>
    <Script src="/landing/scrollcraft.js" strategy="afterInteractive" onReady={mount} />
    <a className={s.skipLink} href="#conteudo">Pular para o conteúdo</a>
    <header className={s.header}><div className={`${s.container} ${s.navbar}`}>
      <Link href="/" className={s.brand} aria-label={`${brandName}, início`}><BrandLogo size={31} textClassName="text-xl" /></Link>
      <nav className={s.desktopNav} aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#recursos">Recursos</a><a href="#white-label">White label</a><a href="#duvidas">Dúvidas</a></nav>
      <div className={s.navActions}><Link href="/auth/login" className={s.login}>Entrar <ArrowUpRight size={14} /></Link><Link href={signup} className={s.navCta}>Criar minha conta <ArrowUpRight size={15} /></Link><button ref={menuButton} className={s.menuToggle} aria-label={menu ? "Fechar menu" : "Abrir menu"} aria-expanded={menu} aria-controls="mobile-navigation" onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button></div>
    </div>{menu && <nav id="mobile-navigation" className={s.mobileNav} aria-label="Navegação móvel">{[["Como funciona", "#como-funciona"], ["Recursos", "#recursos"], ["White label", "#white-label"], ["Comece por aqui", "#primeiros-passos"], ["Dúvidas", "#duvidas"]].map(([label, href]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}<ArrowUpRight size={17} /></a>)}<Link href="/auth/login">Entrar na plataforma <ArrowRight size={17} /></Link><SignupButton /></nav>}</header>
    <main id="conteudo">
      <section className={s.hero} data-sc-act="flow" aria-labelledby="hero-title"><div className={`${s.container} ${s.heroGrid}`}>
        <div className={s.heroCopy}><span className={s.heroEyebrow}><span /> SUA OPERAÇÃO COM MAIS FLUIDEZ</span><h1 id="hero-title">Seu WhatsApp.<br /><span>Em outro ritmo.</span></h1><p>Mensagens, áudios, funis e CRM conectados ao seu WhatsApp. Menos tarefas repetidas, mais espaço para vender.</p><div className={s.heroActions}><SignupButton /><a href="#demonstracao" className={s.demoLink}>Explorar a demonstração <ArrowDownLeft size={17} /></a></div><div className={s.heroFootnote}><Check size={14} /><a href="#white-label">Sua operação. Sua identidade. Conheça o white label.</a></div></div>
        <div id="demonstracao" className={s.heroDemo}><ChatDemo brandName={brandName} /></div>
      </div><div className={`${s.container} ${s.heroBottom}`}><span>DO CONTEÚDO À CONVERSÃO</span><div><MessageSquareText size={16} /> Mensagens</div><div><AudioLines size={17} /> Áudios</div><div><Filter size={16} /> Funis</div><div><Columns3 size={16} /> CRM</div><div><CalendarDays size={16} /> Agenda</div><div><TrendingUp size={16} /> Relatórios</div></div></section>
      <section className={`${s.recognition} ${s.container}`} data-sc-act="flow"><div data-sc-in><p>Seu tempo vale mais do que<br /><span>copiar, colar e procurar.</span></p><span>O trabalho se repete. A sua atenção não precisa se dividir.<br className={s.desktopBreak} /> Dê espaço para o que faz a diferença: a conversa.</span></div><span className={s.recognitionMark} aria-hidden="true"><Zap /></span></section>
      <LeadJourney /><Toolkit /><WhiteLabelSection brandName={brandName} />
      <section id="primeiros-passos" className={s.setup} data-sc-act="flow" aria-labelledby="setup-title"><div className={s.container}><div className={s.setupIntro}><span className={s.eyebrow}>SIMPLES DESDE O COMEÇO</span><h2 id="setup-title">Seu novo jeito de atender<br />começa em três passos.</h2><p>Você conhece seu negócio.<br />O ZapFlow ajuda a colocar o atendimento em ordem.</p><SignupButton /></div><ol className={s.setupSteps} data-sc-in data-sc-stagger="60">{[{ icon: BookOpen, title: "Prepare seu conteúdo", text: "Crie sua conta e organize mensagens, áudios e materiais na biblioteca." }, { icon: LayoutGrid, title: "Conecte à sua rotina", text: "Configure a extensão no computador e abra seu WhatsApp Web." }, { icon: MessageCircle, title: "Deixe a conversa fluir", text: "Use seus conteúdos, acompanhe os leads e organize os próximos passos." }].map((step, i) => <li key={step.title}><span className={s.setupNumber}>{i + 1}</span><div><step.icon size={22} /><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol></div></section>
      <section id="duvidas" className={`${s.faq} ${s.container}`} data-sc-act="flow" aria-labelledby="faq-title"><div><h2 id="faq-title">Bom atendimento<br />começa com clareza.</h2><p>Algumas respostas antes<br />da sua próxima conversa.</p><span className={s.faqGraphic} aria-hidden="true"><MessageCircle /><span>?</span></span></div><div className={s.faqList}>{faqs.map(([q, a]) => <details key={q}><summary>{q}<Plus size={18} /></summary><p>{a}</p></details>)}</div></section>
      <section className={s.close} data-sc-act="flow" aria-labelledby="close-title"><div className={`${s.container} ${s.closeInner}`}><div className={s.closeMark} data-sc-tilt="4" aria-hidden="true"><Zap fill="currentColor" /></div><h2 id="close-title">Menos no automático.<br /><span>Mais no que importa.</span></h2><p>Organize a operação. Abra espaço para boas conversas.<br className={s.desktopBreak} /> E transforme seu jeito de vender no WhatsApp.</p><SignupButton light /><span className={s.closeNote}>O próximo passo começa com uma conta.</span></div></section>
    </main>
    <footer className={s.footer}><div className={s.container}><Link href="/" className={s.brand}><BrandLogo size={26} /></Link><p>Mais fluidez para sua operação.</p><a href="#conteudo">Voltar ao início <ArrowUpRight size={14} /></a></div><div className={`${s.container} ${s.footerBottom}`}><span>© {new Date().getFullYear()} {brandName}.</span><span>{brandName} não é afiliado ao WhatsApp nem à Meta.</span></div></footer>
  </div>;
}
