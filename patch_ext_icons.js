const fs = require('fs');

let code = fs.readFileSync('extension/content.js', 'utf8');

const icons = {
    zap: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    clipboard: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
    rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5-4 5-4s2.92 3.38 4 5c-1 1.45-4 5-4 5H9z"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    refresh: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21.05 10A9 9 0 1 1 18 4l3 4"/></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    msg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/></svg>',
    audio: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
    media: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    doc: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
    starLine: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    starSolid: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    play: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    emptyIcon: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>'
};

// Toggle Btn
code = code.replace("toggleBtn.innerHTML = '⚡';", `toggleBtn.innerHTML = '${icons.zap}';`);

// Login ZapFlow
code = code.replace('<div style="font-size:32px; margin-bottom:10px;">⚡</div>', `<div style="color: #c4b5fd; margin-bottom:10px;">${icons.zap}</div>`);
code = code.replace('<div class="zf-logo-icon">⚡</div>', `<div class="zf-logo-icon">${icons.zap}</div>`);

// Navigation
code = code.replace('<span class="zf-nav-icon">📤</span>', `<span class="zf-nav-icon">${icons.send}</span>`);
code = code.replace('<span class="zf-nav-icon">📋</span>', `<span class="zf-nav-icon">${icons.clipboard}</span>`);
code = code.replace('<span class="zf-nav-icon">🚀</span>', `<span class="zf-nav-icon">${icons.rocket}</span>`);
code = code.replace('<span class="zf-nav-icon">⚙️</span>', `<span class="zf-nav-icon">${icons.settings}</span>`);
code = code.replace('<span class="zf-nav-icon">🔄</span>', `<span class="zf-nav-icon">${icons.refresh}</span>`);

// Search
code = code.replace(/<span class="zf-search-icon">🔍<\/span>/g, `<span class="zf-search-icon">${icons.search}</span>`);

// Page: Envios Status
code = code.replace('<div class="zf-send-status-icon">📤</div>', `<div class="zf-send-status-icon">${icons.send}</div>`);

// Page: Itens Filters
code = code.replace('>📝 Texto', `>${icons.msg} Texto`);
code = code.replace('>🎙️ Áudio', `>${icons.audio} Áudio`);
code = code.replace('>📸 Mídia', `>${icons.media} Mídia`);
code = code.replace('>📄 Doc', `>${icons.doc} Doc`);

code = code.replace('⭐', `${icons.starSolid}`);

// Page: Disparos Empty
code = code.replace('<div class="zf-empty-icon">🚀</div>', `<div class="zf-empty-icon">${icons.rocket}</div>`);
code = code.replace('title="Texto">📝</button>', `title="Texto">${icons.msg}</button>`);
code = code.replace('title="Áudio">🎙️</button>', `title="Áudio">${icons.audio}</button>`);
code = code.replace('title="Mídia">📸</button>', `title="Mídia">${icons.media}</button>`);
code = code.replace('title="Documento">📄</button>', `title="Documento">${icons.doc}</button>`);

// JS rendering logic
// Subtitles
code = code.replace("subtitle: `${m.type === 'image' ? '🖼️ Imagem' : '🎬 Vídeo'} • ${formatFileSize(m.size)}`,", "subtitle: `${m.type === 'image' ? 'Imagem' : 'Vídeo'} • ${formatFileSize(m.size)}`,");

// Empty Box
code = code.replace('<div class="zf-empty-icon">📭</div>', `<div class="zf-empty-icon">${icons.emptyIcon}</div>`);

// Card Icon logic
const typeLogicRegex = /\$\{item\.type === 'msg' \? '📝' : item\.type === 'audio' \? '🎙️' : item\.type === 'media' \? '📸' : '📄'\}/;
const newTypeLogic = `\${item.type === 'msg' ? '${icons.msg}' : item.type === 'audio' ? '${icons.audio}' : item.type === 'media' ? '${icons.media}' : '${icons.doc}'}`;
code = code.replace(typeLogicRegex, newTypeLogic);

// Card Fav & Send
const favLogicRegex = /\$\{item\.isFavorite \? '★' : '☆'\}/;
const newFavLogic = `\${item.isFavorite ? '${icons.starSolid}' : '${icons.starLine}'}`;
code = code.replace(favLogicRegex, newFavLogic);

code = code.replace('▶', icons.play);

fs.writeFileSync('extension/content.js', code);
console.log('✅ Content.js SVG icons applied');
