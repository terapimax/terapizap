const fs = require('fs');

const renderKanbanCode = `
window.renderKanban = function renderKanban() {
    const board = document.getElementById('kanban-board');
    if (!board) {
        console.error('CRITICAL: #kanban-board element not found!');
        return;
    }
    board.style.display = 'flex';
    board.style.opacity = '1';
    board.innerHTML = '';

    if (typeof kanbanData === 'undefined' || !kanbanData) return;

    kanbanData.forEach((column, colIndex) => {
        const totalValue = column.items.reduce((acc, item) => acc + (Number(item.value) || 0), 0);
        const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);
        const colColor = column.color || '#E13584';

        const colDiv = document.createElement('div');
        colDiv.className = 'glass rounded-2xl w-80 flex-shrink-0 flex flex-col border border-white/5 bg-zap-sidebar/50 max-h-full transition-all duration-300 snap-center shadow-xl backdrop-blur-sm ml-4 first:ml-0';
        colDiv.dataset.colid = column.id;

        colDiv.innerHTML = \`
        <!-- Column Header -->
        <div class="p-4 border-b border-white/5 bg-black/20 rounded-t-2xl group relative overflow-hidden">
             <div class="absolute top-0 left-0 w-full h-1 opacity-80" style="background: linear-gradient(to right, \${colColor}, transparent);"></div>
             <div class="absolute top-0 left-0 w-full h-[1px] bg-\${colColor} shadow-[0_0_10px_\${colColor}]"></div>
            <div class="flex justify-between items-start mb-3 relative z-10">
                <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full shadow-[0_0_8px_inset] shadow-current" style="background-color: \${colColor}; color: \${colColor}; box-shadow: 0 0 10px \${colColor};"></div>
                    <h3 class="text-base font-bold text-white uppercase tracking-wider truncate drop-shadow-sm" title="\${column.title}">\${column.title}</h3>
                    <span class="text-[10px] font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-full border border-white/5 shadow-sm">\${column.items.length}</span>
                </div>
                <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-x-2 group-hover:translate-x-0">
                     <button class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white edit-col transition-colors" data-colid="\${column.id}" title="Editar Nome"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                     <button class="p-1.5 rounded-lg hover:bg-white/10 text-red-500/70 hover:text-red-400 remove-col transition-colors" data-colid="\${column.id}" title="Excluir Coluna"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                </div>
            </div>
            <div class="flex items-center justify-between mt-1 bg-white/5 p-2 rounded-lg border border-white/5">
                <span class="text-xs text-zap-text-secondary font-medium uppercase tracking-wide">Valor Total</span>
                <span class="text-xs font-bold text-white tracking-wide">\${formattedTotal}</span>
            </div>
        </div>
        <!-- Cards Container -->
        <div class="kanban-cards-container flex-grow p-3 space-y-3 overflow-y-auto custom-scrollbar min-h-[100px] scroll-smooth" style="max-height: calc(100vh - 260px);"></div>
        \`;

        const itemsDiv = colDiv.querySelector('.kanban-cards-container');

        const tempColors = {
            'hot': 'bg-red-500/20 text-red-400 border-red-500/30',
            'warm': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
            'cold': 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        };

        column.items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'kanban-item kanban-card group bg-zap-card hover:bg-zap-card-hover p-4 rounded-xl shadow-lg border border-white/5 cursor-pointer relative z-10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:border-zap-primary/30';
            card.draggable = true;
            card.dataset.id = item.id;
            card.dataset.colid = column.id;

            const itemValue = Number(item.value) || 0;
            const formattedItemValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemValue);
            const avatarUrl = item.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name) + '&background=random';

            const currentTemp = item.temp || 'cold';
            const colorClass = tempColors[currentTemp] || tempColors['cold'];
            const tempLabel = currentTemp === 'hot' ? 'Quente' : (currentTemp === 'warm' ? 'Morno' : 'Frio');
            const tempBadge = \`<span class="temp-badge px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border \${colorClass} cursor-pointer hover:opacity-80 transition-opacity" data-lead-id="\${item.id}" title="Alterar temperatura">\${tempLabel}</span>\`;
            
            const originDisplay = (item.origin === 'Outros' && item.customOrigin) ? item.customOrigin : (item.origin || '');

            card.innerHTML = \`
                <div class="flex items-start gap-3 mb-2">
                    <div class="relative shrink-0">
                        <img src="\${avatarUrl}" class="w-10 h-10 rounded-full object-cover border-2 border-white/10 shadow-sm" alt="\${item.name}">
                         <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-zap-card rounded-full" title="Online"></div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center flex-wrap gap-2 mb-1">
                            <h4 class="font-bold text-white text-sm truncate leading-tight">\${item.name}</h4>
                            \${tempBadge}
                        </div>
                        <a href="https://wa.me/\${(item.phone || '').replace(/\\D/g, '')}" target="_blank" onclick="event.stopPropagation()" class="text-xs text-green-400 hover:text-green-300 flex items-center gap-1.5 transition-colors font-medium w-fit">
                           <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                           \${item.phone || 'WhatsApp'}
                        </a>
                    </div>
                </div>
                <!-- Extras -->
                <div class="space-y-1.5 mb-2 pl-1">
                    \${originDisplay ? \`
                    <div class="flex items-center gap-1.5">
                        <span class="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Origem:</span>
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate max-w-[150px]">\${originDisplay}</span>
                    </div>\` : ''}
                </div>
                
                <div class="mb-3 pl-1">
                     \${item.product ? \`<div class="text-xs text-gray-400 flex items-center gap-1.5"><svg class="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>\${item.product}</div>\` : ''}
                </div>

                <div class="flex justify-between items-center border-t border-white/5 pt-3 mt-1">
                    <span class="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 shadow-sm">\${formattedItemValue}</span>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button class="p-1.5 rounded-full hover:bg-zap-primary text-gray-400 hover:text-white transition-colors" title="Ver Detalhes">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </button>
                    </div>
                </div>
            \`;

            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.openLeadDetailsModal === 'function') {
                    window.openLeadDetailsModal(item.id, column.id);
                } else {
                    console.log('Lead modal hook', item);
                }
            });

            const detailBtn = card.querySelector('button[title="Ver Detalhes"]');
            if (detailBtn) {
                detailBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof window.openLeadDetailsModal === 'function') {
                       window.openLeadDetailsModal(item.id, column.id);
                    }
                });
            }

            itemsDiv.appendChild(card);
        });

        // Initialize SortableJS
        if (typeof Sortable !== 'undefined') {
            new Sortable(itemsDiv, {
                group: 'kanban', // set both lists to same group
                animation: 150,
                ghostClass: 'opacity-50',
                onEnd: async function (evt) {
                    const itemEl = evt.item;  // dragged HTMLElement
                    const leadId = itemEl.dataset.id;
                    const toDiv = evt.to.closest('.glass');
                    if (!toDiv) return;
                    const newColId = toDiv.dataset.colid;
                    const oldColId = itemEl.dataset.colid;
                    
                    if (leadId && newColId && newColId !== oldColId) {
                        try {
                            const { error } = await supabase.from('leads').update({ column_id: parseInt(newColId) }).eq('id', parseInt(leadId));
                            if (error) { throw error; }
                            itemEl.dataset.colid = newColId;
                            console.log(\`Lead \${leadId} moved from \${oldColId} to \${newColId}\`);
                            if (typeof fetchKanbanData === 'function') {
                                setTimeout(fetchKanbanData, 500); 
                            }
                        } catch (e) {
                            console.error(e);
                            if (typeof Swal !== 'undefined') Swal.fire('Erro', 'Não foi possível salvar o card no banco de dados.', 'error');
                            // Revert on error
                            if (typeof fetchKanbanData === 'function') fetchKanbanData();
                        }
                    }
                }
            });
        }

        board.appendChild(colDiv);
    });
};
window.renderKanban();
`;

fs.writeFileSync('app.js', fs.readFileSync('app.js', 'utf8') + '\n\n' + renderKanbanCode);
console.log('Restored correctly');
