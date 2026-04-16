const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// Update fetchAllData to include funnel_items
code = code.replace(
    "const { data: funs, error: funsErr } = await supabase.from('funnels').select('*').order('created_at', { ascending: false });", 
    "const { data: funs, error: funsErr } = await supabase.from('funnels').select('*, funnel_items(*)').order('created_at', { ascending: false });"
);

code = code.replace(
    "funis = funs.map(f => ({ id: f.id, title: f.title, description: f.description, isFavorite: f.is_favorite, items: [] }));",
    "funis = funs.map(f => ({ id: f.id, title: f.title, description: f.description, isFavorite: f.is_favorite, items: (f.funnel_items || []).map(fi => ({ dbId: fi.id, itemId: parseInt(fi.item_id), type: fi.type, delayMinutes: fi.delay_minutes, delaySeconds: fi.delay_seconds, position: fi.position })).sort((a,b)=>a.position - b.position) }));"
);

// 1. Patch add funnel item
const addItemRegex = /    if \(funilItemForm\) funilItemForm\.addEventListener\('submit', async \(e\) => \{[\s\S]*?\}\);/m;
const newAddItem = `    if (funilItemForm) funilItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const funil = funis.find(f => f.id === selectedFunilId);
        if (funil && funilItemSelect.value) {
            const tempValId = parseInt(funilItemSelect.value);
            const newItemObj = {
                funnel_id: funil.id,
                item_id: tempValId,
                type: currentFunilItemType,
                delay_minutes: parseInt(document.getElementById('funil-delay-minutes').value) || 0,
                delay_seconds: parseInt(document.getElementById('funil-delay-seconds').value) || 0,
                position: funil.items.length
            };
            
            // attach current user to the item (keeps behavior consistent with RLS)
            newItemObj.user_id = await getCurrentUserId();

            try {
                const { data, error } = await supabase.from('funnel_items').insert(newItemObj).select().single();
                if (error) throw error;
                funil.items.push({ 
                    dbId: data.id, 
                    itemId: data.item_id, 
                    type: data.type, 
                    delayMinutes: data.delay_minutes, 
                    delaySeconds: data.delay_seconds 
                });
                renderFunilItems(funil.items);
                showToast('Item adicionado', 'success');
            } catch(err) {
                showToast('Erro ao adicionar item', 'error');
                console.error(err);
            }
            cancelFunilItemModalBtn.click();
        }
    });`;
code = code.replace(addItemRegex, newAddItem);

// 2. Patch delete funnel item
const delItemRegex = /    if \(funilItemListContainer\) funilItemListContainer\.addEventListener\('click', \(e\) => \{[\s\S]*?\}\);/m;
const newDelItem = `    if (funilItemListContainer) funilItemListContainer.addEventListener('click', async (e) => {
        if (e.target.matches('button')) {
            const index = parseInt(e.target.dataset.index);
            const funil = funis.find(f => f.id === selectedFunilId);
            if (funil) { 
                const itData = funil.items[index];
                if(itData && itData.dbId) {
                    await supabase.from('funnel_items').delete().eq('id', itData.dbId);
                }
                funil.items.splice(index, 1); 
                renderFunilItems(funil.items); 
            }
        }
    });`;
code = code.replace(delItemRegex, newDelItem);

// 3. Patch delete funnel
const delFunnelRegex = /    if \(deleteFunilBtn\) deleteFunilBtn\.addEventListener\('click', async \(\) => \{[\s\S]*?showToast\('Funil removido', 'success'\);\r?\n        \}\r?\n    \}\);/m;
const newDelFunnel = `    if (deleteFunilBtn) deleteFunilBtn.addEventListener('click', async () => {
        if (!selectedFunilId) return;
        const result = await Swal.fire({ title: 'Tem certeza?', text: "Você não poderá reverter isso!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#334155', confirmButtonText: 'Sim, deletar!' });

        if (result.isConfirmed) {
            try { 
                await supabase.from('funnels').delete().eq('id', selectedFunilId); 
                funis = funis.filter(f => f.id !== selectedFunilId);
                selectedFunilId = null; isEditingFunil = false; funilDetailsPanel.classList.add('hidden'); funilDetailsPanel.classList.remove('flex'); funilWelcomePanel.classList.remove('hidden'); renderFunis();
                showToast('Funil removido', 'success');
                if(typeof updateDashboardCounters === 'function') updateDashboardCounters();
            } catch (e) { showToast('Erro', 'error'); }
        }
    });`;
code = code.replace(delFunnelRegex, newDelFunnel);

// 4. Patch duplicateFunilBtn
const dupRegex = /    if \(duplicateFunilBtn\) duplicateFunilBtn\.addEventListener\('click', \(\) => \{[\s\S]*?\}\);/m;
const newDup = `    if (duplicateFunilBtn) duplicateFunilBtn.addEventListener('click', async () => {
        if (!selectedFunilId) return;
        const funilToCopy = funis.find(f => f.id === selectedFunilId);
        if (funilToCopy) {
            try {
                const t = funilToCopy.title + " (Cópia)";
                const userId = await getCurrentUserId();
                const {data, error} = await supabase.from('funnels').insert({ title: t, description: funilToCopy.description, is_favorite: false, user_id: userId}).select().single();
                if(data) {
                    funis.push({ id: data.id, title: data.title, items: [], isFavorite: false });
                    renderFunis(); showToast('Funil duplicado', 'success');
                    if(typeof updateDashboardCounters === 'function') updateDashboardCounters();
                }
            } catch(e) {}
        }
    });`;
code = code.replace(dupRegex, newDup);

// 5. Patch save funnel and favorite funnel
const saveOrFavFunnelRegex = /    if \(editFunilBtn\) editFunilBtn\.addEventListener\('click'[\s\S]*?renderFunis\(\);\r?\n/m;
const newSaveOrFavFunnel = `    if (editFunilBtn) editFunilBtn.addEventListener('click', () => { if (!selectedFunilId) return; isEditingFunil = true; displayFunilDetails(selectedFunilId); });
    if (saveFunilBtn) saveFunilBtn.addEventListener('click', async () => { 
        if (!selectedFunilId) return; const funil = funis.find(f => f.id === selectedFunilId); 
        if (funil) {
            await supabase.from('funnels').update({ title: funilTitleDisplay.value }).eq('id', selectedFunilId);
            funil.title = funilTitleDisplay.value; isEditingFunil = false; renderFunis(); displayFunilDetails(selectedFunilId); 
        }
    });
    if (favoriteFunilBtn) favoriteFunilBtn.addEventListener('click', async () => { 
        if (!selectedFunilId) return; const funil = funis.find(f => f.id === selectedFunilId); 
        if (funil) { 
            const nF = !funil.isFavorite;
            await supabase.from('funnels').update({ is_favorite: nF }).eq('id', selectedFunilId);
            funil.isFavorite = nF; 
            if (!isEditingFunil) { displayFunilDetails(selectedFunilId); renderFunis(); } 
        } 
    });
    renderFunis();
`;
code = code.replace(saveOrFavFunnelRegex, newSaveOrFavFunnel);


fs.writeFileSync('app.js', code);
console.log('Funnels patch complete!');
