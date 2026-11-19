// ZapFlow — Background Service Worker
chrome.runtime.onInstalled.addListener((details) => {
    console.log('ZapFlow', chrome.runtime.getManifest().version, details.reason);
    if (details.reason === 'install') {
        chrome.storage.local.set({ zapflow_settings: { confirmSend: true, confirmFunnel: true, theme: 'dark', favOnly: false } });
    }
});

// Badge indicator when sidebar is active
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ZAPFLOW_SIDEBAR_TOGGLE') {
        chrome.action?.setBadgeText({ text: msg.open ? '⚡' : '', tabId: sender.tab?.id });
        chrome.action?.setBadgeBackgroundColor({ color: '#8b5cf6', tabId: sender.tab?.id });
        sendResponse({ ok: true });
        return;
    }
    
    if (msg.type === 'ZAPFLOW_DOWNLOAD_FILE') {
        console.log('⚡ ZapFlow Background: Fetching media file to bypass CSP/CORS:', msg.url);
        fetch(msg.url)
            .then(res => {
                if (!res.ok) throw new Error('Download falhou no background. Status: ' + res.status);
                return res.arrayBuffer().then(buf => ({ buf, mime: res.headers.get('content-type') || 'application/octet-stream' }));
            })
            .then(({ buf, mime }) => {
                // Convert ArrayBuffer to Base64 in a MV3 Service Worker safe way
                let binary = '';
                const bytes = new Uint8Array(buf);
                const len = bytes.byteLength;
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    const chunk = bytes.subarray(i, i + chunkSize);
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const base64 = 'data:' + mime + ';base64,' + btoa(binary);
                sendResponse({ success: true, base64, mimeType: mime });
            })
            .catch(err => {
                console.error('❌ ZapFlow Background: Fetch error:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true; // Keep message channel open for async response
    }
    
    if (msg.type === 'ZAPFLOW_FETCH_AVATAR') {
        // Foto de perfil: o segundo plano baixa porque a página do WhatsApp não permite (CORS).
        // Só aceita endereços do WhatsApp, só imagem e no máximo 1 MB.
        let host = '';
        try { const u = new URL(msg.url); host = u.protocol === 'https:' ? u.hostname : ''; } catch (e) { /* endereço inválido */ }
        if (!/(^|\.)(whatsapp\.net|fbcdn\.net)$/i.test(host)) { sendResponse({ success: false, error: 'Endereço não permitido.' }); return; }
        fetch(msg.url, { credentials: 'omit' })
            .then((res) => {
                const type = (res.headers.get('content-type') || '').split(';')[0].trim();
                if (!res.ok || !/^image\//i.test(type)) throw new Error('Resposta inválida (' + res.status + ').');
                return res.arrayBuffer().then((buf) => ({ buf, type }));
            })
            .then(({ buf, type }) => {
                if (buf.byteLength > 1048576) throw new Error('Imagem grande demais.');
                let binary = '';
                const bytes = new Uint8Array(buf);
                for (let i = 0; i < bytes.byteLength; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
                sendResponse({ success: true, base64: 'data:' + type + ';base64,' + btoa(binary) });
            })
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true;
    }

    if (msg.type === 'ZAPFLOW_AI_FETCH') {
        // Chamadas à IA (Claude, OpenAI, Groq) com a chave do próprio dono. A página do WhatsApp não pode
        // fazer isso (CORS), então o segundo plano faz. Só aceita os 3 serviços, só HTTPS e só estes cabeçalhos.
        const ALLOWED = { 'api.anthropic.com': /^\/v1\//, 'api.openai.com': /^\/v1\//, 'api.groq.com': /^\/openai\/v1\// };
        const HEADERS = ['content-type', 'x-api-key', 'anthropic-version', 'anthropic-dangerous-direct-browser-access', 'authorization'];
        let u = null;
        try { u = new URL(msg.url); } catch (e) { /* endereço inválido */ }
        if (!u || u.protocol !== 'https:' || !ALLOWED[u.hostname] || !ALLOWED[u.hostname].test(u.pathname)) {
            sendResponse({ ok: false, status: 0, error: 'Endereço não permitido.' });
            return;
        }
        const headers = {};
        for (const k of Object.keys(msg.headers || {})) if (HEADERS.includes(k.toLowerCase())) headers[k] = String(msg.headers[k]);
        let body;
        if (Array.isArray(msg.form)) {
            // transcrição: o arquivo vem em base64 e vira arquivo de verdade aqui
            body = new FormData();
            for (const [k, v] of msg.form) {
                if (v && typeof v === 'object' && v.base64 != null) {
                    const bin = atob(v.base64);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    body.append(k, new Blob([bytes], { type: v.type || 'application/octet-stream' }), v.name || 'audio.ogg');
                } else body.append(k, String(v));
            }
        } else if (typeof msg.body === 'string') body = msg.body;
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 240000);
        fetch(u.href, { method: msg.method === 'GET' ? 'GET' : 'POST', headers, body: msg.method === 'GET' ? undefined : body, credentials: 'omit', signal: ctl.signal })
            .then(async (res) => {
                const text = await res.text();
                sendResponse({ ok: res.ok, status: res.status, retryAfter: res.headers.get('retry-after') || null, body: text });
            })
            .catch((err) => sendResponse({ ok: false, status: 0, error: (err && err.message) || 'Falha de rede.' }))
            .finally(() => clearTimeout(timer));
        return true;
    }

    sendResponse({ ok: true });
});
