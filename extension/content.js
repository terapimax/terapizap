// ZapFlow v3.4 — Content Script (interface + envio via motor WA-JS em wa_engine.js)
(function () {
  'use strict';
  const SUPABASE_URL = window.SUPABASE_URL || '';
  const SUPABASE_KEY = window.SUPABASE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_KEY) console.warn('⚠️ ZapFlow: configuração do Supabase ausente (config.js)');

  let sb = null;
  let currentFilter = 'all', showFavOnly = false, searchQuery = '';
  let messagesData = [], mediaData = [], loaded = false;
  const settings = { hideBar: false, barFav: false, theme: 'auto' };
  const $ = (id) => document.getElementById(id);

  // ===== INÍCIO =====
  function init() {
    if ($('zf-sidebar-root')) return;
    const check = setInterval(() => {
      if (document.querySelector('#app') || document.querySelector('#main')) {
        clearInterval(check);
        createSidebar();
        createQuickBar();
        loadSettings();
        watchWhatsAppTheme();
        pollEngine();
        initAuth();
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
  async function pollEngine() {
    const pill = $('zf-engine');
    const set = (state, text) => { if (pill) { pill.dataset.state = state; pill.lastElementChild.textContent = text; } };
    for (let i = 0; i < 90; i++) {
      try {
        const r = await engineRequest('ZF_ENGINE_STATUS', {}, 3000);
        if (r.ready) {
          set('ready', 'Pronto');
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

    if (typeof supabase === 'undefined' || !supabase.createClient) return showAuth('Não foi possível carregar o ZapFlow. Recarregue a página.');
    if (!(await supabaseReachable())) return showAuth('Sem conexão com o banco. Verifique a internet e recarregue a página.');

    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { session } } = await sb.auth.getSession();
    if (session) { hideAuth(); loadAllData(); } else showAuth();
    sb.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        messagesData = []; mediaData = []; loaded = false; setAccount('');
        renderItems(); renderQuickBar(); showAuth();
      }
    });
  }

  async function loadAllData() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      setAccount(session.user?.email);
      const [msgs, media] = await Promise.all([
        sb.from('messages').select('*').order('created_at', { ascending: false }),
        sb.from('media_library').select('*').order('created_at', { ascending: false }),
      ]);
      if (msgs.error || media.error) throw msgs.error || media.error;
      messagesData = msgs.data || [];
      mediaData = media.data || [];
      loaded = true;
      renderItems();
      renderQuickBar();
    } catch (e) {
      console.error('❌ ZapFlow: falha ao carregar itens', e);
      loaded = true;
      const list = $('zf-items-list');
      if (list) list.innerHTML = '<li class="zf-empty"><b>Não foi possível carregar seus itens</b><span>Clique em Atualizar para tentar de novo.</span></li>';
    }
  }

  // ===== BARRA LATERAL =====
  function createSidebar() {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'zf-toggle-btn';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', 'Abrir ZapFlow');
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
    $('zf-s-bar-fav').onchange = (e) => { settings.barFav = e.target.checked; saveSettings(); renderQuickBar(); };
    document.querySelectorAll('[data-zf-theme-opt]').forEach((b) => {
      b.onclick = () => { settings.theme = b.dataset.zfThemeOpt; saveSettings(); applyTheme(); };
    });
  }

  function switchTab(tab) {
    document.querySelectorAll('[data-zf-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.zfTab === tab)));
    document.querySelectorAll('#zf-sidebar-root .zf-page').forEach((p) => p.classList.toggle('zf-page-active', p.dataset.page === tab));
  }

  function toggleSidebar(forceOpen) {
    const root = $('zf-sidebar-root');
    const btn = $('zf-toggle-btn');
    if (!root || !btn) return;
    const open = forceOpen === true ? true : root.classList.contains('zf-hidden');
    root.classList.toggle('zf-hidden', !open);
    btn.classList.toggle('zf-sidebar-open', open);
    btn.setAttribute('aria-label', open ? 'Fechar ZapFlow' : 'Abrir ZapFlow');
    updateQuickBarVisibility();
    positionQuickBar();
    for (const t of [100, 200, 300]) setTimeout(positionQuickBar, t);
  }

  // ===== BARRA RÁPIDA =====
  function createQuickBar() {
    const bar = document.createElement('div');
    bar.id = 'zf-quickbar';
    bar.setAttribute('aria-label', 'Barra rápida do ZapFlow');
    bar.innerHTML = zfBuildQuickBar();
    document.body.appendChild(bar);
    $('zf-qb-toggle').onclick = () => { toggleSidebar(true); switchTab('itens'); $('zf-search')?.focus(); };
    positionQuickBar();
    updateQuickBarVisibility();
    window.addEventListener('resize', positionQuickBar);
    setInterval(positionQuickBar, 1000);
  }

  function positionQuickBar() {
    const bar = $('zf-quickbar');
    if (!bar) return;
    const chat = $('main') || document.querySelector('[data-tab="8"]');
    const side = $('side') || document.querySelector('[data-tab="3"]');
    bar.style.left = (chat ? chat.getBoundingClientRect().left : side ? side.getBoundingClientRect().right : window.innerWidth * 0.3) + 'px';
  }

  function updateQuickBarVisibility() {
    const bar = $('zf-quickbar');
    if (!bar) return;
    const open = !$('zf-sidebar-root')?.classList.contains('zf-hidden');
    bar.classList.toggle('zf-qb-hidden', !open || settings.hideBar);
  }

  function renderQuickBar() {
    const scroll = $('zf-qb-scroll');
    if (!scroll) return;
    updateQuickBarVisibility();
    let items = buildItemsList();
    if (settings.barFav) items = items.filter((i) => i.isFavorite);
    items = items.slice(0, 20);
    const S = window._zfSVG;
    scroll.innerHTML = items.map((i) =>
      `<button type="button" class="zf-qb-item" data-qb-id="${i.id}" data-qb-type="${i.type}" title="Enviar ${escapeHtml(i.title)}">${S[TYPE_ICON[i.type]] || ''}${escapeHtml(i.title.substring(0, 30))}</button>`
    ).join('');
    scroll.querySelectorAll('.zf-qb-item').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
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
      const kind = m.type === 'audio' ? 'Mensagem de voz' : m.type === 'video' ? 'Vídeo' : m.type === 'image' ? 'Imagem' : ((m.url || '').split('?')[0].split('.').pop() || 'Arquivo').toUpperCase();
      items.push({
        id: m.id, type: t, title: m.title, isFavorite: m.is_favorite, content: m.caption, url: m.url, mediaType: m.type,
        meta: [kind, formatFileSize(m.size)].filter(Boolean).join(' · '),
      });
    });
    return items;
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
    if (all.length === 0) {
      list.innerHTML = '<li class="zf-empty"><b>Sua biblioteca está vazia</b><span>Crie mensagens, áudios e arquivos no painel do ZapFlow e clique em Atualizar.</span></li>';
      return;
    }
    if (items.length === 0) {
      list.innerHTML = '<li class="zf-empty"><b>Nada encontrado</b><span>Mude o filtro ou a busca.</span></li>';
      return;
    }

    const S = window._zfSVG;
    list.innerHTML = items.map((item) => `
      <li class="zf-item" data-id="${item.id}" data-type="${item.type}">
        <div class="zf-row">
          <span class="zf-ic zf-ic-${item.type}">${S[TYPE_ICON[item.type]] || ''}</span>
          <button type="button" class="zf-txt" aria-expanded="false" title="Ver conteúdo">
            <span class="zf-tt">${escapeHtml(item.title)}${item.isFavorite ? `<span class="zf-star">${S.star}</span>` : ''}</span>
            <span class="zf-mm">${escapeHtml(item.meta)}</span>
          </button>
          <button type="button" class="zf-send" aria-label="Enviar ${escapeHtml(item.title)}" title="Enviar nesta conversa">${S.play}</button>
        </div>
        <div class="zf-preview">${previewHtml(item)}</div>
      </li>`).join('');

    list.querySelectorAll('.zf-item').forEach((li) => {
      const item = items.find((i) => String(i.id) === li.dataset.id && i.type === li.dataset.type);
      li.querySelector('.zf-send').onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (item) sendItem(item); };
      li.querySelector('.zf-txt').onclick = async () => {
        const open = li.classList.toggle('zf-open');
        li.querySelector('.zf-txt').setAttribute('aria-expanded', String(open));
        const el = open && li.querySelector('[data-src]');
        if (!el) return;
        const loading = li.querySelector('.zf-loading-line');
        try {
          // O WhatsApp Web bloqueia mídia de outros sites (CSP); baixamos e usamos um endereço local (blob)
          const res = await fetch(el.getAttribute('data-src'));
          if (!res.ok) throw new Error('HTTP ' + res.status);
          el.src = URL.createObjectURL(await res.blob());
          el.removeAttribute('data-src');
          el.hidden = false;
          if (loading) loading.remove();
        } catch (err) {
          if (loading) loading.textContent = 'Não foi possível carregar a prévia.';
        }
      };
    });
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

  async function processJob(job) {
    const item = job.item;
    let payload;
    if (item.type === 'msg') {
      const text = item.content || '';
      if (!text.trim()) throw new Error('Mensagem vazia');
      payload = { kind: 'text', text, presenceMs: typingMs(text) };
    } else {
      if (!item.url) throw new Error(item.type === 'audio' ? 'Áudio sem arquivo' : 'Item sem arquivo');
      job.state = 'downloading';
      renderSendStatus();
      const file = await downloadAsDataUrl(item.url);
      if (job.cancelRequested) throw Object.assign(new Error('Envio cancelado'), { cancelled: true });
      if (item.type === 'audio' || file.mimeType.startsWith('audio/')) {
        const duration = await getAudioDuration(file.blob);
        payload = { kind: 'audio', dataUrl: file.dataUrl, mimetype: file.mimeType, presenceMs: recordingMs(duration) };
      } else {
        payload = {
          kind: 'file', dataUrl: file.dataUrl, mimetype: file.mimeType,
          filename: buildFilename(item.title, file.mimeType), caption: item.content || '', presenceMs: jitter(1500, 0.3),
        };
      }
    }
    payload.chatId = job.chatId;

    const res = await engineRequest('ZF_ENGINE_SEND', payload, (payload.presenceMs || 0) + 120000, {
      onId: (id) => { job.requestId = id; },
      onStep: (s) => {
        job.state = s.step;
        if (s.presenceMs) { job.presenceMs = s.presenceMs; job.presenceStart = Date.now(); }
        renderSendStatus();
      },
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

  function statusRoot() {
    let el = document.getElementById('zf-send-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'zf-send-status';
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-zf-cancel]');
        if (btn) { e.preventDefault(); e.stopPropagation(); cancelJob(Number(btn.dataset.zfCancel)); }
      });
      document.body.appendChild(el);
    }
    const bar = document.getElementById('zf-quickbar');
    if (bar && bar.style.left) el.style.left = `calc(${bar.style.left} + 12px)`;
    return el;
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
    const el = statusRoot();
    const current = sendQueue[0] || null;
    const waiting = sendQueue.slice(1);
    const shown = current || lastFinished;
    if (!shown) {
      el.classList.remove('zf-ss-visible');
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
    el.classList.add('zf-ss-visible');
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
  function formatFileSize(b) { if (!b) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return (b/1024).toFixed(1) + ' KB'; return (b/1048576).toFixed(1) + ' MB'; }

  init();
})();
