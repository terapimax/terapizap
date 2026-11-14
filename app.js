// Configuração customizada para o Tailwind CSS
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'zap-dark': '#2B2C40',
                'zap-sidebar': '#3A3B54',
                'zap-card': '#4A4B68',
                'zap-primary': '#E13584',
                'zap-secondary': '#8A6CFF',
                'zap-text': '#E0E0E0',
                'zap-text-secondary': '#A0A0A0',
                'zap-blue': '#3B82F6',
                'zap-green': '#10B981',
                'zap-yellow': '#F59E0B',
            }
        }
    }
}

// --- VARIÁVEIS GLOBAIS ---
// const API_BASE = 'http://localhost:3001'; // REMOVED: Online Only Mode
const API_BASE = null; // Disable local API

// ===== SUPABASE CONFIGURATION (GLOBAL) =====
const SUPABASE_URL = 'https://fhhqctngrukjjozsrkvx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PwraXGFf34pUUEW-dZmaJA_QRCjaNbN';
// let supabase = null; // Init in DOMContentLoaded - REMOVED to avoid conflict with CDN library
async function getCurrentUserId() {
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        console.warn('User not authenticated');
        return null;
    }
    return user.id;
}
var kanbanData = [];
var messages = [];
var audios = [];
var midias = [];
var documentos = [];
var funis = [];
var gatilhos = [];
var currentEditingLead = null;
var currentEditingColumnId = null;

// --- HISTORY HELPER (GLOBAL) ---
window.addLeadHistory = function (lead, type, title, desc, icon = 'check', color = 'gray') {
    if (!lead) return;
    if (!lead.history) lead.history = [];

    lead.history.unshift({
        id: Date.now() + Math.random(),
        date: new Date().toISOString(),
        type,
        title,
        desc,
        icon,
        color
    });
};

window.updateTempVisuals = function (temp) {
    const leadTempBadgeBtn = document.getElementById('lead-temp-badge-btn');
    const leadTempText = document.getElementById('lead-temp-text');
    if (!leadTempBadgeBtn || !leadTempText) return;

    // Reset classes
    leadTempBadgeBtn.className = "px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md border shadow-lg transition-all duration-300 cursor-pointer flex items-center gap-2 group relative overflow-hidden";
    const indicator = leadTempBadgeBtn.querySelector('div');
    if (indicator) indicator.className = "w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)]";

    if (temp === 'hot') {
        leadTempBadgeBtn.classList.add('bg-red-500/20', 'text-red-300', 'border-red-500/30', 'hover:bg-red-500/30', 'shadow-red-900/20');
        if (indicator) indicator.classList.add('bg-red-400');
        leadTempText.textContent = 'Quente';
    } else if (temp === 'warm') {
        leadTempBadgeBtn.classList.add('bg-yellow-500/20', 'text-yellow-300', 'border-yellow-500/30', 'hover:bg-yellow-500/30', 'shadow-yellow-900/20');
        if (indicator) indicator.classList.add('bg-yellow-400');
        leadTempText.textContent = 'Morno';
    } else {
        leadTempBadgeBtn.classList.add('bg-blue-500/20', 'text-blue-300', 'border-blue-500/30', 'hover:bg-blue-500/30', 'shadow-blue-900/20');
        if (indicator) indicator.classList.add('bg-blue-400');
        leadTempText.textContent = 'Frio';
    }
};

window.updateDashboardCounters = function () {
    if (!kanbanData) return;
    const totalLeads = document.getElementById('total-leads-count');
    const activeLeads = document.getElementById('active-leads-count');

    let total = 0;
    kanbanData.forEach(col => total += col.items.length);

    if (totalLeads) totalLeads.textContent = total;
    if (activeLeads) activeLeads.textContent = total;
};

