"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Globe, LayoutGrid, Palette, PanelsTopLeft, Sparkles } from "lucide-react";
import s from "./landing.module.css";

const colors = [
  { name: "Rosa", value: "#bd2164" },
  { name: "Azul", value: "#2457c6" },
  { name: "Verde", value: "#116e63" },
];

export default function WhiteLabelSection({ brandName }: { brandName: string }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0].value);
  const previewName = name.trim() || "Sua marca";
  const initial = Array.from(previewName)[0].toLocaleUpperCase("pt-BR");

  return (
    <section id="white-label" className={s.whiteLabel} data-sc-act="flow" aria-labelledby="white-label-title">
      <div className={`${s.container} ${s.whiteLabelLayout}`}>
        <div className={s.whiteLabelCopy}>
          <span className={s.eyebrow}>WHITE LABEL · DO SEU JEITO</span>
          <h2 id="white-label-title">A eficiência do {brandName}.<br /><span>A identidade da sua marca.</span></h2>
          <p>O atendimento tem a sua voz. A plataforma também pode ter a sua identidade. Personalize a operação com a marca da sua empresa ou do seu cliente.</p>
          <ul className={s.brandBenefits}>
            <li><Sparkles size={20} aria-hidden="true" /><div><strong>Seu nome, seu logotipo, sua presença.</strong><span>Nome, logo e ícone próprios nos espaços da sua operação.</span></div></li>
            <li><Palette size={20} aria-hidden="true" /><div><strong>A mesma identidade, do painel à extensão.</strong><span>As cores da marca acompanham o trabalho dentro e ao lado do WhatsApp Web.</span></div></li>
            <li><Globe size={20} aria-hidden="true" /><div><strong>Um endereço que também é seu.</strong><span>Conecte um domínio próprio após configurar o domínio e o DNS.</span></div></li>
          </ul>
          <Link href="/auth/login?mode=register" className={s.textLink}>Criar minha conta <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>

        <div className={s.brandStudio} style={{ "--preview-accent": color } as CSSProperties}>
          <div className={s.brandPreview} role="region" aria-label="Prévia da identidade visual">
            <div className={s.brandAddress}><Globe size={13} aria-hidden="true" /><span>painel.suamarca.com.br</span><span>EXEMPLO</span></div>
            <div className={s.brandPreviewHeading}>
              <span className={s.previewMark} aria-hidden="true">{initial}</span>
              <div><strong title={previewName}>{previewName}</strong><small>PAINEL DA SUA OPERAÇÃO</small></div>
              <PanelsTopLeft size={19} aria-hidden="true" />
            </div>
            <div className={s.brandWelcome}><span>SEU ESPAÇO DE TRABALHO</span><p>Uma experiência<br /><strong>com a sua assinatura.</strong></p><span className={s.brandAccentSample}><Check size={14} aria-hidden="true" /> Sua identidade em cada detalhe</span></div>
            <div className={s.brandSurfaces}>
              <div><small>NA EXTENSÃO</small><span><span className={s.previewMark} aria-hidden="true">{initial}</span><strong title={previewName}>{previewName}</strong></span></div>
              <div><small>NA TELA DE ACESSO</small><span><span className={s.previewMark} aria-hidden="true">{initial}</span><strong title={previewName}>{previewName}</strong></span></div>
            </div>
          </div>

          <div className={s.brandControls}>
            <span className={s.brandTry}><LayoutGrid size={16} aria-hidden="true" /> Experimente a sua identidade</span>
            <div className={s.brandControlFields}>
              <div className={s.brandNameField}><label htmlFor="preview-brand-name">Nome da sua marca</label><input id="preview-brand-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="Sua marca" autoComplete="off" /></div>
              <fieldset className={s.brandColorField}><legend>Cor da marca</legend><div role="group" aria-label="Escolher cor da prévia">{colors.map((option) => <button key={option.value} type="button" onClick={() => setColor(option.value)} aria-label={option.name} aria-pressed={color === option.value} style={{ backgroundColor: option.value }}>{color === option.value && <Check size={17} aria-hidden="true" />}</button>)}</div></fieldset>
            </div>
            <p>Demonstração visual. Nome e cores mudam só nesta prévia.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
