// ZapFlow v3.9 — Content Script (interface + envio via motor WA-JS em wa_engine.js)
(function () {
  'use strict';
  const SUPABASE_URL = window.SUPABASE_URL || '';
  const SUPABASE_KEY = window.SUPABASE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('⚠️ ZapFlow: configuração do Supabase ausente (config.js)');
  // Endereço do painel (config.js). Troque quando o painel estiver publicado.
  // Endereço do painel: o que estiver nos Ajustes da extensão; sem nada lá, o do config.js
  const DEFAULT_PANEL_URL = String(window.ZAPFLOW_PANEL_URL || 'http://localhost:3002').replace(/\/+$/, '');
  const cleanPanelUrl = (v) => {
    let u = String(v || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = (/^(localhost|127\.)/i.test(u) ? 'http://' : 'https://') + u;
    try { const p = new URL(u); if (!/^[a-z0-9.-]+$/i.test(p.hostname) || !(p.hostname.includes('.') || p.hostname === 'localhost')) return ''; return p.origin + p.pathname.replace(/\/(dashboard.*|auth.*)?$/, '').replace(/\/+$/, ''); } catch (e) { return ''; }
  };
  // ordem: o que foi digitado nos Ajustes > o domínio próprio da conta (marca) > o do config.js
  const panelUrl = () => cleanPanelUrl(settings.panelUrl) || (brand.custom_domain ? 'https://' + brand.custom_domain : '') || DEFAULT_PANEL_URL;

  let sb = null;
  let currentFilter = 'all', showFavOnly = false, searchQuery = '';
  let messagesData = [], mediaData = [], funnelsData = [], triggersData = [], funnelsError = false, loaded = false;
  const settings = { panelUrl: '', hideBar: false, barFav: false, barFunnels: true, stopOnReply: true, keywords: true, capture: true, captureSkip: false, labelSync: true, history: false, avatars: true, theme: 'auto' };
  const $ = (id) => document.getElementById(id);
  // Marca da conta (white label): a mesma escolhida no painel, em Configurações > Marca
  let brand = { name: '', logo_url: '', icon_url: '', mark: '', accent: '', custom_domain: '' };
  const brandName = () => brand.name || 'ZapFlow';

  // ===== INÍCIO =====
  function init() {
    if ($('zf-sidebar-root')) return;
    const check = setInterval(() => {
      if (document.querySelector('#app') || document.querySelector('#main')) {
        clearInterval(check);
        createSidebar();
        createQuickBar();
        loadBrandCache();
        loadSettings();
        watchWhatsAppTheme();
        pollEngine();
        initAuth();
        watchReturnToTab();
        watchUnload();
      }
    }, 1000);
  }

  // ===== AJUSTES (guardados no navegador) =====
  async function loadSettings() {
    try {
      const r = await chrome.storage.local.get('zf_settings');
      Object.assign(settings, r.zf_settings || {});
    } catch (e) { /* sem storage: usa padrões */ }
    if ($('zf-s-hide-bar')) $('zf-s-hide-bar').checked = !!settings.hideBar;
    if ($('zf-s-bar-fav')) $('zf-s-bar-fav').checked = !!settings.barFav;
    syncBarFav();
    if ($('zf-s-bar-funnels')) $('zf-s-bar-funnels').checked = !!settings.barFunnels;
    if ($('zf-s-stop-reply')) $('zf-s-stop-reply').checked = !!settings.stopOnReply;
    if ($('zf-s-keywords')) $('zf-s-keywords').checked = settings.keywords !== false;
    if ($('zf-s-capture')) $('zf-s-capture').checked = settings.capture !== false;
    if ($('zf-s-capture-skip')) $('zf-s-capture-skip').checked = !!settings.captureSkip;
    if ($('zf-s-label-sync')) $('zf-s-label-sync').checked = settings.labelSync !== false;
    if ($('zf-s-history')) $('zf-s-history').checked = settings.history === true;
    if ($('zf-s-avatars')) $('zf-s-avatars').checked = settings.avatars !== false;
    if ($('zf-s-panel-url')) { $('zf-s-panel-url').value = settings.panelUrl || ''; $('zf-s-panel-url').placeholder = DEFAULT_PANEL_URL; }
    applyTheme();
    renderQuickBar();
  }
  function saveSettings() {
    try { chrome.storage.local.set({ zf_settings: settings }); } catch (e) {}
  }

  // ===== TEMA (automático = segue o WhatsApp Web) =====
  function whatsappIsDark() {
    if (document.body.classList.contains('dark')) return true;
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
  }
  function applyTheme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && whatsappIsDark());
    document.documentElement.dataset.zfTheme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-zf-theme-opt]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zfThemeOpt === settings.theme)));
  }
  function watchWhatsAppTheme() {
    new MutationObserver(() => settings.theme === 'auto' && applyTheme()).observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    setInterval(() => settings.theme === 'auto' && applyTheme(), 5000);
  }

  // ===== STATUS DO MOTOR =====
  let engineReady = false;
  async function pollEngine() {
    const pill = $('zf-engine');
    const set = (state, text) => { if (pill) { pill.dataset.state = state; pill.lastElementChild.textContent = text; } };
    for (let i = 0; i < 90; i++) {
      try {
        const r = await engineRequest('ZF_ENGINE_STATUS', {}, 3000);
        if (r.ready) {
          engineReady = true;
          set('ready', 'Pronto');
          updateFiringIndicators();
          if ($('zf-engine-version')) $('zf-engine-version').textContent = `Motor de envio WA-JS ${r.version || ''}`.trim();
          return;
        }
      } catch (e) { /* motor ainda não respondeu */ }
      set('loading', 'Conectando…');
      await new Promise((r) => setTimeout(r, 2000));
    }
    set('error', 'Indisponível');
    if ($('zf-engine-version')) $('zf-engine-version').textContent = 'Motor de envio indisponível: recarregue o WhatsApp Web (F5).';
  }

  // ===== LOGIN (Supabase) =====
  async function supabaseReachable() {
    if (!SUPABASE_URL) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(SUPABASE_URL + '/auth/v1/health', { headers: { apikey: SUPABASE_KEY }, signal: ctrl.signal });
      clearTimeout(t);
      return r.status < 500;
    } catch (e) { return false; }
  }

  function showAuth(message) {
    $('zf-auth-overlay').style.display = 'flex';
    const er = $('zf-auth-error');
    er.textContent = message || '';
    er.style.display = message ? 'block' : 'none';
  }
  function hideAuth() { $('zf-auth-overlay').style.display = 'none'; }

  function setAccount(email) {
    if ($('zf-account-email')) $('zf-account-email').textContent = email || '—';
    if ($('zf-menu-logout')) $('zf-menu-logout').textContent = email || '';
    if ($('zf-account-initials')) $('zf-account-initials').textContent = (email || '?').slice(0, 2).toUpperCase();
  }

  async function initAuth() {
    const form = $('zf-auth-form');
    const btn = $('zf-auth-btn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!sb) return showAuth('Sem conexão com o banco. Verifique a internet e recarregue a página.');
      const email = $('zf-auth-email').value.trim();
      const password = $('zf-auth-password').value;
      if (!email || !password) return showAuth('Informe e-mail e senha.');
      btn.disabled = true; btn.textContent = 'Entrando…';
      const { error } = await sb.auth.signInWithPassword({ email, password });
      btn.disabled = false; btn.textContent = 'Entrar';
      if (error) {
        const map = { 'Invalid login credentials': 'E-mail ou senha incorretos.', 'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos.' };
        return showAuth(map[error.message] || (/fetch/i.test(error.message) ? 'Sem conexão com o banco. Tente de novo.' : error.message));
      }
      hideAuth();
      loadAllData();
    });

    if (typeof supabase === 'undefined' || !supabase.createClient) return showAuth('Não foi possível carregar. Recarregue a página.');
    if (!(await supabaseReachable())) return showAuth('Sem conexão com o banco. Verifique a internet e recarregue a página.');

    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { session } } = await sb.auth.getSession();
    if (session) { hideAuth(); loadAllData(); } else showAuth();
    sb.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        stopAllRuns();
        messagesData = []; mediaData = []; funnelsData = []; triggersData = []; loaded = false; setAccount(''); clearBlobCache(); applyBrand();
        if (taskChannel) { try { sb.removeChannel(taskChannel); } catch (e) { /* já fechado */ } taskChannel = null; }
        crm = { boards: [], columns: [], tags: [], error: false }; leadState = { status: 'idle' }; renderLead();
        renderItems(); renderFunnels(); renderQuickBar(); showAuth();
      }
    });
  }

  // silent: atualização automática (ao voltar para o WhatsApp). Só redesenha se algo mudou
  // e, se falhar, mantém a lista que já está na tela.
  let lastLoadAt = 0, dataSignature = '', loading = false;
  // O Chrome mostra objetos de erro como "[object Object]" na página de erros da extensão.
  // Transforma o erro do Supabase em texto legível (mensagem, código e detalhes).
  const errText = (e) => {
    if (!e) return '';
    if (typeof e === 'string') return e;
    const parts = [e.message, e.code && `(código ${e.code})`, e.details, e.hint].filter(Boolean);
    return parts.length ? parts.join(' ') : JSON.stringify(e);
  };
  async function loadAllData({ silent = false } = {}) {
    if (loading) return;
    loading = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      setAccount(session.user?.email);
      const [msgs, media, funnels, trig] = await Promise.all([
        sb.from('messages').select('*').order('created_at', { ascending: false }),
        sb.from('media_library').select('*').order('created_at', { ascending: false }),
        sb.from('funnels').select('*, funnel_items(*)').order('created_at', { ascending: false }),
        sb.from('triggers').select('*').eq('event', 'keyword').eq('is_active', true).order('created_at'),
      ]);
      // gatilhos com problema também não derrubam nada
      if (trig.error) console.warn('ZapFlow: falha ao carregar gatilhos: ' + errText(trig.error));
      else triggersData = trig.data || [];
      if (msgs.error || media.error) throw msgs.error || media.error;
      // funis com problema não derrubam a lista de itens
      if (funnels.error) console.warn('ZapFlow: falha ao carregar funis: ' + errText(funnels.error));
      lastLoadAt = Date.now();
      fetchBrand();
      watchNewTasks();
      loadCrm().then(() => (leadChat ? loadLead({ quiet: true }) : syncLeadChat())).catch((e) => console.warn('ZapFlow: Kanban', e));
      const sig = JSON.stringify([msgs.data, media.data, funnels.data, !!funnels.error]);
      if (silent && loaded && sig === dataSignature) return;
      dataSignature = sig;
      messagesData = msgs.data || [];
      mediaData = media.data || [];
      funnelsError = !!funnels.error;
      if (!funnels.error) funnelsData = funnels.data || [];
      loaded = true;
      const list = $('zf-items-list');
      const scroll = list ? list.scrollTop : 0;
      renderItems();
      if (list) list.scrollTop = scroll;
      const flist = $('zf-funnel-list');
      const fscroll = flist ? flist.scrollTop : 0;
      renderFunnels();
      if (flist) flist.scrollTop = fscroll;
      renderQuickBar();
    } catch (e) {
      console.error('❌ ZapFlow: falha ao carregar itens: ' + errText(e));
      if (silent && loaded) return;
      loaded = true;
      const list = $('zf-items-list');
      if (list) list.innerHTML = '<li class="zf-empty"><b>Não foi possível carregar seus itens</b><span>Clique em Atualizar para tentar de novo.</span></li>';
      funnelsError = true;
      renderFunnels();
    } finally {
      loading = false;
    }
  }

  // Ao voltar para a aba do WhatsApp (ex.: depois de criar um item no painel), atualiza sozinho.
  function watchReturnToTab() {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !sb || !loaded) return;
      if (Date.now() - lastLoadAt < 5000) return;
      loadAllData({ silent: true });
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
  }

  // ===== MARCA (white label) =====
  // Nome e logotipos vêm da tabela `branding` da conta (os mesmos do painel). Ficam guardados no
  // navegador para a marca já aparecer na tela de login e antes de os dados carregarem.
  async function loadBrandCache() {
    try {
      const r = await chrome.storage.local.get('zf_brand');
      if (r.zf_brand) brand = Object.assign(brand, r.zf_brand);
    } catch (e) { /* sem storage */ }
    applyBrand();
  }
  async function fetchBrand() {
    try {
      let res = await sb.from('branding').select('name, logo_url, icon_url, mark, accent, custom_domain').maybeSingle();
      // banco sem as colunas novas (setup.sql não rodado de novo): lê as antigas para não perder a marca
      if (res.error && /mark|accent|column/i.test(res.error.message || '')) res = await sb.from('branding').select('name, logo_url, icon_url, custom_domain').maybeSingle();
      const { data, error } = res;
      if (error) return; // banco na versão antiga (sem a tabela): fica a marca que já estava
      const next = {
        name: (data && data.name) || '', logo_url: (data && data.logo_url) || '', icon_url: (data && data.icon_url) || '',
        mark: (data && data.mark) || '', accent: (data && data.accent) || '', custom_domain: (data && data.custom_domain) || '',
      };
      if (JSON.stringify(next) === JSON.stringify(brand)) return;
      brand = next;
      try { chrome.storage.local.set({ zf_brand: brand }); } catch (e) { /* sem storage */ }
      applyBrand();
    } catch (e) { /* sem rede: mantém a marca guardada */ }
  }
  // Baixa a imagem uma vez (o WhatsApp Web bloqueia imagens de outros sites) e só então chama
  // `use`. Se o download falhar, quem chamou continua com o visual padrão.
  let brandVersion = 0;
  function loadBrandImg(url, alt, use) {
    const v = brandVersion;
    getBlobUrl(url).then((src) => {
      const img = document.createElement('img');
      img.alt = alt;
      img.onload = () => { if (v === brandVersion) use(img); };
      img.src = src;
    }).catch(() => { /* fica o padrão */ });
  }
  function applyBrand() {
    brandVersion++;
    const name = brandName();
    const K = window._zfBrandKit;
    const mark = K.cleanMark(brand.mark);
    const letter = mark === 'letter';
    document.querySelectorAll('[data-zf-brand-name]').forEach((el) => { el.textContent = name; });
    // cor da marca no lugar do rosa (vazio = rosa padrão do sidebar.css)
    const accent = K.cleanAccent(brand.accent);
    let st = document.getElementById('zf-brand-accent');
    if (accent) {
      if (!st) { st = document.createElement('style'); st.id = 'zf-brand-accent'; (document.head || document.documentElement).appendChild(st); }
      st.textContent = K.accentCss(accent);
    } else if (st) st.remove();
    // quadradinho: o ícone enviado pela conta; sem ele, o símbolo escolhido (raio por padrão) ou a inicial
    const makeMark = () => {
      const m = document.createElement('span');
      m.className = 'zf-mark' + (letter ? ' zf-mark-letter' : '');
      if (letter) m.textContent = name.trim().charAt(0).toUpperCase();
      else m.innerHTML = K.markSvg(mark, 15);
      if (brand.icon_url) loadBrandImg(brand.icon_url, '', (img) => { m.className = 'zf-mark zf-mark-img'; m.replaceChildren(img); });
      return m;
    };
    document.querySelectorAll('[data-zf-brand]').forEach((box) => {
      const withName = box.dataset.zfBrand === 'head';
      box.replaceChildren(makeMark());
      if (withName) {
        const n = document.createElement('span');
        n.className = 'zf-brand';
        n.textContent = name;
        box.appendChild(n);
      }
      // logotipo horizontal: ocupa o lugar do ícone + nome
      if (brand.logo_url) loadBrandImg(brand.logo_url, name, (img) => { img.className = 'zf-logo'; box.replaceChildren(img); });
    });
    const tb = $('zf-toggle-btn');
    if (tb) {
      // a aba lateral fica sempre com o símbolo vetorial (imagem pequena demais vira borrão ali)
      if (letter) { const b = document.createElement('b'); b.className = 'zf-tb-letter'; b.textContent = name.trim().charAt(0).toUpperCase(); tb.replaceChildren(b); }
      else tb.innerHTML = K.markSvg(mark, 18);
      tb.setAttribute('aria-label', (tb.classList.contains('zf-sidebar-open') ? 'Fechar ' : 'Abrir ') + name);
    }
  }

  // ===== PAINEL =====
  // Uma aba só para o painel: os atalhos reaproveitam a mesma aba em vez de abrir várias.
  function openPanel(path) {
    const w = window.open(panelUrl() + path, 'zapflow-painel');
    if (w) { try { w.focus(); } catch (e) { /* outra origem */ } }
    else showToast('O navegador bloqueou a nova aba. Permita pop-ups para o WhatsApp Web.');
  }

  const CREATE_PATH = { msg: '/dashboard/mensagens?novo=1', audio: '/dashboard/audios?novo=1', media: '/dashboard/midias?novo=1', doc: '/dashboard/documentos?novo=1' };
  const CREATE_LABEL = { msg: 'Criar mensagem no painel', audio: 'Criar áudio no painel', media: 'Adicionar mídia no painel', doc: 'Adicionar documento no painel' };

  // ===== MENU ☰ =====
  function bindMenu() {
    const btn = $('zf-menu-btn');
    const menu = $('zf-menu');
    if (!btn || !menu) return;
    const items = () => Array.from(menu.querySelectorAll('[role="menuitem"]'));
    const isOpen = () => menu.classList.contains('zf-menu-open');
    const close = (focusBtn) => {
      if (!isOpen()) return;
      menu.classList.remove('zf-menu-open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    };
    const open = () => {
      menu.classList.add('zf-menu-open');
      btn.setAttribute('aria-expanded', 'true');
      items()[0]?.focus();
    };
    btn.onclick = (e) => { e.stopPropagation(); isOpen() ? close() : open(); };
    menu.onclick = async (e) => {
      const it = e.target.closest('[role="menuitem"]');
      if (!it) return;
      close();
      if (it.dataset.zfGo) return openPanel(it.dataset.zfGo);
      if (it.dataset.zfAction === 'ajustes') return switchTab('ajustes');
      if (it.dataset.zfAction === 'importar') return openImport();
      if (it.dataset.zfAction === 'logout' && sb) await sb.auth.signOut();
    };
    menu.onkeydown = (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        list[e.key === 'Home' ? 0 : list.length - 1].focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === 'Tab') {
        close();
      }
    };
    document.addEventListener('click', (e) => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); }, true);
  }

  // ===== BARRA LATERAL =====
  function createSidebar() {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'zf-toggle-btn';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Abrir ' + brandName());
    toggleBtn.innerHTML = window._zfSVG.bolt.replace('width="15" height="15"', 'width="18" height="18"');
    toggleBtn.onclick = () => toggleSidebar();
    document.body.appendChild(toggleBtn);

    const root = document.createElement('div');
    root.id = 'zf-sidebar-root';
    root.classList.add('zf-hidden');
    root.innerHTML = zfBuildSidebar();
    document.body.appendChild(root);
    bindEvents();
  }

  function bindEvents() {
    $('zf-close').onclick = () => toggleSidebar();
    bindMenu();

    document.querySelectorAll('[data-zf-tab]').forEach((b) => { b.onclick = () => switchTab(b.dataset.zfTab); });

    document.querySelectorAll('.zf-chips [data-filter]').forEach((b) => {
      b.onclick = () => {
        currentFilter = b.dataset.filter;
        document.querySelectorAll('.zf-chips [data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        renderItems();
      };
    });
    $('zf-fav-only').onclick = () => {
      showFavOnly = !showFavOnly;
      $('zf-fav-only').setAttribute('aria-pressed', String(showFavOnly));
      renderItems();
    };
    $('zf-search').oninput = (e) => { searchQuery = e.target.value.trim().toLowerCase(); renderItems(); };
    $('zf-refresh-btn').onclick = () => { if (sb) loadAllData(); };
    $('zf-logout').onclick = async () => { if (sb) await sb.auth.signOut(); };

    $('zf-s-hide-bar').onchange = (e) => { settings.hideBar = e.target.checked; saveSettings(); updateQuickBarVisibility(); };
    $('zf-s-bar-fav').onchange = (e) => { settings.barFav = e.target.checked; saveSettings(); syncBarFav(); renderQuickBar(); };
    $('zf-s-bar-funnels').onchange = (e) => { settings.barFunnels = e.target.checked; saveSettings(); renderQuickBar(); };
    $('zf-s-stop-reply').onchange = (e) => { settings.stopOnReply = e.target.checked; saveSettings(); stopReplyChoice.clear(); renderFunnels(); };
    $('zf-s-keywords').onchange = (e) => { settings.keywords = e.target.checked; saveSettings(); };
    $('zf-s-panel-url').onchange = (e) => {
      const typed = e.target.value.trim();
      const url = cleanPanelUrl(typed);
      if (typed && !url) { showToast('Endereço inválido. Exemplo: https://meu-painel.vercel.app'); e.target.value = settings.panelUrl || ''; return; }
      settings.panelUrl = url; e.target.value = url; saveSettings();
      showToast(url ? 'Endereço do painel salvo' : 'Voltou ao endereço padrão do painel');
    };
    $('zf-s-capture').onchange = (e) => { settings.capture = e.target.checked; saveSettings(); };
    $('zf-s-capture-skip').onchange = (e) => { settings.captureSkip = e.target.checked; saveSettings(); };
    $('zf-s-label-sync').onchange = (e) => { settings.labelSync = e.target.checked; saveSettings(); };
    $('zf-s-history').onchange = (e) => {
      settings.history = e.target.checked; saveSettings();
      if (settings.history && leadState.status === 'lead' && leadChat) backfillHistory(leadChat, true);
    };
    $('zf-s-avatars').onchange = (e) => { settings.avatars = e.target.checked; saveSettings(); if (settings.avatars && leadState.status === 'lead' && leadChat) syncAvatar(leadState.lead, leadChat.chatId); };
    $('zf-open-import').onclick = () => openImport();
    $('zf-import-back').onclick = () => switchTab('lead');
    $('zf-lead-open').onclick = () => { if (leadState.lead) openPanel('/dashboard/leads?lead=' + leadState.lead.id); };
    $('zf-funnel-search').oninput = (e) => { funnelSearch = e.target.value.trim().toLowerCase(); renderFunnels(); };
    document.querySelectorAll('#zf-sidebar-root .zf-foot [data-zf-go]').forEach((b) => { b.onclick = () => openPanel(b.dataset.zfGo); });
    document.querySelectorAll('[data-zf-theme-opt]').forEach((b) => {
      b.onclick = () => { settings.theme = b.dataset.zfThemeOpt; saveSettings(); applyTheme(); };
    });
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-zf-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.zfTab === tab)));
    document.querySelectorAll('#zf-sidebar-root .zf-page').forEach((p) => p.classList.toggle('zf-page-active', p.dataset.page === tab));
    if (tab === 'funis') refreshActiveChat();
    if (tab === 'lead') { if (leadChat) loadLead({ quiet: leadState.status === 'lead' || leadState.status === 'none' }); else syncLeadChat(); }
  }

  function toggleSidebar(forceOpen) {
    const root = $('zf-sidebar-root');
    const btn = $('zf-toggle-btn');
    if (!root || !btn) return;
    const open = forceOpen === true ? true : root.classList.contains('zf-hidden');
    root.classList.toggle('zf-hidden', !open);
    btn.classList.toggle('zf-sidebar-open', open);
    btn.setAttribute('aria-label', (open ? 'Fechar ' : 'Abrir ') + brandName());
    updateQuickBarVisibility();
    positionQuickBar();
    for (const t of [100, 200, 300]) setTimeout(positionQuickBar, t);
    if (open) { flushPendingThumbs(); refreshActiveChat(); }
  }

  // ===== BARRA RÁPIDA =====
  function createQuickBar() {
    const bar = document.createElement('div');
    bar.id = 'zf-quickbar';
    bar.setAttribute('aria-label', 'Barra rápida');
    bar.innerHTML = zfBuildQuickBar();
    document.body.appendChild(bar);
    // estrela da barra: liga/desliga "só favoritos" (o mesmo ajuste de Ajustes > Barra rápida)
    $('zf-qb-toggle').onclick = () => {
      settings.barFav = !settings.barFav;
      saveSettings();
      syncBarFav();
      renderQuickBar();
      showToast(settings.barFav ? 'Barra rápida: só favoritos' : 'Barra rápida: todos os itens');
    };
    syncBarFav();
    positionQuickBar();
    updateQuickBarVisibility();
    window.addEventListener('resize', positionQuickBar);
    setInterval(positionQuickBar, 1000);
  }

  function syncBarFav() {
    const on = !!settings.barFav;
    const b = $('zf-qb-toggle');
    if (b) {
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Mostrando só favoritos. Clique para ver todos' : 'Mostrar só favoritos';
    }
    if ($('zf-s-bar-fav')) $('zf-s-bar-fav').checked = on;
  }

  function positionQuickBar() {
    const bar = $('zf-quickbar');
    if (!bar) return;
    // a barra fica só embaixo da conversa, nunca embaixo da lista de conversas
    const chat = $('main') || document.querySelector('[data-tab="8"]');
    const side = $('side') || document.querySelector('[data-tab="3"]');
    const left = chat ? chat.getBoundingClientRect().left : side ? side.getBoundingClientRect().right : 0;
    bar.style.left = Math.max(0, Math.round(left)) + 'px';
    applyLayoutPush();
  }

  function updateQuickBarVisibility() {
    const bar = $('zf-quickbar');
    if (!bar) return;
    const open = !$('zf-sidebar-root')?.classList.contains('zf-hidden');
    bar.classList.toggle('zf-qb-hidden', !open || settings.hideBar);
    applyLayoutPush();
  }

  // Reserva espaço no WhatsApp para a barra lateral e a barra rápida, em vez de cobrir a conversa.
  function applyLayoutPush() {
    const html = document.documentElement;
    const sidebar = $('zf-sidebar-root');
    const bar = $('zf-quickbar');
    const right = sidebar && !sidebar.classList.contains('zf-hidden') ? sidebar.offsetWidth : 0;
    const bottom = bar && !bar.classList.contains('zf-qb-hidden') ? bar.offsetHeight : 0;
    const r = right + 'px', b = bottom + 'px';
    if (html.style.getPropertyValue('--zf-push-right') !== r) html.style.setProperty('--zf-push-right', r);
    if (html.style.getPropertyValue('--zf-push-bottom') !== b) html.style.setProperty('--zf-push-bottom', b);
    html.classList.toggle('zf-push', right > 0);
    html.classList.toggle('zf-push-bottom', bottom > 0);
  }

  function renderQuickBar() {
    const scroll = $('zf-qb-scroll');
    if (!scroll) return;
    updateQuickBarVisibility();
    let items = buildItemsList();
    let funnels = settings.barFunnels ? funnelsData.filter((f) => (f.funnel_items || []).length) : [];
    if (settings.barFav) { items = items.filter((i) => i.isFavorite); funnels = funnels.filter((f) => f.is_favorite); }
    funnels = funnels.slice(0, 8);
    items = items.slice(0, 20);
    const S = window._zfSVG;
    // funis primeiro, com o raio: um clique liga o motor (3 s para cancelar na central de disparos)
    scroll.innerHTML = funnels.map((f) =>
      `<button type="button" class="zf-qb-item zf-qb-funnel" data-qb-funnel="${f.id}" title="Disparar o funil ${escapeHtml(f.title)} nesta conversa">${S.bolt}${escapeHtml(String(f.title || '').substring(0, 30))}</button>`
    ).join('') + items.map((i) =>
      `<button type="button" class="zf-qb-item" data-qb-id="${i.id}" data-qb-type="${i.type}" title="Enviar ${escapeHtml(i.title)}">${S[TYPE_ICON[i.type]] || ''}${escapeHtml(i.title.substring(0, 30))}</button>`
    ).join('');
    if (settings.barFav && loaded && !funnels.length && !items.length) {
      scroll.innerHTML = '<span class="zf-qb-hint">Nenhum favorito ainda. Marque a estrela nos itens, no painel.</span>';
    }
    scroll.querySelectorAll('.zf-qb-item').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.qbFunnel) {
          const f = funnelsData.find((x) => String(x.id) === btn.dataset.qbFunnel);
          if (f) fireFunnel(f, { stopOnReply: settings.stopOnReply });
          return;
        }
        const item = items.find((x) => String(x.id) === btn.dataset.qbId && x.type === btn.dataset.qbType);
        if (item) sendItem(item);
      };
    });
  }

  // ===== LISTA DE ITENS =====
  function buildItemsList() {
    const items = [];
    messagesData.forEach((m) => items.push({
      id: m.id, type: 'msg', title: m.title, isFavorite: m.is_favorite, content: m.content, url: null,
      meta: (m.content || '').replace(/\s+/g, ' ').slice(0, 70) || 'Mensagem',
    }));
    mediaData.forEach((m) => {
      const t = m.type === 'audio' ? 'audio' : (m.type === 'image' || m.type === 'video') ? 'media' : m.type === 'document' ? 'doc' : null;
      if (!t) return;
      const kind = m.type === 'audio' ? 'Áudio' : m.type === 'video' ? 'Vídeo' : m.type === 'image' ? 'Foto' : ((m.url || '').split('?')[0].split('.').pop() || 'Arquivo').slice(0, 5).toUpperCase();
      const item = { id: m.id, type: t, title: m.title, isFavorite: m.is_favorite, content: m.caption, url: m.url, mediaType: m.type, kind, size: m.size };
      item.meta = metaText(item);
      items.push(item);
    });
    return items;
  }

  // Linha de detalhes igual à do painel: "Vídeo · 0:42 · 3,1 MB"
  function metaText(item) {
    if (item.type === 'msg') return item.meta;
    const dur = durationCache.get(item.url);
    return [item.kind, dur ? formatDuration(dur) : '', formatFileSize(item.size)].filter(Boolean).join(' · ');
  }

  // ===== MINIATURAS =====
  // O WhatsApp Web bloqueia mídia de outros sites (CSP): baixamos o arquivo uma vez e usamos
  // um endereço local (blob), reaproveitado pela miniatura e pela prévia.
  const blobCache = new Map();      // url -> Promise<blobUrl>
  const durationCache = new Map();  // url -> segundos
  const MAX_VIDEO_THUMB = 25 * 1024 * 1024; // vídeos maiores ficam só com o ícone (não vale baixar tudo)
  const thumbWaiting = [];
  const thumbPending = new Set();   // miniaturas que apareceram com a barra fechada
  const loadingMedia = new Set();   // mantém os elementos vivos até o navegador ler os metadados
  let thumbActive = 0;
  let thumbObserver = null;

  function getBlobUrl(url) {
    if (!blobCache.has(url)) {
      const p = fetch(url)
        .then((res) => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.blob(); })
        .then((blob) => URL.createObjectURL(blob));
      p.catch(() => blobCache.delete(url));
      blobCache.set(url, p);
    }
    return blobCache.get(url);
  }

  function clearBlobCache() {
    blobCache.forEach((p) => p.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
    blobCache.clear();
    durationCache.clear();
  }

  // no máximo 3 downloads de miniatura ao mesmo tempo
  function downloadThumb(url) {
    return new Promise((resolve, reject) => {
      const start = () => {
        thumbActive++;
        getBlobUrl(url).then(resolve, reject).finally(() => {
          thumbActive--;
          const next = thumbWaiting.shift();
          if (next) next();
        });
      };
      if (thumbActive < 3) start(); else thumbWaiting.push(start);
    });
  }

  function setDuration(item, seconds) {
    if (!isFinite(seconds) || seconds <= 0) return;
    durationCache.set(item.url, seconds);
    const mm = document.querySelector(`#zf-items-list .zf-item[data-id="${item.id}"][data-type="${item.type}"] .zf-mm`);
    if (mm) mm.textContent = metaText(item);
  }

  function thumbHtml(item) {
    const S = window._zfSVG;
    if (item.type === 'msg') return `<span class="zf-th zf-th-msg" aria-hidden="true">${S.msg}</span>`;
    if (item.type === 'audio') return `<span class="zf-th zf-th-audio" data-thumb="audio" aria-hidden="true">${S.mic}</span>`;
    if (item.type === 'doc') return `<span class="zf-th zf-th-doc" aria-hidden="true">${S.doc}<b>${escapeHtml(item.kind.slice(0, 4))}</b></span>`;
    if (item.mediaType === 'video') return `<span class="zf-th zf-th-media" data-thumb="video" aria-hidden="true"><i class="zf-th-play">${S.play}</i></span>`;
    return `<span class="zf-th zf-th-media" data-thumb="image" aria-hidden="true">${S.img}</span>`;
  }

  async function loadThumb(el) {
    const item = el.__zfItem;
    const kind = el.dataset.thumb;
    if (!item || !item.url || !el.isConnected) return;
    if (kind === 'video' && item.size && item.size > MAX_VIDEO_THUMB) return;
    let src;
    try { src = await downloadThumb(item.url); } catch (e) { return; }

    if (kind === 'audio') {
      if (durationCache.has(item.url)) return;
      const a = new Audio();
      loadingMedia.add(a);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { setDuration(item, a.duration); loadingMedia.delete(a); };
      a.onerror = () => loadingMedia.delete(a);
      a.src = src;
      return;
    }
    if (!el.isConnected) return;
    if (kind === 'image') {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onload = () => { if (el.isConnected) { el.appendChild(img); el.classList.add('zf-th-ready'); } };
      img.src = src;
      return;
    }
    const v = document.createElement('video');
    loadingMedia.add(v);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    // o vídeo entra na miniatura já com os metadados; o navegador pinta o primeiro quadro assim que o decodifica
    v.onloadedmetadata = () => {
      setDuration(item, v.duration);
      if (el.isConnected) { el.insertBefore(v, el.firstChild); el.classList.add('zf-th-ready'); }
      v.currentTime = 0.1; // pula o quadro preto do início
      loadingMedia.delete(v);
    };
    v.onerror = () => { v.remove(); loadingMedia.delete(v); };
    v.src = src;
  }

  /** Só baixa a miniatura quando ela chega perto da área visível e a barra está aberta. */
  function observeThumbs(list) {
    if (thumbObserver) thumbObserver.disconnect();
    thumbPending.clear();
    thumbObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        obs.unobserve(e.target);
        if ($('zf-sidebar-root')?.classList.contains('zf-hidden')) thumbPending.add(e.target);
        else loadThumb(e.target);
      });
    }, { root: list, rootMargin: '150px' });
    return thumbObserver;
  }

  function flushPendingThumbs() {
    thumbPending.forEach((el) => loadThumb(el));
    thumbPending.clear();
  }

  function previewHtml(item) {
    const cap = item.content ? `<p class="zf-cap">${escapeHtml(item.content)}</p>` : '';
    if (item.type === 'msg') return `<p>${escapeHtml(item.content || '')}</p>`;
    if (item.type === 'audio') return `<span class="zf-loading-line">Carregando áudio…</span><audio data-src="${escapeHtml(item.url)}" controls controlsList="nodownload" hidden></audio>`;
    if (item.type === 'media') {
      const tag = item.mediaType === 'video' ? `<video data-src="${escapeHtml(item.url)}" controls hidden></video>` : `<img data-src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" hidden>`;
      return `${cap}<span class="zf-loading-line">Carregando prévia…</span>${tag}`;
    }
    return `${cap}<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Abrir o arquivo</a>`;
  }

  function renderItems() {
    const list = $('zf-items-list');
    if (!list) return;
    const all = buildItemsList();
    let items = all;
    if (currentFilter !== 'all') items = items.filter((i) => i.type === currentFilter);
    if (searchQuery) items = items.filter((i) => i.title.toLowerCase().includes(searchQuery) || (i.content || '').toLowerCase().includes(searchQuery));
    if (showFavOnly) items = items.filter((i) => i.isFavorite);

    const count = $('zf-count');
    if (count) count.textContent = loaded ? `${items.length} de ${all.length} itens` : '';

    if (!loaded) { list.innerHTML = '<li class="zf-skel"></li><li class="zf-skel"></li><li class="zf-skel"></li>'; return; }
    // vazio: botão que abre o painel já no formulário certo; a lista atualiza sozinha ao voltar
    const emptyState = (title, text, type) => {
      list.innerHTML = `<li class="zf-empty"><b>${title}</b><span>${text}</span>${type ? `<button type="button" class="zf-btn zf-empty-cta" data-zf-go="${CREATE_PATH[type]}">${window._zfSVG.external} ${CREATE_LABEL[type]}</button>` : ''}</li>`;
      const cta = list.querySelector('[data-zf-go]');
      if (cta) cta.onclick = () => openPanel(cta.dataset.zfGo);
    };
    const typeName = { msg: 'mensagem', audio: 'áudio', media: 'mídia', doc: 'documento' }[currentFilter];
    if (all.length === 0) {
      emptyState('Sua biblioteca está vazia', 'Crie seus itens no painel. A lista atualiza sozinha quando você voltar para cá.', currentFilter === 'all' ? 'msg' : currentFilter);
      return;
    }
    if (items.length === 0) {
      const noneOfType = typeName && !all.some((i) => i.type === currentFilter);
      if (noneOfType) emptyState(`Nenhum${currentFilter === 'msg' || currentFilter === 'media' ? 'a' : ''} ${typeName} ainda`, 'Crie no painel. A lista atualiza sozinha quando você voltar para cá.', currentFilter);
      else emptyState('Nada encontrado', 'Mude o filtro ou a busca.', typeName ? currentFilter : null);
      return;
    }

    const S = window._zfSVG;
    list.innerHTML = items.map((item) => `
      <li class="zf-item" data-id="${item.id}" data-type="${item.type}">
        <div class="zf-row">
          ${thumbHtml(item)}
          <button type="button" class="zf-txt" aria-expanded="false" title="Ver conteúdo">
            <span class="zf-tt">${escapeHtml(item.title)}${item.isFavorite ? `<span class="zf-star">${S.star}</span>` : ''}</span>
            <span class="zf-mm">${escapeHtml(item.meta)}</span>
          </button>
          <button type="button" class="zf-cal" aria-label="Agendar ${escapeHtml(item.title)}" aria-expanded="false" title="Agendar o envio">${S.calendar}</button>
          <button type="button" class="zf-send" aria-label="Enviar ${escapeHtml(item.title)}" title="Enviar nesta conversa">${S.play}</button>
        </div>
        <div class="zf-sched" hidden></div>
        <div class="zf-preview">${previewHtml(item)}</div>
      </li>`).join('');

    const observer = observeThumbs(list);
    list.querySelectorAll('.zf-item').forEach((li) => {
      const item = items.find((i) => String(i.id) === li.dataset.id && i.type === li.dataset.type);
      const th = li.querySelector('[data-thumb]');
      if (th && item) { th.__zfItem = item; observer.observe(th); }
      li.querySelector('.zf-send').onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (item) sendItem(item); };
      li.querySelector('.zf-cal').onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (item) toggleSchedule(li, item); };
      li.querySelector('.zf-txt').onclick = async () => {
        const open = li.classList.toggle('zf-open');
        li.querySelector('.zf-txt').setAttribute('aria-expanded', String(open));
        const el = open && li.querySelector('[data-src]');
        if (!el) return;
        const loading = li.querySelector('.zf-loading-line');
        try {
          // mesmo arquivo da miniatura: já baixado uma vez, vem do cache
          el.src = await getBlobUrl(el.getAttribute('data-src'));
          el.removeAttribute('data-src');
          el.hidden = false;
          if (loading) loading.remove();
        } catch (err) {
          if (loading) loading.textContent = 'Não foi possível carregar a prévia.';
        }
      };
    });
  }

  // ===== AGENDAR ENVIO =====
  // O calendário de cada item cria uma tarefa de envio (tabela `tasks`, a mesma da Agenda e de
  // Tarefas no painel) para a conversa que estiver aberta agora.
  const pad2 = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const timeStr = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  function schedulePresets() {
    const now = new Date();
    const at = (days, h, m = 0) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m); return d; };
    const inOneHour = new Date(Math.ceil((now.getTime() + 3600000) / 300000) * 300000); // próximo múltiplo de 5 min
    const list = [['Em 1 hora', inOneHour]];
    if (now.getHours() < 17) list.push(['Hoje 18:00', at(0, 18)]);
    list.push(['Amanhã 9:00', at(1, 9)], ['Amanhã 14:00', at(1, 14)], ['Em 3 dias', at(3, 9)]);
    return list;
  }

  async function toggleSchedule(li, item) {
    const box = li.querySelector('.zf-sched');
    const btn = li.querySelector('.zf-cal');
    if (!box.hidden) { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    // só uma caixa aberta por vez
    document.querySelectorAll('#zf-items-list .zf-sched:not([hidden])').forEach((b) => {
      b.hidden = true; b.closest('.zf-item')?.querySelector('.zf-cal')?.setAttribute('aria-expanded', 'false');
    });
    btn.setAttribute('aria-expanded', 'true');
    box.hidden = false;
    box.innerHTML = '<p class="zf-sched-note">Verificando a conversa aberta…</p>';

    let chat = null;
    try { const r = await engineRequest('ZF_ENGINE_ACTIVE_CHAT', {}, 8000); if (r.ok) chat = { chatId: r.chatId, name: r.name }; } catch (e) { /* sem conversa */ }
    if (box.hidden) return;
    if (!chat) { box.innerHTML = '<p class="zf-sched-note">Abra uma conversa no WhatsApp para agendar o envio.</p>'; return; }

    const first = schedulePresets()[0][1];
    box.innerHTML = `
      <p class="zf-sched-to">Enviar para <b>${escapeHtml(chat.name)}</b></p>
      <div class="zf-sched-chips">${schedulePresets().map(([label, d], i) => `<button type="button" data-p="${i}">${label}</button>`).join('')}</div>
      <div class="zf-sched-when">
        <label>Dia<input type="date" class="zf-s-date" min="${dateStr(new Date())}" value="${dateStr(first)}"></label>
        <label>Hora<input type="time" class="zf-s-time" value="${timeStr(first)}"></label>
      </div>
      <label class="zf-sched-ck"><input type="checkbox" class="zf-s-cancel" checked><span>Cancelar se o contato responder antes</span></label>
      <label class="zf-sched-ck"><input type="checkbox" class="zf-s-human" checked><span>Variar alguns minutos no horário</span></label>
      <p class="zf-sched-err" role="alert"></p>
      <div class="zf-sched-actions">
        <button type="button" class="zf-btn zf-s-cancel-btn">Cancelar</button>
        <button type="button" class="zf-btn-primary zf-s-ok">${window._zfSVG.calendar}<span>Agendar</span></button>
      </div>`;
    const presets = schedulePresets();
    const dateEl = box.querySelector('.zf-s-date'), timeEl = box.querySelector('.zf-s-time'), errEl = box.querySelector('.zf-sched-err');
    box.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = () => { const d = presets[+b.dataset.p][1]; dateEl.value = dateStr(d); timeEl.value = timeStr(d); errEl.textContent = ''; };
    });
    box.querySelector('.zf-s-cancel-btn').onclick = () => { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const ok = box.querySelector('.zf-s-ok');
    ok.onclick = async () => {
      errEl.textContent = '';
      if (!dateEl.value || !timeEl.value) { errEl.textContent = 'Escolha o dia e o horário.'; return; }
      const due = new Date(`${dateEl.value}T${timeEl.value}:00`);
      if (isNaN(due) || due.getTime() < Date.now() - 60000) { errEl.textContent = 'Escolha um horário no futuro.'; return; }
      ok.disabled = true;
      try {
        await createScheduledTask(item, chat, due, { cancel_on_reply: box.querySelector('.zf-s-cancel').checked, humanize: box.querySelector('.zf-s-human').checked });
        box.hidden = true; btn.setAttribute('aria-expanded', 'false');
        const d = due, today = dateStr(new Date()), tomorrow = dateStr(new Date(Date.now() + 86400000));
        const day = dateStr(d) === today ? 'hoje' : dateStr(d) === tomorrow ? 'amanhã' : d.toLocaleDateString('pt-BR');
        showToast(`📅 Agendado para ${day} às ${timeStr(d)} · ${chat.name}`);
      } catch (e) {
        ok.disabled = false;
        errEl.textContent = /relation .*tasks|tasks.*(does not exist|schema cache)/i.test(e.message || '')
          ? 'A tabela de tarefas ainda não existe no banco. Rode o supabase/setup.sql.' : 'Não foi possível agendar: ' + (e.message || 'erro');
      }
    };
  }

  async function createScheduledTask(item, chat, due, opts) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Entre na sua conta para agendar.');
    const content = { msg: 'text', audio: 'audio', media: 'media', doc: 'document' }[item.type];
    const label = { text: 'Texto', audio: 'Áudio', media: 'Mídia', document: 'Documento' }[content];
    const phone = /@c\.us$/.test(chat.chatId) ? chat.chatId.split('@')[0] : null;
    const row = {
      user_id: session.user.id,
      kind: 'send',
      title: `${label}: ${(item.title || '').slice(0, 40)}`.trim(),
      due_at: due.toISOString(),
      contact: chat.name,
      phone,
      content_type: content,
      text: content === 'text' ? item.content : null,
      media_id: content === 'text' ? null : item.id,
      options: { ...opts, chat_id: chat.chatId, created_at_ms: Date.now() },
    };
    const { error } = await sb.from('tasks').insert(row);
    if (error) throw error;
  }

  // ===== EXECUTOR DOS ENVIOS AGENDADOS =====
  // Enquanto o WhatsApp Web estiver aberto (computador ligado), a cada 30 s procura tarefas de envio
  // vencidas e as envia com o mesmo motor (digitando/gravando). Regras:
  //  - "variar horário": cada tarefa espera de 0 a 4 min depois do marcado (fixo por tarefa);
  //  - passou de 5 min do horário (computador desligado, WhatsApp fechado): NUNCA envia sozinho,
  //    pergunta se envia agora ou cancela;
  //  - antes de enviar, "estado = enviando" garante que duas abas não mandem em dobro;
  //  - "cancelar se responder": confere se o contato escreveu depois que a tarefa foi criada.
  const TASK_POLL_MS = 30000;
  const TASK_GRACE_MS = 5 * 60 * 1000;
  const TASK_STUCK_MS = 15 * 60 * 1000;
  let taskPolling = false;
  let tasksBroken = false;
  const overdueDismissed = new Set();
  let overdueList = [];

  const TASK_SELECT = '*, lead:leads(id,name,phone), media:media_library(id,title,type,url,caption)';

  function taskJitterMs(t) {
    if (t.options && t.options.humanize === false) return 0;
    return (Math.imul(Number(t.id) | 0, 2654435761) >>> 0) % 240000;
  }

  function phoneToChatId(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    if (d.length <= 11) d = '55' + d;
    return d + '@c.us';
  }

  function taskItem(t) {
    if (t.content_type === 'text') return { type: 'msg', title: t.title, content: t.text };
    if (t.file_url) return { type: 'audio', title: t.title, url: t.file_url };
    const m = t.media;
    if (!m || !m.url) throw new Error('O arquivo da biblioteca foi apagado.');
    const type = m.type === 'audio' ? 'audio' : (m.type === 'image' || m.type === 'video') ? 'media' : 'doc';
    return { type, title: m.title, url: m.url, content: m.caption, mediaType: m.type };
  }

  async function updateTask(id, patch, onlyIf) {
    let q = sb.from('tasks').update(patch).eq('id', id);
    if (onlyIf) q = q.eq('status', onlyIf);
    const { data, error } = await q.select('id');
    if (error) throw error;
    return (data || []).length > 0;
  }

  async function runScheduledTask(t, { force = false } = {}) {
    const opts = t.options || {};
    const claimed = await updateTask(t.id, { status: 'sending', attempts: (t.attempts || 0) + 1, options: { ...opts, claimed_at: Date.now() } }, 'scheduled');
    if (!claimed) return; // outra aba pegou
    const name = (t.lead && t.lead.name) || t.contact || '';
    try {
      const chatId = opts.chat_id || phoneToChatId(t.phone || (t.lead && t.lead.phone));
      if (!chatId) throw new Error('Esta tarefa não tem número de WhatsApp.');
      if (!force && opts.cancel_on_reply !== false) {
        const r = await engineRequest('ZF_ENGINE_REPLIED', { chatId, since: Date.parse(t.created_at) || 0 }, 6000);
        if (r.ok && r.replied) {
          await updateTask(t.id, { status: 'cancelled', error: 'O contato respondeu antes do horário.', finished_at: new Date().toISOString() });
          showToast(`↩️ Envio para ${name || 'o contato'} cancelado: ele respondeu antes.`);
          return;
        }
      }
      if (t.content_type === 'funnel') {
        const funnel = funnelsData.find((f) => f.id === Number(t.funnel_id));
        if (!funnel) throw new Error('O funil foi apagado ou ainda não carregou.');
        if (!startFunnelRun(funnel, { chatId, name: name || 'Contato' }, { stopOnReply: settings.stopOnReply })) throw new Error('O funil não tem passos para enviar.');
        await updateTask(t.id, { status: 'sent', error: null, finished_at: new Date().toISOString() });
        showToast(`⚡ Funil “${funnel.title}” iniciado para ${name || 'o contato'}`);
        return;
      }
      const payload = await buildPayload(taskItem(t), name);
      payload.chatId = chatId;
      payload.createChat = !opts.chat_id; // tarefa criada no painel: o número pode nunca ter conversado antes
      const res = await withEngine(() => engineRequest('ZF_ENGINE_SEND', payload, (payload.presenceMs || 0) + 120000));
      if (!res.ok) throw new Error(res.error || 'Falha ao enviar');
      await updateTask(t.id, { status: 'sent', error: null, finished_at: new Date().toISOString() });
      showToast(opts.from_trigger ? `⚡ ${t.title} — enviado para ${name || 'o contato'}` : `✅ Agendado enviado para ${name || 'o contato'}`);
    } catch (e) {
      console.error('❌ ZapFlow envio agendado:', e);
      try { await updateTask(t.id, { status: 'failed', error: (e && e.message) || 'Falha ao enviar', finished_at: new Date().toISOString() }); } catch (e2) { /* sem rede */ }
      showToast(`❌ Envio agendado para ${name || 'o contato'} falhou: ${(e && e.message) || 'erro'}`);
    }
  }

  async function pollTasks() {
    if (taskPolling || tasksBroken || !sb) return;
    taskPolling = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data, error } = await sb.from('tasks').select(TASK_SELECT)
        .eq('kind', 'send').in('status', ['scheduled', 'sending'])
        .lte('due_at', new Date().toISOString()).order('due_at');
      if (error) {
        if (/tasks|relation|schema cache/i.test(error.message || '')) tasksBroken = true; // tabela ainda não criada
        console.warn('ZapFlow: não foi possível consultar os envios agendados:', error.message);
        return;
      }
      const now = Date.now();
      const due = [];
      overdueList = [];
      for (const t of data || []) {
        const dueMs = Date.parse(t.due_at);
        if (t.status === 'sending') {
          // travada: o WhatsApp foi fechado no meio do envio
          const at = Number(t.options && t.options.claimed_at) || dueMs;
          if (now - at > TASK_STUCK_MS) await updateTask(t.id, { status: 'failed', error: 'O envio foi interrompido (WhatsApp fechado no meio). Confira se a mensagem chegou.', finished_at: new Date().toISOString() }, 'sending').catch(() => {});
          continue;
        }
        if (now - dueMs > TASK_GRACE_MS) { if (!overdueDismissed.has(t.id)) overdueList.push(t); continue; }
        if (now >= dueMs + taskJitterMs(t)) due.push(t);
      }
      renderOverdue();
      if (!due.length) return;
      let ready = false;
      try { const st = await engineRequest('ZF_ENGINE_STATUS', {}, 4000); ready = !!(st && st.ready); } catch (e) { /* motor não respondeu */ }
      if (!ready) return; // tenta de novo no próximo ciclo, sem gastar a tarefa
      for (const t of due) await runScheduledTask(t);
    } catch (e) {
      console.warn('ZapFlow: erro no executor de agendados:', e && e.message);
    } finally {
      taskPolling = false;
    }
  }

  // Aviso de envios que passaram do horário: nunca mandamos mensagem velha sem você decidir.
  function renderOverdue() {
    let el = document.getElementById('zf-overdue');
    if (!overdueList.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'zf-overdue'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Envios atrasados'); document.body.appendChild(el); }
    const fmt = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${timeStr(d)}`; };
    const rows = overdueList.slice(0, 4).map((t) => `
      <li data-id="${t.id}">
        <span><b>${escapeHtml((t.lead && t.lead.name) || t.contact || 'Contato')}</b><small>${escapeHtml(t.title)} · era para ${fmt(t.due_at)}</small></span>
        <button type="button" class="zf-btn-primary" data-act="now">Enviar agora</button>
        <button type="button" class="zf-btn" data-act="cancel">Cancelar</button>
      </li>`).join('');
    const more = overdueList.length > 4 ? `<p class="zf-od-more">+ ${overdueList.length - 4} outros no painel (Tarefas)</p>` : '';
    el.innerHTML = `<div class="zf-od-head"><b>${overdueList.length === 1 ? '1 envio passou do horário' : overdueList.length + ' envios passaram do horário'}</b><button type="button" class="zf-icon-btn" data-act="later" aria-label="Decidir depois" title="Decidir depois">${window._zfSVG.close}</button></div>
      <p class="zf-od-hint">O WhatsApp estava fechado na hora marcada. Não envio mensagem atrasada sozinho.</p><ul>${rows}</ul>${more}`;
    el.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'later') { overdueList.forEach((t) => overdueDismissed.add(t.id)); overdueList = []; renderOverdue(); return; }
      const id = +b.closest('li').dataset.id;
      const t = overdueList.find((x) => x.id === id);
      if (!t) return;
      b.disabled = true;
      overdueList = overdueList.filter((x) => x.id !== id);
      renderOverdue();
      if (b.dataset.act === 'cancel') { try { await updateTask(id, { status: 'cancelled', error: 'Cancelada depois de passar do horário.', finished_at: new Date().toISOString() }, 'scheduled'); } catch (err) { showToast('Não foi possível cancelar.'); } }
      else await runScheduledTask(t, { force: true });
    };
  }

  setTimeout(pollTasks, 8000);
  setInterval(pollTasks, TASK_POLL_MS);

  // Gatilhos de "lead parado numa etapa": pede a conferência ao banco de tempos em tempos
  // (o painel faz o mesmo; o banco não deixa disparar duas vezes). Os envios criados chegam
  // como tarefas, pelo mesmo caminho dos outros gatilhos.
  let staleOff = false;
  async function checkStaleLeads() {
    if (staleOff || !sb) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { error } = await sb.rpc('zf_check_stale');
      if (error) staleOff = true; // banco na versão antiga
    } catch (e) { /* sem rede: tenta na próxima */ }
  }
  setTimeout(checkStaleLeads, 20000);
  setInterval(checkStaleLeads, 10 * 60 * 1000);

  let taskChannel = null;
  function watchNewTasks() {
    if (taskChannel || !sb || typeof sb.channel !== 'function') return;
    try {
      taskChannel = sb.channel('zapflow-tarefas')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (p) => {
          if (p && p.new && p.new.kind === 'send') setTimeout(pollTasks, 1200);
        })
        .subscribe();
    } catch (e) { taskChannel = null; /* sem tempo real: continua de 30 em 30 s */ }
  }

  // ===== GATILHOS POR PALAVRA-CHAVE =====
  // O motor avisa cada mensagem nova recebida (só conversas individuais). Se o texto tiver uma
  // palavra de um gatilho ativo, respondemos com o item ou funil escolhido, com "digitando…".
  // Proteções: um gatilho por mensagem; intervalo por gatilho e conversa (padrão 24 h, guardado no
  // navegador para valer depois de recarregar); no máximo uma resposta automática por minuto na
  // mesma conversa (evita robô conversando com robô); pausa de 2–5 s antes de começar a responder.
  const FIRED_KEY = 'zf_trigger_fired';
  const CHAT_MIN_GAP_MS = 60000;
  const seenIncoming = new Set();
  const lastAutoReply = new Map(); // chatId -> ms
  let firedMap = null;              // "gatilho:conversa" -> ms da última resposta

  async function loadFired() {
    if (firedMap) return firedMap;
    try { firedMap = (await chrome.storage.local.get(FIRED_KEY))[FIRED_KEY] || {}; } catch (e) { firedMap = {}; }
    const old = Date.now() - 400 * 86400000;
    Object.keys(firedMap).forEach((k) => { if (firedMap[k] < old) delete firedMap[k]; });
    return firedMap;
  }
  function saveFired() { try { chrome.storage.local.set({ [FIRED_KEY]: firedMap }); } catch (e) { /* sem storage */ } }

  // minúsculas, sem acento e com espaços simples: "Preço?" e "preco" se encontram
  const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function triggerKeywords(t) {
    const k = t.event_config && t.event_config.keywords;
    return (Array.isArray(k) ? k : String(k || '').split(',')).map(normText).filter(Boolean);
  }

  // Devolve a palavra que casou (ou null). "contém" exige palavra inteira: "preço" não casa com "apreço".
  function keywordHit(t, text) {
    const msg = normText(text);
    if (!msg) return null;
    const mode = (t.event_config && t.event_config.match) || 'contains';
    const bare = msg.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    for (const w of triggerKeywords(t)) {
      const hit = mode === 'exact' ? bare === w
        : mode === 'starts' ? bare.startsWith(w)
        : new RegExp('(^|[^\\p{L}\\p{N}])' + escRe(w) + '($|[^\\p{L}\\p{N}])', 'u').test(msg);
      if (hit) return w;
    }
    return null;
  }

  // cooldown_hours: 0 = toda vez, -1 = só uma vez por conversa, padrão 24
  function cooledDown(t, chatId, now) {
    const last = firedMap[t.id + ':' + chatId];
    if (!last) return true;
    const h = Number(t.event_config && t.event_config.cooldown_hours);
    const hours = t.event_config && t.event_config.cooldown_hours != null && Number.isFinite(h) ? h : 24;
    if (hours < 0) return false;
    return now - last >= hours * 3600000;
  }

  function triggerTarget(t) {
    const c = t.action_config || {};
    if (t.action === 'send_funnel') {
      const f = funnelsData.find((x) => x.id === Number(c.funnel_id));
      return f ? { funnel: f } : null;
    }
    const idx = itemIndex();
    if (t.action === 'send_message') { const i = idx.get('msg:' + Number(c.message_id)); return i ? { item: i } : null; }
    if (t.action === 'send_audio' || t.action === 'send_media' || t.action === 'send_document') {
      const id = Number(c.media_id);
      const i = idx.get('audio:' + id) || idx.get('media:' + id) || idx.get('doc:' + id);
      return i ? { item: i } : null;
    }
    return null;
  }

  async function onIncoming(m) {
    if (!sb || !loaded || settings.keywords === false || !triggersData.length) return;
    if (!m.msgId || !m.chatId || seenIncoming.has(m.msgId)) return;
    seenIncoming.add(m.msgId);
    if (seenIncoming.size > 500) seenIncoming.delete(seenIncoming.values().next().value);
    if (!m.text) return;
    const now = Date.now();
    if (now - (lastAutoReply.get(m.chatId) || 0) < CHAT_MIN_GAP_MS) return;
    await loadFired();
    for (const t of triggersData) {
      const word = keywordHit(t, m.text);
      if (!word || !cooledDown(t, m.chatId, now)) continue;
      const target = triggerTarget(t);
      if (!target) { console.warn('ZapFlow: o gatilho', t.title, 'aponta para um item que não existe mais'); continue; }
      // registra antes de responder: se outra mensagem chegar logo depois, não responde em dobro
      firedMap[t.id + ':' + m.chatId] = now;
      saveFired();
      lastAutoReply.set(m.chatId, now);
      await sleep(2000 + Math.random() * 3000);
      const chat = { chatId: m.chatId, name: m.name };
      if (target.funnel) startFunnelRun(target.funnel, chat, { stopOnReply: settings.stopOnReply });
      else enqueueSend(target.item, chat);
      showToast(`⚡ Gatilho “${t.title}” respondendo ${m.name}`);
      return; // um gatilho por mensagem
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'ZF_ENGINE_INCOMING') return;
    onIncoming(e.data).catch((err) => console.warn('ZapFlow gatilho:', err && err.message));
  });

  // ===== LEAD DA CONVERSA (CRM dentro do WhatsApp) =====
  // A aba "Lead" mostra quem é o contato da conversa aberta (etapa no Kanban, etiquetas, temperatura,
  // observações, próximas tarefas) e deixa mudar tudo ali mesmo. A captura automática transforma quem
  // manda mensagem em lead, na etapa de entrada do Kanban (função zf_capture_lead no banco).
  let crm = { boards: [], columns: [], tags: [], error: false };
  let leadChat = null;                      // { chatId, name, phone, isGroup, isMyContact } da conversa aberta
  let leadState = { status: 'idle' };       // idle | loading | nochat | group | none | lead | error
  let leadSeq = 0;
  const LEAD_SELECT = '*, lead_tags(tag_id), kanban_cards(id,board_id,column_id,position,value,product)';
  const TEMP_OPTS = [['hot', 'Quente', 'flame'], ['warm', 'Morno', 'thermo'], ['cold', 'Frio', 'snow']];
  const MSG_LABEL = { ptt: 'Áudio', audio: 'Áudio', image: 'Foto', video: 'Vídeo', document: 'Documento', sticker: 'Figurinha', location: 'Localização', vcard: 'Contato', multi_vcard: 'Contatos' };
  const TAG_COLORS = ['#6b7280', '#d1236f', '#b42318', '#c2410c', '#9a5b00', '#0e7a4f', '#0f766e', '#1d4ed8', '#6b21a8', '#be185d'];

  // Mesma regra do banco (phone_key) e do painel
  function phoneKeyOf(p) {
    const d = String(p || '').replace(/\D/g, '').replace(/^0+/, '');
    if (d.length < 10) return null;
    return d.length <= 11 ? '55' + d : d;
  }
  function fmtPhone(p) {
    const k = phoneKeyOf(p);
    if (!k || !k.startsWith('55') || (k.length !== 12 && k.length !== 13)) return p ? '+' + String(p).replace(/\D/g, '') : '';
    const n = k.slice(4);
    return `(${k.slice(2, 4)}) ${n.slice(0, -4)}-${n.slice(-4)}`;
  }
  const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const userId = async () => (await sb.auth.getSession()).data.session?.user?.id;

  async function loadCrm() {
    if (!sb) return;
    const [b, c, t] = await Promise.all([
      sb.from('kanban_boards').select('id,title,created_at').order('created_at').order('id'),
      sb.from('kanban_columns').select('id,board_id,title,color,position,is_inbox').order('position').order('id'),
      sb.from('tags').select('*').order('name'),
    ]);
    if (b.error || c.error || t.error) {
      crm.error = true;
      console.warn('ZapFlow: falha ao carregar o Kanban/etiquetas', b.error || c.error || t.error);
    } else {
      crm = { boards: b.data || [], columns: c.data || [], tags: t.data || [], error: false };
    }
    renderCaptureWhere();
  }

  // Etapa de entrada: a marcada no painel, ou a 1ª etapa do 1º quadro (a mesma regra do banco).
  function inboxColumn() {
    const marked = crm.columns.find((c) => c.is_inbox);
    if (marked) return marked;
    for (const b of crm.boards) {
      const first = crm.columns.find((c) => c.board_id === b.id);
      if (first) return first;
    }
    return null;
  }
  function stageLabel(col) {
    const b = crm.boards.find((x) => x.id === col.board_id);
    return (b ? b.title + ' › ' : '') + col.title;
  }

  function renderCaptureWhere() {
    const el = $('zf-capture-where');
    if (!el) return;
    if (crm.error) { el.textContent = 'O banco está na versão antiga: rode o supabase/setup.sql de novo para a captura funcionar.'; return; }
    const col = inboxColumn();
    el.textContent = col
      ? `Os novos entram em ${stageLabel(col)}. Para mudar, marque outra etapa como entrada no Kanban do painel.`
      : 'Você ainda não tem quadro no Kanban: os novos ficam só em Leads.';
  }

  function setLeadChat(info) {
    const before = leadChat && leadChat.chatId;
    leadChat = info && info.chatId ? info : null;
    // conversa mudou, ou a aba ainda não mostrou nada (ex.: nenhuma conversa aberta desde o início)
    if ((leadChat && leadChat.chatId) !== before || leadState.status === 'idle') loadLead();
  }

  async function syncLeadChat() {
    try {
      const r = await engineRequest('ZF_ENGINE_ACTIVE_CHAT', {}, 6000);
      setLeadChat(r.ok ? r : null);
    } catch (e) { /* motor ainda carregando: o evento ZF_ENGINE_ACTIVE avisa depois */ }
  }

  // quiet: atualização em segundo plano (não mostra "carregando" nem atropela o que você está digitando)
  // force: a mudança foi sua (botão, Enter): redesenha mesmo com um campo em foco
  async function loadLead({ quiet = false, force = false } = {}) {
    const my = ++leadSeq;
    if (!sb || !loaded) { leadState = { status: 'idle' }; return renderLead(); }
    if (!leadChat) { leadState = { status: 'nochat' }; return renderLead(); }
    if (leadChat.isGroup) { leadState = { status: 'group' }; return renderLead(); }
    if (!quiet) { leadState = { status: 'loading' }; renderLead(); }
    try {
      const key = phoneKeyOf(leadChat.phone);
      const ors = [`wa_id.eq."${leadChat.chatId.replace(/"/g, '')}"`];
      if (key) ors.push(`phone_key.eq.${key}`);
      const { data, error } = await sb.from('leads').select(LEAD_SELECT).or(ors.join(',')).order('id').limit(3);
      if (error) throw error;
      const lead = (data || []).find((l) => key && l.phone_key === key) || (data || [])[0] || null;
      let tasks = [];
      if (lead) {
        const r = await sb.from('tasks').select('id,title,due_at,kind,status').eq('lead_id', lead.id).in('status', ['scheduled', 'sending']).order('due_at').limit(3);
        tasks = r.data || [];
      }
      if (my !== leadSeq) return;
      leadState = lead ? { status: 'lead', lead, tasks } : { status: 'none' };
      if (lead) { backfillHistory(leadChat); syncAvatar(lead, leadChat.chatId); }
    } catch (e) {
      if (my !== leadSeq) return;
      console.warn('ZapFlow: falha ao carregar o lead', e);
      const old = /column|schema|does not exist/i.test((e && e.message) || '');
      leadState = { status: 'error', message: old ? 'O banco está na versão antiga. Rode o supabase/setup.sql de novo no Supabase.' : 'Não foi possível carregar o lead. Tente de novo em instantes.' };
    }
    const box = $('zf-lead');
    const typing = quiet && !force && box && box.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) { leadDirty = true; return; }
    renderLead();
  }
  let leadDirty = false;

  function fmtDue(iso) {
    const d = new Date(iso);
    const today = new Date();
    const day = d.toDateString() === today.toDateString() ? 'Hoje'
      : d.toDateString() === new Date(today.getTime() + 86400000).toDateString() ? 'Amanhã'
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
    return `${day}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function leadEmpty(title, text, extra) {
    return `<div class="zf-empty"><b>${escapeHtml(title)}</b><span>${escapeHtml(text)}</span>${extra || ''}</div>`;
  }

  function renderLead() {
    const box = $('zf-lead');
    if (!box) return;
    leadDirty = false;
    const st = leadState.status;
    const dot = $('zf-lead-dot');
    if (dot) dot.hidden = st !== 'lead';
    const openBtn = $('zf-lead-open');
    if (openBtn) openBtn.hidden = st !== 'lead';
    const foot = $('zf-lead-foot');
    if (foot) foot.textContent = st === 'lead' && leadState.lead.last_contact_at ? 'Último contato: ' + fmtDue(leadState.lead.last_contact_at) : '';

    if (st === 'idle' || st === 'loading') { box.innerHTML = '<div class="zf-skel"></div><div class="zf-skel"></div><div class="zf-skel"></div>'; return; }
    if (st === 'nochat') { box.innerHTML = leadEmpty('Abra uma conversa', 'O lead da conversa aberta aparece aqui, com etapa, etiquetas e tarefas.'); return; }
    if (st === 'group') { box.innerHTML = leadEmpty('Conversa em grupo', 'Grupos não viram leads. Abra uma conversa individual.'); return; }
    if (st === 'error') { box.innerHTML = leadEmpty('Algo deu errado', leadState.message, '<button type="button" class="zf-btn zf-empty-cta" id="zf-lead-retry">Tentar de novo</button>'); $('zf-lead-retry').onclick = () => loadLead(); return; }

    const name = st === 'lead' ? leadState.lead.name : leadChat.name;
    const phone = st === 'lead' ? (leadState.lead.phone || leadChat.phone) : leadChat.phone;
    const photo = st === 'lead' && /^https:\/\//.test(leadState.lead.avatar || '') ? leadState.lead.avatar : '';
    const photoBlob = photo ? avatarBlobs.get(photo) : '';
    const head = `
      <div class="zf-lead-head">
        <span class="zf-avatar" id="zf-lead-avatar">${photoBlob ? `<img src="${escapeHtml(photoBlob)}" alt="">` : escapeHtml(initialsOf(name))}</span>
        <div class="zf-lead-id"><b>${escapeHtml(name)}</b><span class="zf-mm">${phone ? escapeHtml(fmtPhone(phone)) : 'Número escondido pelo WhatsApp'}</span></div>
      </div>`;

    if (photo && !photoBlob) paintLeadAvatar(photo);

    if (st === 'none') {
      const col = inboxColumn();
      const blockLabel = blockingLabelOf(leadChat.labels);
      box.innerHTML = `${head}
        ${blockLabel ? `<p class="zf-lead-block">Tem a etiqueta “${escapeHtml(blockLabel.name)}” no WhatsApp: a captura automática ignora este contato.</p>` : ''}
        <p class="zf-lead-note">Este contato ainda não é um lead.</p>
        <button type="button" class="zf-btn-primary" id="zf-lead-save">Salvar como lead</button>
        <p class="zf-about zf-lead-where">${col ? 'Entra em ' + escapeHtml(stageLabel(col)) + '.' : 'Fica em Leads (você ainda não tem quadro no Kanban).'}</p>`;
      $('zf-lead-save').onclick = saveAsLead;
      return;
    }

    // ----- é lead -----
    const L = leadState.lead;
    const cards = L.kanban_cards || [];
    const applied = new Set((L.lead_tags || []).map((t) => t.tag_id));
    const tags = crm.tags.filter((t) => applied.has(t.id));
    const free = crm.tags.filter((t) => !applied.has(t.id));
    const boardsWithout = crm.boards.filter((b) => !cards.some((c) => c.board_id === b.id) && crm.columns.some((c) => c.board_id === b.id));
    const blocking = tags.find((t) => t.is_blocking);

    const cardRows = cards.map((c) => {
      const b = crm.boards.find((x) => x.id === c.board_id);
      const cols = crm.columns.filter((x) => x.board_id === c.board_id);
      return `<label class="zf-lead-field"><span>${escapeHtml(b ? b.title : 'Quadro')}</span>
        <select data-zf-card="${c.id}" aria-label="Etapa em ${escapeHtml(b ? b.title : 'quadro')}">${cols.map((x) => `<option value="${x.id}"${x.id === c.column_id ? ' selected' : ''}>${escapeHtml(x.title)}</option>`).join('')}</select></label>`;
    }).join('');
    const addCard = boardsWithout.length ? `
      <div class="zf-lead-row">
        <select id="zf-lead-addcol" aria-label="Colocar em">${boardsWithout.map((b) => `<optgroup label="${escapeHtml(b.title)}">${crm.columns.filter((c) => c.board_id === b.id).map((c) => `<option value="${c.id}">${escapeHtml(b.title + ' › ' + c.title)}</option>`).join('')}</optgroup>`).join('')}</select>
        <button type="button" class="zf-btn" id="zf-lead-addcard">${cards.length ? 'Pôr' : 'Colocar'}</button>
      </div>` : '';

    box.innerHTML = `${head}
      <h3 class="zf-lead-h">Temperatura</h3>
      <div class="zf-temp" role="group" aria-label="Temperatura">${TEMP_OPTS.map(([v, l, ic]) => `<button type="button" data-zf-temp="${v}" aria-pressed="${L.status === v}">${window._zfSVG[ic]}<span>${l}</span></button>`).join('')}</div>

      ${blocking ? `<p class="zf-lead-block">Ignorado pela etiqueta “${escapeHtml(blocking.name)}”: não é capturado, não entra no Kanban e não guarda histórico. Tire a etiqueta para voltar ao normal.</p>` : `
      <h3 class="zf-lead-h">Kanban</h3>
      ${cardRows || (crm.boards.length ? '<p class="zf-lead-note">Fora do Kanban.</p>' : '<p class="zf-lead-note">Crie um quadro no Kanban do painel para acompanhar por etapa.</p>')}
      ${addCard}`}

      <h3 class="zf-lead-h">Etiquetas</h3>
      <div class="zf-tagrow">${tags.map((t) => `<span class="zf-tag"${t.wa_label_id ? ' title="Ligada à etiqueta do WhatsApp"' : ''}><i style="background:${escapeHtml(t.color)}"></i>${escapeHtml(t.name)}<button type="button" data-zf-untag="${t.id}" aria-label="Tirar a etiqueta ${escapeHtml(t.name)}">${window._zfSVG.close}</button></span>`).join('') || '<span class="zf-lead-note">Nenhuma etiqueta.</span>'}</div>
      <div class="zf-lead-row">
        <input id="zf-lead-tag" list="zf-lead-taglist" placeholder="Adicionar etiqueta" aria-label="Adicionar etiqueta" autocomplete="off">
        <datalist id="zf-lead-taglist">${free.map((t) => `<option value="${escapeHtml(t.name)}"></option>`).join('')}</datalist>
        <button type="button" class="zf-btn" id="zf-lead-tag-add">Pôr</button>
      </div>

      <h3 class="zf-lead-h">Observações <small id="zf-lead-notes-st" aria-live="polite"></small></h3>
      <textarea id="zf-lead-notes" rows="3" placeholder="O que é importante lembrar sobre este lead?" aria-label="Observações">${escapeHtml(L.notes || '')}</textarea>

      <h3 class="zf-lead-h">Próximas tarefas</h3>
      ${leadState.tasks.length ? leadState.tasks.map((t) => `<div class="zf-lead-task">${window._zfSVG[t.kind === 'send' ? 'clock' : 'calendar']}<span><b>${escapeHtml(t.title)}</b><small>${new Date(t.due_at).getTime() < Date.now() ? 'Atrasada · ' : ''}${fmtDue(t.due_at)}</small></span></div>`).join('') : '<p class="zf-lead-note">Nenhuma tarefa em aberto.</p>'}
      ${L.last_message ? `<h3 class="zf-lead-h">Última mensagem recebida</h3><p class="zf-lead-last">${escapeHtml(L.last_message)}</p>` : ''}`;

    box.querySelectorAll('[data-zf-temp]').forEach((b) => { b.onclick = () => leadUpdate({ status: b.dataset.zfTemp }); });
    box.querySelectorAll('[data-zf-card]').forEach((s) => { s.onchange = () => moveCard(Number(s.dataset.zfCard), Number(s.value)); });
    if ($('zf-lead-addcard')) $('zf-lead-addcard').onclick = () => addLeadCard(Number($('zf-lead-addcol').value));
    box.querySelectorAll('[data-zf-untag]').forEach((b) => { b.onclick = () => untagLead(Number(b.dataset.zfUntag)); });
    const tagInput = $('zf-lead-tag');
    const addTag = () => { const v = tagInput.value.trim(); if (v) tagLead(v); };
    $('zf-lead-tag-add').onclick = addTag;
    tagInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } };
    const notes = $('zf-lead-notes');
    notes.onblur = () => { saveNotes(notes.value); if (leadDirty) setTimeout(renderLead, 0); };
    // o Agente (agent.js) pendura o cartão dele no topo da aba
    if (window.ZF_AGENT && window.ZF_AGENT.onLeadRender) { try { window.ZF_AGENT.onLeadRender(box); } catch (e) { console.warn('ZapFlow agente:', e); } }
  }

  async function leadAction(fn, okMsg) {
    try {
      await fn();
      if (okMsg) showToast(okMsg);
    } catch (e) {
      console.warn('ZapFlow lead:', e);
      showToast('Não foi possível salvar: ' + ((e && e.message) || 'erro'));
    }
    const refocus = document.activeElement && document.activeElement.id === 'zf-lead-tag';
    await loadLead({ quiet: true, force: true });
    if (refocus) $('zf-lead-tag')?.focus(); // dá para pôr várias etiquetas seguidas
  }

  function leadUpdate(patch, okMsg) {
    const id = leadState.lead && leadState.lead.id;
    if (!id) return;
    return leadAction(async () => { const { error } = await sb.from('leads').update(patch).eq('id', id); if (error) throw error; }, okMsg);
  }

  async function nextPos(columnId) {
    const { data } = await sb.from('kanban_cards').select('position').eq('column_id', columnId).order('position', { ascending: false }).limit(1);
    return data && data[0] ? Number(data[0].position) + 1 : 0;
  }

  function moveCard(cardId, columnId) {
    const col = crm.columns.find((c) => c.id === columnId);
    return leadAction(async () => {
      const { error } = await sb.from('kanban_cards').update({ column_id: columnId, position: await nextPos(columnId) }).eq('id', cardId);
      if (error) throw error;
    }, col ? 'Movido para ' + col.title : null);
  }

  function addLeadCard(columnId) {
    const col = crm.columns.find((c) => c.id === columnId);
    const lead = leadState.lead;
    if (!col || !lead) return;
    return leadAction(async () => {
      const { error } = await sb.from('kanban_cards').insert({ lead_id: lead.id, board_id: col.board_id, column_id: col.id, position: await nextPos(col.id), user_id: await userId() });
      if (error) throw error;
    }, 'Colocado em ' + stageLabel(col));
  }

  // Põe a etiqueta num lead qualquer (o da conversa aberta ou, para o agente, outro). chatId = conversa do lead.
  async function applyTagTo(lead, name, chatId) {
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    let tag = crm.tags.find((t) => norm(t.name) === norm(name));
    const uid = await userId();
    if (!tag) {
      const { data, error } = await sb.from('tags').insert({ name: name.trim().replace(/\s+/g, ' '), color: TAG_COLORS[(crm.tags.length + 1) % TAG_COLORS.length], user_id: uid }).select('id,name,color').single();
      if (error) throw error;
      tag = data;
      crm.tags = [...crm.tags, tag].sort((a, b) => a.name.localeCompare(b.name));
    }
    const { error } = await sb.from('lead_tags').upsert({ lead_id: lead.id, tag_id: tag.id, user_id: uid }, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true });
    if (error) throw error;
    await mirrorLabel(tag, true, chatId);
  }

  function tagLead(name) {
    const lead = leadState.lead;
    if (!lead) return;
    return leadAction(() => applyTagTo(lead, name, leadChat && leadChat.chatId));
  }

  // Põe o lead numa etapa (move o card do quadro dela, ou cria o card). Não depende da conversa aberta.
  async function setLeadStage(lead, columnId) {
    const col = crm.columns.find((c) => c.id === columnId);
    if (!col) throw new Error('Etapa não existe mais.');
    const card = (lead.kanban_cards || []).find((c) => c.board_id === col.board_id);
    if (card) {
      if (card.column_id === columnId) return;
      const { error } = await sb.from('kanban_cards').update({ column_id: columnId, position: await nextPos(columnId) }).eq('id', card.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('kanban_cards').insert({ lead_id: lead.id, board_id: col.board_id, column_id: col.id, position: await nextPos(col.id), user_id: await userId() });
      if (error) throw error;
    }
  }

  function untagLead(tagId) {
    const lead = leadState.lead;
    if (!lead) return;
    return leadAction(async () => {
      const { error } = await sb.from('lead_tags').delete().eq('lead_id', lead.id).eq('tag_id', tagId);
      if (error) throw error;
      await mirrorLabel(crm.tags.find((t) => t.id === tagId), false);
    });
  }

  async function saveNotes(text) {
    const lead = leadState.lead;
    if (!lead || (lead.notes || '') === text) return;
    const st = $('zf-lead-notes-st');
    const { error } = await sb.from('leads').update({ notes: text.trim() || null }).eq('id', lead.id);
    if (error) { showToast('Não foi possível salvar as observações.'); return; }
    lead.notes = text.trim() || null;
    if (st) { st.textContent = 'Salvo'; setTimeout(() => { if (st.isConnected) st.textContent = ''; }, 1800); }
  }

  async function saveAsLead() {
    if (!leadChat || !sb) return;
    const btn = $('zf-lead-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    const { data, error } = await sb.rpc('zf_capture_lead', { p_name: leadChat.name, p_phone: leadChat.phone, p_wa_id: leadChat.chatId, p_message: null, p_create: true });
    if (error) {
      console.warn('ZapFlow: falha ao salvar lead', error);
      showToast(/function|schema/i.test(error.message || '') ? 'Rode o supabase/setup.sql de novo para salvar leads.' : 'Não foi possível salvar o lead.');
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar como lead'; }
      return;
    }
    showToast(data && data.stage ? `Lead salvo em ${data.stage}` : 'Lead salvo');
    backfillHistory(leadChat, true);
    if (data && data.lead_id) syncAvatar({ id: data.lead_id, avatar: null, lead_tags: [] }, leadChat.chatId);
    loadLead();
  }

  // ===== FOTO DE PERFIL DOS LEADS =====
  // O WhatsApp entrega o endereço da foto (que expira em poucos dias): a extensão baixa, reduz para 96 px
  // (uns 5 KB) e guarda uma cópia na pasta da conta no Supabase; o endereço da cópia vai em leads.avatar,
  // com ?v=<hora> para saber a idade. Atualiza a cada 30 dias. Quem não tem foto (ou esconde pela privacidade)
  // é anotado e só é consultado de novo depois de 14 dias. Contatos com etiqueta de ignorar nunca.
  const AVATAR_BUCKET = 'campaign_files';
  const AVATAR_TTL = 30 * 86400000;
  const AVATAR_MISS_KEY = 'zf_avatar_miss';
  let avatarMiss = {};          // "<usuário>:<lead>" -> até quando não perguntar de novo
  let avatarMissLoaded = false;
  const avatarBusy = new Set();

  async function loadAvatarMiss() {
    if (avatarMissLoaded) return;
    avatarMissLoaded = true;
    try { avatarMiss = (await chrome.storage.local.get(AVATAR_MISS_KEY))[AVATAR_MISS_KEY] || {}; } catch (e) { avatarMiss = {}; }
    const now = Date.now();
    for (const k of Object.keys(avatarMiss)) if (avatarMiss[k] < now) delete avatarMiss[k];
  }
  function saveAvatarMiss() { try { chrome.storage.local.set({ [AVATAR_MISS_KEY]: avatarMiss }); } catch (e) { /* sem storage */ } }
  const avatarAge = (url) => { const m = /[?&]v=(\d+)/.exec(url || ''); return m ? Date.now() - Number(m[1]) : Infinity; };
  const avatarNeeded = (lead) => !lead.avatar || avatarAge(lead.avatar) > AVATAR_TTL;
  const isBlockedLead = (lead) => (lead.lead_tags || []).some((x) => (crm.tags.find((t) => t.id === x.tag_id) || {}).is_blocking);

  // O WhatsApp Web só deixa a página carregar imagens de endereços da lista dele (CSP), então a foto
  // do Supabase não pode ir direto no <img>: baixa (como as miniaturas dos itens) e mostra como blob:.
  // Até chegar, ficam as iniciais; se não carregar, também.
  const avatarBlobs = new Map(); // endereço da foto -> blob:
  async function paintLeadAvatar(url) {
    try {
      const blob = await getBlobUrl(url);
      avatarBlobs.set(url, blob);
      const el = $('zf-lead-avatar');
      if (!el || !el.isConnected || !leadState.lead || leadState.lead.avatar !== url) return;
      const img = new Image();
      img.alt = '';
      img.onload = () => { if (el.isConnected) { el.textContent = ''; el.appendChild(img); } };
      img.src = blob;
    } catch (e) { /* sem foto: ficam as iniciais */ }
  }

  // Depois de recarregar/atualizar a extensão, o script que ficou na aba do WhatsApp perde a ligação com ela
  // ("Extension context invalidated"). Ele não consegue mais nada: só para, sem barulho e sem anotar falha.
  const extDead = () => { try { return !(chrome.runtime && chrome.runtime.id); } catch (e) { return true; } };

  function fetchAvatarBlob(url) {
    return new Promise((resolve, reject) => {
      if (extDead()) return reject(new Error('Extension context invalidated'));
      try {
        chrome.runtime.sendMessage({ type: 'ZAPFLOW_FETCH_AVATAR', url }, (r) => {
          if (chrome.runtime.lastError || !r || !r.success) return reject(new Error((r && r.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'sem resposta'));
          const img = new Image();
          img.onload = () => {
            try {
              const S = 96, side = Math.min(img.naturalWidth, img.naturalHeight);
              if (!side) return reject(new Error('imagem vazia'));
              const c = document.createElement('canvas');
              c.width = c.height = S;
              c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
              c.toBlob((b) => (b ? resolve(b) : reject(new Error('não deu para reduzir'))), 'image/jpeg', 0.78);
            } catch (e) { reject(e); }
          };
          img.onerror = () => reject(new Error('imagem inválida'));
          img.src = r.base64;
        });
      } catch (e) { reject(e); }
    });
  }

  /** Busca a foto do lead e guarda. Devolve 'ok' | 'miss' | 'skip' | 'fail'. Nunca lança. */
  async function syncAvatar(lead, chatId, opts) {
    opts = opts || {};
    try {
      if (!sb || !lead || !lead.id || !chatId || settings.avatars === false) return 'skip';
      if (!/@(c\.us|lid)$/.test(chatId)) return 'skip';
      if (isBlockedLead(lead)) return 'skip';
      if (!opts.force && !avatarNeeded(lead)) return 'skip';
      const uid = await userId();
      if (!uid) return 'skip';
      await loadAvatarMiss();
      const missKey = uid + ':' + lead.id;
      if (!opts.force && avatarMiss[missKey] > Date.now()) return 'skip';
      if (avatarBusy.has(lead.id)) return 'skip';
      avatarBusy.add(lead.id);
      try {
        const r = await engineRequest('ZF_ENGINE_AVATAR', { chatId }, 12000);
        if (!r.ok) return 'fail'; // motor ocupado ou sem carregar: tenta depois, sem anotar
        if (!r.url) { avatarMiss[missKey] = Date.now() + 14 * 86400000; saveAvatarMiss(); return 'miss'; }
        let blob;
        try { blob = await fetchAvatarBlob(r.url); }
        catch (e) {
          if (extDead() || /context invalidated/i.test((e && e.message) || '')) return 'skip';
          console.warn('ZapFlow: não foi possível baixar a foto', e && e.message); avatarMiss[missKey] = Date.now() + 86400000; saveAvatarMiss(); return 'fail'; }
        const path = `${uid}/avatars/${lead.id}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const up = await sb.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error;
        const url = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
        const { error } = await sb.from('leads').update({ avatar: url }).eq('id', lead.id);
        if (error) { await sb.storage.from(AVATAR_BUCKET).remove([path]).catch(() => {}); throw error; }
        // apaga a foto anterior (cada lead guarda uma só)
        const old = /\/campaign_files\/([^?]+)/.exec(lead.avatar || '');
        if (old) sb.storage.from(AVATAR_BUCKET).remove([decodeURIComponent(old[1])]).catch(() => {});
        lead.avatar = url;
        if (avatarMiss[missKey]) { delete avatarMiss[missKey]; saveAvatarMiss(); }
        if (leadState.lead && leadState.lead.id === lead.id) { leadState.lead.avatar = url; if (!leadDirty) renderLead(); }
        return 'ok';
      } finally { avatarBusy.delete(lead.id); }
    } catch (e) {
      if (extDead()) return 'skip';
      console.warn('ZapFlow: foto de perfil falhou', e && e.message);
      return 'fail';
    }
  }

  // Leads antigos (e fotos com mais de 30 dias): um por vez, devagar, enquanto o WhatsApp Web está aberto.
  let avatarQueue = [];
  let avatarQueueAt = 0;
  async function buildAvatarQueue() {
    avatarQueueAt = Date.now();
    const uid = await userId();
    if (!uid) return;
    await loadAvatarMiss();
    const rows = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await sb.from('leads').select('id,wa_id,phone_key,avatar,last_contact_at,lead_tags(tag_id)').order('id').range(from, from + 999);
      if (error) return;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    avatarQueue = rows
      .filter((l) => (l.wa_id || l.phone_key) && avatarNeeded(l) && !isBlockedLead(l) && !(avatarMiss[uid + ':' + l.id] > Date.now()))
      .sort((a, b) => String(b.last_contact_at || '').localeCompare(String(a.last_contact_at || '')) || b.id - a.id);
  }
  async function avatarTick() {
    if (extDead()) return; // script órfão (extensão recarregada): para o ciclo
    let wait = 60000;
    try {
      if (sb && loaded && settings.avatars !== false && !document.hidden) {
        if (!avatarQueue.length && Date.now() - avatarQueueAt > 30 * 60000) await buildAvatarQueue();
        const lead = avatarQueue.shift();
        if (lead) {
          const r = await syncAvatar(lead, lead.wa_id || (lead.phone_key + '@c.us'));
          wait = (r === 'skip' ? 1500 : 12000) + Math.random() * 13000; // 12 a 25 s entre uma consulta e outra
        }
      }
    } catch (e) { /* tenta no próximo ciclo */ }
    setTimeout(avatarTick, wait);
  }
  setTimeout(avatarTick, 60000);

  // ----- Captura automática (mensagem recebida) -----
  const seenLeadMsgs = new Set();
  const lastCapture = new Map(); // chatId -> ms (a última mensagem é atualizada no máximo 1x por minuto)
  async function onIncomingLead(m) {
    if (!sb || !loaded || !m.msgId || !m.chatId) return;
    if (seenLeadMsgs.has(m.msgId)) return;
    seenLeadMsgs.add(m.msgId);
    if (seenLeadMsgs.size > 500) seenLeadMsgs.delete(seenLeadMsgs.values().next().value);
    const capture = settings.capture !== false;
    const create = capture && !(settings.captureSkip && m.isMyContact);
    const now = Date.now();
    if (now - (lastCapture.get(m.chatId) || 0) < 60000) return;
    lastCapture.set(m.chatId, now);
    if (!capture) return;
    const preview = m.text ? m.text : (MSG_LABEL[m.msgType] || 'Mensagem');
    const { data, error } = await sb.rpc('zf_capture_lead', { p_name: m.name, p_phone: m.phone || null, p_wa_id: m.chatId, p_message: preview, p_create: create, p_wa_labels: m.labels || null });
    if (error) { console.warn('ZapFlow: captura de lead falhou', error); return; }
    if (data && data.created) {
      showToast(`Novo lead: ${m.name}${data.stage ? ' → ' + data.stage : ''}`);
      backfillHistory({ chatId: m.chatId, phone: m.phone, isGroup: false });
      if (data.lead_id) syncAvatar({ id: data.lead_id, avatar: null, lead_tags: [] }, m.chatId);
    }
    if (leadChat && leadChat.chatId === m.chatId) loadLead({ quiet: true });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === 'ZF_ENGINE_ACTIVE') setLeadChat(e.data.chat);
    else if (e.data.type === 'ZF_ENGINE_INCOMING') onIncomingLead(e.data).catch((err) => console.warn('ZapFlow lead:', err && err.message));
  });

  // ===== IMPORTAR CONVERSAS DO WHATSAPP =====
  // Lê as conversas individuais do WhatsApp Web, mostra quantas são novas e importa em lotes de 200
  // (função zf_import_chats no banco: não duplica quem já é lead e traz as etiquetas do Business).
  const IMPORT_DAYS = [[7, '7 dias'], [30, '30 dias'], [90, '3 meses'], [365, '1 ano'], [0, 'Todas as conversas']];
  let imp = { stage: 'idle', chats: [], labels: [], isBusiness: false, known: null, error: '', progress: null, result: null,
    opts: { days: 90, contacts: true, archived: true, label: '', withLabels: true, column: 'inbox' } };

  // Sincronizar = importar de novo com os mesmos filtros, só o que mudou desde a última vez.
  // Fica guardado no navegador, por conta: os filtros escolhidos e quando foi a última sincronização.
  const SYNC_KEY = 'zf_sync';
  const SYNC_MARGIN = 10 * 60000; // revisa também os últimos 10 min antes da última vez (relógio/atraso)
  let syncState = { uid: null, opts: null, lastAt: 0, last: null };

  async function loadSyncState() {
    let uid = null;
    try { uid = (await sb.auth.getSession()).data.session?.user?.id || null; } catch (e) { /* sem sessão */ }
    let saved = null;
    try { saved = (await chrome.storage.local.get(SYNC_KEY))[SYNC_KEY]; } catch (e) { /* sem storage */ }
    syncState = saved && saved.uid === uid ? saved : { uid, opts: null, lastAt: 0, last: null };
    if (syncState.opts) Object.assign(imp.opts, syncState.opts);
  }
  function saveSyncState() {
    try { chrome.storage.local.set({ [SYNC_KEY]: syncState }); } catch (e) { /* sem storage */ }
  }

  async function openImport() {
    toggleSidebar(true);
    switchTab('importar');
    if (imp.stage === 'scanning' || imp.stage === 'importing') return;
    if (!sb || !loaded) { imp.stage = 'error'; imp.error = 'Entre na sua conta primeiro.'; return renderImport(); }
    await loadSyncState();
    // já sincronizou antes: mostra o resumo e o botão de um clique; senão, a escolha dos filtros
    if (syncState.lastAt) { imp.stage = 'home'; renderImport(); } else scanChats();
  }

  // Um clique: lê as conversas e sincroniza na hora com os filtros salvos (sem tela de prévia).
  async function quickSync() {
    await scanChats({ quiet: true });
    if (imp.stage !== 'ready') return;
    const since = syncState.lastAt - SYNC_MARGIN;
    // quem ainda não é lead + quem já é lead e conversou desde a última vez (o resto não mudou)
    const list = importList().filter((c) => !isKnown(c) || (c.t && c.t >= since));
    if (!list.length) {
      syncState.lastAt = imp.scannedAt;
      syncState.last = { created: 0, existing: 0, tagged: 0, cards: 0, skipped: 0 };
      saveSyncState();
      imp.stage = 'done';
      imp.result = syncState.last;
      return renderImport();
    }
    return runImport(list);
  }

  function filtersText() {
    const o = imp.opts;
    const days = (IMPORT_DAYS.find(([v]) => v === o.days) || [0, 'Todas as conversas'])[1];
    const parts = [o.days ? `Conversas dos últimos ${days}` : 'Todas as conversas'];
    if (o.label) parts.push(`só com a etiqueta “${o.labelName || 'escolhida'}”`);
    if (!o.contacts) parts.push('sem contatos salvos');
    if (!o.archived) parts.push('sem arquivadas');
    const col = o.column === 'inbox' ? inboxColumn() : crm.columns.find((c) => String(c.id) === String(o.column));
    parts.push(col ? `novos vão para ${stageLabel(col)}` : 'novos ficam só em Leads');
    return parts.join(' · ');
  }

  async function knownLeads() {
    const keys = new Set(), was = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('leads').select('phone_key,wa_id').range(from, from + 999);
      if (error) throw error;
      for (const l of data || []) { if (l.phone_key) keys.add(l.phone_key); if (l.wa_id) was.add(l.wa_id); }
      if (!data || data.length < 1000) return { keys, was };
    }
  }

  async function scanChats({ quiet = false } = {}) {
    if (!sb || !loaded) { imp.stage = 'error'; imp.error = 'Entre na sua conta primeiro.'; return renderImport(); }
    imp.stage = 'scanning';
    imp.result = null;
    imp.quick = quiet;
    imp.scannedAt = Date.now();
    renderImport();
    try {
      const r = await engineRequest('ZF_ENGINE_LIST_CHATS', {}, 90000);
      if (!r.ok) throw new Error(r.notReady ? 'O WhatsApp ainda está carregando. Espere a lista de conversas aparecer e tente de novo.' : r.error);
      const [known] = await Promise.all([knownLeads(), loadCrm()]);
      Object.assign(imp, { stage: 'ready', chats: r.chats || [], labels: r.labels || [], isBusiness: !!r.isBusiness, known });
      if (imp.opts.label && !imp.labels.some((l) => l.id === imp.opts.label)) imp.opts.label = '';
      // a etapa salva pode ter sido apagada no painel: volta para a etapa de entrada
      if (imp.opts.column && imp.opts.column !== 'inbox' && !crm.columns.some((c) => String(c.id) === String(imp.opts.column))) imp.opts.column = 'inbox';
    } catch (e) {
      imp.stage = 'error';
      imp.error = /column|schema|function/i.test((e && e.message) || '') ? 'O banco está na versão antiga. Rode o supabase/setup.sql de novo no Supabase.' : ((e && e.message) || 'Não foi possível ler as conversas.');
    }
    renderImport();
  }

  // withBlocked: inclui as conversas com etiqueta de ignorar ("Fora"...), que nunca são importadas
  function importList(withBlocked) {
    const o = imp.opts;
    const since = o.days ? Date.now() - o.days * 86400000 : 0;
    return imp.chats.filter((c) => (!since || c.t >= since) && (o.contacts || !c.isMyContact) && (o.archived || !c.archived)
      && (!o.label || (c.labels || []).includes(o.label)) && (withBlocked || !blockingLabelOf(c.labels)));
  }
  function isKnown(c) {
    const k = phoneKeyOf(c.phone);
    return !!imp.known && ((k && imp.known.keys.has(k)) || imp.known.was.has(c.chatId));
  }
  function importColumnId() {
    if (imp.opts.column === 'inbox') { const c = inboxColumn(); return c ? c.id : null; }
    return Number(imp.opts.column) || null;
  }

  function setRow(id, label, hint, checked) {
    return `<div class="zf-set"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><label class="zf-switch"><input type="checkbox" id="${id}" aria-label="${label}"${checked ? ' checked' : ''}><span></span></label></div>`;
  }

  function renderImport() {
    const box = $('zf-import');
    if (!box) return;
    if (imp.stage === 'idle' || imp.stage === 'scanning') {
      box.innerHTML = `<p class="zf-lead-note">${imp.quick ? 'Sincronizando… lendo suas conversas do WhatsApp.' : 'Lendo suas conversas do WhatsApp…'}</p><div class="zf-skel"></div><div class="zf-skel"></div><div class="zf-skel"></div>`;
      return;
    }
    if (imp.stage === 'home') {
      const r = syncState.last;
      const res = r ? (r.created || r.existing ? `${r.created} ${r.created === 1 ? 'lead novo' : 'leads novos'} · ${r.existing} ${r.existing === 1 ? 'atualizado' : 'atualizados'}` : 'Nada novo naquela vez') : '';
      box.innerHTML = `
        <div class="zf-sync-card">
          <small>Última sincronização</small>
          <b>${escapeHtml(fmtDue(new Date(syncState.lastAt).toISOString()))}</b>
          ${res ? `<span>${res}</span>` : ''}
          <span class="zf-sync-filters">${escapeHtml(filtersText())}</span>
        </div>
        <button type="button" class="zf-btn-primary" id="zf-sync-go">${window._zfSVG.retry}<span>Sincronizar agora</span></button>
        <button type="button" class="zf-btn zf-btn-wide" id="zf-sync-edit">Mudar filtros</button>
        <p class="zf-about" style="margin-top:12px">Traz quem conversou com você desde a última vez e atualiza quem já é lead (último contato e etiquetas). Pode repetir quantas vezes quiser: ninguém é duplicado. Grupos e contatos com etiqueta de ignorar não entram.</p>`;
      $('zf-sync-go').onclick = quickSync;
      $('zf-sync-edit').onclick = () => scanChats();
      return;
    }
    if (imp.stage === 'error') {
      box.innerHTML = `<div class="zf-imp-err" role="alert">${escapeHtml(imp.error)}</div><button type="button" class="zf-btn" id="zf-imp-retry">Tentar de novo</button>`;
      $('zf-imp-retry').onclick = () => (syncState.lastAt ? quickSync() : scanChats());
      return;
    }
    if (imp.stage === 'importing') {
      const p = imp.progress || { done: 0, total: 1 };
      box.innerHTML = `<p class="zf-lead-note">Sincronizando… não feche o WhatsApp.</p><div class="zf-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}"><i style="width:${Math.round((p.done / Math.max(1, p.total)) * 100)}%"></i></div><p class="zf-about">${p.done} de ${p.total} conversas</p>`;
      return;
    }
    if (imp.stage === 'done') {
      const r = imp.result;
      const nothing = !r.created && !r.existing;
      box.innerHTML = (nothing
        ? `<div class="zf-imp-done zf-imp-none" role="status"><b>Tudo em dia</b>Ninguém novo conversou com você desde a última sincronização.</div>`
        : `<div class="zf-imp-done" role="status"><b>Sincronização concluída</b>${r.created} ${r.created === 1 ? 'lead novo' : 'leads novos'}${r.cards ? ` · ${r.cards} no Kanban` : ''}<br>${r.existing} ${r.existing === 1 ? 'lead atualizado' : 'leads atualizados'}${r.tagged ? ` · ${r.tagged} etiquetas aplicadas` : ''}${r.skipped ? `<br>${r.skipped} sem número nem conversa válida foram pulados` : ''}</div>`)
        + `<button type="button" class="zf-btn-primary" id="zf-imp-panel">Ver no painel</button>
        <button type="button" class="zf-btn zf-btn-wide" id="zf-imp-again">Voltar</button>`;
      $('zf-imp-panel').onclick = () => openPanel('/dashboard/leads');
      $('zf-imp-again').onclick = () => { imp.stage = 'home'; renderImport(); };
      return;
    }

    // ----- pronto para importar -----
    const o = imp.opts;
    const inbox = inboxColumn();
    const colOptions = crm.boards.map((b) => {
      const cols = crm.columns.filter((c) => c.board_id === b.id);
      return cols.length ? `<optgroup label="${escapeHtml(b.title)}">${cols.map((c) => `<option value="${c.id}"${String(o.column) === String(c.id) ? ' selected' : ''}>${escapeHtml(b.title + ' › ' + c.title)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    box.innerHTML = `
      <h3 class="zf-lead-h" style="margin-top:4px">Quais conversas</h3>
      <label class="zf-lead-field"><span>Com mensagens nos últimos</span>
        <select id="zf-imp-days">${IMPORT_DAYS.map(([v, l]) => `<option value="${v}"${o.days === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${imp.labels.length ? `<label class="zf-lead-field"><span>Etiqueta do WhatsApp</span>
        <select id="zf-imp-label"><option value="">Com ou sem etiqueta</option>${imp.labels.map((l) => `<option value="${escapeHtml(l.id)}"${o.label === l.id ? ' selected' : ''}>Só “${escapeHtml(l.name)}”${l.count ? ` (${l.count})` : ''}</option>`).join('')}</select></label>` : ''}
      ${setRow('zf-imp-contacts', 'Incluir contatos salvos na agenda', '', o.contacts)}
      ${setRow('zf-imp-archived', 'Incluir conversas arquivadas', '', o.archived)}
      <div class="zf-imp-sum" id="zf-imp-sum"></div>

      <h3 class="zf-lead-h">Leads novos vão para</h3>
      <select id="zf-imp-col" aria-label="Etapa do Kanban">
        ${inbox ? `<option value="inbox"${o.column === 'inbox' ? ' selected' : ''}>Etapa de entrada (${escapeHtml(stageLabel(inbox))})</option>` : ''}
        <option value=""${!o.column || (o.column === 'inbox' && !inbox) ? ' selected' : ''}>Só em Leads (fora do Kanban)</option>
        ${colOptions}
      </select>
      ${imp.labels.length ? setRow('zf-imp-tags', 'Trazer as etiquetas do WhatsApp', 'Viram etiquetas do seu painel e ficam ligadas às do WhatsApp.', o.withLabels) : ''}

      <button type="button" class="zf-btn-primary" id="zf-imp-go" style="margin-top:16px"></button>
      <p class="zf-about" style="margin-top:8px">Quem já é lead não é duplicado: só ganha a conversa, o último contato e as etiquetas. Grupos não entram. Os filtros ficam salvos: da próxima vez é só clicar em Sincronizar agora.</p>
      <ul class="zf-imp-list" id="zf-imp-list" aria-label="Conversas que serão importadas"></ul>`;

    const days = $('zf-imp-days'); days.onchange = () => { o.days = Number(days.value); renderImportSummary(); };
    if ($('zf-imp-label')) $('zf-imp-label').onchange = (e) => { o.label = e.target.value; o.labelName = (imp.labels.find((l) => l.id === o.label) || {}).name || ''; renderImportSummary(); };
    $('zf-imp-contacts').onchange = (e) => { o.contacts = e.target.checked; renderImportSummary(); };
    $('zf-imp-archived').onchange = (e) => { o.archived = e.target.checked; renderImportSummary(); };
    $('zf-imp-col').onchange = (e) => { o.column = e.target.value; };
    if ($('zf-imp-tags')) $('zf-imp-tags').onchange = (e) => { o.withLabels = e.target.checked; };
    $('zf-imp-go').onclick = runImport;
    renderImportSummary();
  }

  function renderImportSummary() {
    const list = importList();
    const fresh = list.filter((c) => !isKnown(c));
    const ignored = importList(true).length - list.length;
    const sum = $('zf-imp-sum');
    if (sum) sum.innerHTML = `<b>${list.length} ${list.length === 1 ? 'conversa' : 'conversas'}</b><span>${fresh.length} ${fresh.length === 1 ? 'nova' : 'novas'} · ${list.length - fresh.length} já ${list.length - fresh.length === 1 ? 'é lead' : 'são leads'}${ignored ? ` · ${ignored} com etiqueta de ignorar (fica${ignored === 1 ? '' : 'm'} de fora)` : ''}</span>`;
    const go = $('zf-imp-go');
    if (go) { go.disabled = !list.length; go.textContent = list.length ? `Sincronizar ${list.length} ${list.length === 1 ? 'conversa' : 'conversas'}` : 'Nenhuma conversa com esses filtros'; }
    const ul = $('zf-imp-list');
    if (ul) {
      const shown = list.slice(0, 60);
      ul.innerHTML = shown.map((c) => `<li><span>${escapeHtml(c.name)}</span><small>${c.phone ? escapeHtml(fmtPhone(c.phone)) : 'número escondido'}</small>${isKnown(c) ? '<em>já é lead</em>' : ''}</li>`).join('')
        + (list.length > shown.length ? `<li><small>e mais ${list.length - shown.length}…</small></li>` : '');
      ul.hidden = !list.length;
    }
  }

  async function runImport(given) {
    const list = Array.isArray(given) ? given : importList();
    if (!list.length) return;
    const startedAt = imp.scannedAt || Date.now();
    const labels = imp.opts.withLabels ? imp.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })) : [];
    const columnId = importColumnId();
    const total = { created: 0, existing: 0, tagged: 0, cards: 0, skipped: 0 };
    imp.stage = 'importing';
    imp.progress = { done: 0, total: list.length };
    renderImport();
    try {
      for (let i = 0; i < list.length; i += 200) {
        const chats = list.slice(i, i + 200).map((c) => ({
          wa_id: c.chatId, phone: c.phone || null, name: c.name,
          last_at: c.t ? new Date(c.t).toISOString() : null,
          labels: imp.opts.withLabels ? (c.labels || []) : [],
        }));
        const { data, error } = await sb.rpc('zf_import_chats', { p_chats: chats, p_labels: labels, p_column_id: columnId });
        if (error) throw error;
        for (const k of Object.keys(total)) total[k] += Number(data && data[k]) || 0;
        imp.progress = { done: Math.min(list.length, i + 200), total: list.length };
        renderImport();
      }
      imp.stage = 'done';
      imp.result = total;
      // guarda os filtros e a hora: a próxima sincronização olha só o que mudou desde agora
      syncState.lastAt = startedAt;
      syncState.last = total;
      syncState.opts = { ...imp.opts };
      saveSyncState();
      showToast(total.created ? `${total.created} ${total.created === 1 ? 'lead novo' : 'leads novos'}` : 'Conversas sincronizadas');
    } catch (e) {
      console.warn('ZapFlow: importação falhou', e);
      imp.stage = 'error';
      imp.error = (total.created ? `Parou no meio (${total.created} já entraram; pode sincronizar de novo sem duplicar). ` : '') + (/function|schema/i.test((e && e.message) || '') ? 'Rode o supabase/setup.sql de novo no Supabase.' : ((e && e.message) || 'Erro desconhecido.'));
    }
    renderImport();
    loadCrm().then(() => loadLead({ quiet: true }));
  }

  // ===== ETIQUETAS SINCRONIZADAS COM O WHATSAPP BUSINESS =====
  // No WhatsApp -> ZapFlow: o motor avisa quando você etiqueta uma conversa (ZF_ENGINE_LABEL_CHANGE).
  // No ZapFlow -> WhatsApp: pela aba Lead, ao pôr/tirar uma etiqueta ligada (tags.wa_label_id).
  async function onLabelChange(ev) {
    if (!sb || !loaded || settings.labelSync === false || !ev.chat || ev.chat.isGroup || !(ev.labels || []).length) return;
    try {
      for (const l of ev.labels) {
        if (ev.change === 'remove') {
          const { error } = await sb.rpc('zf_untag_chat', { p_phone: ev.chat.phone || null, p_wa_id: ev.chat.chatId, p_wa_label_id: l.id });
          if (error) throw error;
        } else {
          const col = inboxColumn();
          const { data, error } = await sb.rpc('zf_import_chats', {
            p_chats: [{ wa_id: ev.chat.chatId, phone: ev.chat.phone || null, name: ev.chat.name, last_at: null, labels: [l.id] }],
            p_labels: [{ id: l.id, name: l.name, color: l.color }],
            p_column_id: col ? col.id : null,
            p_fire: true, // etiquetar uma conversa é uma ação sua: gatilhos de "etiqueta" e "lead novo" valem
          });
          if (error) throw error;
          if (data && data.created) showToast(`Novo lead: ${ev.chat.name} (etiqueta ${l.name})`);
        }
      }
    } catch (e) { console.warn('ZapFlow: sincronizar etiqueta falhou', e); return; }
    await loadCrm();
    if (leadChat && leadChat.chatId === ev.chat.chatId) loadLead({ quiet: true });
  }

  // Espelha no WhatsApp a etiqueta posta/tirada pela aba Lead (só se ela estiver ligada e a conversa aberta for do lead)
  async function mirrorLabel(tag, add, chatId) {
    const target = chatId || (leadChat && !leadChat.isGroup ? leadChat.chatId : null);
    if (settings.labelSync === false || !tag || !tag.wa_label_id || !target) return;
    try {
      const r = await engineRequest('ZF_ENGINE_SET_LABEL', { chatId: target, labelId: tag.wa_label_id, add }, 15000);
      if (!r.ok && !/Business/.test(r.error || '')) showToast('A etiqueta mudou aqui, mas não no WhatsApp: ' + r.error);
    } catch (e) { /* motor ocupado: fica só no ZapFlow */ }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'ZF_ENGINE_LABEL_CHANGE') return;
    onLabelChange(e.data).catch((err) => console.warn('ZapFlow etiqueta:', err && err.message));
  });

  // ===== HISTÓRICO DE CONVERSAS (opcional) =====
  // Com "Guardar histórico" ligado, as mensagens das conversas com leads (recebidas e enviadas, por você
  // ou pelo ZapFlow) vão para o banco (zf_log_messages: últimas 50 por lead, 90 dias) e aparecem na
  // ficha do lead no painel. Ao abrir a conversa de um lead, as mensagens recentes também são trazidas.
  const historyQueue = new Map(); // chatId -> { phone, msgs: Map(id -> msg) }
  let historyTimer = null;
  const backfilled = new Set();

  function queueHistory(chat, msg) {
    if (settings.history !== true || !sb || !loaded || !chat || !chat.chatId || chat.isGroup || !msg || !msg.id) return;
    let q = historyQueue.get(chat.chatId);
    if (!q) { q = { phone: chat.phone || null, msgs: new Map() }; historyQueue.set(chat.chatId, q); }
    q.msgs.set(msg.id, Object.assign({}, q.msgs.get(msg.id), msg));
    // junta as mensagens de alguns segundos numa ida só ao banco
    if (!historyTimer) historyTimer = setTimeout(flushHistory, 2500);
  }

  async function flushHistory() {
    historyTimer = null;
    const batch = [...historyQueue.entries()];
    historyQueue.clear();
    for (const [chatId, q] of batch) {
      const { error } = await sb.rpc('zf_log_messages', { p_phone: q.phone, p_wa_id: chatId, p_msgs: [...q.msgs.values()] });
      if (error) console.warn('ZapFlow: histórico não gravado', error);
    }
  }

  // Traz as mensagens recentes da conversa (uma vez por conversa enquanto a página estiver aberta)
  async function backfillHistory(chat, force) {
    if (settings.history !== true || !sb || !chat || chat.isGroup) return;
    if (backfilled.has(chat.chatId) && !force) return;
    backfilled.add(chat.chatId);
    try {
      const r = await engineRequest('ZF_ENGINE_CHAT_HISTORY', { chatId: chat.chatId, count: 50 }, 20000);
      if (!r.ok || !(r.messages || []).length) return;
      const { error } = await sb.rpc('zf_log_messages', { p_phone: chat.phone || null, p_wa_id: chat.chatId, p_msgs: r.messages });
      if (error) throw error;
    } catch (e) {
      backfilled.delete(chat.chatId);
      console.warn('ZapFlow: não foi possível trazer o histórico', e);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data.type === 'ZF_ENGINE_OUTGOING') queueHistory(e.data.chat, e.data.msg);
    else if (e.data.type === 'ZF_ENGINE_INCOMING' && e.data.msg) {
      queueHistory({ chatId: e.data.chatId, phone: e.data.phone, isGroup: false }, e.data.msg);
    }
  });

  // Etiqueta de ignorar ("Fora", "Família"...) entre as etiquetas do WhatsApp da conversa
  function blockingLabelOf(labels) {
    const ids = new Set((labels || []).map(String));
    return crm.tags.find((t) => t.is_blocking && t.wa_label_id && ids.has(String(t.wa_label_id))) || null;
  }

  // ===== FUNIS =====
  // Disparo de funis na conversa aberta: esperas reais entre os passos, "digitando…/gravando…"
  // em cada envio e parada automática se o contato responder. Funis em conversas diferentes
  // rodam ao mesmo tempo; na mesma conversa, um espera o outro terminar.
  const STEP_TYPE = { message: 'msg', audio: 'audio', midia: 'media', document: 'doc' };
  const IGNITION_MS = 3000;     // tempo para desistir antes do primeiro envio
  const REPLY_CHECK_MS = 3000;  // de quanto em quanto tempo olha se o contato respondeu (durante as esperas)
  const LIVE = new Set(['ignition', 'queued', 'running']);
  let funnelSearch = '';
  let openFunnelId = null;
  let activeChat = null;              // conversa aberta, para o botão "Disparar para …"
  const stopReplyChoice = new Map();  // escolha feita no detalhe de cada funil (padrão = Ajustes)
  const runs = [];
  let runSeq = 0;
  let dockCollapsed = false;
  let dockTicker = null;
  let dockKey = '';
  let liveCount = -1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function itemIndex() {
    const m = new Map();
    buildItemsList().forEach((i) => m.set(i.type + ':' + i.id, i));
    return m;
  }

  function funnelSteps(f, index) {
    return (f.funnel_items || []).slice()
      .sort((a, b) => (a.position - b.position) || (a.id - b.id))
      .map((fi) => {
        const type = STEP_TYPE[fi.type] || 'msg';
        return { type, item: index.get(type + ':' + fi.item_id) || null, delayMs: ((+fi.delay_minutes || 0) * 60 + (+fi.delay_seconds || 0)) * 1000 };
      });
  }

  // Duração aproximada: esperas + digitando/gravando de cada passo
  function estimateMs(steps) {
    return steps.reduce((t, s) => {
      if (!s.item) return t + s.delayMs;
      const presence = s.type === 'msg' ? Math.min(Math.max((s.item.content || '').length * 55, 1500), 9000)
        : s.type === 'audio' ? Math.min(Math.max((durationCache.get(s.item.url) || 6) * 1000, 2000), 15000) : 3000;
      return t + s.delayMs + presence + 1000;
    }, 0);
  }

  function fmtLong(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + ' s';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + ' h' + (m ? ' ' + m + ' min' : '');
    return m + ' min' + (r && m < 10 ? ' ' + r + ' s' : '');
  }

  // ----- Aba Funis -----
  function renderFunnels() {
    const list = $('zf-funnel-list');
    if (!list) return;
    const count = $('zf-funnel-count');
    if (count) count.textContent = '';
    if (!loaded) { list.innerHTML = '<li class="zf-skel"></li><li class="zf-skel"></li>'; return; }
    const S = window._zfSVG;
    const empty = (title, text, cta) => {
      list.innerHTML = `<li class="zf-empty"><b>${title}</b><span>${text}</span>${cta ? `<button type="button" class="zf-btn zf-empty-cta" data-zf-go="/dashboard/funis">${S.external} Criar funil no painel</button>` : ''}</li>`;
      const b = list.querySelector('[data-zf-go]');
      if (b) b.onclick = () => openPanel(b.dataset.zfGo);
    };
    if (funnelsError && !funnelsData.length) return empty('Não foi possível carregar os funis', 'Clique em Atualizar na aba Itens para tentar de novo.');
    const all = funnelsData;
    const shown = funnelSearch
      ? all.filter((f) => (f.title || '').toLowerCase().includes(funnelSearch) || (f.description || '').toLowerCase().includes(funnelSearch))
      : all;
    if (count) count.textContent = `${shown.length} de ${all.length} funis`;
    if (!all.length) return empty('Nenhum funil ainda', 'Monte a sequência de mensagens no painel. A lista atualiza sozinha quando você voltar para cá.', true);
    if (!shown.length) return empty('Nada encontrado', 'Tente outra busca.');

    const index = itemIndex();
    list.innerHTML = shown.map((f) => {
      const steps = funnelSteps(f, index);
      const usable = steps.filter((s) => s.item).length;
      const missing = steps.length - usable;
      const open = String(f.id) === String(openFunnelId);
      const stop = stopReplyChoice.has(f.id) ? stopReplyChoice.get(f.id) : settings.stopOnReply;
      const meta = steps.length ? `${steps.length} passo${steps.length > 1 ? 's' : ''} · cerca de ${fmtLong(estimateMs(steps))}` : 'Sem passos';
      const detail = !open ? '' : `
        <ol class="zf-steps">${steps.map((s, i) => `
          <li class="zf-step${s.item ? '' : ' zf-step-off'}">
            <span class="zf-step-dot zf-t-${s.type}">${S[TYPE_ICON[s.type]]}</span>
            <span class="zf-step-txt"><b>${i + 1}. ${s.item ? escapeHtml(s.item.title) : 'Item apagado da biblioteca'}</b>
            <small>${s.item ? `${s.delayMs ? S.clock + ' Espera ' + fmtLong(s.delayMs) + ', depois ' : ''}${s.type === 'audio' ? 'gravando' : 'digitando'}` : 'Será pulado'}</small></span>
          </li>`).join('')}
        </ol>
        ${missing ? `<p class="zf-fn-warn">${missing} passo${missing > 1 ? 's apontam' : ' aponta'} para itens apagados e ${missing > 1 ? 'serão pulados' : 'será pulado'}.</p>` : ''}
        <label class="zf-check"><input type="checkbox" data-stop-reply ${stop ? 'checked' : ''}><span>Parar se o contato responder</span></label>
        <button type="button" class="zf-btn-primary zf-fire-btn" ${usable ? '' : 'disabled'}>${S.bolt}<span>Disparar para <b data-chat-name>${activeChat ? escapeHtml(activeChat.name) : 'a conversa aberta'}</b></span></button>`;
      return `
      <li class="zf-item zf-fn${open ? ' zf-open' : ''}" data-fid="${f.id}">
        <div class="zf-row">
          <span class="zf-th zf-th-fn" aria-hidden="true">${S.funnel}</span>
          <button type="button" class="zf-txt" aria-expanded="${open}" title="Ver os passos">
            <span class="zf-tt">${escapeHtml(f.title)}${f.is_favorite ? `<span class="zf-star">${S.star}</span>` : ''}</span>
            <span class="zf-mm" data-fn-meta data-base="${escapeHtml(meta)}">${escapeHtml(meta)}</span>
          </button>
          <button type="button" class="zf-send zf-fire" ${usable ? '' : 'disabled'} aria-label="Disparar ${escapeHtml(f.title)} nesta conversa" title="Disparar nesta conversa">${S.bolt}</button>
        </div>
        <div class="zf-preview zf-fn-detail">${detail}</div>
      </li>`;
    }).join('');

    list.querySelectorAll('.zf-fn').forEach((li) => {
      const f = funnelsData.find((x) => String(x.id) === li.dataset.fid);
      if (!f) return;
      const stopChoice = () => (stopReplyChoice.has(f.id) ? stopReplyChoice.get(f.id) : settings.stopOnReply);
      li.querySelector('.zf-txt').onclick = () => {
        openFunnelId = String(openFunnelId) === String(f.id) ? null : f.id;
        renderFunnels();
        if (openFunnelId != null) refreshActiveChat();
      };
      li.querySelector('.zf-fire').onclick = (e) => { e.stopPropagation(); fireFunnel(f, { stopOnReply: stopChoice() }); };
      const big = li.querySelector('.zf-fire-btn');
      if (big) big.onclick = () => fireFunnel(f, { stopOnReply: stopChoice() });
      const cb = li.querySelector('[data-stop-reply]');
      if (cb) cb.onchange = () => stopReplyChoice.set(f.id, cb.checked);
    });
    updateFunnelLive();
  }

  // Funil rodando aparece "vivo" na lista, com o passo atual
  function updateFunnelLive() {
    document.querySelectorAll('#zf-funnel-list .zf-fn').forEach((li) => {
      const live = runs.filter((r) => String(r.funnelId) === li.dataset.fid && LIVE.has(r.state));
      li.classList.toggle('zf-fn-running', live.length > 0);
      const meta = li.querySelector('[data-fn-meta]');
      if (!meta) return;
      if (!live.length) { meta.textContent = meta.dataset.base || ''; return; }
      const r = live[live.length - 1];
      meta.textContent = live.length > 1
        ? `Rodando em ${live.length} conversas`
        : `Rodando · passo ${Math.min(r.idx + 1, r.steps.length)} de ${r.steps.length} · ${r.chatName}`;
    });
  }

  let chatAsking = false;
  async function refreshActiveChat() {
    if (chatAsking) return;
    chatAsking = true;
    try {
      const r = await engineRequest('ZF_ENGINE_ACTIVE_CHAT', {}, 6000);
      activeChat = r.ok ? { chatId: r.chatId, name: r.name } : null;
    } catch (e) { activeChat = null; }
    chatAsking = false;
    document.querySelectorAll('#zf-funnel-list [data-chat-name]').forEach((el) => { el.textContent = activeChat ? activeChat.name : 'a conversa aberta'; });
  }
  // com um funil aberto na aba, o botão acompanha a conversa que você abrir
  setInterval(() => {
    if (openFunnelId == null || $('zf-sidebar-root')?.classList.contains('zf-hidden')) return;
    if (!document.querySelector('#zf-sidebar-root .zf-page-active[data-page="funis"]')) return;
    refreshActiveChat();
  }, 2500);

  // ----- Executor -----
  class RunStop extends Error { constructor(kind) { super(kind); this.kind = kind; } }

  async function fireFunnel(funnel, opts) {
    let chat;
    try { chat = await engineRequest('ZF_ENGINE_ACTIVE_CHAT', {}, 8000); } catch (e) { chat = { ok: false, notReady: true }; }
    if (!chat.ok) {
      showToast(chat.notReady ? 'O motor de envio ainda não está pronto. Recarregue o WhatsApp Web (F5).' : (chat.error || 'Abra uma conversa primeiro.'));
      return;
    }
    startFunnelRun(funnel, chat, opts);
  }

  // Também usado pelos gatilhos, que disparam em conversas que não estão abertas na tela.
  function startFunnelRun(funnel, chat, opts) {
    const steps = funnelSteps(funnel, itemIndex()).map((s) => Object.assign(s, { state: s.item ? 'pending' : 'skipped' }));
    if (!steps.some((s) => s.item)) { showToast('Este funil não tem passos para enviar.'); return false; }
    const run = {
      uid: ++runSeq, funnelId: funnel.id, title: funnel.title || 'Funil', chatId: chat.chatId, chatName: chat.name,
      stopOnReply: !!(opts && opts.stopOnReply), steps, idx: 0, sent: 0,
      state: 'ignition', phase: 'ignition', paused: false, startedAt: Date.now(), since: Date.now(),
    };
    runs.push(run);
    dockCollapsed = false;
    renderDock();
    driveRun(run);
    return true;
  }

  function checkStop(run) { if (run.stopRequested) throw new RunStop('stopped'); }

  async function checkReply(run) {
    if (!run.stopOnReply) return;
    let r = null;
    try { r = await engineRequest('ZF_ENGINE_REPLIED', { chatId: run.chatId, since: run.since }, 4000); } catch (e) { /* motor não respondeu: segue */ }
    if (r && r.replied) throw new RunStop('replied');
  }

  // Espera que respeita pausa (o relógio congela) e confere respostas do contato
  async function waitFor(run, ms, phase) {
    run.phase = phase;
    run.waitTotal = ms;
    run.waitLeft = ms;
    renderDock();
    let last = Date.now(), lastCheck = Date.now();
    while (run.waitLeft > 0) {
      checkStop(run);
      const now = Date.now();
      if (!run.paused) run.waitLeft -= now - last;
      last = now;
      if (phase !== 'ignition' && !run.paused && now - lastCheck >= REPLY_CHECK_MS) { lastCheck = now; await checkReply(run); }
      await sleep(Math.min(250, Math.max(20, run.waitLeft)));
    }
  }

  async function holdWhilePaused(run) {
    if (!run.paused) return;
    const before = run.phase;
    run.phase = 'hold';
    renderDock();
    while (run.paused) { checkStop(run); await sleep(250); }
    run.phase = before;
  }

  async function waitTurn(run) {
    const ahead = () => runs.some((r) => r !== run && r.chatId === run.chatId && r.uid < run.uid && LIVE.has(r.state));
    if (!ahead()) return;
    run.state = 'queued';
    run.phase = 'queued';
    renderDock();
    while (ahead()) { checkStop(run); await sleep(400); }
  }

  async function sendStep(run, st) {
    run.phase = 'preparing';
    renderDock();
    const payload = await buildPayload(st.item, run.chatName, () => { run.phase = 'downloading'; renderDock(); });
    payload.chatId = run.chatId;
    checkStop(run);
    run.phase = 'engine';
    renderDock();
    const res = await withEngine(async () => {
      checkStop(run);
      await checkReply(run); // última conferida antes de começar a digitar
      return engineRequest('ZF_ENGINE_SEND', payload, (payload.presenceMs || 0) + 120000, {
        onId: (id) => { run.requestId = id; },
        onStep: (s) => {
          run.phase = s.step;
          if (s.presenceMs) { run.presenceMs = s.presenceMs; run.presenceStart = Date.now(); }
          renderDock();
        },
      });
    });
    run.requestId = null;
    if (res.cancelled) throw new RunStop('stopped');
    if (!res.ok) throw new Error(res.error || 'Falha ao enviar');
  }

  async function driveRun(run) {
    try {
      if (run.state === 'ignition') await waitFor(run, IGNITION_MS, 'ignition');
      await waitTurn(run);
      run.state = 'running';
      for (; run.idx < run.steps.length; run.idx++) {
        const st = run.steps[run.idx];
        if (st.state === 'done' || st.state === 'skipped') continue;
        if (st.delayMs && !st.waited) { st.state = 'waiting'; await waitFor(run, st.delayMs, 'waiting'); }
        st.waited = true;
        await holdWhilePaused(run);
        checkStop(run);
        st.state = 'active';
        await sendStep(run, st);
        st.state = 'done';
        run.sent++;
      }
      finishRun(run, 'done');
    } catch (e) {
      run.requestId = null;
      const st = run.steps[run.idx];
      if (e instanceof RunStop) {
        if (st && (st.state === 'active' || st.state === 'waiting')) st.state = 'pending';
        finishRun(run, e.kind);
      } else {
        if (st) st.state = 'error';
        run.error = (e && e.message) || 'Falha ao enviar';
        console.error('❌ ZapFlow funil:', e);
        finishRun(run, 'error');
      }
    }
  }

  function finishRun(run, state) {
    run.state = state;
    run.phase = state;
    run.paused = false;
    run.endedAt = Date.now();
    renderDock();
    const ms = { done: 9000, stopped: 4000, replied: 15000 }[state];
    clearTimeout(run.dismissTimer);
    if (ms) run.dismissTimer = setTimeout(() => dismissRun(run.uid), ms);
    if (state === 'replied') showToast(`${run.chatName} respondeu: o funil "${run.title}" parou.`);
  }

  function dismissRun(uid) {
    const i = runs.findIndex((r) => r.uid === uid);
    if (i < 0 || LIVE.has(runs[i].state)) return;
    clearTimeout(runs[i].dismissTimer);
    runs.splice(i, 1);
    renderDock();
  }

  function requestStop(run) {
    run.stopRequested = true;
    run.paused = false;
    if (run.requestId) engineRequest('ZF_ENGINE_CANCEL', { targetId: run.requestId }, 5000).catch(() => {});
  }

  function stopAllRuns() { runs.forEach((r) => { if (LIVE.has(r.state)) requestStop(r); }); }

  function runAction(uid, act) {
    if (act === 'collapse') { dockCollapsed = !dockCollapsed; renderDock(); return; }
    const run = runs.find((r) => r.uid === uid);
    if (!run) return;
    if (act === 'pause' && LIVE.has(run.state)) { run.paused = !run.paused; renderDock(); }
    else if (act === 'stop' && LIVE.has(run.state)) { requestStop(run); renderDock(); }
    else if (act === 'close') dismissRun(uid);
    else if (act === 'retry' && run.state === 'error') {
      clearTimeout(run.dismissTimer);
      const st = run.steps[run.idx];
      if (st) { st.state = 'pending'; st.waited = true; }
      Object.assign(run, { error: null, stopRequested: false, paused: false, state: 'running', phase: 'preparing', since: Date.now(), endedAt: null });
      renderDock();
      driveRun(run);
    }
  }

  function watchUnload() {
    // recarregar a página interrompe os funis no meio: o navegador pergunta antes
    window.addEventListener('beforeunload', (e) => {
      if (runs.some((r) => LIVE.has(r.state))) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ----- Central de disparos -----
  const FAST = new Set(['preparing', 'downloading', 'engine', 'composing', 'recording', 'sending']);

  function engineMode(run) {
    if (run.state === 'done') return 'done';
    if (run.state === 'error') return 'error';
    if (run.state === 'stopped' || run.state === 'replied') return 'off';
    if (run.paused || run.phase === 'hold') return 'paused';
    if (run.phase === 'ignition') return 'ignite';
    return FAST.has(run.phase) ? 'fast' : 'slow';
  }

  function runLabel(run) {
    const n = run.steps.length;
    const step = Math.min(run.idx + 1, n);
    switch (run.state) {
      case 'done': return `Funil concluído · ${run.sent} envio${run.sent === 1 ? '' : 's'} em ${fmtLong(run.endedAt - run.startedAt)}`;
      case 'replied': return `O contato respondeu · parado no passo ${step} de ${n}`;
      case 'stopped': return run.sent ? `Parado no passo ${step} de ${n}` : 'Disparo cancelado';
      case 'error': return `Erro no passo ${step}: ${run.error || 'falha ao enviar'}`;
    }
    if (run.stopRequested) return 'Parando…';
    if (run.paused) {
      if (run.phase === 'waiting' || run.phase === 'ignition') return `Pausado · faltam ${fmtSecs(run.waitLeft)}`;
      if (run.phase === 'hold') return 'Pausado';
      return 'Pausa assim que este envio terminar';
    }
    switch (run.phase) {
      case 'ignition': return `Ligando o motor… ${Math.max(1, Math.ceil(run.waitLeft / 1000))}`;
      case 'queued': return 'Na fila: outro funil está rodando nesta conversa';
      case 'waiting': return `Próximo passo em ${fmtSecs(run.waitLeft)}`;
      case 'preparing': return 'Preparando o passo…';
      case 'downloading': return 'Baixando o arquivo…';
      case 'engine': return 'Aguardando a vez do motor…';
      case 'composing': return `Digitando… ${fmtSecs(run.presenceStart + run.presenceMs - Date.now())}`;
      case 'recording': return `Gravando áudio… ${fmtSecs(run.presenceStart + run.presenceMs - Date.now())}`;
      case 'sending': return 'Enviando…';
    }
    return '';
  }

  // 0–100 no anel em volta do motor (espera ou digitando/gravando); null = sem anel
  function runRing(run) {
    if (!LIVE.has(run.state)) return run.state === 'done' ? 100 : null;
    if ((run.phase === 'waiting' || run.phase === 'ignition') && run.waitTotal) return 100 - (Math.max(0, run.waitLeft) / run.waitTotal) * 100;
    if ((run.phase === 'composing' || run.phase === 'recording') && run.presenceMs) {
      return Math.min(100, ((Date.now() - run.presenceStart) / run.presenceMs) * 100);
    }
    return null;
  }

  function trackHtml(run) {
    const S = window._zfSVG;
    const live = LIVE.has(run.state);
    return run.steps.map((s, i) => {
      let link = '';
      if (i > 0) {
        const flow = live && i === run.idx && (s.state === 'waiting' || (s.state === 'pending' && run.state === 'running'));
        const done = i < run.idx || ['active', 'done', 'error'].includes(s.state);
        link = `<span class="zf-link" data-s="${flow ? 'flow' : done ? 'done' : 'todo'}"></span>`;
      }
      const title = `${i + 1}. ${s.item ? s.item.title : 'Item apagado (pulado)'}`;
      const icon = s.state === 'done' ? S.check : S[TYPE_ICON[s.type]];
      return `${link}<span class="zf-node zf-t-${s.type}" data-s="${s.state}" style="--i:${i}" title="${escapeHtml(title)}">${icon}</span>`;
    }).join('');
  }

  function runCard(run) {
    const S = window._zfSVG;
    const live = LIVE.has(run.state);
    const mode = engineMode(run);
    const core = mode === 'done' ? S.check : mode === 'error' ? '!' : mode === 'off' ? S.stop : mode === 'paused' ? S.pause : S.bolt;
    let actions = '';
    if (live && !run.stopRequested) {
      actions = `<button type="button" class="zf-run-btn" data-zf-run="${run.uid}" data-zf-act="pause" aria-label="${run.paused ? 'Retomar' : 'Pausar'}" title="${run.paused ? 'Retomar' : 'Pausar'}">${run.paused ? S.play : S.pause}</button>` +
        `<button type="button" class="zf-run-btn zf-run-stop" data-zf-run="${run.uid}" data-zf-act="stop" aria-label="${run.phase === 'ignition' ? 'Cancelar' : 'Parar o funil'}" title="${run.phase === 'ignition' ? 'Cancelar' : 'Parar o funil'}">${S.stop}</button>`;
    } else if (!live) {
      actions = `<button type="button" class="zf-run-btn" data-zf-run="${run.uid}" data-zf-act="close" aria-label="Fechar" title="Fechar">${S.close}</button>`;
    }
    const n = run.steps.length;
    return `
    <article class="zf-run" data-uid="${run.uid}" data-state="${run.state}" data-mode="${mode}" style="--steps:${n}">
      <div class="zf-eng" data-mode="${mode}" aria-hidden="true">
        <span class="zf-eng-blades"></span>
        <svg class="zf-eng-ring" viewBox="0 0 48 48"><circle class="zf-eng-track" cx="24" cy="24" r="22" pathLength="100"/><circle class="zf-eng-prog" cx="24" cy="24" r="22" pathLength="100" data-ring/></svg>
        <span class="zf-eng-core">${core}</span>
      </div>
      <div class="zf-run-body">
        <div class="zf-run-top"><b class="zf-run-title" title="${escapeHtml(run.title)}">${escapeHtml(run.title)}</b><span class="zf-run-actions">${actions}</span></div>
        <div class="zf-run-sub">para ${escapeHtml(run.chatName)} · passo ${Math.min(run.idx + 1, n)} de ${n}</div>
        <div class="zf-track">${trackHtml(run)}</div>
        <div class="zf-run-state" data-label>${escapeHtml(runLabel(run))}</div>
        ${run.state === 'error' ? `<button type="button" class="zf-run-btn zf-run-retry" data-zf-run="${run.uid}" data-zf-act="retry" title="Envia este passo de novo e segue o funil">${S.retry}<span>Tentar de novo a partir do passo ${Math.min(run.idx + 1, n)}</span></button>` : ''}
      </div>
    </article>`;
  }

  function renderDock() {
    statusRoot();
    const dock = $('zf-dock');
    if (!dock) return;
    const live = runs.filter((r) => LIVE.has(r.state));
    const key = JSON.stringify([dockCollapsed, runs.map((r) => [r.uid, r.state, r.phase, r.paused, !!r.stopRequested, r.idx, r.steps.map((s) => s.state).join('')])]);
    if (key !== dockKey) {
      dockKey = key;
      if (!runs.length) dock.innerHTML = '';
      else {
        const S = window._zfSVG;
        const first = live[0] || runs[runs.length - 1];
        const status = live.length ? `${live.length} rodando`
          : runs.some((r) => r.state === 'error') ? 'Precisa de atenção'
            : runs.some((r) => r.state === 'done') ? 'Concluído' : 'Parado';
        // minimizada: só uma linha com o funil atual e o que ele está fazendo agora
        dock.innerHTML = `
          <div class="zf-dock-head${live.length ? ' zf-dock-live' : ''}${dockCollapsed ? ' zf-dock-mini' : ''}">
            <span class="zf-dock-bolt">${S.bolt}</span>
            ${dockCollapsed
              ? `<span class="zf-dock-mini-txt"><b>${escapeHtml(first.title)}</b> <span data-dock-summary></span></span>${runs.length > 1 ? `<span class="zf-dock-more">+${runs.length - 1}</span>` : ''}`
              : `<b>Central de disparos</b><span class="zf-dock-count">${status}</span>`}
            <button type="button" class="zf-run-btn" data-zf-run="0" data-zf-act="collapse" aria-expanded="${!dockCollapsed}" aria-label="${dockCollapsed ? 'Mostrar disparos' : 'Minimizar'}" title="${dockCollapsed ? 'Mostrar disparos' : 'Minimizar'}">${dockCollapsed ? S.chevron : S.minus}</button>
          </div>
          ${dockCollapsed ? '' : `<div class="zf-runs">${runs.map(runCard).join('')}</div>`}
          <span class="zf-sr" role="status">${escapeHtml(runs.map((r) => r.title + ': ' + runLabel(r).replace(/\s\d+:\d\d$/, '')).join('. '))}</span>`;
      }
      updateStatusVisibility();
      updateFunnelLive();
    }
    // partes que mudam a cada instante: só o texto e o anel (os botões continuam os mesmos)
    const mini = dock.querySelector('[data-dock-summary]');
    if (mini) {
      const r = live[0] || runs[runs.length - 1];
      const text = r ? runLabel(r) : '';
      if (mini.textContent !== text) mini.textContent = text;
    }
    runs.forEach((r) => {
      const el = dock.querySelector(`.zf-run[data-uid="${r.uid}"]`);
      if (!el) return;
      const label = el.querySelector('[data-label]');
      const text = runLabel(r);
      if (label && label.textContent !== text) label.textContent = text;
      const ring = el.querySelector('[data-ring]');
      const pct = runRing(r);
      if (ring) {
        ring.style.opacity = pct == null ? '0' : '1';
        ring.style.strokeDashoffset = String(100 - (pct || 0));
      }
    });
    if (live.length && !dockTicker) dockTicker = setInterval(renderDock, 200);
    if (!live.length && dockTicker) { clearInterval(dockTicker); dockTicker = null; }
    if (live.length !== liveCount) { liveCount = live.length; updateFiringIndicators(); }
  }

  // Raio pulsando na aba lateral, contador na aba Funis e no status do cabeçalho
  function updateFiringIndicators() {
    const live = runs.filter((r) => LIVE.has(r.state)).length;
    document.documentElement.classList.toggle('zf-firing', live > 0);
    const badge = $('zf-funnel-badge');
    if (badge) { badge.hidden = !live; badge.textContent = String(live); }
    const pill = $('zf-engine');
    if (pill && engineReady) {
      pill.dataset.state = live ? 'firing' : 'ready';
      pill.lastElementChild.textContent = live ? (live === 1 ? '1 disparo' : `${live} disparos`) : 'Pronto';
    }
  }

  // ===== SEND ITEM =====
  // Cada clique vira um "job" numa fila. A conversa de destino é fixada no clique,
  // então trocar de conversa durante o envio não desvia a mensagem.
  const sendQueue = [];
  let queueRunning = false;
  let _zfJobSeq = 0;
  let lastFinished = null;
  let lastFinishedTimer = null;

  async function sendItem(item) {
    let chat;
    try {
      chat = await engineRequest('ZF_ENGINE_ACTIVE_CHAT', {}, 8000);
    } catch (e) {
      chat = { ok: false, notReady: true, error: e.message };
    }
    if (!chat.ok && chat.notReady) {
      // Motor indisponível: modo manual (cola no campo para o usuário conferir e enviar)
      try { await sendManually(item); } catch (e) { showToast('❌ ' + e.message); }
      return;
    }
    if (!chat.ok) { flashError(item, chat.error); return; }
    enqueueSend(item, chat);
  }

  function enqueueSend(item, chat) {
    const job = { uid: ++_zfJobSeq, item, chatId: chat.chatId, chatName: chat.name, state: 'queued' };
    sendQueue.push(job);
    renderSendStatus();
    runQueue();
  }

  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (sendQueue.length) {
      const job = sendQueue[0];
      try {
        await processJob(job);
        job.state = 'done';
      } catch (e) {
        job.state = e.cancelled || job.cancelRequested ? 'cancelled' : 'error';
        job.error = e.message;
        if (job.state === 'error') console.error('❌ ZapFlow envio:', e);
      }
      sendQueue.shift();
      showFinished(job);
    }
    queueRunning = false;
    renderSendStatus();
  }

  // Monta o que o motor precisa para enviar um item (baixa o arquivo quando há um).
  async function buildPayload(item, contactName, onDownloading) {
    if (item.type === 'msg') {
      const text = fillTemplate(item.content || '', contactName);
      if (!text.trim()) throw new Error('Mensagem vazia');
      return { kind: 'text', text, presenceMs: typingMs(text) };
    }
    if (!item.url) throw new Error(item.type === 'audio' ? 'Áudio sem arquivo' : 'Item sem arquivo');
    if (onDownloading) onDownloading();
    const file = await downloadAsDataUrl(item.url);
    if (item.type === 'audio' || file.mimeType.startsWith('audio/')) {
      const duration = await getAudioDuration(file.blob);
      return { kind: 'audio', dataUrl: file.dataUrl, mimetype: file.mimeType, presenceMs: recordingMs(duration) };
    }
    return {
      kind: 'file', dataUrl: file.dataUrl, mimetype: file.mimeType,
      filename: buildFilename(item.title, file.mimeType), caption: fillTemplate(item.content || '', contactName), presenceMs: jitter(1500, 0.3),
    };
  }

  // {nome} = primeiro nome do contato, {nome_completo} = nome inteiro (igual às tarefas do painel).
  // Conversa sem nome salvo (só o número): o marcador some e a frase continua natural.
  function fillTemplate(text, name) {
    if (!/\{nome(_completo)?\}/i.test(text)) return text;
    const full = /\p{L}/u.test(name || '') ? String(name).trim() : '';
    const first = full.split(/\s+/)[0] || '';
    let out = text.replace(/\{nome_completo\}/gi, full).replace(/\{nome\}/gi, first);
    if (!full) out = out.replace(/[ \t]+([,.!?;:])/g, '$1').replace(/[ \t]{2,}/g, ' ');
    return out;
  }

  // O motor envia uma coisa por vez: itens avulsos e passos de funis entram nesta fila única.
  let engineChain = Promise.resolve();
  function withEngine(fn) {
    const p = engineChain.then(fn, fn);
    engineChain = p.catch(() => {});
    return p;
  }

  async function processJob(job) {
    const payload = await buildPayload(job.item, job.chatName, () => { job.state = 'downloading'; renderSendStatus(); });
    if (job.cancelRequested) throw Object.assign(new Error('Envio cancelado'), { cancelled: true });
    payload.chatId = job.chatId;

    const res = await withEngine(() => {
      if (job.cancelRequested) return { cancelled: true };
      return engineRequest('ZF_ENGINE_SEND', payload, (payload.presenceMs || 0) + 120000, {
        onId: (id) => { job.requestId = id; },
        onStep: (s) => {
          job.state = s.step;
          if (s.presenceMs) { job.presenceMs = s.presenceMs; job.presenceStart = Date.now(); }
          renderSendStatus();
        },
      });
    });
    if (res.cancelled) throw Object.assign(new Error('Envio cancelado'), { cancelled: true });
    if (!res.ok) throw new Error(res.error || 'Falha ao enviar');
    job.ack = res.ack;
  }

  function cancelJob(uid) {
    const idx = sendQueue.findIndex((j) => j.uid === uid);
    if (idx < 0) return;
    const job = sendQueue[idx];
    if (idx > 0) {
      sendQueue.splice(idx, 1);
      renderSendStatus();
      return;
    }
    job.cancelRequested = true;
    if (job.requestId) engineRequest('ZF_ENGINE_CANCEL', { targetId: job.requestId }, 5000).catch(() => {});
    renderSendStatus();
  }

  // ===== MOTOR (wa_engine.js) =====
  let _zfReqSeq = 0;

  function engineRequest(type, payload, timeoutMs, hooks) {
    hooks = hooks || {};
    return new Promise((resolve, reject) => {
      const requestId = 'zf-' + Date.now() + '-' + (++_zfReqSeq);
      if (hooks.onId) hooks.onId(requestId);
      const timer = setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('O WhatsApp demorou demais para responder.'));
      }, timeoutMs);
      function listener(event) {
        if (event.source !== window || !event.data || event.data.requestId !== requestId) return;
        if (event.data.type === 'ZF_ENGINE_STEP') { if (hooks.onStep) hooks.onStep(event.data); return; }
        if (event.data.type !== 'ZF_ENGINE_RESULT') return;
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        resolve(event.data);
      }
      window.addEventListener('message', listener);
      window.postMessage(Object.assign({ type, requestId }, payload), '*');
    });
  }

  // Tempo de "digitando"/"gravando" proporcional ao conteúdo, com variação
  // aleatória para não ficar sempre igual.
  function jitter(ms, pct) { return Math.round(ms * (1 + (Math.random() * 2 - 1) * pct)); }
  function typingMs(text) {
    const base = Math.min(Math.max((text || '').length * 55, 1500), 9000);
    return jitter(base, 0.2);
  }
  function recordingMs(durationSec) {
    const base = Math.min(Math.max((durationSec || 3) * 1000, 2000), 15000);
    return jitter(base, 0.1);
  }

  // ===== PAINEL DE STATUS DO ENVIO =====
  const TYPE_ICON = { msg: 'msg', audio: 'mic', media: 'img', doc: 'doc' };
  const STATE_LABEL = {
    queued: 'Na fila', downloading: 'Preparando arquivo…', composing: 'Digitando…', recording: 'Gravando áudio…',
    sending: 'Enviando…', done: 'Enviado', cancelled: 'Cancelado', error: 'Não enviado',
  };
  let statusTicker = null;

  // Um só canto da tela para tudo que está sendo enviado: a central de disparos (funis) e os itens avulsos.
  function statusRoot() {
    let el = document.getElementById('zf-send-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'zf-send-status';
      el.innerHTML = '<div id="zf-dock"></div><div id="zf-ss-items"></div>';
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-zf-cancel]');
        if (btn) { e.preventDefault(); e.stopPropagation(); cancelJob(Number(btn.dataset.zfCancel)); return; }
        const act = e.target.closest('[data-zf-act]');
        if (act) { e.preventDefault(); e.stopPropagation(); runAction(Number(act.dataset.zfRun), act.dataset.zfAct); }
      });
      document.body.appendChild(el);
    }
    const bar = document.getElementById('zf-quickbar');
    if (bar && bar.style.left) el.style.left = `calc(${bar.style.left} + 12px)`;
    // logo acima da caixa de digitar do WhatsApp, para não cobrir o que você escreve
    const footer = document.querySelector('#main footer');
    if (footer) {
      const top = footer.getBoundingClientRect().top;
      if (top > 0) el.style.bottom = Math.round(window.innerHeight - top + 10) + 'px';
    }
    return el;
  }

  function updateStatusVisibility() {
    const el = statusRoot();
    const has = !!($('zf-dock')?.childElementCount || $('zf-ss-items')?.childElementCount);
    el.classList.toggle('zf-ss-visible', has);
  }

  function fmtSecs(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function jobCard(job, isCurrent) {
    const icons = window._zfSVG || {};
    const icon = icons[TYPE_ICON[job.item.type]] || '';
    let progress = '';
    let label = STATE_LABEL[job.state] || '';
    if ((job.state === 'composing' || job.state === 'recording') && job.presenceMs) {
      const left = job.presenceStart + job.presenceMs - Date.now();
      const pct = Math.min(100, Math.max(0, 100 - (left / job.presenceMs) * 100));
      label += ' ' + fmtSecs(left);
      progress = `<div class="zf-ss-progress"><div style="width:${pct.toFixed(1)}%"></div></div>`;
    } else if (job.state === 'downloading' || job.state === 'sending') {
      progress = '<div class="zf-ss-progress zf-ss-indeterminate"><div></div></div>';
    }
    if (job.state === 'done' && job.ack === 0) label = 'Enviado · aguardando o servidor';
    if (job.state === 'error' && job.error) label += ': ' + job.error;
    const canCancel = isCurrent && ['queued', 'downloading', 'composing', 'recording'].includes(job.state) && !job.cancelRequested;
    return `<div class="zf-ss-card zf-ss-${job.state}">
      <div class="zf-ss-icon zf-t-${job.item.type}">${icon}</div>
      <div class="zf-ss-body">
        <div class="zf-ss-title">${escapeHtml(job.item.title || '')}</div>
        <div class="zf-ss-sub">para ${escapeHtml(job.chatName || '')}</div>
        <div class="zf-ss-state">${escapeHtml(label)}</div>
        ${progress}
      </div>
      ${canCancel ? `<button class="zf-ss-cancel" data-zf-cancel="${job.uid}" title="Cancelar">✕</button>` : ''}
    </div>`;
  }

  function renderSendStatus() {
    statusRoot();
    const el = $('zf-ss-items');
    const current = sendQueue[0] || null;
    const waiting = sendQueue.slice(1);
    const shown = current || lastFinished;
    if (!shown) {
      el.innerHTML = '';
      updateStatusVisibility();
      if (statusTicker) { clearInterval(statusTicker); statusTicker = null; }
      return;
    }
    let html = jobCard(shown, !!current);
    if (waiting.length) {
      html += `<div class="zf-ss-queue"><div class="zf-ss-queue-title">Na fila (${waiting.length})</div>` +
        waiting.map((j) => `<div class="zf-ss-queue-item"><span>${escapeHtml(j.item.title || '')}</span>` +
          `<button class="zf-ss-cancel zf-ss-cancel-sm" data-zf-cancel="${j.uid}" title="Remover">✕</button></div>`).join('') +
        '</div>';
    }
    el.innerHTML = html;
    updateStatusVisibility();
    const needsTick = current && (current.state === 'composing' || current.state === 'recording');
    if (needsTick && !statusTicker) statusTicker = setInterval(renderSendStatus, 250);
    if (!needsTick && statusTicker) { clearInterval(statusTicker); statusTicker = null; }
  }

  function showFinished(job) {
    lastFinished = job;
    clearTimeout(lastFinishedTimer);
    renderSendStatus();
    lastFinishedTimer = setTimeout(() => {
      if (lastFinished === job) { lastFinished = null; renderSendStatus(); }
    }, job.state === 'error' ? 6000 : 2500);
  }

  function flashError(item, message) {
    showFinished({ uid: ++_zfJobSeq, item, chatName: '—', state: 'error', error: message });
  }

  async function sendManually(item) {
    if (item.type === 'msg') { insertTextManually(item.content || ''); return; }
    if (!item.url) throw new Error('Item sem arquivo');
    const file = await downloadAsDataUrl(item.url);
    pasteFileManually(file, item.title || 'arquivo');
    showToast('⚠️ Motor indisponível: arquivo colado. Confira e envie.');
  }

  // ===== DOWNLOAD =====
  async function downloadAsDataUrl(fileUrl) {
    let dataUrl, mimeType;
    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'ZAPFLOW_DOWNLOAD_FILE', url: fileUrl }, (r) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (r && r.success) resolve(r);
          else reject(new Error((r && r.error) || 'Download falhou no background'));
        });
      });
      dataUrl = res.base64;
      mimeType = res.mimeType;
    } catch (bgErr) {
      console.warn('ZapFlow: download pelo background falhou, tentando direto...', bgErr.message);
      const r = await fetch(fileUrl);
      if (!r.ok) throw new Error('Download falhou. Status: ' + r.status);
      const b = await r.blob();
      mimeType = b.type || 'application/octet-stream';
      dataUrl = await blobToDataUrl(b);
    }
    mimeType = (mimeType || 'application/octet-stream').split(';')[0].trim();
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, mimeType, blob };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => (reader.result ? resolve(reader.result) : reject(new Error('Falha ao ler arquivo')));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(blob);
    });
  }

  async function getAudioDuration(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const a = new Audio(url);
      return await new Promise((resolve) => {
        a.addEventListener('loadedmetadata', () => resolve(isFinite(a.duration) ? a.duration : 3));
        a.addEventListener('error', () => resolve(3));
        setTimeout(() => resolve(3), 2000);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function buildFilename(title, mimeType) {
    let ext = (mimeType.split('/')[1] || 'bin').toLowerCase();
    if (ext.includes('pdf')) ext = 'pdf';
    if (ext === 'mpeg') ext = 'mp3';
    return (title || 'arquivo') + '.' + ext;
  }

  // ===== MODO MANUAL (fallback sem motor) =====
  function findInputBox() {
    return document.querySelector('footer div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][data-tab="10"]') ||
      document.querySelector('#main div[contenteditable="true"][role="textbox"]');
  }

  function pasteFileManually(file, title) {
    const inputBox = findInputBox();
    if (!inputBox) throw new Error('Abra uma conversa primeiro!');
    const f = new File([file.blob], buildFilename(title, file.mimeType), { type: file.mimeType });
    const dt = new DataTransfer();
    dt.items.add(f);
    inputBox.focus();
    inputBox.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }

  // Insere o texto no campo de mensagem SEM enviar: no modo manual o usuário confere e envia.
  function insertTextManually(text) {
    const inputBox = findInputBox();
    if (!inputBox) { showToast('⚠️ Abra uma conversa primeiro'); return; }
    inputBox.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, text);
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('⚠️ Motor indisponível: mensagem colocada no campo. Confira e envie.');
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
  }

  function showToast(msg) {
    document.querySelector('.zf-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'zf-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  function escapeHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  function formatFileSize(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b/1024) + ' KB'; return (b/1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function formatDuration(sec) { const s = Math.max(0, Math.round(sec)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  // ===== PONTE PARA O AGENTE (agent.js) =====
  // O agente vive em outro arquivo e usa só o que está aqui: leitura do estado e as mesmas ações da aba Lead
  // e da fila de envio (então tudo que ele faz passa pelo "digitando/gravando" e pelas regras de sempre).
  window.ZF_BRIDGE = {
    sb: () => sb,
    isLoaded: () => loaded,
    leadChat: () => leadChat,
    leadState: () => leadState,
    crm: () => crm,
    settings: () => settings,
    data: () => ({ messages: messagesData, media: mediaData, funnels: funnelsData }),
    items: () => buildItemsList(),
    funnelById: (id) => funnelsData.find((f) => f.id === id) || null,
    userId,
    engineRequest,
    enqueueSend,
    startFunnelRun,
    reloadLead: (opts) => loadLead(opts),
    leadUpdate,
    moveCard,
    addLeadCard,
    tagLead,
    applyTagTo,
    setLeadStage,
    triggerReplyAt: (chatId) => lastAutoReply.get(chatId) || 0,
    stageLabel,
    blockingLabelOf,
    showToast,
    escapeHtml,
    fillTemplate,
    initialsOf,
  };

  init();
})();
