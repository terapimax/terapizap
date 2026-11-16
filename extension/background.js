// ZapFlow v2.0 — Background Service Worker
chrome.runtime.onInstalled.addListener((details) => {
    console.log('⚡ ZapFlow Extension v2.0 installed:', details.reason);
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

    sendResponse({ ok: true });
});
