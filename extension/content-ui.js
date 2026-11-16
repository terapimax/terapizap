// ZapFlow v3.7 — HTML da barra lateral (só estrutura; a lógica fica em content.js)

const ZF_VERSION = '3.13.0';

const _zfIcon = (paths, size = 16, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;

// Ícones usados também pelo content.js (painel de status e barra rápida)
window._zfSVG = {
  mic: _zfIcon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 19v3"/>'),
  msg: _zfIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  img: _zfIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  doc: _zfIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
  search: _zfIcon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  close: _zfIcon('<path d="M18 6 6 18M6 6l12 12"/>', 18),
  bolt: _zfIcon('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', 15, 'stroke-width="2.4"'),
  star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  starLine: _zfIcon('<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>'),
  flame: _zfIcon('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  thermo: _zfIcon('<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>'),
  snow: _zfIcon('<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2M6 12l-2-2M6 12l-2 2M18 12l2-2M18 12l2 2"/>'),
  list: _zfIcon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  menu: _zfIcon('<path d="M4 6h16M4 12h16M4 18h16"/>', 18),
  external: _zfIcon('<path d="M7 17 17 7M8 7h9v9"/>'),
  plus: _zfIcon('<path d="M12 5v14M5 12h14"/>'),
  funnel: _zfIcon('<path d="M3 4h18l-7 8v6l-4 2v-8z"/>'),
  tasks: _zfIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>'),
  kanban: _zfIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>'),
  users: _zfIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  gear: _zfIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  logout: _zfIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  check: _zfIcon('<path d="M20 6 9 17l-5-5"/>', 16, 'stroke-width="2.6"'),
  retry: _zfIcon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  calendar: _zfIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', 16),
  clock: _zfIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  chevron: _zfIcon('<path d="m6 9 6 6 6-6"/>'),
  minus: _zfIcon('<path d="M5 12h14"/>'),
  download: _zfIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  back: _zfIcon('<path d="m15 18-6-6 6-6"/>'),
};

// Atalhos do menu ☰: caminho no painel (ou ação local da extensão)
const ZF_MENU = [
  { label: 'Abrir o painel', icon: 'external', path: '/dashboard' },
  '-',
  { label: 'Nova mensagem', icon: 'plus', path: '/dashboard/mensagens?novo=1' },
  { label: 'Novo áudio', icon: 'plus', path: '/dashboard/audios?novo=1' },
  { label: 'Nova mídia', icon: 'plus', path: '/dashboard/midias?novo=1' },
  '-',
  { label: 'Funis', icon: 'funnel', path: '/dashboard/funis' },
  { label: 'Tarefas', icon: 'tasks', path: '/dashboard/tarefas' },
  { label: 'Leads', icon: 'users', path: '/dashboard/leads' },
  { label: 'Kanban', icon: 'kanban', path: '/dashboard/kanban' },
  { label: 'Sincronizar conversas', icon: 'retry', action: 'importar' },
  '-',
  { label: 'Ajustes', icon: 'gear', action: 'ajustes' },
  { label: 'Sair', icon: 'logout', action: 'logout', id: 'zf-menu-logout' },
];

function zfBuildMenu() {
  const S = window._zfSVG;
  return ZF_MENU.map((m) => m === '-'
    ? '<hr role="separator">'
    : `<button type="button" role="menuitem" tabindex="-1" ${m.path ? `data-zf-go="${m.path}"` : `data-zf-action="${m.action}"`}>${S[m.icon]}<span>${m.label}</span>${m.id ? `<small id="${m.id}"></small>` : ''}</button>`
  ).join('');
}

function zfBuildSidebar() {
  const S = window._zfSVG;
  const toggle = (id, label, hint) => `
    <div class="zf-set">
      <span>${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <label class="zf-switch"><input type="checkbox" id="${id}" aria-label="${label}"><span></span></label>
    </div>`;

  return `
<div class="zf-panel">
  <div class="zf-auth" id="zf-auth-overlay" role="dialog" aria-labelledby="zf-auth-title">
    <span class="zf-brandbox" data-zf-brand="auth"><span class="zf-mark">${S.bolt}</span></span>
    <h2 id="zf-auth-title">Entrar no <span data-zf-brand-name>ZapFlow</span></h2>
    <p>Use o mesmo e-mail e senha do painel.</p>
    <form id="zf-auth-form" novalidate>
      <label>E-mail<input type="email" id="zf-auth-email" autocomplete="email" placeholder="voce@empresa.com"></label>
      <label>Senha<input type="password" id="zf-auth-password" autocomplete="current-password" placeholder="Sua senha"></label>
      <p class="zf-auth-error" id="zf-auth-error" role="alert"></p>
      <button type="submit" class="zf-btn-primary" id="zf-auth-btn">Entrar</button>
    </form>
  </div>

  <header class="zf-head">
    <span class="zf-brandbox" data-zf-brand="head"><span class="zf-mark">${S.bolt}</span><span class="zf-brand">ZapFlow</span></span>
    <span class="zf-engine" id="zf-engine" data-state="loading" title="Motor de envio"><i></i><span>Conectando…</span></span>
    <button type="button" class="zf-icon-btn" id="zf-menu-btn" aria-label="Menu" title="Painel e atalhos" aria-haspopup="menu" aria-expanded="false" aria-controls="zf-menu">${S.menu}</button>
    <button type="button" class="zf-icon-btn" id="zf-close" aria-label="Fechar">${S.close}</button>
  </header>
  <div class="zf-menu" id="zf-menu" role="menu" aria-label="Painel e atalhos">${zfBuildMenu()}</div>

  <nav class="zf-tabs" role="tablist" aria-label="Seções">
    <button type="button" role="tab" data-zf-tab="itens" aria-selected="true">Itens</button>
    <button type="button" role="tab" data-zf-tab="lead" aria-selected="false">Lead<span class="zf-tab-dot" id="zf-lead-dot" hidden></span></button>
    <button type="button" role="tab" data-zf-tab="funis" aria-selected="false">Funis<span class="zf-tab-badge" id="zf-funnel-badge" hidden></span></button>
    <button type="button" role="tab" data-zf-tab="ajustes" aria-selected="false">Ajustes</button>
  </nav>

  <section class="zf-page zf-page-active" data-page="itens" aria-label="Itens">
    <div class="zf-tools">
      <label class="zf-search">${S.search}<input type="search" id="zf-search" placeholder="Buscar itens" aria-label="Buscar itens"></label>
      <div class="zf-chips" role="group" aria-label="Filtrar por tipo">
        <button type="button" data-filter="all" aria-pressed="true">Todos</button>
        <button type="button" class="zf-chip-ic" data-filter="msg" aria-pressed="false" aria-label="Mensagens" data-zf-tip="Mensagens">${S.msg}</button>
        <button type="button" class="zf-chip-ic" data-filter="audio" aria-pressed="false" aria-label="Áudios" data-zf-tip="Áudios">${S.mic}</button>
        <button type="button" class="zf-chip-ic" data-filter="media" aria-pressed="false" aria-label="Fotos e vídeos" data-zf-tip="Fotos e vídeos">${S.img}</button>
        <button type="button" class="zf-chip-ic" data-filter="doc" aria-pressed="false" aria-label="Documentos" data-zf-tip="Documentos">${S.doc}</button>
        <span class="zf-chip-sep" aria-hidden="true"></span>
        <button type="button" class="zf-chip-ic zf-chip-fav" id="zf-fav-only" aria-pressed="false" aria-label="Só favoritos" data-zf-tip="Só favoritos">${S.starLine}</button>
      </div>
    </div>
    <ul class="zf-list" id="zf-items-list" aria-label="Itens da biblioteca"><li class="zf-skel"></li><li class="zf-skel"></li><li class="zf-skel"></li></ul>
    <footer class="zf-foot">
      <span id="zf-count"></span>
      <button type="button" class="zf-link-btn" id="zf-refresh-btn">Atualizar</button>
    </footer>
  </section>

  <section class="zf-page" data-page="lead" aria-label="Lead da conversa">
    <div class="zf-lead" id="zf-lead" aria-live="polite"><div class="zf-skel"></div><div class="zf-skel"></div></div>
    <footer class="zf-foot">
      <span id="zf-lead-foot"></span>
      <button type="button" class="zf-link-btn" id="zf-lead-open">Abrir no painel</button>
    </footer>
  </section>

  <section class="zf-page" data-page="importar" aria-label="Sincronizar conversas">
    <div class="zf-subhead">
      <button type="button" class="zf-icon-btn" id="zf-import-back" aria-label="Voltar">${S.back}</button>
      <h2>Sincronizar conversas</h2>
    </div>
    <div class="zf-lead" id="zf-import" aria-live="polite"></div>
  </section>

  <section class="zf-page" data-page="funis" aria-label="Funis">
    <div class="zf-tools">
      <label class="zf-search">${S.search}<input type="search" id="zf-funnel-search" placeholder="Buscar funis" aria-label="Buscar funis"></label>
    </div>
    <ul class="zf-list" id="zf-funnel-list" aria-label="Seus funis"><li class="zf-skel"></li><li class="zf-skel"></li></ul>
    <footer class="zf-foot">
      <span id="zf-funnel-count"></span>
      <button type="button" class="zf-link-btn" data-zf-go="/dashboard/funis">Editar no painel</button>
    </footer>
  </section>

  <section class="zf-page" data-page="ajustes" aria-label="Ajustes">
    <div class="zf-settings">
      <div class="zf-sec">
        <h3>Conta</h3>
        <div class="zf-account">
          <span class="zf-avatar" id="zf-account-initials">?</span>
          <span class="zf-mm" id="zf-account-email">—</span>
          <button type="button" class="zf-btn" id="zf-logout">Sair</button>
        </div>
      </div>
      <div class="zf-sec">
        <h3>Barra rápida</h3>
        ${toggle('zf-s-hide-bar', 'Ocultar a barra rápida', 'A faixa de itens que aparece embaixo da conversa.')}
        ${toggle('zf-s-bar-fav', 'Mostrar só favoritos na barra', '')}
        ${toggle('zf-s-bar-funnels', 'Mostrar funis na barra', 'Um clique dispara o funil na conversa aberta (com 3 s para cancelar).')}
      </div>
      <div class="zf-sec">
        <h3>Leads</h3>
        ${toggle('zf-s-capture', 'Capturar novos contatos', 'Quem mandar mensagem e ainda não for lead vira lead e entra no Kanban. Só conversas individuais.')}
        ${toggle('zf-s-capture-skip', 'Ignorar contatos salvos na agenda', 'Útil se você usa o mesmo WhatsApp para amigos e família.')}
        ${toggle('zf-s-history', 'Guardar histórico de conversas', 'As últimas 50 mensagens de cada lead (só o texto; mídias aparecem como “Áudio”, “Foto”…), por 90 dias, para ver na ficha do lead no painel. Contatos ignorados nunca.')}
        ${toggle('zf-s-label-sync', 'Sincronizar etiquetas do WhatsApp Business', 'Etiquetar uma conversa no WhatsApp põe a etiqueta no lead, e o contrário pela aba Lead.')}
        <p class="zf-about" id="zf-capture-where" style="margin-top:6px"></p>
        <button type="button" class="zf-btn" id="zf-open-import" style="margin-top:10px">${S.retry} Sincronizar conversas do WhatsApp</button>
      </div>
      <div class="zf-sec">
        <h3>Funis</h3>
        ${toggle('zf-s-stop-reply', 'Parar quando o contato responder', 'Vale para os próximos disparos. Dá para mudar em cada funil antes de disparar.')}
      </div>
      <div class="zf-sec">
        <h3>Gatilhos</h3>
        ${toggle('zf-s-keywords', 'Responder por palavra-chave', 'Responde sozinho quando o contato escreve uma palavra dos seus gatilhos (crie no painel, em Gatilhos). Só em conversas individuais.')}
      </div>
      <div class="zf-sec">
        <h3>Painel</h3>
        <label class="zf-search" style="margin-top:4px"><input type="url" id="zf-s-panel-url" inputmode="url" autocomplete="off" spellcheck="false" aria-label="Endereço do painel"></label>
        <p class="zf-about" style="margin-top:8px">Endereço do seu painel (ex.: https://meu-painel.vercel.app). É para onde vão o menu ☰ e os botões “Abrir no painel”. Vazio = endereço padrão.</p>
      </div>
      <div class="zf-sec">
        <h3>Tema</h3>
        <div class="zf-seg" role="group" aria-label="Tema">
          <button type="button" data-zf-theme-opt="auto" aria-pressed="true">Automático</button>
          <button type="button" data-zf-theme-opt="light" aria-pressed="false">Claro</button>
          <button type="button" data-zf-theme-opt="dark" aria-pressed="false">Escuro</button>
        </div>
        <p class="zf-about" style="margin-top:8px">No automático, segue o tema do WhatsApp Web.</p>
      </div>
      <div class="zf-sec">
        <h3>Sobre</h3>
        <p class="zf-about"><span data-zf-brand-name>ZapFlow</span> ${ZF_VERSION}<br><span id="zf-engine-version">Motor de envio carregando…</span><br>Crie e organize seus itens no painel.</p>
      </div>
    </div>
  </section>
</div>`;
}

function zfBuildQuickBar() {
  return `<button type="button" class="zf-qb-filter-btn" id="zf-qb-toggle" aria-pressed="false" aria-label="Mostrar só favoritos na barra" title="Mostrar só favoritos">${window._zfSVG.starLine}</button><div class="zf-qb-scroll" id="zf-qb-scroll"></div>`;
}