document.addEventListener('DOMContentLoaded', async function () {
    // --- DEBUG & CONNECTION CHECK ---
    console.log('🚀 Zapflow App Initializing...');

    // Clear HTML Safety Timeout if possible
    if (typeof window.safetyTimeout !== 'undefined') {
        console.log('🛡️ Clearing HTML Safety Timeout');
        clearTimeout(window.safetyTimeout);
    } else {
        console.log('⚠️ safetyTimeout not found (scope issue?)');
    }

    // Check Supabase
    // Check Supabase
    // Check Supabase
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        console.log('✅ Supabase SDK Library Found');
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('✅ Supabase Client Created');
        } catch (err) {
            console.error('❌ Failed to create Supabase client:', err);
        }
    } else {
        console.warn('⚠️ Supabase SDK Library NOT found on window.supabase');
    }

    if (supabase) {
        try {
            console.log('✅ Supabase Client Ready, setting up Auth state listener...');

            // Setup Auth listener
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`🔑 Auth State Event: ${event}`);
                const authOverlay = document.getElementById('auth-overlay');
                
                if (session) {
                    console.log('🔓 Active session found for user:', session.user.email);
                    if (authOverlay) authOverlay.classList.add('hidden');
                    
                    // Fetch data since user is authenticated
                    try {
                        if (typeof fetchAllData === 'function') {
                            await fetchAllData();
                        } else if (typeof fetchKanbanData === 'function') {
                            await fetchKanbanData();
                        }
                    } catch (fetchErr) {
                        console.error('Error fetching data after sign in:', fetchErr);
                    }
                    hideGlobalLoader();
                } else {
                    console.log('🔒 No active session. Showing login overlay.');
                    if (authOverlay) authOverlay.classList.remove('hidden');
                    hideGlobalLoader();
                }
            });

            // Set up login/signup form event listeners
            const authForm = document.getElementById('auth-form');
            const authEmail = document.getElementById('auth-email');
            const authPassword = document.getElementById('auth-password');
            const authSubmitBtn = document.getElementById('auth-submit-btn');
            const authToggleBtn = document.getElementById('auth-toggle-btn');
            const authTitle = document.getElementById('auth-title');
            const authSubtitle = document.getElementById('auth-subtitle');
            const authToggleText = document.getElementById('auth-toggle-text');

            let isSignUpMode = false;

            if (authToggleBtn) {
                authToggleBtn.addEventListener('click', () => {
                    isSignUpMode = !isSignUpMode;
                    if (isSignUpMode) {
                        if (authTitle) authTitle.textContent = 'Criar Conta';
                        if (authSubtitle) authSubtitle.textContent = 'Cadastre-se para começar a usar o ZapFlow.';
                        if (authSubmitBtn) authSubmitBtn.textContent = 'Criar Conta';
                        if (authToggleText) authToggleText.textContent = 'Já tem uma conta?';
                        if (authToggleBtn) authToggleBtn.textContent = 'Fazer Login';
                    } else {
                        if (authTitle) authTitle.textContent = 'Bem-vindo(a)';
                        if (authSubtitle) authSubtitle.textContent = 'Faça login para continuar para o ZapFlow.';
                        if (authSubmitBtn) authSubmitBtn.textContent = 'Entrar';
                        if (authToggleText) authToggleText.textContent = 'Não tem uma conta?';
                        if (authToggleBtn) authToggleBtn.textContent = 'Criar conta';
                    }
                });
            }

            if (authForm) {
                authForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = authEmail.value.trim();
                    const password = authPassword.value;

                    if (!email || !password) return;

                    try {
                        if (isSignUpMode) {
                            const { data, error } = await supabase.auth.signUp({ email, password });
                            if (error) throw error;
                            
                            Swal.fire({
                                icon: 'info',
                                title: 'Cadastro Iniciado!',
                                text: 'Verifique seu e-mail para confirmar a conta e liberar o acesso.',
                                confirmButtonColor: '#E13584'
                            });
                            hideGlobalLoader();
                        } else {
                            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                            if (error) throw error;
                            
                            Swal.fire({
                                icon: 'success',
                                title: 'Sucesso!',
                                text: 'Login efetuado com sucesso!',
                                timer: 1500,
                                showConfirmButton: false
                            });
                        }
                    } catch (err) {
                        console.error('Auth Error:', err);
                        hideGlobalLoader();
                        Swal.fire({
                            icon: 'error',
                            title: 'Erro de Autenticação',
                            text: err.message || 'Credenciais inválidas',
                            confirmButtonColor: '#E13584'
                        });
                    }
                });
            }

            window.logoutZapflow = async function() {
                showGlobalLoader();
                try {
                    await supabase.auth.signOut();
                    showToast('Sessão encerrada', 'info');
                } catch (logoutErr) {
                    console.error('Logout error:', logoutErr);
                } finally {
                    hideGlobalLoader();
                }
            };

        } catch (e) {
            console.error('❌ Supabase Init Error:', e);
            Swal.fire({
                icon: 'error',
                title: 'Erro Crítico',
                text: 'Falha ao inicializar sistema: ' + e.message,
                confirmButtonColor: '#E13584'
            });
        }
    } else {
        console.error('❌ Supabase SDK MISSING');
        Swal.fire({
            icon: 'error',
            title: 'Erro de Carregamento',
            text: 'A biblioteca do sistema não foi carregada.',
            confirmButtonColor: '#E13584'
        });
    }

    const menuItems = document.querySelectorAll('.menu-item');
    const pages = document.querySelectorAll('.page-content');

    // Lógica de Navegação do Menu
    menuItems.forEach(item => {
        item.addEventListener('click', function (event) {
            event.preventDefault();
            const targetPageId = this.getAttribute('data-target');
            pages.forEach(page => page.classList.add('hidden'));
            const targetPage = document.getElementById(targetPageId);
            if (targetPage) targetPage.classList.remove('hidden');

            document.querySelectorAll('.menu-item').forEach(link => {
                // Remove active state classes
                link.classList.remove('bg-zap-primary', 'text-white', 'shadow-lg', 'shadow-zap-primary/20', 'bg-zap-dark', 'border-l-4', 'border-zap-primary', 'font-semibold');
                // Add inactive state classes
                link.classList.add('text-zap-text-secondary', 'hover:bg-white/5', 'hover:text-white');
            });

            // Apply active state to clicked item
            this.classList.remove('text-zap-text-secondary', 'hover:bg-white/5', 'hover:text-white');
            this.classList.add('bg-zap-primary', 'text-white', 'shadow-lg', 'shadow-zap-primary/20', 'font-semibold');

            // Trigger Renders based on page
            if (targetPageId === 'page-kanban') renderKanban();
            if (targetPageId === 'page-mensagens') renderMessages();
            if (targetPageId === 'page-audios') renderAudios();
            if (targetPageId === 'page-midias') renderMidias();
            if (targetPageId === 'page-documentos') renderDocumentos();
            if (targetPageId === 'page-funis') renderFunis();
            if (targetPageId === 'page-inicio') updateDashboardCounters();
        });
    });

    // Lógica do Menu de Configurações
    const settingsBtn = document.getElementById('settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!settingsMenu.contains(e.target) && !settingsBtn.contains(e.target)) {
                settingsMenu.classList.add('hidden');
            }
        });
    }

    // --- BANCO DE DADOS GERAL (SIMULADO) ---
    messages = [
        { id: 1, title: 'Saudação Inicial', content: 'Olá! Tudo bem? Vi que você se interessou pelo nosso produto. Gostaria de mais alguma informação?', isFavorite: false },
        { id: 2, title: 'Follow-up 1', content: 'Olá, passando para saber se você conseguiu dar uma olhada na nossa proposta.', isFavorite: true },
        { id: 3, title: 'Proposta Comercial', content: 'Segue em anexo nossa proposta comercial detalhada.', isFavorite: false },
        { id: 4, title: 'Boas Vindas', content: 'Seja bem-vindo à nossa plataforma! Qualquer dúvida estamos à disposição.', isFavorite: false }
    ];
    audios = [];
    midias = [];
    documentos = [];
    funis = [];
    gatilhos = [];
    kanbanData = [
        {
            id: 1, title: 'Novos Leads', items: [
                { id: 101, name: 'Ana Clara', phone: '11987654321', email: '', product: 'Produto A', value: 1500, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024d', lastMessage: 'Olá, gostaria de um orçamento...' },
                { id: 102, name: 'Bruno Costa', phone: '21987654321', email: '', product: 'Produto B', value: 0, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d', lastMessage: 'Tenho interesse no produto.' },
                { id: 105, name: 'Fernanda Lima', phone: '31988887777', email: '', product: 'Mentoria', value: 3000, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026024e', lastMessage: 'Como funciona o pagamento?' }
            ]
        },
        {
            id: 2, title: 'Em Negociação', items: [
                { id: 103, name: 'Carlos Silva', phone: '31987654321', email: '', product: 'Produto C', value: 5000, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026025d', lastMessage: 'Podemos marcar uma reunião?' }
            ]
        },
        {
            id: 3, title: 'Agendado', items: []
        },
        {
            id: 4, title: 'Fechado', items: [
                { id: 104, name: 'Daniela Souza', phone: '41987654321', email: '', product: 'Produto A', value: 1500, avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026026d', lastMessage: 'Pagamento confirmado!' }
            ]
        }
    ];

    // Base da API quando o backend estiver ativo
    // let API_BASE = ''; // REMOVED: Online Only Mode

    // Tenta carregar dados do backend se disponível
    /*
    (async function tryLoadBackend() {
        // ... REMOVED FOR ONLINE ONLY MODE ...
    })();
    */

    // Force Render Initial State (Empty or Mock)
    try { if (typeof renderMessages === 'function') renderMessages(); } catch (err) { }
    try { if (typeof renderKanban === 'function') renderKanban(); } catch (err) { }
    try { if (typeof renderAudios === 'function') renderAudios(); } catch (err) { }
    try { if (typeof renderMidias === 'function') renderMidias(); } catch (err) { }
    try { if (typeof renderDocumentos === 'function') renderDocumentos(); } catch (err) { }
    try { if (typeof renderFunis === 'function') renderFunis(); } catch (err) { }
    try { updateDashboardCounters && typeof updateDashboardCounters === 'function' && updateDashboardCounters(); } catch (e) { }

    // --- LÓGICA DA PÁGINA DE MENSAGENS ---
    const messageListContainer = document.getElementById('message-list');
    const searchMessageInput = document.getElementById('search-message-input');
    const addMessageBtn = document.getElementById('add-message-btn');
    const messageWelcomePanel = document.getElementById('message-welcome-panel');
    const messageDetailsPanel = document.getElementById('message-details-panel');
    const messageTitleDisplay = document.getElementById('message-title-display');
    const messageContentDisplay = document.getElementById('message-content-display');
    const deleteMessageBtn = document.getElementById('delete-message-btn');
    const editMessageBtn = document.getElementById('edit-message-btn');
    const saveMessageBtn = document.getElementById('save-message-btn');
    const favoriteMessageBtn = document.getElementById('favorite-message-btn');
    const starOutline = document.getElementById('star-outline');
    const starSolid = document.getElementById('star-solid');
    let selectedMessageId = null;
    let isEditingMessage = false;

    function renderMessages() {
        if (!messageListContainer) return;
        messageListContainer.innerHTML = '';
        const searchTerm = searchMessageInput ? searchMessageInput.value.toLowerCase() : '';

        // Filter messages based on search
        const filteredMessages = messages.filter(msg =>
            msg.title.toLowerCase().includes(searchTerm) ||
            msg.content.toLowerCase().includes(searchTerm)
        );

        if (filteredMessages.length === 0) {
            messageListContainer.innerHTML = `
            <div class="text-center py-10 text-gray-500">
                <p class="text-sm">Nenhuma mensagem encontrada.</p>
            </div>
        `;
            return;
        }

        filteredMessages.forEach(msg => {
            const isActive = msg.id === selectedMessageId;
            const itemDiv = document.createElement('div');

            // Premium List Item Style with Glassmorphism
            itemDiv.className = `group p-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-300 border backdrop-blur-sm ${isActive
                ? 'bg-zap-primary/20 border-zap-primary/50 shadow-lg shadow-zap-primary/10 translate-x-1'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:translate-x-1'}`;
            itemDiv.dataset.id = msg.id;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center overflow-hidden flex-1';

            // Icon/Avatar Placeholder
            const iconDiv = document.createElement('div');
            iconDiv.className = `w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 transition-colors duration-300 ${isActive ? 'bg-zap-primary text-white shadow-md shadow-zap-primary/20' : 'bg-white/5 text-zap-text-secondary group-hover:bg-white/10 group-hover:text-white'}`;
            iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>`;
            contentDiv.appendChild(iconDiv);

            const textDiv = document.createElement('div');
            textDiv.className = 'overflow-hidden flex-1 min-w-0 pr-2';

            const titleEl = document.createElement('h4');
            titleEl.className = `font-semibold truncate text-sm transition-colors duration-300 ${isActive ? 'text-white' : 'text-zap-text group-hover:text-white'}`;
            titleEl.textContent = msg.title;

            const previewEl = document.createElement('p');
            previewEl.className = 'text-xs text-zap-text-secondary truncate transition-colors duration-300 group-hover:text-gray-400';
            previewEl.textContent = msg.content;

            textDiv.appendChild(titleEl);
            textDiv.appendChild(previewEl);
            contentDiv.appendChild(textDiv);

            itemDiv.appendChild(contentDiv);

            if (msg.isFavorite) {
                const starIcon = document.createElement('div');
                starIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-yellow-400 drop-shadow-md" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
                itemDiv.appendChild(starIcon);
            }

            itemDiv.addEventListener('click', () => {
                selectedMessageId = msg.id;
                isEditingMessage = false;
                displayMessageDetails(msg.id);
                renderMessages();
            });
            messageListContainer.appendChild(itemDiv);
        });
    }

    function displayMessageDetails(id) {
        const message = messages.find(m => m.id === id);
        if (!message) return;

        // Toggle panels
        messageWelcomePanel.classList.add('hidden');
        messageDetailsPanel.classList.remove('hidden');
        messageDetailsPanel.classList.add('flex');

        // Populate data
        messageTitleDisplay.value = message.title;
        messageContentDisplay.value = message.content;

        // Handle Favorites Star
        if (message.isFavorite) {
            starOutline.classList.add('hidden');
            starSolid.classList.remove('hidden');
        } else {
            starOutline.classList.remove('hidden');
            starSolid.classList.add('hidden');
        }

        // Handle Edit Mode UI
        if (isEditingMessage) {
            messageTitleDisplay.readOnly = false;
            messageContentDisplay.readOnly = false;
            messageTitleDisplay.classList.remove('bg-transparent', 'border-none');
            messageTitleDisplay.classList.add('bg-white/10', 'border-b', 'border-zap-primary');

            editMessageBtn.classList.add('hidden');
            saveMessageBtn.classList.remove('hidden');

            messageContentDisplay.parentElement.classList.add('ring-2', 'ring-zap-primary/30');
            messageTitleDisplay.focus();
        } else {
            messageTitleDisplay.readOnly = true;
            messageContentDisplay.readOnly = true;
            messageTitleDisplay.classList.add('bg-transparent', 'border-none');
            messageTitleDisplay.classList.remove('bg-white/10', 'border-b', 'border-zap-primary');

            editMessageBtn.classList.remove('hidden');
            saveMessageBtn.classList.add('hidden');

            messageContentDisplay.parentElement.classList.remove('ring-2', 'ring-zap-primary/30');
        }
    }

    if (addMessageBtn) addMessageBtn.addEventListener('click', async () => {
        const title = prompt('Digite o título da nova mensagem:');
        if (title && title.trim() !== '') {
            try {
                showGlobalLoader();
                const userId = await getCurrentUserId();
                if (!userId) {
                    showToast('Erro: Não autenticado', 'error');
                    return;
                }
                const { data, error } = await supabase
                    .from('messages')
                    .insert([{ user_id: userId, title, content: 'Escreva sua mensagem aqui...', is_favorite: false }])
                    .select();

                if (error) throw error;

                if (data && data[0]) {
                    // Update Local State
                    messages.unshift({
                        id: data[0].id,
                        title: data[0].title,
                        content: data[0].content,
                        isFavorite: data[0].is_favorite
                    });

                    selectedMessageId = data[0].id;
                    isEditingMessage = true;
                    renderMessages();
                    displayMessageDetails(data[0].id);
                    showToast('Mensagem criada!', 'success');
                }
            } catch (err) {
                console.error('Error creating message:', err);
                showToast('Erro ao criar mensagem.', 'error');
            } finally {
                hideGlobalLoader();
            }
        }
    });

    if (deleteMessageBtn) deleteMessageBtn.addEventListener('click', async () => {
        if (!selectedMessageId) return;

        const result = await Swal.fire({
            title: 'Apagar mensagem?',
            text: "Esta ação não pode ser desfeita.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim, apagar',
            cancelButtonText: 'Cancelar',
            background: '#1e293b',
            color: '#fff'
        });

        if (!result.isConfirmed) return;

        /*
        if (API_BASE) {
            try {
                const res = await fetch(API_BASE + '/api/messages/' + selectedMessageId, { method: 'DELETE' });
                if (!res.ok) throw new Error('API error');
                messages = messages.filter(m => m.id !== selectedMessageId);
                showToast('Mensagem removida', 'success');
            } catch (e) { showToast('Erro ao apagar no backend.', 'error'); return; }
        } else {
        */
        messages = messages.filter(m => m.id !== selectedMessageId);
        showToast('Mensagem removida (local)', 'success');
        // }
        selectedMessageId = null; isEditingMessage = false;
        messageDetailsPanel.classList.add('hidden'); messageDetailsPanel.classList.remove('flex');
        messageWelcomePanel.classList.remove('hidden');
        renderMessages();
    });

    if (editMessageBtn) editMessageBtn.addEventListener('click', () => { if (!selectedMessageId) return; isEditingMessage = true; displayMessageDetails(selectedMessageId); });

    if (saveMessageBtn) saveMessageBtn.addEventListener('click', async () => {
        if (!selectedMessageId) return;
        const message = messages.find(m => m.id === selectedMessageId);
        if (!message) return;
        const newTitle = messageTitleDisplay.value; const newContent = messageContentDisplay.value;
        /*
        if (API_BASE) {
            try {
                await fetch(API_BASE + '/api/messages/' + selectedMessageId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle, content: newContent }) });
                message.title = newTitle; message.content = newContent;
                showToast('Mensagem salva', 'success');
            } catch (e) { alert('Erro ao salvar no backend.'); }
        } else {
        */
        message.title = newTitle; message.content = newContent;
        showToast('Mensagem salva (local)', 'success');
        // }
        renderMessages(); displayMessageDetails(selectedMessageId);
        isEditingMessage = false;
    });

    if (favoriteMessageBtn) favoriteMessageBtn.addEventListener('click', async () => {
        if (!selectedMessageId) return;
        const message = messages.find(m => m.id === selectedMessageId);
        if (!message) return;
        const newStatus = !message.isFavorite;
        /*
        if (API_BASE) {
            try { await fetch(API_BASE + '/api/messages/' + selectedMessageId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_favorite: newStatus }) }); } catch (e) { }
        }
        */
        message.isFavorite = newStatus;
        if (!isEditingMessage) { displayMessageDetails(selectedMessageId); renderMessages(); }
        showToast('Favorito atualizado', 'success');
    });
    renderMessages();


    // --- LÓGICA DA PÁGINA DE ÁUDIOS ---
    const audioListContainer = document.getElementById('audio-list');
    const searchAudioInput = document.getElementById('search-audio-input');
    const addAudioBtn = document.getElementById('add-audio-btn');
    const audioWelcomePanel = document.getElementById('audio-welcome-panel');
    const audioDetailsPanel = document.getElementById('audio-details-panel');
    const audioTitleDisplay = document.getElementById('audio-title-display');
    const audioPlayer = document.getElementById('audio-player');
    const deleteAudioBtn = document.getElementById('delete-audio-btn');
    const editAudioBtn = document.getElementById('edit-audio-btn');
    const saveAudioBtn = document.getElementById('save-audio-btn');
    const downloadAudioBtn = document.getElementById('download-audio-btn');
    const favoriteAudioBtn = document.getElementById('favorite-audio-btn');
    const audioStarOutline = document.getElementById('audio-star-outline');
    const audioStarSolid = document.getElementById('audio-star-solid');
    const addAudioModal = document.getElementById('add-audio-modal');
    const addAudioForm = document.getElementById('add-audio-form');
    const cancelAudioModalBtn = document.getElementById('cancel-audio-modal');
    const audioNameInput = document.getElementById('audio-name-input');
    const audioDropzone = document.getElementById('audio-dropzone');
    const audioDropzoneFile = document.getElementById('audio-dropzone-file');
    const dropzoneText = document.getElementById('dropzone-text');
    let selectedAudioId = null;
    let isEditingAudio = false;
    let audioFileToUpload = null;

    function renderAudios() {
        if (!audioListContainer) return;
        audioListContainer.innerHTML = '';
        const searchTerm = searchAudioInput ? searchAudioInput.value.toLowerCase() : '';

        // Filter audios based on search
        const filteredAudios = audios.filter(audio =>
            audio.title.toLowerCase().includes(searchTerm)
        );

        if (filteredAudios.length === 0) {
            audioListContainer.innerHTML = `
            <div class="text-center py-10 text-gray-500">
                <p class="text-sm">Nenhum áudio encontrado.</p>
            </div>
        `;
            return;
        }

        filteredAudios.forEach(audio => {
            const isActive = audio.id === selectedAudioId;
            const itemDiv = document.createElement('div');

            // Premium Audio List Item Style
            itemDiv.className = `group p-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-300 border backdrop-blur-sm ${isActive
                ? 'bg-zap-secondary/20 border-zap-secondary/50 shadow-lg shadow-zap-secondary/10 translate-x-1'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:translate-x-1'}`;
            itemDiv.dataset.id = audio.id;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center overflow-hidden flex-1';

            // Icon Placeholder with Play/Pause hint (could be dynamic)
            const iconDiv = document.createElement('div');
            iconDiv.className = `w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 transition-colors duration-300 ${isActive ? 'bg-zap-secondary text-white shadow-md shadow-zap-secondary/20' : 'bg-white/5 text-zap-text-secondary group-hover:bg-white/10 group-hover:text-white'}`;
            iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>`;
            contentDiv.appendChild(iconDiv);

            const textDiv = document.createElement('div');
            textDiv.className = 'overflow-hidden flex-1 min-w-0 pr-2';

            const titleEl = document.createElement('h4');
            titleEl.className = `font-semibold truncate text-sm transition-colors duration-300 ${isActive ? 'text-white' : 'text-zap-text group-hover:text-white'}`;
            titleEl.textContent = audio.title;

            const subtitleEl = document.createElement('p');
            subtitleEl.className = 'text-xs text-zap-text-secondary truncate flex items-center gap-1 transition-colors duration-300 group-hover:text-gray-400';
            // Add badges to list item if applicable
            let metaText = audio.duration ? audio.duration : '00:00';
            if (audio.isForwarded) metaText += ' • Encaminhada';
            subtitleEl.textContent = metaText;

            textDiv.appendChild(titleEl);
            textDiv.appendChild(subtitleEl);
            contentDiv.appendChild(textDiv);

            itemDiv.appendChild(contentDiv);

            if (audio.isFavorite) {
                const starIcon = document.createElement('div');
                starIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-yellow-400 drop-shadow-md" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1-118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
                itemDiv.appendChild(starIcon);
            }

            itemDiv.addEventListener('click', () => {
                selectedAudioId = audio.id;
                isEditingAudio = false;
                displayAudioDetails(audio.id);
                renderAudios();
            });
            audioListContainer.appendChild(itemDiv);
        });
        updateDashboardCounters();
    }

    function displayAudioDetails(id) {
        const audio = audios.find(a => a.id === id);
        if (!audio) return;

        // Toggle panels
        audioWelcomePanel.classList.add('hidden');
        audioDetailsPanel.classList.remove('hidden');
        audioDetailsPanel.classList.add('flex');

        // Populate data
        audioTitleDisplay.value = audio.title;
        const player = document.getElementById('audio-player');
        if (player) {
            player.src = audio.url;
            player.load(); // Reload audio source
        }

        // Update Badges
        const forwardedBadge = document.getElementById('audio-forwarded-badge');
        const viewOnceBadge = document.getElementById('audio-view-once-badge');

        if (forwardedBadge) {
            forwardedBadge.innerHTML = audio.isForwarded
                ? '<span class="w-2 h-2 rounded-full bg-zap-green shadow-lg shadow-zap-green/50"></span> Sim'
                : '<span class="w-2 h-2 rounded-full bg-gray-500"></span> Não';
        }

        if (viewOnceBadge) {
            viewOnceBadge.innerHTML = audio.isViewOnce
                ? '<span class="w-2 h-2 rounded-full bg-zap-primary shadow-lg shadow-zap-primary/50"></span> Sim'
                : '<span class="w-2 h-2 rounded-full bg-gray-500"></span> Não';
        }

        // Handle Favorites Star
        if (audio.isFavorite) {
            audioStarOutline.classList.add('hidden');
            audioStarSolid.classList.remove('hidden');
        } else {
            audioStarOutline.classList.remove('hidden');
            audioStarSolid.classList.add('hidden');
        }

        // Handle Edit Mode UI
        if (isEditingAudio) {
            audioTitleDisplay.readOnly = false;
            audioTitleDisplay.classList.remove('bg-transparent', 'border-none');
            audioTitleDisplay.classList.add('bg-white/10', 'border-b', 'border-zap-secondary');

            editAudioBtn.classList.add('hidden');
            saveAudioBtn.classList.remove('hidden');
            audioTitleDisplay.focus();
        } else {
            audioTitleDisplay.readOnly = true;
            audioTitleDisplay.classList.add('bg-transparent', 'border-none');
            audioTitleDisplay.classList.remove('bg-white/10', 'border-b', 'border-zap-secondary');

            editAudioBtn.classList.remove('hidden');
            saveAudioBtn.classList.add('hidden');
        }
    }
    if (addAudioBtn) addAudioBtn.addEventListener('click', () => { if (addAudioModal) { addAudioModal.classList.remove('hidden'); addAudioModal.classList.add('flex'); } });
    if (cancelAudioModalBtn) cancelAudioModalBtn.addEventListener('click', () => { addAudioModal.classList.add('hidden'); addAudioModal.classList.remove('flex'); addAudioForm.reset(); audioFileToUpload = null; if (dropzoneText) dropzoneText.innerHTML = 'Arraste o áudio ou <span class="text-blue-600 underline">clique aqui</span>'; });
    if (audioDropzoneFile) audioDropzoneFile.addEventListener('change', (e) => handleAudioFile(e.target.files[0]));
    if (audioDropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => audioDropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false));
        ['dragenter', 'dragover'].forEach(eventName => audioDropzone.addEventListener(eventName, () => audioDropzone.classList.add('border-blue-500', 'bg-blue-50')));
        ['dragleave', 'drop'].forEach(eventName => audioDropzone.addEventListener(eventName, () => audioDropzone.classList.remove('border-blue-500', 'bg-blue-50')));
        audioDropzone.addEventListener('drop', (e) => handleAudioFile(e.dataTransfer.files[0]));
    }
    function handleAudioFile(file) {
        if (file && file.type.startsWith('audio/')) {
            audioFileToUpload = file;
            if (dropzoneText) dropzoneText.textContent = file.name;
            if (!audioNameInput.value) audioNameInput.value = file.name.split('.').slice(0, -1).join('.');
        } else alert('Por favor, selecione um arquivo de áudio válido.');
    }
    if (addAudioForm) addAudioForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = audioNameInput.value;
        if (title && title.trim() !== '' && audioFileToUpload) {
            try {
                showGlobalLoader();
                showToast('Enviando áudio...', 'info');

                const userId = await getCurrentUserId();
                if (!userId) {
                    showToast('Erro: Não autenticado', 'error');
                    return;
                }

                // 1. Upload File
                const publicUrl = await uploadToSupabase(audioFileToUpload, 'audios');

                // 2. Insert Metadata
                const { data, error } = await supabase.from('media_library').insert([{
                    user_id: userId,
                    title: title,
                    url: publicUrl,
                    type: 'audio',
                    mime_type: audioFileToUpload.type,
                    size: audioFileToUpload.size,
                    is_favorite: false
                }]).select();

                if (error) throw error;

                if (data && data[0]) {
                    audios.unshift({
                        id: data[0].id,
                        title: data[0].title,
                        url: data[0].url,
                        isFavorite: data[0].is_favorite,
                        duration: '00:00' // Placeholder
                    });

                    cancelAudioModalBtn.click();
                    renderAudios();
                    showToast('Áudio adicionado!', 'success');
                }

            } catch (err) {
                console.error(err);
                showToast('Erro ao enviar áudio', 'error');
            } finally {
                hideGlobalLoader();
            }
        } else alert('Preencha os campos obrigatórios.');
    });

    if (deleteAudioBtn) deleteAudioBtn.addEventListener('click', async () => {
        if (!selectedAudioId) return;

        const result = await Swal.fire({
            title: 'Apagar áudio?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim, apagar',
            cancelButtonText: 'Cancelar',
            background: '#1e293b',
            color: '#fff'
        });

        if (result.isConfirmed) {
            try {
                // Delete from DB (Row Level Security will handle the rest if configured, 
                // but we should manually delete from storage if we can get the path)
                const audio = audios.find(a => a.id === selectedAudioId);

                // 1. Delete from DB
                const { error } = await supabase.from('media_library').delete().eq('id', selectedAudioId);
                if (error) throw error;

                // 2. Delete from Storage (Optional/Cleanup)
                if (audio && audio.url.includes('campaign_files')) {
                    const path = audio.url.split('/campaign_files/')[1];
                    if (path) await supabase.storage.from('campaign_files').remove([path]);
                }

                showToast('Áudio apagado', 'success');
                await fetchKanbanData(); // Refresh list

            } catch (e) {
                console.error(e);
                showToast('Erro ao apagar áudio', 'error');
            }
            selectedAudioId = null; isEditingAudio = false;
            audioDetailsPanel.classList.add('hidden'); audioDetailsPanel.classList.remove('flex');
            audioWelcomePanel.classList.remove('hidden');
        }
    });
    if (editAudioBtn) editAudioBtn.addEventListener('click', () => { if (!selectedAudioId) return; isEditingAudio = true; displayAudioDetails(selectedAudioId); });
    if (saveAudioBtn) saveAudioBtn.addEventListener('click', () => { if (!selectedAudioId) return; const audio = audios.find(a => a.id === selectedAudioId); if (audio) audio.title = audioTitleDisplay.value; isEditingAudio = false; renderAudios(); displayAudioDetails(selectedAudioId); });
    if (favoriteAudioBtn) favoriteAudioBtn.addEventListener('click', () => { if (!selectedAudioId) return; const audio = audios.find(a => a.id === selectedAudioId); if (audio) { audio.isFavorite = !audio.isFavorite; if (!isEditingAudio) { displayAudioDetails(selectedAudioId); renderAudios(); } } });
    if (downloadAudioBtn) downloadAudioBtn.addEventListener('click', () => { if (!selectedAudioId) return; const audio = audios.find(a => a.id === selectedAudioId); if (audio) { const a = document.createElement('a'); a.href = audio.url; a.download = audio.title; document.body.appendChild(a); a.click(); document.body.removeChild(a); } });
    renderAudios();


    // --- LÓGICA DA PÁGINA DE MÍDIAS ---
    const midiaListContainer = document.getElementById('midia-list');
    const searchMidiaInput = document.getElementById('search-midia-input');
    const addMidiaBtn = document.getElementById('add-midia-btn');
    const midiaWelcomePanel = document.getElementById('midia-welcome-panel');
    const midiaDetailsPanel = document.getElementById('midia-details-panel');
    const midiaTitleDisplay = document.getElementById('midia-title-display');
    const midiaCaptionDisplay = document.getElementById('midia-caption-display');
    const midiaImagePreview = document.getElementById('midia-image-preview');
    const midiaVideoPreview = document.getElementById('midia-video-preview');
    const deleteMidiaBtn = document.getElementById('delete-midia-btn');
    const editMidiaBtn = document.getElementById('edit-midia-btn');
    const saveMidiaBtn = document.getElementById('save-midia-btn');
    const downloadMidiaBtn = document.getElementById('download-midia-btn');
    const favoriteMidiaBtn = document.getElementById('favorite-midia-btn');
    const midiaStarOutline = document.getElementById('midia-star-outline');
    const midiaStarSolid = document.getElementById('midia-star-solid');
    const addMidiaModal = document.getElementById('add-midia-modal');
    const addMidiaForm = document.getElementById('add-midia-form');
    const cancelMidiaModalBtn = document.getElementById('cancel-midia-modal');
    const midiaNameInput = document.getElementById('midia-name-input');
    const midiaCaptionInput = document.getElementById('midia-caption-input');
    const midiaDropzone = document.getElementById('midia-dropzone');
    const midiaDropzoneFile = document.getElementById('midia-dropzone-file');
    const midiaDropzoneText = document.getElementById('midia-dropzone-text');
    let selectedMidiaId = null;
    let isEditingMidia = false;
    let midiaFileToUpload = null;

    function renderMidias() {
        if (!midiaListContainer) return;
        midiaListContainer.innerHTML = '';
        const searchTerm = searchMidiaInput ? searchMidiaInput.value.toLowerCase() : '';

        // Filter midias based on search
        const filteredMidias = midias.filter(midia =>
            midia.title.toLowerCase().includes(searchTerm) ||
            (midia.caption && midia.caption.toLowerCase().includes(searchTerm))
        );

        if (filteredMidias.length === 0) {
            midiaListContainer.innerHTML = `
            <div class="col-span-2 text-center py-10 text-gray-500">
                <p class="text-sm">Nenhuma mídia encontrada.</p>
            </div>
        `;
            return;
        }

        filteredMidias.forEach(midia => {
            const isActive = midia.id === selectedMidiaId;
            const itemDiv = document.createElement('div');

            // Premium Grid Item Style
            itemDiv.className = `group relative aspect-square rounded-xl cursor-pointer overflow-hidden border transition-all duration-300 ${isActive
                ? 'border-zap-primary ring-2 ring-zap-primary/50 shadow-lg shadow-zap-primary/20 scale-[1.02]'
                : 'border-white/10 hover:border-white/30 hover:shadow-xl hover:scale-[1.02]'}`;
            itemDiv.dataset.id = midia.id;

            // Thumbnail Content
            const type = midia.mime_type || midia.type || '';
            let thumbnail = '';

            if (type.startsWith('image/')) {
                thumbnail = `<img src="${midia.url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="${midia.title}">`;
            } else if (type.startsWith('video/')) {
                thumbnail = `
                <video src="${midia.url}#t=0.1" preload="metadata" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"></video>
                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                    <div class="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
                        <svg class="w-5 h-5 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                </div>
            `;
            } else {
                // Fallback for other files
                thumbnail = `
                <div class="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                    <svg class="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
            `;
            }

            // Overlay with Title (on hover)
            const overlay = `
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">
                <p class="text-white text-xs font-medium truncate">${midia.title}</p>
            </div>
        `;

            itemDiv.innerHTML = thumbnail + overlay;

            // Favorite Indicator
            if (midia.isFavorite) {
                const starIcon = document.createElement('div');
                starIcon.className = 'absolute top-2 right-2 text-yellow-400 drop-shadow-md';
                starIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
                itemDiv.appendChild(starIcon);
            }

            itemDiv.addEventListener('click', () => {
                selectedMidiaId = midia.id;
                isEditingMidia = false;
                displayMidiaDetails(midia.id);
                renderMidias();
            });
            midiaListContainer.appendChild(itemDiv);
        });
        updateDashboardCounters();
    }

    function displayMidiaDetails(id) {
        const midia = midias.find(m => m.id === id);
        if (!midia) return;

        // Toggle panels
        midiaWelcomePanel.classList.add('hidden');
        midiaDetailsPanel.classList.remove('hidden');
        midiaDetailsPanel.classList.add('flex');

        // Populate Data
        midiaTitleDisplay.value = midia.title;
        midiaCaptionDisplay.value = midia.caption || '';

        // Toggle Image/Video Preview
        midiaImagePreview.classList.add('hidden');
        midiaVideoPreview.classList.add('hidden');
        const type = midia.mime_type || midia.type || '';

        if (type.startsWith('image/')) {
            midiaImagePreview.src = midia.url;
            midiaImagePreview.classList.remove('hidden');
        } else if (type.startsWith('video/')) {
            midiaVideoPreview.src = midia.url;
            midiaVideoPreview.classList.remove('hidden');
        }

        // Update Badge
        const viewOnceBadge = document.getElementById('midia-view-once-badge');
        if (viewOnceBadge) {
            if (midia.isViewOnce) {
                viewOnceBadge.className = "px-3 py-1 rounded-full text-xs font-medium bg-zap-primary/20 text-zap-primary border border-zap-primary/30";
                viewOnceBadge.innerText = "Visualização Única: Sim";
            } else {
                viewOnceBadge.className = "px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-400 border border-gray-600";
                viewOnceBadge.innerText = "Visualização Única: Não";
            }
        }

        // Handle Favorites Star
        if (midia.isFavorite) {
            midiaStarOutline.classList.add('hidden');
            midiaStarSolid.classList.remove('hidden');
        } else {
            midiaStarOutline.classList.remove('hidden');
            midiaStarSolid.classList.add('hidden');
        }

        // Handle Edit Mode UI
        if (isEditingMidia) {
            midiaTitleDisplay.readOnly = false;
            midiaCaptionDisplay.readOnly = false;
            midiaTitleDisplay.classList.remove('bg-transparent', 'border-none');
            midiaTitleDisplay.classList.add('bg-white/10', 'border-b', 'border-zap-primary');
            midiaCaptionDisplay.classList.add('bg-white/5', 'ring-1', 'ring-zap-primary/30');

            editMidiaBtn.classList.add('hidden');
            saveMidiaBtn.classList.remove('hidden');
            midiaTitleDisplay.focus();
        } else {
            midiaTitleDisplay.readOnly = true;
            midiaCaptionDisplay.readOnly = true;
            midiaTitleDisplay.classList.add('bg-transparent', 'border-none');
            midiaTitleDisplay.classList.remove('bg-white/10', 'border-b', 'border-zap-primary');
            midiaCaptionDisplay.classList.remove('bg-white/5', 'ring-1', 'ring-zap-primary/30');

            editMidiaBtn.classList.remove('hidden');
            saveMidiaBtn.classList.add('hidden');
        }
    }
    if (addMidiaBtn) addMidiaBtn.addEventListener('click', () => { if (addMidiaModal) { addMidiaModal.classList.remove('hidden'); addMidiaModal.classList.add('flex'); } });
    if (cancelMidiaModalBtn) cancelMidiaModalBtn.addEventListener('click', () => { addMidiaModal.classList.add('hidden'); addMidiaModal.classList.remove('flex'); addMidiaForm.reset(); midiaFileToUpload = null; if (midiaDropzoneText) midiaDropzoneText.innerHTML = 'Arraste a mídia ou <span class="text-blue-600 underline">clique aqui</span>'; });
    if (midiaDropzoneFile) midiaDropzoneFile.addEventListener('change', (e) => handleMidiaFile(e.target.files[0]));
    if (midiaDropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => midiaDropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false));
        ['dragenter', 'dragover'].forEach(eventName => midiaDropzone.addEventListener(eventName, () => midiaDropzone.classList.add('border-blue-500', 'bg-blue-50')));
        ['dragleave', 'drop'].forEach(eventName => midiaDropzone.addEventListener(eventName, () => midiaDropzone.classList.remove('border-blue-500', 'bg-blue-50')));
        midiaDropzone.addEventListener('drop', (e) => handleMidiaFile(e.dataTransfer.files[0]));
    }
    function handleMidiaFile(file) {
        if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
            midiaFileToUpload = file;
            if (midiaDropzoneText) midiaDropzoneText.textContent = file.name;
            if (!midiaNameInput.value) midiaNameInput.value = file.name.split('.').slice(0, -1).join('.');
        } else alert('Por favor, selecione um ficheiro de imagem ou vídeo válido.');
    }
    if (addMidiaForm) addMidiaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = midiaNameInput.value;
        const caption = midiaCaptionInput ? midiaCaptionInput.value : '';
        if (title && title.trim() !== '' && midiaFileToUpload) {
            try {
                showGlobalLoader();
                showToast('Enviando mídia...', 'info');

                const userId = await getCurrentUserId();
                if (!userId) {
                    showToast('Erro: Não autenticado', 'error');
                    return;
                }

                // 1. Upload File
                const publicUrl = await uploadToSupabase(midiaFileToUpload, 'midias');

                // 2. Insert Metadata
                const { data, error } = await supabase.from('media_library').insert([{
                    user_id: userId,
                    title: title,
                    caption: caption,
                    url: publicUrl,
                    type: midiaFileToUpload.type.startsWith('image/') ? 'image' : 'video',
                    mime_type: midiaFileToUpload.type,
                    size: midiaFileToUpload.size,
                    is_favorite: false
                }]).select();

                if (error) throw error;

                if (data && data[0]) {
                    midias.unshift({
                        id: data[0].id,
                        title: data[0].title,
                        caption: data[0].caption,
                        url: data[0].url,
                        type: data[0].mime_type,
                        isFavorite: data[0].is_favorite
                    });

                    selectedMidiaId = data[0].id;
                    isEditingMidia = false;
                    renderMidias();
                    displayMidiaDetails(data[0].id);
                    cancelMidiaModalBtn.click();
                    showToast('Mídia adicionada!', 'success');
                }

            } catch (err) {
                console.error(err);
                showToast('Erro ao enviar mídia', 'error');
            } finally {
                hideGlobalLoader();
            }
        } else alert('Preencha os campos obrigatórios.');
    });
    if (deleteMidiaBtn) deleteMidiaBtn.addEventListener('click', async () => {
        if (!selectedMidiaId) return;
        const result = await Swal.fire({
            title: 'Apagar mídia?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim',
            cancelButtonText: 'Não',
            background: '#1e293b',
            color: '#fff'
        });
        if (result.isConfirmed) {
            try {
                const midia = midias.find(m => m.id === selectedMidiaId);

                // 1. Delete from DB
                const { error } = await supabase.from('media_library').delete().eq('id', selectedMidiaId);
                if (error) throw error;

                // 2. Delete from Storage
                if (midia && midia.url.includes('campaign_files')) {
                    const path = midia.url.split('/campaign_files/')[1];
                    if (path) await supabase.storage.from('campaign_files').remove([path]);
                }

                showToast('Mídia removida', 'success');
                await fetchKanbanData();

            } catch (err) {
                console.error(err);
                showToast('Erro ao remover mídia', 'error');
            }
            selectedMidiaId = null; isEditingMidia = false;
            midiaDetailsPanel.classList.add('hidden'); midiaDetailsPanel.classList.remove('flex');
            midiaWelcomePanel.classList.remove('hidden');
        }
    });
    if (editMidiaBtn) editMidiaBtn.addEventListener('click', () => { if (!selectedMidiaId) return; isEditingMidia = true; displayMidiaDetails(selectedMidiaId); });
    if (saveMidiaBtn) saveMidiaBtn.addEventListener('click', () => { if (!selectedMidiaId) return; const midia = midias.find(m => m.id === selectedMidiaId); if (midia) { midia.title = midiaTitleDisplay.value; midia.caption = midiaCaptionDisplay.value; } isEditingMidia = false; renderMidias(); displayMidiaDetails(selectedMidiaId); });
    renderMidias();

    // --- LÓGICA DA PÁGINA DE DOCUMENTOS ---
    const documentListContainer = document.getElementById('document-list');
    const searchDocumentoInput = document.getElementById('search-documento-input');
    const addDocumentBtn = document.getElementById('add-document-btn');
    const documentWelcomePanel = document.getElementById('document-welcome-panel');
    const documentDetailsPanel = document.getElementById('document-details-panel');
    const documentTitleDisplay = document.getElementById('document-title-display');
    const deleteDocumentBtn = document.getElementById('delete-document-btn');
    const editDocumentBtn = document.getElementById('edit-document-btn');
    const saveDocumentBtn = document.getElementById('save-document-btn');
    const downloadDocumentBtn = document.getElementById('download-document-btn');
    const favoriteDocumentBtn = document.getElementById('favorite-document-btn');
    const documentStarOutline = document.getElementById('document-star-outline');
    const documentStarSolid = document.getElementById('document-star-solid');
    const addDocumentModal = document.getElementById('add-document-modal');
    const addDocumentForm = document.getElementById('add-document-form');
    const cancelDocumentModalBtn = document.getElementById('cancel-document-modal');
    const documentNameInput = document.getElementById('document-name-input');
    const documentDropzone = document.getElementById('document-dropzone');
    const documentDropzoneFile = document.getElementById('document-dropzone-file');
    const documentDropzoneText = document.getElementById('document-dropzone-text');
    let selectedDocumentId = null;
    let isEditingDocument = false;
    let documentFileToUpload = null;

    function renderDocumentos() {
        if (!documentListContainer) return;
        documentListContainer.innerHTML = '';
        const searchTerm = searchDocumentoInput ? searchDocumentoInput.value.toLowerCase() : '';

        // Filter documents
        const filteredDocs = documentos.filter(doc =>
            doc.title.toLowerCase().includes(searchTerm)
        );

        if (filteredDocs.length === 0) {
            documentListContainer.innerHTML = `
            <div class="text-center py-10 text-gray-500">
                <p class="text-sm">Nenhum documento encontrado.</p>
            </div>
        `;
            return;
        }

        filteredDocs.forEach(doc => {
            const isActive = doc.id === selectedDocumentId;
            const itemDiv = document.createElement('div');

            // Premium Document List Item Style
            itemDiv.className = `group p-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-300 border backdrop-blur-sm ${isActive
                ? 'bg-zap-secondary/20 border-zap-secondary/50 shadow-lg shadow-zap-secondary/10 translate-x-1'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:translate-x-1'}`;
            itemDiv.dataset.id = doc.id;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center overflow-hidden flex-1';

            // File Icon
            const iconDiv = document.createElement('div');
            iconDiv.className = `w-10 h-10 rounded-xl flex items-center justify-center mr-4 flex-shrink-0 transition-colors duration-300 ${isActive ? 'bg-zap-secondary text-white shadow-md shadow-zap-secondary/20' : 'bg-white/5 text-blue-400 group-hover:bg-white/10 group-hover:text-blue-300'}`;
            iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;
            contentDiv.appendChild(iconDiv);

            const textDiv = document.createElement('div');
            textDiv.className = 'overflow-hidden flex-1 min-w-0 pr-2';

            const titleEl = document.createElement('h4');
            titleEl.className = `font-semibold truncate text-sm transition-colors duration-300 ${isActive ? 'text-white' : 'text-zap-text group-hover:text-white'}`;
            titleEl.textContent = doc.title;

            const subtitleEl = document.createElement('p');
            subtitleEl.className = 'text-xs text-zap-text-secondary truncate transition-colors duration-300 group-hover:text-gray-400';
            // Simulate file size/type if available, else generic
            subtitleEl.textContent = (doc.size || 'Unknown Size') + ' • ' + (doc.type || 'Documento');

            textDiv.appendChild(titleEl);
            textDiv.appendChild(subtitleEl);
            contentDiv.appendChild(textDiv);

            itemDiv.appendChild(contentDiv);

            if (doc.isFavorite) {
                const starIcon = document.createElement('div');
                starIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-yellow-400 drop-shadow-md" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
                itemDiv.appendChild(starIcon);
            }

            itemDiv.addEventListener('click', () => {
                selectedDocumentId = doc.id;
                isEditingDocument = false;
                displayDocumentDetails(doc.id);
                renderDocumentos();
            });
            documentListContainer.appendChild(itemDiv);
        });
        updateDashboardCounters();
    }

    function displayDocumentDetails(id) {
        const doc = documentos.find(d => d.id === id);
        if (!doc) return;

        // Toggle panels
        documentWelcomePanel.classList.add('hidden');
        documentDetailsPanel.classList.remove('hidden');
        documentDetailsPanel.classList.add('flex');

        // Populate Data
        documentTitleDisplay.value = doc.title;

        // Update Preview Area Info
        const filenameDisplay = document.getElementById('documento-filename-display');
        const filesizeDisplay = document.getElementById('documento-filesize-display');
        const downloadLink = document.getElementById('documento-download-link');

        if (filenameDisplay) filenameDisplay.textContent = doc.title;
        if (filesizeDisplay) filesizeDisplay.textContent = (doc.size || 'Unknown Size') + ' • ' + (doc.type || 'Documento');
        if (downloadLink) {
            downloadLink.href = doc.url || '#';
            downloadLink.download = doc.title || 'download';
        }

        // Handle Favorites Star
        if (doc.isFavorite) {
            documentStarOutline.classList.add('hidden');
            documentStarSolid.classList.remove('hidden');
        } else {
            documentStarOutline.classList.remove('hidden');
            documentStarSolid.classList.add('hidden');
        }

        // Handle Edit Mode UI
        if (isEditingDocument) {
            documentTitleDisplay.readOnly = false;
            documentTitleDisplay.classList.remove('bg-transparent', 'border-none');
            documentTitleDisplay.classList.add('bg-white/10', 'border-b', 'border-zap-secondary');

            editDocumentBtn.classList.add('hidden');
            saveDocumentBtn.classList.remove('hidden');
            documentTitleDisplay.focus();
        } else {
            documentTitleDisplay.readOnly = true;
            documentTitleDisplay.classList.add('bg-transparent', 'border-none');
            documentTitleDisplay.classList.remove('bg-white/10', 'border-b', 'border-zap-secondary');

            editDocumentBtn.classList.remove('hidden');
            saveDocumentBtn.classList.add('hidden');
        }
    }
    if (addDocumentBtn) addDocumentBtn.addEventListener('click', () => { if (addDocumentModal) { addDocumentModal.classList.remove('hidden'); addDocumentModal.classList.add('flex'); } });
    if (cancelDocumentModalBtn) cancelDocumentModalBtn.addEventListener('click', () => { addDocumentModal.classList.add('hidden'); addDocumentModal.classList.remove('flex'); addDocumentForm.reset(); documentFileToUpload = null; if (documentDropzoneText) documentDropzoneText.innerHTML = 'Arraste o documento ou <span class="text-blue-600 underline">clique aqui</span>'; });
    if (documentDropzoneFile) documentDropzoneFile.addEventListener('change', (e) => handleDocumentFile(e.target.files[0]));
    if (documentDropzone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => documentDropzone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false));
        ['dragenter', 'dragover'].forEach(eventName => documentDropzone.addEventListener(eventName, () => documentDropzone.classList.add('border-blue-500', 'bg-blue-50')));
        ['dragleave', 'drop'].forEach(eventName => documentDropzone.addEventListener(eventName, () => documentDropzone.classList.remove('border-blue-500', 'bg-blue-50')));
        documentDropzone.addEventListener('drop', (e) => handleDocumentFile(e.dataTransfer.files[0]));
    }
    function handleDocumentFile(file) {
        if (file) { documentFileToUpload = file; if (documentDropzoneText) documentDropzoneText.textContent = file.name; if (!documentNameInput.value) documentNameInput.value = file.name; }
    }
    if (addDocumentForm) addDocumentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = documentNameInput.value;
        if (title && title.trim() !== '' && documentFileToUpload) {
            try {
                showGlobalLoader();
                showToast('Enviando documento...', 'info');

                const userId = await getCurrentUserId();
                if (!userId) {
                    showToast('Erro: Não autenticado', 'error');
                    return;
                }

                // 1. Upload File
                const publicUrl = await uploadToSupabase(documentFileToUpload, 'documents');

                // 2. Insert Metadata
                const { data, error } = await supabase.from('media_library').insert([{
                    user_id: userId,
                    title: title,
                    url: publicUrl,
                    type: 'document',
                    mime_type: documentFileToUpload.type,
                    size: documentFileToUpload.size,
                    is_favorite: false
                }]).select();

                if (error) throw error;

                if (data && data[0]) {
                    documentos.unshift({
                        id: data[0].id,
                        title: data[0].title,
                        url: data[0].url,
                        size: (data[0].size / 1024).toFixed(2) + ' KB', // Est. size
                        type: 'Documento',
                        isFavorite: data[0].is_favorite
                    });

                    cancelDocumentModalBtn.click();
                    renderDocumentos();
                    showToast('Documento adicionado!', 'success');
                }

            } catch (err) {
                console.error(err);
                showToast('Erro ao enviar documento', 'error');
            } finally {
                hideGlobalLoader();
            }
        } else alert('Preencha os campos obrigatórios.');
    });
    if (deleteDocumentBtn) deleteDocumentBtn.addEventListener('click', async () => {
        if (!selectedDocumentId) return;
        const result = await Swal.fire({
            title: 'Apagar documento?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim',
            cancelButtonText: 'Não',
            background: '#1e293b',
            color: '#fff'
        });
        if (result.isConfirmed) {
            try {
                const doc = documentos.find(d => d.id === selectedDocumentId);

                // 1. DB Delete
                const { error } = await supabase.from('media_library').delete().eq('id', selectedDocumentId);
                if (error) throw error;

                // 2. Storage Delete
                if (doc && doc.url.includes('campaign_files')) {
                    const path = doc.url.split('/campaign_files/')[1];
                    if (path) await supabase.storage.from('campaign_files').remove([path]);
                }

                showToast('Documento removido', 'success');
                await fetchKanbanData();

            } catch (err) {
                console.error(err);
                showToast('Erro ao remover documento', 'error');
            }

            selectedDocumentId = null; isEditingDocument = false;
            documentDetailsPanel.classList.add('hidden'); documentDetailsPanel.classList.remove('flex');
            documentWelcomePanel.classList.remove('hidden');
        }
    });
    if (editDocumentBtn) editDocumentBtn.addEventListener('click', () => { if (!selectedDocumentId) return; isEditingDocument = true; displayDocumentDetails(selectedDocumentId); });
    if (saveDocumentBtn) saveDocumentBtn.addEventListener('click', () => { if (!selectedDocumentId) return; const doc = documentos.find(d => d.id === selectedDocumentId); if (doc) doc.title = documentTitleDisplay.value; isEditingDocument = false; renderDocumentos(); displayDocumentDetails(selectedDocumentId); });
    if (favoriteDocumentBtn) favoriteDocumentBtn.addEventListener('click', () => { if (!selectedDocumentId) return; const doc = documentos.find(d => d.id === selectedDocumentId); if (doc) { doc.isFavorite = !doc.isFavorite; if (!isEditingDocument) { displayDocumentDetails(selectedDocumentId); renderDocumentos(); } } });
    if (downloadDocumentBtn) downloadDocumentBtn.addEventListener('click', () => { if (!selectedDocumentId) return; const doc = documentos.find(d => d.id === selectedDocumentId); if (doc) { const a = document.createElement('a'); a.href = doc.url; a.download = doc.title; document.body.appendChild(a); a.click(); document.body.removeChild(a); } });
    renderDocumentos();


    // --- LÓGICA DA PÁGINA DE FUNIS ---
    const funilListContainer = document.getElementById('funil-list');
    const searchFunilInput = document.getElementById('search-funil-input');
    const addFunilBtn = document.getElementById('add-funil-btn');
    const funilWelcomePanel = document.getElementById('funil-welcome-panel');
    const funilDetailsPanel = document.getElementById('funil-details-panel');
    const funilTitleDisplay = document.getElementById('funil-title-display');
    const funilItemListContainer = document.getElementById('funil-item-list');
    const deleteFunilBtn = document.getElementById('delete-funil-btn');
    const editFunilBtn = document.getElementById('edit-funil-btn');
    const saveFunilBtn = document.getElementById('save-funil-btn');
    const favoriteFunilBtn = document.getElementById('favorite-funil-btn');
    const duplicateFunilBtn = document.getElementById('duplicate-funil-btn');
    const funilStarOutline = document.getElementById('funil-star-outline');
    const funilStarSolid = document.getElementById('funil-star-solid');
    // Botões para adicionar itens ao funil -> Modals
    const addFunilMessageBtn = document.getElementById('add-funil-message-btn');
    const addFunilAudioBtn = document.getElementById('add-funil-audio-btn');
    const addFunilMidiaBtn = document.getElementById('add-funil-midia-btn');
    const addFunilDocumentBtn = document.getElementById('add-funil-document-btn');
    const funilItemModal = document.getElementById('funil-item-modal');
    const funilItemForm = document.getElementById('funil-item-form');
    const funilItemModalTitle = document.getElementById('funil-item-modal-title');
    const funilItemSelectLabel = document.getElementById('funil-item-select-label');
    const funilItemSelect = document.getElementById('funil-item-select');
    const cancelFunilItemModalBtn = document.getElementById('cancel-funil-item-modal');
    let selectedFunilId = null;
    let isEditingFunil = false;
    let currentFunilItemType = null; // 'messsage', 'audio', 'midia', 'document'

    function renderFunis() {
        if (!funilListContainer) return;
        funilListContainer.innerHTML = '';
        funis.forEach(funil => {
            const isActive = funil.id === selectedFunilId;
            const itemDiv = document.createElement('div');
            // Premium Funnel Item
            itemDiv.className = `p-4 rounded-xl mb-3 cursor-pointer flex items-center justify-between transition-all duration-300 border border-transparent ${isActive ? 'bg-zap-primary/20 border-zap-primary/50 shadow-lg shadow-zap-primary/10' : 'bg-white/5 hover:bg-white/10 hover:border-white/10 hover:translate-x-1'}`;
            itemDiv.dataset.id = funil.id;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'flex items-center overflow-hidden';

            const iconDiv = document.createElement('div');
            iconDiv.className = `w-10 h-10 rounded-full flex items-center justify-center mr-4 flex-shrink-0 ${isActive ? 'bg-zap-primary text-white' : 'bg-white/5 text-pink-500'}`;
            iconDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.572a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>`;
            contentDiv.appendChild(iconDiv);

            const textDiv = document.createElement('div');
            textDiv.className = 'overflow-hidden';
            const titleEl = document.createElement('h4');
            titleEl.className = `font-semibold truncate text-sm ${isActive ? 'text-white' : 'text-zap-text'}`;
            titleEl.textContent = funil.title;
            const countEl = document.createElement('p');
            countEl.className = 'text-xs text-zap-text-secondary';
            countEl.textContent = (funil.items ? funil.items.length : 0) + ' etapas';

            textDiv.appendChild(titleEl);
            textDiv.appendChild(countEl);
            contentDiv.appendChild(textDiv);
            itemDiv.appendChild(contentDiv);

            if (funil.isFavorite) {
                const starIcon = document.createElement('div');
                starIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>`;
                itemDiv.appendChild(starIcon);
            }
            itemDiv.addEventListener('click', () => { selectedFunilId = funil.id; isEditingFunil = false; displayFunilDetails(funil.id); renderFunis(); });
            funilListContainer.appendChild(itemDiv);
        });
        updateDashboardCounters();
    }

    function displayFunilDetails(id) {
        const funil = funis.find(f => f.id === id);
        if (funil) {
            funilWelcomePanel.classList.add('hidden'); funilDetailsPanel.classList.remove('hidden'); funilDetailsPanel.classList.add('flex');
            funilTitleDisplay.value = funil.title;
            if (funil.isFavorite) { funilStarOutline.classList.add('hidden'); funilStarSolid.classList.remove('hidden'); }
            else { funilStarOutline.classList.remove('hidden'); funilStarSolid.classList.add('hidden'); }
            if (isEditingFunil) { funilTitleDisplay.readOnly = false; editFunilBtn.classList.add('hidden'); saveFunilBtn.classList.remove('hidden'); funilTitleDisplay.focus(); }
            else { funilTitleDisplay.readOnly = true; editFunilBtn.classList.remove('hidden'); saveFunilBtn.classList.add('hidden'); }
            renderFunilItems(funil.items);
        }
    }

    function renderFunilItems(items) {
        funilItemListContainer.innerHTML = '';
        if (!items || items.length === 0) { funilItemListContainer.innerHTML = '<p class="text-zap-text-secondary text-center py-4">Nenhum item adicionado a este funil.</p>'; return; }
        items.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'bg-white/5 border border-white/5 p-3 rounded-xl mb-2 flex justify-between items-center hover:bg-white/10 transition-colors group';
            let itemName = 'Item desconhecido';
            // lookup logic
            if (item.type === 'message') { const m = messages.find(x => x.id === item.itemId); itemName = m ? `Mensagem: ${m.title}` : 'Mensagem (apagada)'; }
            else if (item.type === 'audio') { const a = audios.find(x => x.id === item.itemId); itemName = a ? `Áudio: ${a.title}` : 'Áudio (apagado)'; }
            else if (item.type === 'midia') { const mm = midias.find(x => x.id === item.itemId); itemName = mm ? `Mídia: ${mm.title}` : 'Mídia (apagada)'; }
            else if (item.type === 'document') { const d = documentos.find(x => x.id === item.itemId); itemName = d ? `Documento: ${d.title}` : 'Documento (apagado)'; }

            itemDiv.innerHTML = `<div><span class="font-semibold text-white">${index + 1}. ${itemName}</span><div class="text-xs text-zap-text-secondary">Delay: ${item.delayMinutes}m ${item.delaySeconds}s</div></div><button class="text-red-400 hover:text-red-600" data-index="${index}">&times;</button>`;
            funilItemListContainer.appendChild(itemDiv);
        });
    }

    if (addFunilBtn) addFunilBtn.addEventListener('click', async () => {
        const title = prompt('Nome do novo funil:');
        if (title && title.trim() !== '') {
            try {
                showGlobalLoader();
                const userId = await getCurrentUserId();
                if (!userId) {
                    showToast('Erro: Não autenticado', 'error');
                    hideGlobalLoader();
                    return;
                }
                const { data, error } = await supabase.from('funnels').insert([{ user_id: userId, title, description: '', is_favorite: false }]).select();

                if (error) throw error;

                if (data && data[0]) {
                    funis.push({
                        id: data[0].id,
                        title: data[0].title,
                        items: [], // New funnel has no items
                        isFavorite: data[0].is_favorite
                    });

                    selectedFunilId = data[0].id;
                    isEditingFunil = true;
                    renderFunis();
                    displayFunilDetails(data[0].id);
                    showToast('Funil criado!', 'success');
                }
            } catch (err) {
                console.error(err);
                showToast('Erro ao criar funil', 'error');
            } finally {
                hideGlobalLoader();
            }
        }
    });

    const openFunilItemModal = (type) => {
        currentFunilItemType = type;
        funilItemModalTitle.textContent = `Adicionar ${type === 'message' ? 'Mensagem' : type === 'audio' ? 'Áudio' : type === 'midia' ? 'Mídia' : 'Documento'}`;
        funilItemSelectLabel.textContent = `Selecione o(a) ${type === 'message' ? 'Mensagem' : type === 'audio' ? 'Áudio' : type === 'midia' ? 'Mídia' : 'Documento'}:`;
        funilItemSelect.innerHTML = '';
        let source = [];
        if (type === 'message') source = messages;
        else if (type === 'audio') source = audios;
        else if (type === 'midia') source = midias;
        else if (type === 'document') source = documentos;

        source.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; funilItemSelect.appendChild(option); });
        funilItemModal.classList.remove('hidden'); funilItemModal.classList.add('flex');
    };

    if (addFunilMessageBtn) addFunilMessageBtn.addEventListener('click', () => openFunilItemModal('message'));
    if (addFunilAudioBtn) addFunilAudioBtn.addEventListener('click', () => openFunilItemModal('audio'));
    if (addFunilMidiaBtn) addFunilMidiaBtn.addEventListener('click', () => openFunilItemModal('midia'));
    if (addFunilDocumentBtn) addFunilDocumentBtn.addEventListener('click', () => openFunilItemModal('document'));
    if (cancelFunilItemModalBtn) cancelFunilItemModalBtn.addEventListener('click', () => { funilItemModal.classList.add('hidden'); funilItemModal.classList.remove('flex'); funilItemForm.reset(); });

    if (funilItemForm) funilItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const funil = funis.find(f => f.id === selectedFunilId);
        if (funil && funilItemSelect.value) {
            const newItem = { itemId: parseInt(funilItemSelect.value), type: currentFunilItemType, delayMinutes: parseInt(document.getElementById('funil-delay-minutes').value) || 0, delaySeconds: parseInt(document.getElementById('funil-delay-seconds').value) || 0 };
            /*
            if (API_BASE) {
                try {
                    await fetch(API_BASE + `/api/funnels/${funil.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) });
                    funil.items.push(newItem); renderFunilItems(funil.items); showToast('Item adicionado', 'success');
                } catch (e) { showToast('Erro ao adicionar item', 'error'); }
            } else {
            */
            funil.items.push(newItem); renderFunilItems(funil.items); showToast('Item adicionado', 'success');
            // }
            cancelFunilItemModalBtn.click();
        }
    });

    if (funilItemListContainer) funilItemListContainer.addEventListener('click', (e) => {
        if (e.target.matches('button')) {
            const index = parseInt(e.target.dataset.index);
            const funil = funis.find(f => f.id === selectedFunilId);
            if (funil) { funil.items.splice(index, 1); renderFunilItems(funil.items); }
        }
    });

    if (deleteFunilBtn) deleteFunilBtn.addEventListener('click', async () => {
        if (!selectedFunilId) return;
        const result = await Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter isso!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim, deletar!',
            cancelButtonText: 'Cancelar',
            background: '#1e293b',
            color: '#fff'
        });

        if (result.isConfirmed) {
            if (API_BASE) {
                try { await fetch(API_BASE + '/api/funnels/' + selectedFunilId, { method: 'DELETE' }); } catch (e) { }
            }
            funis = funis.filter(f => f.id !== selectedFunilId);
            selectedFunilId = null; isEditingFunil = false; funilDetailsPanel.classList.add('hidden'); funilDetailsPanel.classList.remove('flex'); funilWelcomePanel.classList.remove('hidden'); renderFunis();
            showToast('Funil removido', 'success');
        }
    });

    if (duplicateFunilBtn) duplicateFunilBtn.addEventListener('click', () => {
        if (!selectedFunilId) return;
        const funilToCopy = funis.find(f => f.id === selectedFunilId);
        if (funilToCopy) {
            const newId = funis.length > 0 ? Math.max(...funis.map(f => f.id)) + 1 : 1;
            const newFunil = JSON.parse(JSON.stringify(funilToCopy));
            newFunil.id = newId; newFunil.title = `${newFunil.title} (Cópia)`; newFunil.isFavorite = false;
            funis.push(newFunil); renderFunis(); showToast('Funil duplicado (local)', 'success');
        }
    });
    if (editFunilBtn) editFunilBtn.addEventListener('click', () => { if (!selectedFunilId) return; isEditingFunil = true; displayFunilDetails(selectedFunilId); });
    if (saveFunilBtn) saveFunilBtn.addEventListener('click', () => { if (!selectedFunilId) return; const funil = funis.find(f => f.id === selectedFunilId); if (funil) funil.title = funilTitleDisplay.value; isEditingFunil = false; renderFunis(); displayFunilDetails(selectedFunilId); });
    if (favoriteFunilBtn) favoriteFunilBtn.addEventListener('click', () => { if (!selectedFunilId) return; const funil = funis.find(f => f.id === selectedFunilId); if (funil) { funil.isFavorite = !funil.isFavorite; if (!isEditingFunil) { displayFunilDetails(selectedFunilId); renderFunis(); } } });
    renderFunis();




    // --- LÓGICA DO KANBAN ---
    // Variables and functions now in shared scope
    let selectedKanbanColumnId = null;

    // --- DATA FETCHING ---
    async function fetchKanbanData() {
        if (!supabase) return;
        try {
            const { data, error } = await supabase.from('kanban_columns').select('*, leads(*)').order('position');
            if (error) throw error;
            if (data) {
                kanbanData = data.map(col => ({ ...col, items: col.leads || [] }));
                renderKanban();
                updateDashboardCounters();
            }
        } catch (error) {
            console.error('❌ Error fetching kanban:', error);
            if (error.code === '42P01' || error.message.includes('404')) {
                Swal.fire({ icon: 'warning', title: 'Tabelas não encontradas', text: 'Por favor, rode o script SQL atualizado.' });
            }
        }
    }

    async function fetchMessages() {
        const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
        if (data) {
            messages = data.map(m => ({ id: m.id, title: m.title, content: m.content, isFavorite: m.is_favorite }));
            renderMessages();
        }
    }

    async function fetchMediaLibrary() {
        const { data, error } = await supabase.from('media_library').select('*').order('created_at', { ascending: false });
        if (data) {
            audios = data.filter(m => m.type === 'audio').map(m => ({ id: m.id, title: m.title, url: m.url, isFavorite: m.is_favorite, duration: '00:00' }));
            midias = data.filter(m => m.type === 'image' || m.type === 'video').map(m => ({ id: m.id, title: m.title, caption: m.caption, url: m.url, type: m.mime_type, isFavorite: m.is_favorite }));
            documentos = data.filter(m => m.type === 'document').map(m => ({ id: m.id, title: m.title, url: m.url, size: (m.size ? (m.size / 1024).toFixed(2) + ' KB' : 'Unknown'), type: 'Documento', isFavorite: m.is_favorite }));

            renderAudios();
            renderMidias();
            renderDocumentos();
        }
    }

    async function fetchFunis() {
        // Fetch funnels and their items
        const { data, error } = await supabase.from('funnels').select('*, funnel_items(*)').order('created_at', { ascending: false });

        if (data) {
            funis = data.map(f => ({
                id: f.id,
                title: f.title,
                isFavorite: f.is_favorite,
                items: (f.funnel_items || []).map(item => ({
                    itemId: item.item_id,
                    type: item.type,
                    delayMinutes: item.delay_minutes,
                    delaySeconds: item.delay_seconds,
                    position: item.position
                })).sort((a, b) => a.position - b.position)
            }));
            renderFunis();
        }
    }

    // Expose for usage
    window.fetchKanbanData = fetchKanbanData;
    window.fetchAllData = async function () {
        showGlobalLoader();
        await Promise.all([
            fetchKanbanData(),
            fetchMessages(),
            fetchMediaLibrary(),
            fetchFunis()
        ]);
        hideGlobalLoader();
    };

    function renderKanban() {
        // Get element dynamically each time
        const board = document.getElementById('kanban-board');

        if (!board) {
            console.error('CRITICAL: #kanban-board element not found!');
            return;
        }

        // FORCE VISIBILITY
        board.style.display = 'flex';
        board.style.opacity = '1';

        board.innerHTML = '';

        board.innerHTML = '';

        // ===== SUPABASE CONFIGURATION (MOVED GLOBAL) =====
        // const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        // State Variables
        let isSidebarOpen = true;
        let activeLeadId = null;
        let currentAudio = null;
        let currentPlayBtn = null;
        // let kanbanData = []; // Will be populated from Supabase
        kanbanData.forEach((column, colIndex) => {
            // Calculate Total Value
            // Calculate Total Value
            const totalValue = column.items.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
            const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);
            const colColor = column.color || '#E13584'; // Default color

            const colDiv = document.createElement('div');
            // Premium Glass Column Structure with localized styling
            colDiv.className = 'glass rounded-2xl w-80 flex-shrink-0 flex flex-col border border-white/5 bg-zap-sidebar/50 max-h-full transition-all duration-300 snap-center shadow-xl backdrop-blur-sm ml-4 first:ml-0';
            colDiv.dataset.colid = column.id;

            colDiv.innerHTML = `
            <!-- Column Header -->
            <div class="p-4 border-b border-white/5 bg-black/20 rounded-t-2xl group relative overflow-hidden">
                 <div class="absolute top-0 left-0 w-full h-1 opacity-80" style="background: linear-gradient(to right, ${colColor}, transparent);"></div>
                 <div class="absolute top-0 left-0 w-full h-[1px] bg-${colColor} shadow-[0_0_10px_${colColor}]"></div>
                <div class="flex justify-between items-start mb-3 relative z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-3 h-3 rounded-full shadow-[0_0_8px_inset] shadow-current" style="background-color: ${colColor}; color: ${colColor}; box-shadow: 0 0 10px ${colColor};"></div>
                        <h3 class="text-base font-bold text-white uppercase tracking-wider truncate drop-shadow-sm" title="${column.title}">${column.title}</h3>
                        <span class="text-[10px] font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-full border border-white/5 shadow-sm">${column.items.length}</span>
                    </div>
                    <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0">
                         <button class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white edit-col transition-colors" data-colid="${column.id}" title="Editar Nome"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                         <button class="p-1.5 rounded-lg hover:bg-white/10 text-red-500/70 hover:text-red-400 remove-col transition-colors" data-colid="${column.id}" title="Excluir Coluna"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </div>
                </div>
                <div class="flex items-center justify-between mt-1 bg-white/5 p-2 rounded-lg border border-white/5">
                    <span class="text-xs text-zap-text-secondary font-medium uppercase tracking-wide">Valor Total</span>
                    <span class="text-xs font-bold text-white tracking-wide">${formattedTotal}</span>
                </div>
            </div>

            <!-- Cards Container -->
            <div class="kanban-cards-container flex-grow p-3 space-y-3 overflow-y-auto custom-scrollbar min-h-[100px] scroll-smooth" style="max-height: calc(100vh - 260px);">
                <!-- Cards will be injected here -->
            </div>
        `;

            const itemsDiv = colDiv.querySelector('.kanban-cards-container');

            column.items.forEach(item => {
                const card = document.createElement('div');
                // Premium Card Style
                card.className = 'kanban-item kanban-card group bg-zap-card hover:bg-zap-card-hover p-4 rounded-xl shadow-lg border border-white/5 cursor-pointer relative z-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-zap-primary/30';
                card.draggable = true;
                card.dataset.id = item.id;
                card.dataset.colid = column.id;

                const itemValue = Number(item.value) || 0;
                const formattedItemValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemValue);
                const avatarUrl = item.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name) + '&background=random';

                const dateObj = item.createdAt ? new Date(item.createdAt) : new Date();
                const dateStr = dateObj.toLocaleDateString('pt-BR');
                const originDisplay = (item.origin === 'Outros' && item.customOrigin) ? item.customOrigin : (item.origin || '');

                // Temp Badge Logic (Visuals)
                // Default to 'cold' if not set, so it can be interacted with
                const currentTemp = item.temp || 'cold';
                const tempColors = {
                    'hot': 'bg-red-500/20 text-red-400 border-red-500/30',
                    'warm': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                    'cold': 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                };
                const colorClass = tempColors[currentTemp] || tempColors['cold'];
                const tempLabel = currentTemp === 'hot' ? 'Quente' : (currentTemp === 'warm' ? 'Morno' : 'Frio');

                // Add 'temp-badge' class for event delegation
                const tempBadge = `<span class="temp-badge px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${colorClass} cursor-pointer hover:opacity-80 transition-opacity" data-lead-id="${item.id}" title="Alterar temperatura">${tempLabel}</span>`;

                card.innerHTML = `
                                    <div class="flex items-start gap-3 mb-2">
                                        <div class="relative shrink-0">
                                            <img src="${avatarUrl}" class="w-10 h-10 rounded-full object-cover border-2 border-white/10 shadow-sm" alt="${item.name}">
                                             <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-zap-card rounded-full" title="Online"></div>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center flex-wrap gap-2 mb-1">
                                                <h4 class="font-bold text-white text-sm truncate leading-tight">${item.name}</h4>
                                                ${tempBadge}
                                            </div>
                                            
                                            <!-- WhatsApp (Clickable) -->
                                            <a href="https://wa.me/${(item.phone || '').replace(/\D/g, '')}" target="_blank" onclick="event.stopPropagation()" class="text-xs text-green-400 hover:text-green-300 flex items-center gap-1.5 transition-colors font-medium w-fit">
                                               <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                                               ${item.phone || 'WhatsApp'}
                                            </a>
                                        </div>
                                    </div>
                                    
                                    <!-- Origin & Campaign Tags -->
                                    <div class="space-y-1.5 mb-2 pl-1">
                                        ${originDisplay ? `
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Origem:</span>
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate max-w-[150px]">${originDisplay}</span>
                                        </div>` : ''}
                                        
                                        ${item.campaign ? `
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Campanha:</span>
                                            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-500/10 text-pink-300 border border-pink-500/20 truncate max-w-[150px]">${item.campaign}</span>
                                        </div>` : ''}
                                    </div>

                                    <!-- Product -->
                                    <div class="mb-3 pl-1">
                                         ${item.product ? `<div class="text-xs text-gray-400 flex items-center gap-1.5"><svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>${item.product}</div>` : ''}
                                    </div>

                                    <div class="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
                                        <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shadow-sm">${formattedItemValue}</span>
                                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <button class="p-1.5 rounded-full hover:bg-zap-primary text-gray-400 hover:text-white transition-colors" title="Ver Detalhes">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            </button>
                                            <button class="kanban-delete-btn p-1.5 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors" title="Arquivar">
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                            </button>
                                        </div>
                                    </div>
                `;
                // Event Listeners for Interaction
                card.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Manual Listener: Click on card', item.id);
                    if (typeof window.openLeadDetailsModal === 'function') {
                        window.openLeadDetailsModal(item.id, column.id);
                    } else {
                        alert('Erro: Função modal não encontrada!');
                    }
                });

                const detailBtn = card.querySelector('button[title="Ver Detalhes"]');
                if (detailBtn) {
                    detailBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.openLeadDetailsModal(item.id, column.id);
                    });
                }

                // Archive logic removed for online-only stability


                itemsDiv.appendChild(card);
            });

            board.appendChild(colDiv);
        }); // End forEach
    } // End renderKanban

    // window.renderKanban = renderKanban; // Already executed
    // renderKanban(); // REMOVED RECURSIVE CALL

    // --- LÓGICA DO MODAL DE DETALHES DO LEAD ---
    const leadDetailsModal = document.getElementById('lead-details-modal');
    const closeLeadModalBtn = document.getElementById('close-lead-modal-btn');
    const cancelLeadDetailsBtn = document.getElementById('cancel-lead-details-btn');
    const saveLeadDetailsBtn = document.getElementById('save-lead-details-btn');
    const leadTabBtns = document.querySelectorAll('.lead-tab-btn');
    const leadTabContents = document.querySelectorAll('.lead-tab-content');

    // let currentEditingLead = null; // Removed shadowing
    // let currentEditingColumnId = null; // Removed shadowing


    // --- EVENT LISTENERS FOR MODAL (GLOBAL BINDING) ---
    // Re-bind buttons to global functions to avoid shadowing issues
    const saveBtnGlobal = document.getElementById('save-lead-details-btn');
    if (saveBtnGlobal) {
        saveBtnGlobal.onclick = function (e) {
            e.preventDefault();
            if (window.saveLeadDetails) window.saveLeadDetails();
        };
    }

    const closeBtnGlobal = document.getElementById('close-lead-modal-btn');
    if (closeBtnGlobal) {
        closeBtnGlobal.onclick = function () {
            if (window.closeLeadDetailsModal) window.closeLeadDetailsModal();
        };
    }

    const cancelBtnGlobal = document.getElementById('cancel-lead-details-btn');
    if (cancelBtnGlobal) {
        cancelBtnGlobal.onclick = function () {
            if (window.closeLeadDetailsModal) window.closeLeadDetailsModal();
        };
    }



    // Expose currentEditingLead via getter/setter to ensure updates are reflected
    // Only define if not already defined to avoid "Cannot redefine property" error
    if (!Object.getOwnPropertyDescriptor(window, 'currentEditingLead')) {
        Object.defineProperty(window, 'currentEditingLead', {
            get: () => currentEditingLead,
            set: (val) => { currentEditingLead = val; },
            configurable: true // Allow redefinition if needed
        });
    }

    // Helper to toggle temperature directly on card
    function toggleLeadTemp(leadId, columnId) {
        const column = kanbanData.find(c => c.id === columnId);
        if (!column) return;
        const lead = column.items.find(i => i.id === leadId);
        if (!lead) return;

        const temps = ['cold', 'warm', 'hot'];
        const current = lead.temp || 'cold';
        const nextIndex = (temps.indexOf(current) + 1) % temps.length;
        lead.temp = temps[nextIndex];

        // Update History
        if (window.addLeadHistory) {
            const labels = { 'cold': 'FRIO', 'warm': 'MORNO', 'hot': 'QUENTE' };
            window.addLeadHistory(lead, 'thermometer', 'Temperatura Alterada', `Classificado como ${labels[lead.temp]}.`, 'thermometer', 'purple');
        }

        renderKanban();
    }
    window.toggleLeadTemp = toggleLeadTemp;

    // --- SETUP LISTENERS AFTER DOM IS READY ---
    // Moved inside a function to be called from DOMContentLoaded or ensuring these run
    // --- SETUP LISTENERS (GLOBAL VERSION) ---
    window.setupKanbanListeners = function () {
        console.log('🚀 Executing setupKanbanListeners...');
        const kanbanBoard = document.getElementById('kanban-board');
        const addKanbanColumnBtn = document.getElementById('add-kanban-column-btn');
        const addLeadBtn = document.getElementById('add-lead-btn');
        const addLeadModal = document.getElementById('add-lead-modal');
        const addLeadForm = document.getElementById('add-lead-form');
        const cancelLeadModalBtn = document.getElementById('cancel-lead-modal-btn');

        if (kanbanBoard) {
            console.log('✅ Kanban board found');
            // Remove existing to avoid duplicates
            kanbanBoard.removeEventListener('click', window.handleKanbanClick);
            kanbanBoard.addEventListener('click', window.handleKanbanClick);

            // Force overflow styles via JS
            kanbanBoard.style.overflowX = 'auto';
            kanbanBoard.style.overflowY = 'hidden';
            kanbanBoard.style.display = 'flex';
            kanbanBoard.style.flexWrap = 'nowrap';
            kanbanBoard.style.scrollBehavior = 'auto'; // Disable smooth for instant response
            kanbanBoard.style.userSelect = 'none'; // Prevent text selection while dragging

            // ===== MOUSE WHEEL SCROLL =====
            // ===== MOUSE WHEEL SCROLL =====
            kanbanBoard.addEventListener('wheel', (evt) => {
                // Check if we are scrolling INSIDE a column (which has vertical scroll)
                const scrollableColumn = evt.target.closest('.kanban-cards-container');

                // If inside a column and it HAS scrollable content, STRICTLY allow default vertical scroll
                // and PREVENT any board horizontal scroll mapping.
                if (scrollableColumn && scrollableColumn.scrollHeight > scrollableColumn.clientHeight) {
                    evt.stopPropagation(); // Stop event from bubbling to any other handlers
                    return; // Let default browser behavior (vertical scroll) happen
                }

                // If NOT in a scrollable column, map vertical scroll to horizontal board scroll
                if (Math.abs(evt.deltaY) > Math.abs(evt.deltaX)) {
                    evt.preventDefault();
                    kanbanBoard.scrollLeft += evt.deltaY;
                }
            }, { passive: false });

            // ===== DRAG TO SCROLL (Mouse) =====
            let isDragging = false;
            let startX = 0;
            let scrollLeftStart = 0;

            kanbanBoard.addEventListener('mousedown', (e) => {
                // Only start drag if clicking on the board itself, not on cards
                if (e.target.closest('.kanban-card') || e.target.closest('button')) return;
                isDragging = true;
                startX = e.pageX - kanbanBoard.offsetLeft;
                scrollLeftStart = kanbanBoard.scrollLeft;
                e.preventDefault();
            });

            kanbanBoard.addEventListener('mouseleave', () => {
                isDragging = false;
            });

            kanbanBoard.addEventListener('mouseup', () => {
                isDragging = false;
            });

            kanbanBoard.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const x = e.pageX - kanbanBoard.offsetLeft;
                const walk = (x - startX) * 1.5; // multiply for faster scroll
                kanbanBoard.scrollLeft = scrollLeftStart - walk;
            });

            // ===== TOUCH SCROLL (Mobile) =====
            let touchStartX = 0;
            let touchScrollLeft = 0;

            kanbanBoard.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].pageX;
                touchScrollLeft = kanbanBoard.scrollLeft;
            }, { passive: true });

            kanbanBoard.addEventListener('touchmove', (e) => {
                const touchX = e.touches[0].pageX;
                const walk = (touchStartX - touchX) * 1.2;
                kanbanBoard.scrollLeft = touchScrollLeft + walk;
            }, { passive: true });

            console.log('✅ Scroll handlers attached (wheel + drag + touch)');
        } else {
            console.error('❌ Kanban board NOT found inside listener setup');
        }

        if (addKanbanColumnBtn) {
            console.log('✅ Add Column Button found');
            addKanbanColumnBtn.onclick = async (e) => {
                e.preventDefault();
                const t = prompt('Nome da coluna:');
                if (t) {
                    try {
                        const userId = await getCurrentUserId();
                        if (!userId) {
                            showToast('Erro: Não autenticado', 'error');
                            return;
                        }
                        // Optimistic Update (optional, but let's stick to fetch for safety first)
                        const { error } = await supabase.from('kanban_columns').insert([{
                            user_id: userId,
                            title: t,
                            color: '#E13584',
                            position: kanbanData.length + 1
                        }]);

                        if (error) throw error;
                        fetchKanbanData(); // Refresh board
                        showToast('Coluna criada!', 'success');
                    } catch (err) {
                        console.error(err);
                        alert('Erro ao criar coluna');
                    }
                }
            };
        } else { console.error('❌ Add Column Button NOT found'); }

        if (addLeadBtn) {
            console.log('✅ Add Lead Button found');
            addLeadBtn.onclick = (e) => {
                e.preventDefault();
                addLeadModal.classList.remove('hidden');
                addLeadModal.classList.add('flex');
            };
        }

        if (cancelLeadModalBtn) cancelLeadModalBtn.onclick = () => {
            addLeadModal.classList.add('hidden');
            addLeadModal.classList.remove('flex');
            addLeadForm.reset();
        };

        if (addLeadForm) addLeadForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('lead-name-input').value;
            const phone = document.getElementById('lead-phone-input').value;
            const value = document.getElementById('lead-value-input').value;
            const product = document.getElementById('lead-product-input').value;
            const email = document.getElementById('lead-email-input').value;

            if (name && phone) {
                const defaultColId = kanbanData.length > 0 ? kanbanData[0].id : 1;

                if (supabase) {
                    try {
                        showGlobalLoader(); // Show loader for action
                        const userId = await getCurrentUserId();
                        if (!userId) {
                            showToast('Erro: Não autenticado', 'error');
                            hideGlobalLoader();
                            return;
                        }

                        const newLead = {
                            user_id: userId,
                            name,
                            phone,
                            value: parseFloat(value) || 0,
                            product: product || '',
                            email: email || '',
                            column_id: defaultColId,
                            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff`,
                            status: 'cold',
                            created_at: new Date().toISOString()
                        };

                        const { data, error } = await supabase.from('leads').insert([newLead]).select();

                        if (error) throw error;

                        if (data && data[0]) {
                            newLead.id = data[0].id; // Use DB ID

                            // Update State
                            const col = kanbanData.find(c => c.id === defaultColId);
                            if (col) col.items.unshift(newLead);

                            showToast('Lead adicionado!', 'success');
                            cancelLeadModalBtn.click();
                            renderKanban();
                        }
                    } catch (err) {
                        console.error('Supabase Add Lead Error:', err);
                        Swal.fire('Erro', 'Não foi possível conectar ao servidor.', 'error');
                    } finally {
                        hideGlobalLoader();
                    }
                } else {
                    Swal.fire('Erro', 'Sistema desconectado.', 'error');
                }
            }
        };
    };

    // Make handleKanbanClick global too
    window.handleKanbanClick = async function (e) {
        // Temperature Badge Toggle (Inline)
        const tempBadge = e.target.closest('.temp-badge');
        if (tempBadge) {
            e.stopPropagation();
            const lid = parseInt(tempBadge.dataset.leadId);
            const colEl = tempBadge.closest('.kanban-column');
            const cid = colEl ? parseInt(colEl.dataset.colid) : null;
            if (lid && cid) {
                toggleLeadTemp(lid, cid);
            }
            return;
        }

        const removeColBtn = e.target.closest('.remove-col');
        const editColBtn = e.target.closest('.edit-col');
        const removeLeadBtn = e.target.closest('.remove-lead');
        const card = e.target.closest('.kanban-card');

        if (removeColBtn) {
            const result = await Swal.fire({
                title: 'Remover coluna?',
                text: "Os leads nesta coluna serão perdidos!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#334155',
                confirmButtonText: 'Sim, remover',
                cancelButtonText: 'Cancelar',
                background: '#1e293b',
                color: '#fff'
            });
            if (result.isConfirmed) {
                try {
                    const colId = parseInt(removeColBtn.dataset.colid);
                    // Supabase Delete
                    const { error } = await supabase.from('kanban_columns').delete().eq('id', colId);
                    if (error) throw error;

                    kanbanData = kanbanData.filter(c => c.id !== colId);
                    renderKanban();
                    showToast('Coluna removida', 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao remover coluna (verifique se há leads nela)', 'error');
                }
            }
        }
        if (editColBtn) {
            const c = kanbanData.find(x => x.id === parseInt(editColBtn.dataset.colid));
            if (c) {
                const { value: formValues } = await Swal.fire({
                    title: 'Editar Coluna',
                    html: `
                        <div class="flex flex-col gap-4 text-left">
                            <div>
                                <label class="block text-sm font-medium text-gray-400 mb-1">Nome da Coluna</label>
                                <input id="swal-col-title" class="swal2-input m-0 w-full bg-white/5 border border-white/10 text-white focus:border-zap-primary" placeholder="Nome da Coluna" value="${c.title}">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-400 mb-1">Cor do Neon</label>
                                <div class="flex gap-2 justify-center mt-2">
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#E13584]" data-color="#E13584" title="Neon Pink"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#8A6CFF]" data-color="#8A6CFF" title="Neon Purple"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#F59E0B]" data-color="#F59E0B" title="Neon Orange"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#10B981]" data-color="#10B981" title="Neon Green"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#3B82F6]" data-color="#3B82F6" title="Neon Blue"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#06B6D4]" data-color="#06B6D4" title="Cyan"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#8B5CF6]" data-color="#8B5CF6" title="Violet"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#EF4444]" data-color="#EF4444" title="Red"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#D946EF]" data-color="#D946EF" title="Fuchsia"></div>
                                    <div class="color-option w-8 h-8 rounded-full cursor-pointer border-2 border-transparent hover:scale-110 transition-transform bg-[#84cc16]" data-color="#84cc16" title="Lime"></div>
                                    <input type="color" id="swal-col-color" class="w-8 h-8 p-0 border-0 rounded-full cursor-pointer ml-2" value="${c.color || '#E13584'}" title="Cor Personalizada">
                                </div>
                            </div>
                        </div>
                    `,
                    background: '#1e293b',
                    color: '#fff',
                    confirmButtonColor: '#8b5cf6',
                    showCancelButton: true,
                    focusConfirm: false,
                    didOpen: () => {
                        const colorOptions = Swal.getPopup().querySelectorAll('.color-option');
                        const colorInput = Swal.getPopup().querySelector('#swal-col-color');

                        colorOptions.forEach(opt => {
                            opt.addEventListener('click', () => {
                                colorInput.value = opt.dataset.color;
                                // Visual feedback
                                colorOptions.forEach(o => o.style.borderColor = 'transparent');
                                opt.style.borderColor = '#fff';
                            });
                        });
                    },
                    preConfirm: () => {
                        return [
                            document.getElementById('swal-col-title').value,
                            document.getElementById('swal-col-color').value
                        ]
                    }
                });

                if (formValues) {
                    try {
                        const newTitle = formValues[0];
                        const newColor = formValues[1];
                        const colId = c.id;

                        // Supabase Update
                        const { error } = await supabase
                            .from('kanban_columns')
                            .update({ title: newTitle, color: newColor })
                            .eq('id', colId);

                        if (error) throw error;

                        c.title = newTitle;
                        c.color = newColor;
                        renderKanban();
                        showToast('Coluna atualizada!', 'success');
                    } catch (err) {
                        console.error(err);
                        showToast('Erro ao atualizar coluna', 'error');
                    }
                }
            }
        }
        if (removeLeadBtn) {
            e.stopPropagation(); // Stop card click
            const result = await Swal.fire({
                title: 'Remover lead?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#334155',
                confirmButtonText: 'Sim',
                cancelButtonText: 'Não',
                background: '#1e293b',
                color: '#fff'
            });
            if (result.isConfirmed) {
                try {
                    const lid = parseInt(removeLeadBtn.dataset.leadid);
                    // Supabase Delete
                    const { error } = await supabase.from('leads').delete().eq('id', lid);

                    if (error) throw error;

                    fetchKanbanData(); // Refresh Board
                    showToast('Lead removido', 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Erro ao remover lead', 'error');
                }
            }
        }
    }

    // Call setups
    // Call setups securely
    if (typeof window.setupKanbanListeners === 'function') {
        window.setupKanbanListeners();
    } else {
        console.error('window.setupKanbanListeners is not a function');
    }

    // Event Listeners do Modal
    if (closeLeadModalBtn) closeLeadModalBtn.addEventListener('click', closeLeadDetailsModal);
    if (cancelLeadDetailsBtn) cancelLeadDetailsBtn.addEventListener('click', closeLeadDetailsModal);

    // Temperature Badge Interactive (Modal)
    const modalTempBtn = document.getElementById('lead-temp-badge-btn');
    if (modalTempBtn) {
        modalTempBtn.addEventListener('click', () => {
            const temps = ['cold', 'warm', 'hot'];
            const current = modalTempBtn.dataset.temp || 'cold';
            const nextIndex = (temps.indexOf(current) + 1) % temps.length;
            updateModalTempBadge(temps[nextIndex]);
        });
    }

    // Tabs
    leadTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            leadTabBtns.forEach(b => {
                b.classList.remove('active', 'text-white', 'border-zap-primary');
                b.classList.add('text-zap-text-secondary', 'border-transparent');
            });
            btn.classList.add('active', 'text-white', 'border-zap-primary');
            btn.classList.remove('text-zap-text-secondary', 'border-transparent');

            leadTabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById('lead-tab-' + btn.dataset.tab).classList.remove('hidden');
        });
    });

    // Adicionar nota
    const addNoteBtn = document.getElementById('add-note-btn');
    const newNoteInput = document.getElementById('new-note-input');
    if (addNoteBtn) addNoteBtn.addEventListener('click', () => {
        if (!currentEditingLead || !newNoteInput.value.trim()) return;
        if (!currentEditingLead.notes) currentEditingLead.notes = [];
        currentEditingLead.notes.unshift({
            text: newNoteInput.value.trim(),
            createdAt: new Date().toISOString()
        });
        newNoteInput.value = '';
        renderLeadNotes();
        showToast('Nota adicionada!', 'success');
    });

    // Adicionar lembrete
    const addReminderBtn = document.getElementById('add-reminder-btn');
    if (addReminderBtn) addReminderBtn.addEventListener('click', () => {
        const date = document.getElementById('reminder-date').value;
        const time = document.getElementById('reminder-time').value;
        const text = document.getElementById('reminder-text').value.trim();
        if (!currentEditingLead || !date || !time || !text) {
            showToast('Preencha todos os campos do lembrete', 'warning');
            return;
        }
        if (!currentEditingLead.reminders) currentEditingLead.reminders = [];
        currentEditingLead.reminders.push({ date, time, text });
        document.getElementById('reminder-date').value = '';
        document.getElementById('reminder-time').value = '';
        document.getElementById('reminder-text').value = '';
        renderLeadReminders();
        showToast('Lembrete adicionado!', 'success');
    });

    // Deletar nota/lembrete (event delegation)
    document.getElementById('notes-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-note-btn')) {
            const idx = parseInt(e.target.closest('.delete-note-btn').dataset.idx);
            if (currentEditingLead && currentEditingLead.notes) {
                currentEditingLead.notes.splice(idx, 1);
                renderLeadNotes();
            }
        }
    });
    document.getElementById('reminders-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-reminder-btn')) {
            const idx = parseInt(e.target.closest('.delete-reminder-btn').dataset.idx);
            if (currentEditingLead && currentEditingLead.reminders) {
                currentEditingLead.reminders.splice(idx, 1);
                renderLeadReminders();
            }
        }
    });

    // Salvar alterações do lead
    if (saveLeadDetailsBtn) {
        saveLeadDetailsBtn.addEventListener('click', () => {
            console.log('💾 Save button clicked');
            window.saveLeadDetails();
        });
    }


    // Clicar no card para abrir modal (usando event delegation GLOBAL)
    document.addEventListener('click', (e) => {
        // Debug global de cliques
        // console.log('🎯 Clicked on:', e.target); 

        const card = e.target.closest('.kanban-card');
        if (card && !e.target.closest('.remove-lead')) {
            console.log('🎯 Kanban Card Clicked:', card);

            const leadId = parseInt(card.dataset.leadId);
            const colDiv = card.closest('[data-colid]');
            const columnId = colDiv ? parseInt(colDiv.dataset.colid) : null;

            console.log('🎯 Extracted IDs - Lead:', leadId, 'Column:', columnId);

            if (leadId && columnId) {
                openLeadDetailsModal(leadId, columnId);
            }
        }
    });
    // --- LÓGICA DO MÓDULO GATILHOS (PREMIUM) ---
    // Mock Data se vazio
    if (!gatilhos || gatilhos.length === 0) {
        gatilhos = [
            { id: 1, nome: 'Boas-vindas', event: 'message_received', keyword: 'oi, olá, bom dia', action: 'send_message', response: 'Olá! Bem-vindo ao ZapFlow. Como posso ajudar?', isActive: true },
            { id: 2, nome: 'Interesse', event: 'tag_added', keyword: 'interesse', action: 'move_funnel', response: 'Mover para: Em Negociação', isActive: true },
            { id: 3, nome: 'Ausência', event: 'message_received', keyword: 'horário', action: 'send_message', response: 'Nosso horário de atendimento é das 9h às 18h.', isActive: false }
        ];
    }

    let selectedGatilhoId = null;
    let isEditingGatilho = false;

    // Referências do DOM
    const gatilhoListContainer = document.getElementById('gatilho-list');
    const gatilhoWelcomePanel = document.getElementById('gatilho-welcome-panel');
    const gatilhoDetailsPanel = document.getElementById('gatilho-details-panel');
    const gatilhoTitleDisplay = document.getElementById('gatilho-title-display');
    const gatilhoEventSelect = document.getElementById('gatilho-event-select');
    const gatilhoKeywordInput = document.getElementById('gatilho-keyword-input');
    const gatilhoActionSelect = document.getElementById('gatilho-action-select');
    const gatilhoResponseInput = document.getElementById('gatilho-response-input');
    const gatilhoStatusToggle = document.getElementById('gatilho-status-toggle');
    const gatilhoStatusText = document.getElementById('gatilho-status-text');

    // Botões
    const addGatilhoBtn = document.getElementById('add-gatilho-btn');
    const editGatilhoBtn = document.getElementById('edit-gatilho-btn');
    const saveGatilhoBtn = document.getElementById('save-gatilho-btn');
    const deleteGatilhoBtn = document.getElementById('delete-gatilho-btn');
    const searchGatilhoInput = document.getElementById('search-gatilho-input');

    function renderGatilhos() {
        if (!gatilhoListContainer) return;
        gatilhoListContainer.innerHTML = '';
        const term = searchGatilhoInput ? searchGatilhoInput.value.toLowerCase() : '';

        const filtered = gatilhos.filter(g => g.nome.toLowerCase().includes(term));

        if (filtered.length === 0) {
            gatilhoListContainer.innerHTML = `<div class="text-center py-8 text-gray-500"><p class="text-sm">Nenhum gatilho encontrado.</p></div>`;
            return;
        }

        filtered.forEach(g => {
            const isActive = g.id === selectedGatilhoId;
            const itemDiv = document.createElement('div');
            itemDiv.className = `p-4 rounded-xl cursor-pointer border transition-all duration-300 group ${isActive
                ? 'bg-zap-primary/20 border-zap-primary/50 shadow-lg shadow-zap-primary/10'
                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'}`;

            // Icon based on event
            let iconSvg = '';
            if (g.event === 'message_received') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />';
            else if (g.event === 'funnel_enter') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />';
            else iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />';

            itemDiv.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center ${isActive ? 'bg-zap-primary text-white' : 'bg-white/10 text-gray-400 group-hover:bg-white/20 group-hover:text-white'} transition-colors">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">${iconSvg}</svg>
                        </div>
                        <h4 class="font-semibold text-sm ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'} truncate" style="max-width: 140px;">${g.nome}</h4>
                    </div>
                    <div class="w-2 h-2 rounded-full ${g.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-600'}"></div>
                </div>
                <div class="flex items-center gap-2 text-xs text-zap-text-secondary pl-11">
                    <span class="bg-black/30 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[100px]">${g.event === 'message_received' ? 'Msg Recebida' : (g.event === 'funnel_enter' ? 'Funil' : 'Tag')}</span>
                    <span class="text-gray-600">&rarr;</span>
                    <span class="bg-black/30 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[100px]">${g.action === 'send_message' ? 'Enviar Msg' : (g.action === 'move_funnel' ? 'Mover' : 'Add Tag')}</span>
                </div>
            `;

            itemDiv.addEventListener('click', () => {
                selectedGatilhoId = g.id;
                isEditingGatilho = false;
                displayGatilhoDetails(g.id);
                renderGatilhos();
            });
            gatilhoListContainer.appendChild(itemDiv);
        });
        const dc = document.getElementById('dashboard-gatilhos-count'); if (dc) dc.textContent = gatilhos.length;
    }

    function displayGatilhoDetails(id) {
        const gatilho = gatilhos.find(g => g.id === id);
        if (!gatilho) return;

        gatilhoWelcomePanel.classList.add('hidden');
        gatilhoDetailsPanel.classList.remove('hidden');
        gatilhoDetailsPanel.classList.add('flex');

        gatilhoTitleDisplay.value = gatilho.nome;
        gatilhoEventSelect.value = gatilho.event;
        gatilhoKeywordInput.value = gatilho.keyword || '';
        gatilhoActionSelect.value = gatilho.action;
        gatilhoResponseInput.value = gatilho.response || '';

        // Status Update
        updateGatilhoStatusUI(gatilho.isActive);

        // Read-only state
        setGatilhoEditMode(false);
    }

    function updateGatilhoStatusUI(isActive) {
        if (!gatilhoStatusToggle) return;
        if (isActive) {
            gatilhoStatusToggle.classList.remove('bg-gray-600');
            gatilhoStatusToggle.classList.add('bg-green-500');
            gatilhoStatusToggle.querySelector('span').classList.add('translate-x-4');
            gatilhoStatusToggle.querySelector('span').classList.remove('translate-x-0');
            gatilhoStatusText.textContent = 'Ativo';
            gatilhoStatusText.classList.replace('text-gray-400', 'text-green-400');
        } else {
            gatilhoStatusToggle.classList.add('bg-gray-600');
            gatilhoStatusToggle.classList.remove('bg-green-500');
            gatilhoStatusToggle.querySelector('span').classList.remove('translate-x-4');
            gatilhoStatusToggle.querySelector('span').classList.add('translate-x-0');
            gatilhoStatusText.textContent = 'Inativo';
            gatilhoStatusText.classList.replace('text-green-400', 'text-gray-400');
        }
    }

    function setGatilhoEditMode(editable) {
        isEditingGatilho = editable;
        const inputs = [gatilhoTitleDisplay, gatilhoEventSelect, gatilhoKeywordInput, gatilhoActionSelect, gatilhoResponseInput];

        inputs.forEach(input => {
            if (!input) return;
            input.disabled = !editable;
            input.readOnly = !editable; // select elements don't obey readonly but disabled works
            if (editable) {
                input.classList.add('bg-black/40', 'border-zap-primary/50');
                input.classList.remove('bg-black/20', 'border-white/10');
            } else {
                input.classList.remove('bg-black/40', 'border-zap-primary/50');
                input.classList.add('bg-black/20', 'border-white/10');
            }
        });

        // Title styling specific
        if (editable) {
            gatilhoTitleDisplay.classList.remove('bg-transparent', 'border-none');
            gatilhoTitleDisplay.classList.add('bg-white/10', 'border-b', 'border-zap-primary');
        } else {
            gatilhoTitleDisplay.classList.add('bg-transparent', 'border-none');
            gatilhoTitleDisplay.classList.remove('bg-white/10', 'border-b', 'border-zap-primary');
        }

        if (editable) {
            editGatilhoBtn.classList.add('hidden');
            saveGatilhoBtn.classList.remove('hidden');
        } else {
            editGatilhoBtn.classList.remove('hidden');
            saveGatilhoBtn.classList.add('hidden');
        }
    }

    // Listeners
    if (searchGatilhoInput) searchGatilhoInput.addEventListener('input', renderGatilhos);

    if (addGatilhoBtn) addGatilhoBtn.addEventListener('click', () => {
        const newId = Date.now();
        const newGatilho = {
            id: newId,
            nome: 'Nova Automação',
            event: 'message_received',
            keyword: '',
            action: 'send_message',
            response: '',
            isActive: false
        };
        gatilhos.unshift(newGatilho);
        selectedGatilhoId = newId;
        renderGatilhos();
        displayGatilhoDetails(newId);
        setGatilhoEditMode(true); // Auto-enter edit mode
        gatilhoTitleDisplay.focus();
        showToast('Novo gatilho criado', 'success');
    });

    if (editGatilhoBtn) editGatilhoBtn.addEventListener('click', () => setGatilhoEditMode(true));

    if (saveGatilhoBtn) saveGatilhoBtn.addEventListener('click', () => {
        const g = gatilhos.find(x => x.id === selectedGatilhoId);
        if (g) {
            g.nome = gatilhoTitleDisplay.value;
            g.event = gatilhoEventSelect.value;
            g.keyword = gatilhoKeywordInput.value;
            g.action = gatilhoActionSelect.value;
            g.response = gatilhoResponseInput.value;

            setGatilhoEditMode(false);
            renderGatilhos();
            showToast('Gatilho salvo com sucesso!', 'success');

            // Simular save API
            if (API_BASE) { /* fetch implementation */ }
        }
    });

    if (gatilhoStatusToggle) gatilhoStatusToggle.addEventListener('click', () => {
        if (!isEditingGatilho) {
            // Allow toggling status even in read-mode? Yes, usually better UX.
            const g = gatilhos.find(x => x.id === selectedGatilhoId);
            if (g) {
                g.isActive = !g.isActive;
                updateGatilhoStatusUI(g.isActive);
                renderGatilhos(); // Update list dot
            }
        }
    });

    if (deleteGatilhoBtn) deleteGatilhoBtn.addEventListener('click', async () => {
        const result = await Swal.fire({
            title: 'Excluir Gatilho?',
            text: "Essa ação não pode ser desfeita.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sim, excluir',
            cancelButtonText: 'Cancelar',
            background: '#1e293b',
            color: '#fff'
        });

        if (result.isConfirmed) {
            gatilhos = gatilhos.filter(g => g.id !== selectedGatilhoId);
            selectedGatilhoId = null;
            gatilhoDetailsPanel.classList.add('hidden');
            gatilhoWelcomePanel.classList.remove('hidden');
            renderGatilhos();
            showToast('Gatilho removido.', 'success');
        }
    });

    // Initial Load
    // Initial Load - Wrapped in IIFE to avoid top-level await syntax error if scope is confused
    (async () => {
        try {
            await fetchKanbanData();
        } catch (e) {
            console.error('Initial Load Error:', e);
        }
    })();
});

// ===== SUPABASE FUNCTIONS =====

// --- LOADER & CONNECTION HELPERS ---
function showGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.remove('hidden');
}

function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.add('hidden');
}

async function fetchWithTimeout(promise, ms = 10000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Tempo limite de conexão excedido'));
        }, ms);

        promise
            .then(value => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(reason => {
                clearTimeout(timer);
                reject(reason);
            });
    });
}

// ===== SUPABASE FUNCTIONS (ONLINE ONLY) =====

async function fetchKanbanData() {
    showGlobalLoader();

    if (!supabase) {
        console.error('❌ Supabase client not initialized');
        hideGlobalLoader();
        Swal.fire({
            title: 'Erro de Configuração',
            text: 'Não foi possível conectar ao sistema. A biblioteca Supabase não foi carregada.',
            icon: 'error',
            confirmButtonText: 'Tentar Novamente',
            allowOutsideClick: false
        }).then(() => location.reload());
        return;
    }

    try {
        console.log('🔄 Fetching data from Supabase (Online Only)...');

        // Parallel Fetch with Timeout
        // We use Promise.all to fetch columns and leads simultaneously
        const [columnsResult, leadsResult] = await fetchWithTimeout(
            Promise.all([
                supabase.from('kanban_columns').select('*').order('position', { ascending: true }),
                supabase.from('leads').select('*')
            ])
        );

        const { data: columns, error: colError } = columnsResult;
        const { data: leads, error: leadError } = leadsResult;

        if (colError) throw colError;
        if (leadError) throw leadError;

        // If no columns (first run), verify if we need to create defaults or if it's just empty
        if (!columns || columns.length === 0) {
            console.log('⚠️ No columns found in Supabase. Creating defaults...');
            await createDefaultColumns();
            return fetchKanbanData(); // Retry once
        }

        // Map columns and attach leads
        kanbanData = columns.map(col => ({
            id: col.id,
            title: col.title,
            color: col.color || '#E13584',
            items: leads.filter(l => l.column_id === col.id).map(l => ({
                ...l,
                temp: l.status === 'hot' ? 'hot' : 'warm', // Mapping back to UI helpers
                badge: l.status === 'hot' ? 'Muito Quente' : 'Quente'
            }))
        }));

        renderKanban();

        // 4. Fetch Media Library (Non-blocking)
        // We don't await this strictly for the critical path, but good to have
        supabase
            .from('media_library')
            .select('*')
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (data) {
                    midias = data.filter(m => m.type === 'image' || m.type === 'video');
                    audios = data.filter(m => m.type === 'audio');
                    documentos = data.filter(m => m.type === 'document');
                    if (typeof renderMidias === 'function') renderMidias();
                    if (typeof renderAudios === 'function') renderAudios();
                    if (typeof renderDocumentos === 'function') renderDocumentos();
                }
            });

        console.log('✅ All data loaded successfully!');
        hideGlobalLoader();

    } catch (error) {
        console.error('❌ Data Load Error:', error);
        hideGlobalLoader();

        // Show Retry Modal
        Swal.fire({
            title: 'Erro de Conexão',
            text: 'Não foi possível carregar os dados. Verifique sua internet.',
            icon: 'error',
            confirmButtonText: 'Tentar Novamente',
            allowOutsideClick: false,
            confirmButtonColor: '#E13584'
        }).then((result) => {
            if (result.isConfirmed) {
                location.reload();
            }
        });
    }
}

async function createDefaultColumns() {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const defaults = [
        { user_id: userId, title: 'Novos Leads', color: '#E13584', position: 1 },
        { user_id: userId, title: 'Em Atendimento', color: '#8A6CFF', position: 2 },
        { user_id: userId, title: 'Agendados', color: '#F59E0B', position: 3 },
        { user_id: userId, title: 'Venda Realizada', color: '#10B981', position: 4 },
        { user_id: userId, title: 'Perdido', color: '#3B82F6', position: 5 }
    ];
    await supabase.from('kanban_columns').insert(defaults);
}

// --- APEXCHARTS CONFIGURATION ---
// NOTE: Using window.funnelChart to avoid Temporal Dead Zone errors
if (typeof window.funnelChart === 'undefined') {
    window.funnelChart = null;
}

function initDashboardChart() {
    if (window.funnelChart) return;
    const chartEl = document.querySelector("#funnel-chart");
    if (!chartEl) return;

    const options = {
        series: [{
            name: 'Leads',
            data: [0, 0, 0]
        }],
        chart: {
            type: 'bar',
            height: 250,
            background: 'transparent',
            toolbar: { show: false },
            animations: {
                enabled: true,
                easing: 'easeinout',
                speed: 800,
                animateGradually: { enabled: true, delay: 150 },
                dynamicAnimation: { enabled: true, speed: 350 }
            }
        },
        plotOptions: {
            bar: {
                borderRadius: 6,
                columnWidth: '40%',
                distributed: true,
            }
        },
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: {
            show: true,
            borderColor: 'rgba(255,255,255,0.05)',
            strokeDashArray: 4,
        },
        xaxis: {
            categories: ['Novos', 'Negociação', 'Fechado'],
            labels: {
                style: { colors: '#94a3b8', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: { colors: '#94a3b8', fontSize: '12px', fontFamily: 'Inter, sans-serif' }
            }
        },
        colors: ['#8b5cf6', '#eab308', '#22c55e'],
        tooltip: {
            theme: 'dark',
            y: { formatter: function (val) { return val + " Leads" } }
        }
    };

    if (typeof ApexCharts !== 'undefined') {
        window.funnelChart = new ApexCharts(chartEl, options);
        window.funnelChart.render();
    }
}

function updateDashboardCounters() {
    const safeSet = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };

    // Init chart if not exists
    initDashboardChart();

    safeSet('dashboard-mensagens-count', messages.length);
    safeSet('dashboard-audios-count', audios.length);
    safeSet('dashboard-midias-count', midias.length);
    safeSet('dashboard-documentos-count', documentos.length);
    safeSet('dashboard-funis-count', funis.length);
    safeSet('dashboard-gatilhos-count', (typeof gatilhos !== 'undefined') ? gatilhos.length : 0);

    try {
        const totalLeads = kanbanData.reduce((sum, c) => sum + (c.items ? c.items.length : 0), 0);

        // Calculate column logic for chart mock (assuming 3 main stages or map by index)
        // Mock mapping: Column 0 -> Novos, Column 1 -> Negociação, Last Column -> Fechado
        let novos = 0, negociacao = 0, fechado = 0;

        if (kanbanData.length > 0) novos = kanbanData[0].items.length;
        if (kanbanData.length > 1) {
            // Sum all middle columns
            for (let i = 1; i < kanbanData.length - 1; i++) {
                negociacao += kanbanData[i].items.length;
            }
            // If only 2 columns, put the 2nd in Fechado or Negociacao? Let's say last is closed.
            if (kanbanData.length === 2) negociacao = 0; // reset to avoid double count if logic fails
        }
        if (kanbanData.length > 1) fechado = kanbanData[kanbanData.length - 1].items.length;

        // Update Chart
        if (window.funnelChart) {
            window.funnelChart.updateSeries([{
                data: [novos, negociacao, fechado]
            }]);
        }

        const pageInicio = document.getElementById('page-inicio');
        if (pageInicio && !pageInicio.classList.contains('hidden')) {
            let totalValue = 0;
            kanbanData.forEach(col => {
                col.items.forEach(item => {
                    if (item.value) totalValue += Number(item.value);
                });
            });
            const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
            const elements = pageInicio.querySelectorAll('p.text-4xl');
            if (elements.length >= 2) {
                elements[0].textContent = totalLeads;
                elements[1].textContent = formatter.format(totalValue);
                if (kanbanData.length > 0 && totalLeads > 0) {
                    const rate = Math.round((fechado / totalLeads) * 100);
                    if (elements[2]) elements[2].textContent = rate + '%';
                }
            }
        }
    } catch (e) { console.error('Error updating dashboard insights', e); }
}


// Helper Toast
// Helper Toast using SweetAlert2
function showToast(message, kind = 'info') {
    if (typeof Swal !== 'undefined') {
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer);
                toast.addEventListener('mouseleave', Swal.resumeTimer);
            },
            customClass: {
                popup: 'colored-toast'
            }
        });

        Toast.fire({
            icon: kind,
            title: message,
            background: kind === 'success' ? '#10b981' : (kind === 'error' ? '#ef4444' : '#334155'),
            color: '#fff'
        });
    } else {
        // Fallback
        const el = document.createElement('div');
        el.textContent = message;
        el.style.cssText = `position:fixed;right:20px;bottom:20px;padding:10px 14px;border-radius:6px;z-index:9999;color:#fff;background:${kind === 'error' ? '#e53e3e' : (kind === 'success' ? '#10b981' : '#334155')}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }
}
window.showToast = showToast;




// ==========================================
// --- LÓGICA DO MODAL DE DETALHES DO LEAD (GLOBAL FIX) ---
// ==========================================

// Funções Globais para acesso direto
// --- RENDERIZADORES DO MODAL ---

window.renderLeadNotes = function () {
    const notesList = document.getElementById('notes-list');
    const lead = window.currentEditingLead;
    if (!lead) return;
    const notes = lead.notes || [];

    if (notes.length === 0) {
        notesList.innerHTML = '<div class="col-span-2 text-center py-8"><p class="text-gray-500 text-sm">Nenhuma nota interna registrada.</p></div>';
        return;
    }

    notesList.innerHTML = notes.map((note, idx) => `
        <div class="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-colors group relative">
            <div class="flex justify-between items-start mb-2">
                <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">${new Date(note.createdAt).toLocaleDateString('pt-BR')} às ${new Date(note.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="edit-note-btn p-1 text-blue-400 hover:text-white transition-colors" data-idx="${idx}" title="Editar">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button class="delete-note-btn p-1 text-red-400 hover:text-white transition-colors" data-idx="${idx}" title="Excluir">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
            <p class="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">${note.text}</p>
        </div>
    `).join('');
};

window.renderLeadInteractions = function () {
    const list = document.getElementById('lead-interactions-list');
    const lead = window.currentEditingLead;
    if (!list || !lead) return;

    // Simulate chat history (In a real app, this would come from an API)
    // We use the lead's data to make it look realistic
    const avatarUrl = lead.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random&color=fff`;

    // Mock Messages
    const messages = [
        { type: 'in', text: 'Olá! Tudo bem? Vi que tem interesse no nosso produto.', time: 'Ontem 14:30' },
        { type: 'out', text: 'Oi! Sim, gostaria de saber mais sobre os valores.', time: 'Ontem 14:45' },
        { type: 'in', text: 'Claro! Temos planos a partir de R$ 97,00 mensais.', time: 'Ontem 14:46' },
        { type: 'out', text: 'Entendi. Vou analisar e retorno.', time: 'Ontem 15:00' } // Latest
    ];

    // Render Last 3-4 messages to fill the frame
    list.innerHTML = messages.map(msg => {
        if (msg.type === 'in') {
            // Message from CRM User (Agent)
            return `
            <div class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-zap-primary/20 flex items-center justify-center text-xs font-bold text-zap-primary flex-shrink-0 border border-zap-primary/30">VC</div>
                <div class="bg-zap-primary/10 rounded-2xl rounded-tl-none p-3 text-sm text-gray-200 border border-zap-primary/20 shadow-sm">
                    <p>${msg.text}</p>
                    <span class="text-[10px] text-gray-500 mt-1 block text-right">${msg.time}</span>
                </div>
            </div>`;
        } else {
            // Message from Lead
            return `
            <div class="flex gap-3 flex-row-reverse">
                <img src="${avatarUrl}" class="w-8 h-8 rounded-full object-cover border border-white/10 shadow-sm">
                <div class="bg-white/5 rounded-2xl rounded-tr-none p-3 text-sm text-gray-200 border border-white/10 shadow-sm">
                    <p>${msg.text}</p>
                    <span class="text-[10px] text-gray-500 mt-1 block text-right">${msg.time}</span>
                </div>
            </div>`;
        }
    }).join('');

    // Setup "See Full History" button
    const historyBtn = document.getElementById('view-full-history-btn');
    if (historyBtn) {
        historyBtn.onclick = () => {
            const phone = lead.phone.replace(/\D/g, '');
            window.open(`https://wa.me/${phone}`, '_blank');
        };
    }
};

window.renderLeadTimeline = function () {
    const container = document.getElementById('lead-timeline-container');
    const lead = window.currentEditingLead;
    if (!lead || !container) return;

    // Ensure history exists
    if (!lead.history || lead.history.length === 0) {
        lead.history = [];
        // Add initial creation event if missing
        const createDate = lead.createdAt ? new Date(lead.createdAt) : new Date();
        if (!lead.createdAt) createDate.setDate(createDate.getDate() - Math.floor(Math.random() * 10) - 1);

        window.addLeadHistory(lead, 'start', 'Lead Capturado', `Origem: ${lead.origin || 'Desconhecida'}`, 'star', 'yellow');
    }

    const events = [...lead.history].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = events.map((ev, index) => {
        let iconSvg = '';
        // Map icons
        if (ev.icon === 'start') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />';
        else if (ev.icon === 'move') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />';
        else if (ev.icon === 'note' || ev.icon === 'pencil') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />';
        else if (ev.icon === 'bell') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />';
        else if (ev.icon === 'thermometer') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />';
        else if (ev.icon === 'trash') iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />';
        else iconSvg = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';

        const colorMap = {
            yellow: 'bg-yellow-500 shadow-yellow-500/20',
            blue: 'bg-blue-500 shadow-blue-500/20',
            purple: 'bg-purple-500 shadow-purple-500/20',
            red: 'bg-red-500 shadow-red-500/20'
        };
        const bgClass = colorMap[ev.color] || 'bg-gray-500 shadow-gray-500/20';

        // Format Date
        const dateObj = new Date(ev.date);
        const dateStr = dateObj.toLocaleDateString('pt-BR');
        const timeStr = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        return `
        <div class="relative pl-8 group mb-4">
            ${index !== events.length - 1 ? '<div class="absolute left-[11px] top-8 bottom-[-16px] w-0.5 bg-white/10 group-hover:bg-zap-primary/30 transition-colors"></div>' : ''}
            
            <div class="absolute left-0 top-1 w-6 h-6 rounded-full ${bgClass} shadow-lg flex items-center justify-center z-10 ring-4 ring-zap-dark transition-transform group-hover:scale-110">
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconSvg}</svg>
            </div>
            
            <div class="bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-all hover:translate-x-1">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="text-[10px] font-bold text-white uppercase tracking-wide">${ev.title}</h4>
                    <span class="text-[9px] text-gray-500">${dateStr} ${timeStr}</span>
                </div>
                <p class="text-xs text-gray-300 leading-snug">${ev.desc}</p>
            </div>
        </div>
        `;
    }).join('');
};

window.openLeadDetailsModal = function (leadId, columnId) {
    const column = kanbanData.find(c => c.id === columnId);
    if (!column) return;
    const lead = column.items.find(i => i.id === leadId);
    if (!lead) return;

    window.currentEditingLead = lead;
    window.currentEditingColumnId = columnId;

    // --- POPULATE HEADER ---
    const avatarUrl = lead.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(lead.name)}&background=random&color=fff`;
    document.getElementById('lead-modal-avatar').src = avatarUrl;
    document.getElementById('lead-modal-name').textContent = lead.name;
    const stageEl = document.getElementById('lead-modal-stage');
    if (stageEl) stageEl.textContent = column.title;

    // Temperature Badge (Header)
    updateTempVisuals(lead.temp || 'cold');

    // --- POPULATE INFO TAB ---
    // Full Name Input
    document.getElementById('lead-modal-fullname').value = lead.name;
    document.getElementById('lead-modal-email').value = lead.email || '';
    document.getElementById('lead-modal-product').value = lead.product || '';
    document.getElementById('lead-modal-value').value = lead.value || 0;

    // Origin / Campaign (If fields exist)
    const originSelect = document.getElementById('lead-modal-origin');
    if (originSelect) {
        originSelect.value = lead.origin || '';
        if (lead.origin === 'Outros') {
            document.getElementById('lead-modal-origin-custom').parentNode.classList.remove('hidden');
            document.getElementById('lead-modal-origin-custom').value = lead.customOrigin || '';
        } else {
            document.getElementById('lead-modal-origin-custom').parentNode.classList.add('hidden');
        }
    }
    const campaignInput = document.getElementById('lead-modal-campaign');
    if (campaignInput) campaignInput.value = lead.campaign || '';

    // --- RENDER SUB-COMPONENTS ---
    window.renderLeadNotes(); // Use global
    window.renderLeadInteractions(); // Use global
    window.renderLeadTimeline(); // Use global

    // Show Modal
    const modal = document.getElementById('lead-details-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.saveLeadDetails = function () {
    // Use local scope variables if available, or fallbacks
    const editingLead = currentEditingLead || window.currentEditingLead;
    const colId = currentEditingColumnId || window.currentEditingColId;

    if (!editingLead) {
        console.error('No lead being edited');
        return;
    }

    // Capture Values
    editingLead.name = document.getElementById('lead-modal-fullname').value;
    editingLead.email = document.getElementById('lead-modal-email').value;
    editingLead.product = document.getElementById('lead-modal-product').value;
    editingLead.value = parseFloat(document.getElementById('lead-modal-value').value) || 0;

    // Campaign Stuff
    const originSelect = document.getElementById('lead-modal-origin');
    if (originSelect) {
        editingLead.origin = originSelect.value;
        if (editingLead.origin === 'Outros') {
            editingLead.customOrigin = document.getElementById('lead-modal-origin-custom').value;
        } else {
            delete editingLead.customOrigin;
        }
    }
    editingLead.campaign = document.getElementById('lead-modal-campaign').value || '';

    // Temperature
    const modalTempBtn = document.getElementById('lead-temp-badge-btn');
    if (modalTempBtn) {
        editingLead.temp = modalTempBtn.dataset.temp || 'cold';
    }

    // LOG HISTORY: UPDATED
    if (window.addLeadHistory) {
        window.addLeadHistory(editingLead, 'pencil', 'Perfil Atualizado', 'Informações de contato e detalhes foram atualizados.', 'pencil', 'blue');
    }

    // --- PERSISTENCE LOGIC (Online Only) ---
    (async () => {
        if (supabase) {
            try {
                const { error } = await supabase
                    .from('leads')
                    .update({
                        name: editingLead.name,
                        email: editingLead.email,
                        product: editingLead.product,
                        value: editingLead.value,
                        origin: editingLead.origin,
                        customOrigin: editingLead.customOrigin,
                        campaign: editingLead.campaign,
                        status: editingLead.temp // Map temp -> status
                    })
                    .eq('id', editingLead.id);

                if (error) throw error;

                window.showToast('Lead salvo com sucesso!', 'success');

                // Re-render Board to reflect changes
                if (typeof renderKanban === 'function') renderKanban();
                window.closeLeadDetailsModal();

            } catch (err) {
                console.error('❌ Supabase Update Error:', err);
                Swal.fire('Erro', 'Não foi possível salvar as alterações. Verifique sua conexão.', 'error');
            }
        } else {
            Swal.fire('Erro', 'Banco de dados desconectado.', 'error');
        }
    })();
};

window.closeLeadDetailsModal = function () {
    const modal = document.getElementById('lead-details-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    window.currentEditingLead = null;
    window.currentEditingColumnId = null;
};


// --- PERIOD FILTER DROPDOWN ---
document.addEventListener('DOMContentLoaded', () => {
    const filterBtn = document.getElementById('period-filter-btn');
    const filterMenu = document.getElementById('period-filter-menu');
    const filterText = document.getElementById('period-filter-text');
    const filterArrow = document.getElementById('period-filter-arrow');
    const periodOptions = document.querySelectorAll('.period-option');

    if (filterBtn && filterMenu) {
        // Toggle dropdown
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.toggle('hidden');
            filterArrow.style.transform = filterMenu.classList.contains('hidden') ? '' : 'rotate(180deg)';
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!filterMenu.contains(e.target) && !filterBtn.contains(e.target)) {
                filterMenu.classList.add('hidden');
                filterArrow.style.transform = '';
            }
        });

        // Handle option selection
        periodOptions.forEach(option => {
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                const text = option.textContent.trim();

                filterText.textContent = text;
                filterMenu.classList.add('hidden');
                filterArrow.style.transform = '';

                // Update active state
                periodOptions.forEach(opt => {
                    opt.classList.remove('text-white', 'bg-zap-primary/10');
                    opt.classList.add('text-gray-300');
                });
                option.classList.add('text-white', 'bg-zap-primary/10');
                option.classList.remove('text-gray-300');

                // Trigger data update based on period
                console.log('Period selected:', value);
                // TODO: Add actual filtering logic here
            });
        });
    }
});

// --- CALENDAR & APPOINTMENTS SYSTEM (Apple Style) ---
var agendamentos = [];
var currentCalendarDate = new Date();
var selectedDate = new Date(); // ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Sidebar Toggle
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const tabAgendamentos = document.getElementById('tab-agendamentos');
    const kanbanContent = document.getElementById('kanban-content');
    const agendamentosContent = document.getElementById('agendamentos-content');
    const kanbanActions = document.getElementById('kanban-actions');
    const agendamentosActions = document.getElementById('agendamentos-actions');

    // Calendar Navigation
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const todayBtn = document.getElementById('today-btn');

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            currentCalendarDate = new Date();
            selectedDate = new Date();
            renderCalendar();
            selectDate(selectedDate);
        });
    }

    // Add Appointment Button
    const addAgendamentoBtn = document.getElementById('add-agendamento-btn');
    if (addAgendamentoBtn) {
        addAgendamentoBtn.addEventListener('click', () => {
            showAddAppointmentModal();
        });
    }

    // Sample appointments
    agendamentos = [
        { id: 1, date: '2026-02-10', time: '09:00', title: 'Reunião com Ana Clara', contact: 'Ana Clara', phone: '11987654321', color: '#E13584', notes: 'Discutir contrato mensal' },
        { id: 2, date: '2026-02-15', time: '14:30', title: 'Follow-up Bruno', contact: 'Bruno Costa', phone: '21987654321', color: '#8A6CFF', notes: 'Verificar status da proposta' },
        { id: 3, date: '2026-02-20', time: '10:00', title: 'Proposta Fernanda', contact: 'Fernanda Lima', phone: '31987654321', color: '#10B981', notes: 'Apresentação final' }
    ];

    // Initial Render call if on agendamentos tab (or just to prep)
    renderCalendar();
});

function renderCalendar() {
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('calendar-month-year');
    if (!calendarGrid) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    // Update header
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    monthYearDisplay.textContent = `${monthNames[month]} ${year}`;

    // Get first day of month and total days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = '';

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="p-1 min-h-[30px] flex items-center justify-center text-gray-600 text-[10px] opacity-50">${day}</div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayDate = new Date(year, month, day);
        const dayAppointments = agendamentos.filter(a => a.date === dateStr);
        const isToday = isCurrentMonth && today.getDate() === day;
        const isSelected = selectedDate && selectedDate.toDateString() === dayDate.toDateString();

        const hasEvent = dayAppointments.length > 0;
        const eventDot = hasEvent ? `<div class="w-1 h-1 rounded-full bg-zap-secondary mx-auto mt-0.5"></div>` : '';

        let bgClass = '';
        let textClass = 'text-white';

        if (isSelected) {
            bgClass = 'bg-white text-black font-bold shadow-lg shadow-white/20';
            textClass = 'text-black';
        } else if (isToday) {
            bgClass = 'bg-zap-primary text-white font-bold';
        } else {
            bgClass = 'hover:bg-white/10 text-gray-300';
        }

        html += `
            <div class="calendar-day p-1 min-h-[30px] flex flex-col items-center justify-center cursor-pointer rounded-full w-8 h-8 mx-auto transition-all duration-200 ${bgClass}" 
                 data-date="${dateStr}"
                 onclick="selectDate(new Date(${year}, ${month}, ${day}))">
                <span class="text-xs ${textClass}">${day}</span>
                ${!isSelected ? eventDot : ''}
            </div>
        `;
    }

    // Next month days
    const totalDays = firstDay + daysInMonth;
    const remainingDays = 42 - totalDays;
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="p-1 min-h-[30px] flex items-center justify-center text-gray-600 text-[10px] opacity-50">${day}</div>`;
    }

    calendarGrid.innerHTML = html;

    // Also render daily timeline for currently selected date
    if (selectedDate) {
        renderDailyTimeline(selectedDate);
    }

    renderUpcomingAppointments();
}

