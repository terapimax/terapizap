// ZapFlow v3.4 — HTML da barra lateral (só estrutura; a lógica fica em content.js)

const ZF_VERSION = '3.4.0';

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
  list: _zfIcon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
};

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
    <span class="zf-mark">${S.bolt}</span>
    <h2 id="zf-auth-title">Entrar no ZapFlow</h2>
    <p>Use o mesmo e-mail e senha do painel.</p>
    <form id="zf-auth-form" novalidate>
      <label>E-mail<input type="email" id="zf-auth-email" autocomplete="email" placeholder="voce@empresa.com"></label>
      <label>Senha<input type="password" id="zf-auth-password" autocomplete="current-password" placeholder="Sua senha"></label>
      <p class="zf-auth-error" id="zf-auth-error" role="alert"></p>
      <button type="submit" class="zf-btn-primary" id="zf-auth-btn">Entrar</button>
    </form>
  </div>

  <header class="zf-head">
    <span class="zf-mark">${S.bolt}</span>
    <span class="zf-brand">ZapFlow</span>
    <span class="zf-engine" id="zf-engine" data-state="loading" title="Motor de envio"><i></i><span>Conectando…</span></span>
    <button type="button" class="zf-icon-btn" id="zf-close" aria-label="Fechar ZapFlow">${S.close}</button>
  </header>

  <nav class="zf-tabs" role="tablist" aria-label="Seções">
    <button type="button" role="tab" data-zf-tab="itens" aria-selected="true">Itens</button>
    <button type="button" role="tab" data-zf-tab="ajustes" aria-selected="false">Ajustes</button>
  </nav>

  <section class="zf-page zf-page-active" data-page="itens" aria-label="Itens">
    <div class="zf-tools">
      <label class="zf-search">${S.search}<input type="search" id="zf-search" placeholder="Buscar itens" aria-label="Buscar itens"></label>
      <div class="zf-chips" role="group" aria-label="Filtrar por tipo">
        <button type="button" data-filter="all" aria-pressed="true">Todos</button>
        <button type="button" data-filter="msg" aria-pressed="false">Mensagens</button>
        <button type="button" data-filter="audio" aria-pressed="false">Áudios</button>
        <button type="button" data-filter="media" aria-pressed="false">Mídias</button>
        <button type="button" data-filter="doc" aria-pressed="false">Docs</button>
        <button type="button" id="zf-fav-only" aria-pressed="false">${S.star} Favoritos</button>
      </div>
    </div>
    <ul class="zf-list" id="zf-items-list" aria-label="Itens da biblioteca"><li class="zf-skel"></li><li class="zf-skel"></li><li class="zf-skel"></li></ul>
    <footer class="zf-foot">
      <span id="zf-count"></span>
      <button type="button" class="zf-link-btn" id="zf-refresh-btn">Atualizar</button>
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
        <p class="zf-about">ZapFlow ${ZF_VERSION}<br><span id="zf-engine-version">Motor de envio carregando…</span><br>Crie e organize seus itens no painel do ZapFlow.</p>
      </div>
    </div>
  </section>
</div>`;
}

function zfBuildQuickBar() {
  return `<button type="button" class="zf-qb-filter-btn" id="zf-qb-toggle" aria-label="Abrir todos os itens">${window._zfSVG.list}</button><div class="zf-qb-scroll" id="zf-qb-scroll"></div>`;
}
