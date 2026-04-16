const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Remove mock messages
code = code.replace(/    messages = \[\r?\n[\s\S]*?\r?\n    \];/m, '    messages = [];');

// 2. Define fetchAllData
const fetchAllDataCode = `
window.fetchAllData = async function() {
    console.log('🔄 Fetching ALL global data...');
    if (typeof showGlobalLoader === 'function') showGlobalLoader();
    
    try {
        if (!supabase) throw new Error('Supabase not accessible');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Load Messages
        const { data: msgs, error: msgsErr } = await supabase.from('messages').select('*').order('created_at', { ascending: false });
        if (!msgsErr && msgs) {
            messages = msgs.map(m => ({ id: m.id, title: m.title, content: m.content, isFavorite: m.is_favorite }));
            if (typeof renderMessages === 'function') renderMessages();
        }

        // Load Funnels
        const { data: funs, error: funsErr } = await supabase.from('funnels').select('*').order('created_at', { ascending: false });
        if (!funsErr && funs) {
            funis = funs.map(f => ({ id: f.id, title: f.title, description: f.description, isFavorite: f.is_favorite, items: [] }));
            if (typeof renderFunis === 'function') renderFunis();
        }

        // Trigger existing Kanban & Media routines
        if (typeof fetchKanbanData === 'function') await fetchKanbanData();
        
        // Update dashboard
        if (typeof updateDashboardCounters === 'function') updateDashboardCounters();
        
    } catch (e) {
        console.error('Error fetching global data:', e);
    } finally {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
    }
};
`;

// Append fetchAllData
code += '\n\n' + fetchAllDataCode;

// 3. Patch deleteMessageBtn
const delRegex = /    if \(deleteMessageBtn\) deleteMessageBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?renderMessages\(\);\r?\n    \}\);/m;
const newDelMsg = `    if (deleteMessageBtn) deleteMessageBtn.addEventListener('click', async () => {
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

        try {
            const { error } = await supabase.from('messages').delete().eq('id', selectedMessageId);
            if (error) throw error;

            messages = messages.filter(m => m.id !== selectedMessageId);
            showToast('Mensagem removida', 'success');
        } catch (e) {
            showToast('Erro ao apagar no banco.', 'error');
            return;
        }

        selectedMessageId = null; isEditingMessage = false;
        messageDetailsPanel.classList.add('hidden'); messageDetailsPanel.classList.remove('flex');
        messageWelcomePanel.classList.remove('hidden');
        renderMessages();
        if (typeof updateDashboardCounters === 'function') updateDashboardCounters();
    });`;
code = code.replace(delRegex, newDelMsg);

// 4. Patch saveMessageBtn
const saveRegex = /    if \(saveMessageBtn\) saveMessageBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?isEditingMessage = false;\r?\n    \}\);/m;
const newSaveMsg = `    if (saveMessageBtn) saveMessageBtn.addEventListener('click', async () => {
        if (!selectedMessageId) return;
        const message = messages.find(m => m.id === selectedMessageId);
        if (!message) return;
        
        const newTitle = messageTitleDisplay.value; 
        const newContent = messageContentDisplay.value;
        
        try {
            const { error } = await supabase.from('messages').update({ title: newTitle, content: newContent }).eq('id', selectedMessageId);
            if (error) throw error;
            
            message.title = newTitle; 
            message.content = newContent;
            showToast('Mensagem salva', 'success');
        } catch (e) {
            showToast('Erro ao salvar no banco.', 'error');
            return;
        }
        
        renderMessages(); 
        displayMessageDetails(selectedMessageId);
        isEditingMessage = false;
    });`;
code = code.replace(saveRegex, newSaveMsg);

// 5. Patch favoriteMessageBtn
const favRegex = /    if \(favoriteMessageBtn\) favoriteMessageBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?showToast\('Favorito atualizado', 'success'\);\r?\n    \}\);/m;
const newFavMsg = `    if (favoriteMessageBtn) favoriteMessageBtn.addEventListener('click', async () => {
        if (!selectedMessageId) return;
        const message = messages.find(m => m.id === selectedMessageId);
        if (!message) return;
        const newStatus = !message.isFavorite;

        try {
            const { error } = await supabase.from('messages').update({ is_favorite: newStatus }).eq('id', selectedMessageId);
            if(error) throw error;
            
            message.isFavorite = newStatus;
            if (!isEditingMessage) { displayMessageDetails(selectedMessageId); renderMessages(); }
            showToast('Favorito atualizado', 'success');
        } catch(e) { console.error(e); }
    });`;
code = code.replace(favRegex, newFavMsg);

// 6. Fix "addMessageBtn" to actually update dashboard counters after creation
code = code.replace("showToast('Mensagem criada!', 'success');", "showToast('Mensagem criada!', 'success'); if(typeof updateDashboardCounters === 'function') updateDashboardCounters();");

// 7. Ensure new message creation includes user_id
const addMsgRegex = /const \{ data, error \} = await supabase[\s\S]*?\.from\('messages'\)[\s\S]*?\.insert\([\s\S]*?\)\s*\.select\(\);/m;
const addMsgReplacement = `const userId = await getCurrentUserId();\n                const payload = [{ title, content: 'Escreva sua mensagem aqui...', is_favorite: false, user_id: userId }];\n                const { data, error } = await supabase.from('messages').insert(payload).select();`;
code = code.replace(addMsgRegex, addMsgReplacement);

fs.writeFileSync('app.js', code);
console.log('Patch complete.');