function selectDate(date) {
    selectedDate = date;

    // Update local variables for visual sync if needed (e.g. if selecting a date in another month)
    if (date.getMonth() !== currentCalendarDate.getMonth()) {
        currentCalendarDate = new Date(date);
        renderCalendar(); // Re-render whole month
    } else {
        // Just update visual selection classes without full re-render for performance
        document.querySelectorAll('.calendar-day').forEach(el => {
            const elDate = el.dataset.date;
            const isSel = elDate === date.toISOString().split('T')[0];

            // Simplified toggle re-rendering is safer to guarantee state
            renderCalendar();
        });
    }

    // Update display text
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    document.getElementById('selected-date-display').textContent = date.getDate();
    document.getElementById('selected-day-name').textContent = dayNames[date.getDay()];
    document.getElementById('selected-month-name').textContent = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;

    renderDailyTimeline(date);

    // Clear details panel
    document.getElementById('appointment-detail-content').innerHTML = `
        <div class="text-center py-12 text-gray-500">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
            </div>
            <p class="text-sm font-medium mb-1">Selecione um agendamento</p>
            <p class="text-xs text-gray-600">Clique em um evento no calendário para ver os detalhes</p>
        </div>
    `;
}

function renderDailyTimeline(date) {
    const container = document.getElementById('day-schedule');
    if (!container) return;

    const dateStr = date.toISOString().split('T')[0];
    const dayAppointments = agendamentos.filter(a => a.date === dateStr);

    // Generate hours 08:00 to 18:00
    let html = '';
    for (let i = 8; i <= 18; i++) {
        const hour = String(i).padStart(2, '0');
        const timeSlot = `${hour}:00`;

        // Find appointments starting in this hour
        const events = dayAppointments.filter(a => a.time.startsWith(hour));

        let eventsHtml = '';
        if (events.length > 0) {
            eventsHtml = events.map(evt => `
                <div onclick="showAppointmentDetails(${evt.id})" 
                     class="ml-4 p-3 rounded-xl bg-gradient-to-r from-gray-800 to-gray-800/50 border-l-[3px] cursor-pointer hover:bg-gray-700 transition-all group"
                     style="border-color: ${evt.color}">
                    <div class="flex justify-between items-start">
                        <div>
                             <p class="text-sm font-semibold text-white group-hover:text-zap-secondary transition-colors">${evt.title}</p>
                             <p class="text-xs text-gray-400 mt-0.5">${evt.time} - ${evt.contact}</p>
                        </div>
                        <div class="w-2 h-2 rounded-full" style="background: ${evt.color}"></div>
                    </div>
                </div>
            `).join('');
        }

        html += `
            <div class="flex group min-h-[60px]">
                <div class="w-14 text-right pr-3 text-xs text-gray-500 font-medium pt-2 relative">
                    ${timeSlot}
                </div>
                <div class="flex-1 border-t border-white/5 relative pt-1 pb-1">
                    ${eventsHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

function showAppointmentDetails(id) {
    const apt = agendamentos.find(a => a.id === id);
    if (!apt) return;

    const container = document.getElementById('appointment-detail-content');
    container.innerHTML = `
        <div class="animate-fade-in">
            <div class="flex justify-between items-start mb-6">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg" style="background: ${apt.color}">
                    ${apt.contact.charAt(0)}
                </div>
                <div class="flex gap-2">
                    <button class="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                    </button>
                    <button class="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-colors">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            </div>
            
            <h3 class="text-xl font-bold text-white mb-1 leading-tight">${apt.title}</h3>
            <p class="text-sm text-zap-primary font-medium mb-6">${formatDate(apt.date)} • ${apt.time}</p>
            
            <div class="space-y-4">
                <div class="flex items-start gap-4 p-3 rounded-xl bg-white/5">
                    <svg class="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    <div>
                        <p class="text-xs text-gray-400 mb-0.5">Contato</p>
                        <p class="text-sm text-white font-medium">${apt.contact}</p>
                    </div>
                </div>
                
                <div class="flex items-start gap-4 p-3 rounded-xl bg-white/5">
                    <svg class="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    <div>
                        <p class="text-xs text-gray-400 mb-0.5">Telefone</p>
                        <p class="text-sm text-white font-medium">${apt.phone}</p>
                    </div>
                </div>
                
                <div class="flex items-start gap-4 p-3 rounded-xl bg-white/5">
                    <svg class="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <div>
                        <p class="text-xs text-gray-400 mb-0.5">Notas</p>
                        <p class="text-sm text-gray-300">${apt.notes || 'Sem observações'}</p>
                    </div>
                </div>
            </div>
            
            <button class="w-full mt-6 py-3 rounded-xl bg-zap-primary hover:bg-zap-primary/90 text-white font-semibold shadow-lg shadow-zap-primary/30 transition-all flex items-center justify-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
                Iniciar Conversa
            </button>
        </div>
    `;
}

function renderUpcomingAppointments() {
    const container = document.getElementById('upcoming-appointments');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const upcoming = agendamentos.filter(a => a.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-gray-500">
                <p class="text-xs">Nenhum agendamento futuro</p>
            </div>
        `;
        return;
    }

    container.innerHTML = upcoming.map(a => `
        <div onclick="handleUpcomingClick('${a.date}', ${a.id})" 
             class="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
            <div class="w-1 h-8 rounded-full group-hover:h-10 transition-all duration-300" style="background: ${a.color}"></div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-white truncate group-hover:text-zap-secondary transition-colors">${a.title}</p>
                <p class="text-[10px] text-gray-400">${formatDate(a.date)} • ${a.time}</p>
            </div>
        </div>
    `).join('');
}

