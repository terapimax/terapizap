// ============================================================
// ZAPFLOW EXTENSION — Content Script
// Injected into web.whatsapp.com
// ============================================================

(function () {
    'use strict';

    // ===== SUPABASE CONFIG (from extension/config.js) =====
    const SUPABASE_URL = window.SUPABASE_URL || '';
    const SUPABASE_KEY = window.SUPABASE_KEY || '';

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('⚠️ ZapFlow extension: SUPABASE_URL or SUPABASE_KEY not defined. Create extension/config.js from extension/config.example.js.');
    }

    let sb = null; // supabase client
    let currentPage = 'envios';
    let currentFilter = 'all'; // all, msg, audio, media, doc
    let showFavOnly = false;
    let searchQuery = '';

    // Data caches
    let messagesData = [];
    let mediaData = [];

    // ===== INIT =====
    function init() {
        if (document.getElementById('zf-sidebar-root')) return; // already injected

        // Wait for WhatsApp to fully load
        const check = setInterval(() => {
            if (document.querySelector('#app') || document.querySelector('#main')) {
                clearInterval(check);
                createSidebar();
                initSupabase();
            }
        }, 1000);
    }

    // ===== CREATE SUPABASE CLIENT =====
    async function initSupabase() {
        try {
            if (typeof supabase !== 'undefined' && supabase.createClient) {
                sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                console.log('✅ ZapFlow: Supabase connected');
                
                // Auth Logic
                const authOverlay = document.getElementById('zf-auth-overlay');
                const authBtn = document.getElementById('zf-auth-btn');
                const authEmail = document.getElementById('zf-auth-email');
                const authPassword = document.getElementById('zf-auth-password');
                const authError = document.getElementById('zf-auth-error');

                const { data: { session } } = await sb.auth.getSession();
                if (session) {
                    authOverlay.style.display = 'none';
                    loadAllData();
                } else {
                    authOverlay.style.display = 'flex';
                }

                authBtn.addEventListener('click', async () => {
                    authBtn.textContent = 'Aguarde...';
                    authError.style.display = 'none';
                    const { error } = await sb.auth.signInWithPassword({
                        email: authEmail.value,
                        password: authPassword.value
                    });

                    if (error) {
                        authError.textContent = error.message;
                        authError.style.display = 'block';
                        authBtn.textContent = 'Entrar na Extensão';
                    } else {
                        authOverlay.style.display = 'none';
                        loadAllData();
                    }
                });

                sb.auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_OUT') {
                        authOverlay.style.display = 'flex';
                        messagesData = [];
                        mediaData = [];
                        renderCurrentPage();
                    }
                });
            } else {
                console.warn('⚠️ ZapFlow: Supabase SDK not found');
            }
        } catch (e) {
            console.error('❌ ZapFlow: Supabase init error:', e);
        }
    }

    // ===== LOAD DATA FROM SUPABASE =====
    async function loadAllData() {
        try {
            const { data: { session } } = await sb.auth.getSession();
            if (!session) return; // Nao carrega se nao estiver logado

            // Load messages
            const { data: msgs } = await sb.from('messages').select('*').order('created_at', { ascending: false });
            messagesData = msgs || [];

            // Load media library
            const { data: media } = await sb.from('media_library').select('*').order('created_at', { ascending: false });
            mediaData = media || [];

            console.log(`✅ ZapFlow: Loaded ${messagesData.length} messages, ${mediaData.length} media items`);
            renderCurrentPage();
        } catch (e) {
            console.error('❌ ZapFlow: Load data error:', e);
        }
    }

    // ===== CREATE SIDEBAR HTML =====
    function createSidebar() {
        // Toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'zf-toggle-btn';
        toggleBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>';
        toggleBtn.title = 'ZapFlow';
        toggleBtn.onclick = () => toggleSidebar();
        document.body.appendChild(toggleBtn);

        // Sidebar root
        const root = document.createElement('div');
        root.id = 'zf-sidebar-root';
        root.classList.add('zf-hidden');
        root.innerHTML = `
            <!-- Main Panel -->
            <div class="zf-panel" style="position:relative;">
                <!-- Auth Overlay -->
                <div id="zf-auth-overlay" style="display:flex; flex-direction:column; align-items:center; justify-content:center; position:absolute; inset:0; background:#0f172a; z-index:9999; padding:24px;">
                    <div style="color: #c4b5fd; margin-bottom:10px;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></div>
                    <h3 style="color:white; margin-bottom:20px; font-size:20px; font-weight:bold;">Login ZapFlow</h3>
                    <input type="email" id="zf-auth-email" placeholder="Seu email" style="width:100%; padding:12px; margin-bottom:12px; border-radius:8px; border:1px solid #334155; background:#1e293b; color:white; outline:none;">
                    <input type="password" id="zf-auth-password" placeholder="Sua senha" style="width:100%; padding:12px; margin-bottom:20px; border-radius:8px; border:1px solid #334155; background:#1e293b; color:white; outline:none;">
                    <button id="zf-auth-btn" style="width:100%; padding:12px; background:#8b5cf6; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; transition:all 0.2s;">Entrar na Extensão</button>
                    <p id="zf-auth-error" style="color:#ef4444; font-size:12px; margin-top:12px; text-align:center; display:none;"></p>
                </div>

                <!-- Header -->
                <div class="zf-header">
                    <div class="zf-logo-area">
                        <div class="zf-logo-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg></div>
                        <div class="zf-logo-text">
                            <div class="zf-logo-title">ZAPFLOW</div>
                            <div class="zf-logo-version">v1.0.0 • Extension</div>
                        </div>
                    </div>
                    <button class="zf-close-btn" id="zf-close">✕</button>
                </div>

                <!-- PAGE: Envios -->
                <div class="zf-page zf-page-active" data-page="envios">
                    <div class="zf-send-status">
                        <div class="zf-send-status-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>
                        <div class="zf-send-status-text">Nenhum item está sendo enviado no momento</div>
                        <div class="zf-send-status-sub">Selecione itens na aba "Itens" para enviar</div>
                    </div>
                </div>

                <!-- PAGE: Itens -->
                <div class="zf-page" data-page="itens">
                    <!-- Search -->
                    <div class="zf-search-bar">
                        <div class="zf-search-wrap">
                            <span class="zf-search-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
                            <input type="text" class="zf-search-input" id="zf-search" placeholder="Buscar...">
                        </div>
                    </div>
                    <!-- Type Filter Tabs -->
                    <div class="zf-filters">
                        <button class="zf-filter-btn zf-active" data-filter="all">Todos</button>
                        <button class="zf-filter-btn" data-filter="msg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg> Texto</button>
                        <button class="zf-filter-btn" data-filter="audio"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg> Áudio</button>
                        <button class="zf-filter-btn" data-filter="media"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg> Mídia</button>
                        <button class="zf-filter-btn" data-filter="doc"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg> Doc</button>
                        <label class="zf-fav-toggle" title="Apenas favoritos">
                            <input type="checkbox" id="zf-fav-only">
                            <span class="zf-fav-slider"></span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        </label>
                    </div>
                    <!-- Items List -->
                    <div class="zf-items-list" id="zf-items-list">
                        <div class="zf-loading"><div class="zf-spinner"></div></div>
                    </div>
                </div>

                <!-- PAGE: Disparos -->
                <div class="zf-page" data-page="disparos">
                    <div class="zf-disparos-header">
                        <div class="zf-disparos-title">Disparar em massa</div>
                        <div class="zf-type-tabs">
                            <button class="zf-type-tab zf-tab-active" title="Texto"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg></button>
                            <button class="zf-type-tab" title="Áudio"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></button>
                            <button class="zf-type-tab" title="Mídia"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></button>
                            <button class="zf-type-tab" title="Documento"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg></button>
                        </div>
                    </div>
                    <div class="zf-search-bar">
                        <div class="zf-search-wrap">
                            <span class="zf-search-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
                            <input type="text" class="zf-search-input" placeholder="Buscar item para disparar...">
                        </div>
                    </div>
                    <div class="zf-items-list" id="zf-disparos-list">
                        <div class="zf-empty-state">
                            <div class="zf-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5-4 5-4s2.92 3.38 4 5c-1 1.45-4 5-4 5H9z"/></svg></div>
                            <div class="zf-empty-title">Disparos em massa</div>
                            <div class="zf-empty-desc">Selecione um item e configure os disparos</div>
                        </div>
                    </div>
                </div>

                <!-- PAGE: Ajustes -->
                <div class="zf-page" data-page="ajustes">
                    <div class="zf-settings-page">
                        <div class="zf-settings-section">
                            <div class="zf-settings-section-title">Envio dos Itens</div>
                            <div class="zf-setting-row">
                                <span class="zf-setting-label">Perguntar ao enviar itens únicos</span>
                                <label class="zf-toggle">
                                    <input type="checkbox" checked>
                                    <span class="zf-toggle-track"></span>
                                    <span class="zf-toggle-thumb"></span>
                                </label>
                            </div>
                            <div class="zf-setting-row">
                                <span class="zf-setting-label">Perguntar ao enviar funis</span>
                                <label class="zf-toggle">
                                    <input type="checkbox" checked>
                                    <span class="zf-toggle-track"></span>
                                    <span class="zf-toggle-thumb"></span>
                                </label>
                            </div>
                        </div>
                        <div class="zf-settings-section">
                            <div class="zf-settings-section-title">Aparência</div>
                            <div class="zf-setting-row">
                                <span class="zf-setting-label">Tema da Barra Lateral</span>
                            </div>
                            <div class="zf-theme-btns">
                                <button class="zf-theme-btn zf-theme-active"><span class="zf-dot" style="background:#8b5cf6"></span> Escuro</button>
                                <button class="zf-theme-btn"><span class="zf-dot" style="background:#f1f5f9"></span> Claro</button>
                                <button class="zf-theme-btn"><span class="zf-dot" style="background:#00a884"></span> WhatsApp</button>
                            </div>
                        </div>
                        <div class="zf-settings-section">
                            <div class="zf-settings-section-title">Barra de acesso rápido</div>
                            <div class="zf-setting-row">
                                <span class="zf-setting-label">Ocultar barra de itens</span>
                                <label class="zf-toggle">
                                    <input type="checkbox">
                                    <span class="zf-toggle-track"></span>
                                    <span class="zf-toggle-thumb"></span>
                                </label>
                            </div>
                            <div class="zf-setting-row">
                                <span class="zf-setting-label">Mostrar apenas favoritos</span>
                                <label class="zf-toggle">
                                    <input type="checkbox">
                                    <span class="zf-toggle-track"></span>
                                    <span class="zf-toggle-thumb"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Vertical Icon Navigation -->
            <div class="zf-icon-nav">
                <button class="zf-nav-item zf-nav-active" data-nav="envios">
                    <span class="zf-nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span>
                    <span class="zf-nav-label">Envios</span>
                </button>
                <button class="zf-nav-item" data-nav="itens">
                    <span class="zf-nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg></span>
                    <span class="zf-nav-label">Itens</span>
                </button>
                <button class="zf-nav-item" data-nav="disparos">
                    <span class="zf-nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5-4 5-4s2.92 3.38 4 5c-1 1.45-4 5-4 5H9z"/></svg></span>
                    <span class="zf-nav-label">Disparos</span>
                </button>
                <div class="zf-nav-divider"></div>
                <button class="zf-nav-item" data-nav="ajustes">
                    <span class="zf-nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span>
                    <span class="zf-nav-label">Ajustes</span>
                </button>
                <div class="zf-nav-spacer"></div>
                <button class="zf-nav-item" id="zf-refresh-btn" title="Recarregar dados">
                    <span class="zf-nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21.05 10A9 9 0 1 1 18 4l3 4"/></svg></span>
                    <span class="zf-nav-label">Atualizar</span>
                </button>
            </div>
        `;

        document.body.appendChild(root);
        bindEvents();
        console.log('✅ ZapFlow: Sidebar injected');
    }

    // ===== BIND EVENTS =====
    function bindEvents() {
        // Close button
        document.getElementById('zf-close').onclick = () => toggleSidebar();

        // Navigation
        document.querySelectorAll('.zf-nav-item[data-nav]').forEach(btn => {
            btn.onclick = () => {
                currentPage = btn.getAttribute('data-nav');
                document.querySelectorAll('.zf-nav-item').forEach(n => n.classList.remove('zf-nav-active'));
                btn.classList.add('zf-nav-active');
                document.querySelectorAll('.zf-page').forEach(p => p.classList.remove('zf-page-active'));
                const page = document.querySelector(`.zf-page[data-page="${currentPage}"]`);
                if (page) page.classList.add('zf-page-active');
                renderCurrentPage();
            };
        });

        // Filter buttons
        document.querySelectorAll('.zf-filter-btn').forEach(btn => {
            btn.onclick = () => {
                currentFilter = btn.getAttribute('data-filter');
                document.querySelectorAll('.zf-filter-btn').forEach(b => b.classList.remove('zf-active'));
                btn.classList.add('zf-active');
                renderItems();
            };
        });

        // Search
        const searchInput = document.getElementById('zf-search');
        if (searchInput) {
            searchInput.oninput = () => {
                searchQuery = searchInput.value.toLowerCase();
                renderItems();
            };
        }

        // Favorites toggle
        const favToggle = document.getElementById('zf-fav-only');
        if (favToggle) {
            favToggle.onchange = () => {
                showFavOnly = favToggle.checked;
                renderItems();
            };
        }

        // Refresh
        const refreshBtn = document.getElementById('zf-refresh-btn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                if (sb) loadAllData();
            };
        }
    }

    // ===== TOGGLE SIDEBAR =====
    function toggleSidebar() {
        const root = document.getElementById('zf-sidebar-root');
        const btn = document.getElementById('zf-toggle-btn');
        if (!root || !btn) return;

        root.classList.toggle('zf-hidden');
        btn.classList.toggle('zf-sidebar-open');
    }

    // ===== RENDER CURRENT PAGE =====
    function renderCurrentPage() {
        if (currentPage === 'itens') {
            renderItems();
        }
    }

    // ===== RENDER ITEMS LIST =====
    function renderItems() {
        const container = document.getElementById('zf-items-list');
        if (!container) return;

        let items = [];

        // Build unified item list
        if (currentFilter === 'all' || currentFilter === 'msg') {
            messagesData.forEach(m => {
                items.push({
                    id: m.id,
                    type: 'msg',
                    title: m.title,
                    subtitle: (m.content || '').substring(0, 50) + '...',
                    isFavorite: m.is_favorite,
                    content: m.content,
                    url: null
                });
            });
        }

        if (currentFilter === 'all' || currentFilter === 'audio') {
            mediaData.filter(m => m.type === 'audio').forEach(m => {
                items.push({
                    id: m.id,
                    type: 'audio',
                    title: m.title,
                    subtitle: formatFileSize(m.size),
                    isFavorite: m.is_favorite,
                    content: null,
                    url: m.url
                });
            });
        }

        if (currentFilter === 'all' || currentFilter === 'media') {
            mediaData.filter(m => m.type === 'image' || m.type === 'video').forEach(m => {
                items.push({
                    id: m.id,
                    type: 'media',
                    title: m.title,
                    subtitle: `${m.type === 'image' ? 'Imagem' : 'Vídeo'} • ${formatFileSize(m.size)}`,
                    isFavorite: m.is_favorite,
                    content: m.caption,
                    url: m.url
                });
            });
        }

        if (currentFilter === 'all' || currentFilter === 'doc') {
            mediaData.filter(m => m.type === 'document').forEach(m => {
                items.push({
                    id: m.id,
                    type: 'doc',
                    title: m.title,
                    subtitle: formatFileSize(m.size),
                    isFavorite: m.is_favorite,
                    content: null,
                    url: m.url
                });
            });
        }

        // Apply search
        if (searchQuery) {
            items = items.filter(i => i.title.toLowerCase().includes(searchQuery));
        }

        // Apply favorites filter
        if (showFavOnly) {
            items = items.filter(i => i.isFavorite);
        }

        // Render
        if (items.length === 0) {
            container.innerHTML = `
                <div class="zf-empty-state">
                    <div class="zf-empty-icon"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg></div>
                    <div class="zf-empty-title">Nenhum item encontrado</div>
                    <div class="zf-empty-desc">Adicione itens no painel ZapFlow</div>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="zf-item-card" data-id="${item.id}" data-type="${item.type}">
                <div class="zf-item-info">
                    <div class="zf-item-icon zf-${item.type}">
                        ${item.type === 'msg' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>' : item.type === 'audio' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>' : item.type === 'media' ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'}
                    </div>
                    <div>
                        <div class="zf-item-name">${escapeHtml(item.title)}</div>
                        <div class="zf-item-subtitle">${escapeHtml(item.subtitle || '')}</div>
                    </div>
                </div>
                <div class="zf-item-actions">
                    <button class="zf-item-action-btn zf-item-fav ${item.isFavorite ? 'zf-favorited' : ''}" title="Favorito">
                        ${item.isFavorite ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'}
                    </button>
                    <button class="zf-item-action-btn zf-send-btn" title="Enviar na conversa" data-action="send">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                </div>
            </div>
        `).join('');

        // Bind send buttons
        container.querySelectorAll('.zf-send-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const card = btn.closest('.zf-item-card');
                const id = parseInt(card.getAttribute('data-id'));
                const type = card.getAttribute('data-type');
                const item = items.find(i => i.id === id && i.type === type);
                if (item) sendItem(item);
            };
        });
    }

    // ===== SEND ITEM TO WHATSAPP =====
    function sendItem(item) {
        if (item.type === 'msg') {
            injectTextMessage(item.content);
        } else {
            // For media/audio/doc - open URL or copy to clipboard
            if (item.url) {
                copyToClipboard(item.url);
                showToast('🔗 URL copiado! Cole no WhatsApp');
            } else {
                showToast('⚠️ Arquivo sem URL');
            }
        }
    }

    // ===== INJECT TEXT INTO WHATSAPP INPUT =====
    function injectTextMessage(text) {
        // Find WhatsApp's input box
        const inputBox = document.querySelector('div[contenteditable="true"][data-tab="10"]')
            || document.querySelector('footer div[contenteditable="true"]')
            || document.querySelector('div[contenteditable="true"][role="textbox"]');

        if (!inputBox) {
            showToast('⚠️ Abra uma conversa primeiro');
            return;
        }

        // Focus & inject
        inputBox.focus();

        // Use execCommand for compatibility with WhatsApp's React
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);

        // Trigger input event so WhatsApp recognizes the text
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));

        showToast('✅ Mensagem inserida!');
    }

    // ===== COPY TO CLIPBOARD =====
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    }

    // ===== SHOW TOAST =====
    function showToast(msg) {
        const existing = document.querySelector('.zf-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'zf-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 2500);
    }

    // ===== UTILS =====
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatFileSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ===== START =====
    init();
})();
