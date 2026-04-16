const fs = require('fs');

const leadLogicCode = `
document.addEventListener('DOMContentLoaded', () => {
    const addLeadBtn = document.getElementById('add-lead-btn');
    const addLeadForm = document.getElementById('add-lead-form');
    const addLeadModal = document.getElementById('add-lead-modal');
    const cancelLeadModalBtn = document.getElementById('cancel-lead-modal-btn');
    
    window.openAddLeadModal = function(colId = null) {
        if(colId) window.currentAddLeadColId = colId;
        else if (typeof kanbanData !== 'undefined' && kanbanData.length > 0) window.currentAddLeadColId = kanbanData[0].id;
        else window.currentAddLeadColId = 0; 
        
        if(addLeadForm) addLeadForm.reset();
        if(addLeadModal) {
            addLeadModal.classList.remove('hidden');
            addLeadModal.classList.add('flex');
        }
    };

    if (addLeadBtn) {
        addLeadBtn.addEventListener('click', () => {
            window.openAddLeadModal();
        });
    }

    if (cancelLeadModalBtn) {
           cancelLeadModalBtn.addEventListener('click', () => {
               if(addLeadModal) {
                 addLeadModal.classList.add('hidden');
                 addLeadModal.classList.remove('flex');
               }
           });
    }

    if (addLeadForm) {
        addLeadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('lead-name-input').value;
            const phone = document.getElementById('lead-phone-input').value;
            const product = document.getElementById('lead-product-input').value;
            const valueStr = document.getElementById('lead-value-input').value;
            const email = document.getElementById('lead-email-input').value;
            const value = parseFloat(valueStr) || 0;
            
            if(!supabase) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            showGlobalLoader();

            const userId = session?.user?.id || await getCurrentUserId();

            const newLead = {
                user_id: userId,
                name: name,
                phone: phone,
                product: product,
                value: value,
                email: email,
                column_id: window.currentAddLeadColId,
                status: 'warm'
            };

            const { error } = await supabase.from('leads').insert([newLead]);
            hideGlobalLoader();
            
            if (error) {
                console.error(error);
                if (typeof Swal !== 'undefined') Swal.fire('Erro', 'Não foi possível salvar o lead. Verifica as políticas do Supabase RLS.', 'error');
            } else {
                addLeadModal.classList.add('hidden');
                addLeadModal.classList.remove('flex');
                if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, icon: 'success', title: 'Lead adicionado' });
                if (typeof fetchKanbanData === 'function') fetchKanbanData();
            }
        });
    }
});
`;

fs.writeFileSync('app.js', fs.readFileSync('app.js', 'utf8') + '\n\n' + leadLogicCode);
console.log('Lead logic hooked!');