function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function showAddAppointmentModal(defaultDate = null) {
    const today = defaultDate ? defaultDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    Swal.fire({
        title: 'Novo Agendamento',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Título</label>
                    <input id="swal-title" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-white/10" placeholder="Ex: Reunião com cliente">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm text-gray-400 mb-1">Data</label>
                        <input id="swal-date" type="date" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-white/10" value="${today}">
                    </div>
                    <div>
                        <label class="block text-sm text-gray-400 mb-1">Hora</label>
                        <input id="swal-time" type="time" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-white/10" value="09:00">
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-gray-400 mb-1">Contato</label>
                    <input id="swal-contact" class="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-white/10" placeholder="Nome do contato">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        background: '#2B2C40',
        color: '#fff',
        confirmButtonColor: '#E13584',
        preConfirm: () => {
            const title = document.getElementById('swal-title').value;
            const date = document.getElementById('swal-date').value;
            const time = document.getElementById('swal-time').value;
            const contact = document.getElementById('swal-contact').value;

            if (!title || !date || !time) {
                Swal.showValidationMessage('Preencha todos os campos obrigatórios');
                return false;
            }
            return { title, date, time, contact };
        }
    }).then(result => {
        if (result.isConfirmed) {
            const colors = ['#E13584', '#8A6CFF', '#10B981', '#3B82F6', '#F59E0B'];
            const newAppointment = {
                id: Date.now(),
                ...result.value,
                color: colors[Math.floor(Math.random() * colors.length)],
                notes: 'Novo agendamento criado via painel'
            };
            agendamentos.push(newAppointment);

            // If the date is selected, refresh view
            if (selectedDate && selectedDate.toISOString().split('T')[0] === result.value.date) {
                renderDailyTimeline(selectedDate);
            }
            renderCalendar();

            Swal.fire({
                icon: 'success',
                title: 'Agendamento criado!',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                background: '#10B981',
                color: '#fff'
            });
        }
    });
}

function handleUpcomingClick(dateStr, id) {
    const [year, month, day] = dateStr.split('-');
    // Create date in local time: 00:00:00
    // month is 0-indexed in Date constructor
    selectedDate = new Date(year, month - 1, day);
    renderCalendar();
    selectDate(selectedDate);
    showAppointmentDetails(id);
}


