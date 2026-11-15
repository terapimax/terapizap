// wa_engine.js — Motor de envio ZapFlow (MAIN world)
// Usa SOMENTE a API pública da WA-JS (WPP.*). Sem mocks, sem varredura de módulos
// internos e sem interceptar o microfone.
//
// Protocolo com o content.js (window.postMessage, todas as mensagens levam requestId):
//   → ZF_ENGINE_STATUS                      ← ZF_ENGINE_RESULT { ok, ready, version }
//   → ZF_ENGINE_ACTIVE_CHAT                 ← ZF_ENGINE_RESULT { ok, chatId, name }
//   → ZF_ENGINE_SEND { chatId, kind: 'text'|'audio'|'file', text?, dataUrl?,
//                      filename?, mimetype?, caption?, presenceMs? }
//        ← ZF_ENGINE_STEP { step: 'composing'|'recording', presenceMs }
//        ← ZF_ENGINE_STEP { step: 'sending' }
//        ← ZF_ENGINE_RESULT { ok, id?, ack?, error?, cancelled?, notReady? }
//   → ZF_ENGINE_CANCEL { targetId }  (cancela durante "digitando/gravando")
//   → ZF_ENGINE_REPLIED { chatId, since } ← ZF_ENGINE_RESULT { ok, replied }  (contato respondeu desde `since`?)
//   → ZF_ENGINE_CONTACT { chatId }        ← ZF_ENGINE_RESULT { ok, ...contato }  (ver contactInfo)
//   ← ZF_ENGINE_INCOMING { msgId, chatId, name, text, msgType, t, phone, isMyContact }  (sem requestId: mensagem nova recebida)
//   ← ZF_ENGINE_ACTIVE { chat: contato | null }  (sem requestId: você abriu outra conversa)
//   → ZF_ENGINE_LIST_CHATS                ← ZF_ENGINE_RESULT { ok, chats: [contato + { t, archived, labels }], labels, isBusiness }
//   → ZF_ENGINE_LABELS                    ← ZF_ENGINE_RESULT { ok, labels: [{ id, name, color, count }], isBusiness }
//   → ZF_ENGINE_SET_LABEL { chatId, labelId, add } ← ZF_ENGINE_RESULT { ok, error? }  (só WhatsApp Business)
//   ← ZF_ENGINE_LABEL_CHANGE { chat: contato, change: 'add'|'remove', labels }  (sem requestId: você etiquetou no WhatsApp)
// contato = { chatId, name, phone, isGroup, isMyContact }; phone = só dígitos com DDI, ou null quando o
// WhatsApp esconde o número (conversas @lid sem número conhecido).
(function () {
    'use strict';
    if (window.__zfEngine) return;
    window.__zfEngine = true;

    const MAX_PRESENCE_MS = 30000;
    const PRESENCE_REFRESH_MS = 4000; // WhatsApp expira o "gravando/digitando" sozinho; renovamos
    const ACK_LABELS = {
        '-7': 'versão do WhatsApp incompatível', '-6': 'conversa inativa', '-5': 'mídia não pôde ser enviada',
        '-4': 'arquivo grande demais', '-3': 'mídia indisponível', '-2': 'envio expirou', '-1': 'falha no envio',
    };

    const cancelled = new Set();
    let busy = false;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function wppReady() {
        return typeof WPP !== 'undefined' && WPP.isReady === true && !!WPP.chat;
    }

    async function waitReady(timeoutMs) {
        const start = Date.now();
        while (!wppReady()) {
            if (Date.now() - start > timeoutMs) return false;
            await sleep(250);
        }
        return true;
    }

    function chatInfo(chat) {
        if (!chat || !chat.id) return null;
        const chatId = chat.id._serialized || chat.id.toString();
        const name = chat.formattedTitle || chat.name || (chat.contact && (chat.contact.pushname || chat.contact.name)) || chatId.split('@')[0];
        return { chatId, name };
    }

    // Dados do contato de uma conversa. Em conversas @lid o número não vem no id: pedimos à WA-JS
    // (getPnLidEntry, que usa o que o WhatsApp já sabe); se ela não souber, phone fica null.
    async function contactInfo(chatId) {
        if (!chatId) return null;
        const chat = WPP.chat.get(chatId);
        const base = chatInfo(chat) || { chatId, name: chatId.split('@')[0] };
        const isGroup = !/@(c\.us|lid)$/.test(chatId);
        let phone = null;
        if (/@c\.us$/.test(chatId)) phone = chatId.split('@')[0];
        else if (/@lid$/.test(chatId) && WPP.contact && WPP.contact.getPnLidEntry) {
            try {
                const e = await WPP.contact.getPnLidEntry(chatId);
                phone = (e && e.phoneNumber && e.phoneNumber.id) || null;
            } catch (e) { /* número escondido */ }
        }
        const c = chat && chat.contact;
        // contato salvo: o nome da agenda; senão o nome que a pessoa usa no WhatsApp
        const name = (c && (c.name || c.pushname || c.verifiedName)) || base.name;
        return { chatId: base.chatId, name, phone: phone ? String(phone).replace(/\D/g, '') : null, isGroup, isMyContact: !!(c && c.isMyContact) };
    }

    // ----- Etiquetas (WhatsApp Business) e lista de conversas -----
    function isBusiness() {
        try { return !!(WPP.profile && WPP.profile.isBusiness && WPP.profile.isBusiness()); } catch (e) { return false; }
    }
    function labelOut(l) {
        return { id: String(l.id), name: l.name || '', color: l.hexColor || l.color || null, count: Number(l.count) || 0 };
    }
    async function allLabels() {
        try { return ((await WPP.labels.getAllLabels()) || []).map(labelOut).filter((l) => l.name); } catch (e) { return []; }
    }
    // Conversas individuais (sem grupos, canais, status e a conversa com você mesmo)
    async function listChats() {
        const list = await WPP.chat.list({ onlyUsers: true, ignoreGroupMetadata: true });
        let me = null;
        try { me = WPP.conn.getMyUserId && WPP.conn.getMyUserId(); } catch (e) { /* sem o próprio número */ }
        const meUser = me && (me.user || String(me).split('@')[0]);
        const out = [];
        for (const chat of list) {
            const id = chat && chat.id && (chat.id._serialized || String(chat.id));
            if (!id || !/@(c\.us|lid)$/.test(id) || id === '0@c.us') continue;
            if (meUser && id.split('@')[0] === meUser) continue;
            const info = await contactInfo(id).catch(() => null);
            if (!info) continue;
            out.push(Object.assign(info, {
                t: (Number(chat.t) || 0) * 1000,
                archived: !!chat.archive,
                labels: (chat.labels || []).map(String),
            }));
        }
        return out;
    }

    function reply(requestId, payload) {
        window.postMessage(Object.assign({ type: 'ZF_ENGINE_RESULT', requestId }, payload), '*');
    }

    function step(requestId, name, extra) {
        window.postMessage(Object.assign({ type: 'ZF_ENGINE_STEP', requestId, step: name }, extra || {}), '*');
    }

    class Cancelled extends Error {}

    // Mantém "digitando"/"gravando" ativo durante a espera, renovando a cada 4s.
    async function holdPresence(requestId, chatId, mode, ms) {
        const total = Math.max(0, Math.min(Number(ms) || 0, MAX_PRESENCE_MS));
        if (!total) return;
        step(requestId, mode, { presenceMs: total });
        const mark = () => (mode === 'recording' ? WPP.chat.markIsRecording(chatId) : WPP.chat.markIsComposing(chatId))
            .catch((e) => console.warn('ZapFlow engine: presença falhou (seguindo sem ela):', e && e.message));
        const end = Date.now() + total;
        let nextMark = 0;
        while (Date.now() < end) {
            if (cancelled.has(requestId)) throw new Cancelled('Envio cancelado');
            if (Date.now() >= nextMark) { mark(); nextMark = Date.now() + PRESENCE_REFRESH_MS; }
            await sleep(Math.min(200, end - Date.now()));
        }
        if (cancelled.has(requestId)) throw new Cancelled('Envio cancelado');
    }

    function checkAck(result) {
        if (!result || !result.id) throw new Error('O WhatsApp não registrou a mensagem.');
        const ack = Number(result.ack);
        if (ack < 0) throw new Error('WhatsApp recusou: ' + (ACK_LABELS[String(ack)] || 'erro ' + ack));
        return ack;
    }

    async function handleSend(msg) {
        const { requestId, kind } = msg;
        if (busy) return reply(requestId, { ok: false, error: 'Já existe um envio em andamento.' });
        busy = true;
        const chatId = msg.chatId;
        try {
            if (!(await waitReady(10000))) {
                return reply(requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp (WA-JS) não carregou.' });
            }
            if (!chatId || !WPP.chat.get(chatId)) {
                return reply(requestId, { ok: false, error: 'Conversa de destino não encontrada.' });
            }

            let result;
            if (kind === 'text') {
                if (!msg.text) throw new Error('Mensagem vazia.');
                await holdPresence(requestId, chatId, 'composing', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendTextMessage(chatId, msg.text, { createChat: !!msg.createChat, waitForAck: true });
            } else if (kind === 'audio') {
                if (!msg.dataUrl) throw new Error('Áudio sem conteúdo.');
                await holdPresence(requestId, chatId, 'recording', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendFileMessage(chatId, msg.dataUrl, {
                    type: 'audio', isPtt: true, mimetype: msg.mimetype || undefined, createChat: !!msg.createChat, waitForAck: true,
                });
            } else if (kind === 'file') {
                if (!msg.dataUrl) throw new Error('Arquivo sem conteúdo.');
                await holdPresence(requestId, chatId, 'composing', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendFileMessage(chatId, msg.dataUrl, {
                    type: 'auto-detect', filename: msg.filename || undefined, mimetype: msg.mimetype || undefined,
                    caption: msg.caption || undefined, createChat: !!msg.createChat, waitForAck: true,
                });
            } else {
                throw new Error('Tipo de envio desconhecido: ' + kind);
            }

            const ack = checkAck(result);
            reply(requestId, { ok: true, id: result.id, ack });
        } catch (e) {
            if (e instanceof Cancelled) return reply(requestId, { ok: false, cancelled: true, error: e.message });
            console.error('❌ ZapFlow engine:', e);
            reply(requestId, { ok: false, error: (e && e.message) || String(e) });
        } finally {
            cancelled.delete(requestId);
            if (chatId && wppReady()) { try { await WPP.chat.markIsPaused(chatId); } catch (e) { /* sem impacto */ } }
            busy = false;
        }
    }

    // O contato mandou alguma mensagem de verdade (texto, áudio, mídia…) depois de `since` (ms)?
    // Usado pelos funis para parar quando a pessoa responde.
    const REPLY_TYPES = new Set(['chat', 'ptt', 'audio', 'image', 'video', 'document', 'sticker', 'location', 'vcard', 'multi_vcard', 'buttons_response', 'list_response']);
    function contactReplied(chatId, since) {
        if (!wppReady() || !chatId) return false;
        try {
            const chat = WPP.chat.get(chatId);
            if (!chat || !chat.msgs) return false;
            const list = chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : (chat.msgs.models || []);
            for (let i = list.length - 1; i >= 0; i--) {
                const m = list[i];
                if (!m || !m.id) continue;
                if ((Number(m.t) || 0) * 1000 < since) break; // mensagens mais antigas: pode parar de olhar
                if (!m.id.fromMe && REPLY_TYPES.has(m.type)) return true;
            }
        } catch (e) { console.warn('ZapFlow engine: não foi possível checar respostas:', e && e.message); }
        return false;
    }

    window.addEventListener('message', async (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object' || !msg.requestId) return;

        switch (msg.type) {
            case 'ZF_ENGINE_STATUS':
                reply(msg.requestId, {
                    ok: true, ready: wppReady(),
                    version: (typeof WPP !== 'undefined' && WPP.version) || null,
                    supportedWhatsappWeb: (typeof WPP !== 'undefined' && WPP.supportedWhatsappWeb) || null,
                });
                break;
            case 'ZF_ENGINE_ACTIVE_CHAT': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                const active = chatInfo(WPP.chat.getActiveChat());
                if (!active) return reply(msg.requestId, { ok: false, error: 'Abra uma conversa primeiro.' });
                const info = (await contactInfo(active.chatId).catch(() => null)) || active;
                reply(msg.requestId, Object.assign({ ok: true }, info));
                break;
            }
            case 'ZF_ENGINE_CONTACT': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                const info = await contactInfo(msg.chatId).catch(() => null);
                reply(msg.requestId, info ? Object.assign({ ok: true }, info) : { ok: false, error: 'Conversa não encontrada.' });
                break;
            }
            case 'ZF_ENGINE_SEND':
                handleSend(msg);
                break;
            case 'ZF_ENGINE_LIST_CHATS': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                try {
                    const [chats, labels] = await Promise.all([listChats(), allLabels()]);
                    reply(msg.requestId, { ok: true, chats, labels, isBusiness: isBusiness() });
                } catch (e) {
                    reply(msg.requestId, { ok: false, error: (e && e.message) || 'Não foi possível ler as conversas.' });
                }
                break;
            }
            case 'ZF_ENGINE_LABELS': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                reply(msg.requestId, { ok: true, labels: await allLabels(), isBusiness: isBusiness() });
                break;
            }
            case 'ZF_ENGINE_SET_LABEL': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                if (!isBusiness()) return reply(msg.requestId, { ok: false, error: 'Etiquetas só existem no WhatsApp Business.' });
                try {
                    await WPP.labels.addOrRemoveLabels(msg.chatId, [{ labelId: String(msg.labelId), type: msg.add ? 'add' : 'remove' }]);
                    reply(msg.requestId, { ok: true });
                } catch (e) {
                    reply(msg.requestId, { ok: false, error: (e && e.message) || 'Não foi possível mudar a etiqueta no WhatsApp.' });
                }
                break;
            }
            case 'ZF_ENGINE_REPLIED':
                reply(msg.requestId, { ok: true, replied: contactReplied(msg.chatId, Number(msg.since) || 0) });
                break;
            case 'ZF_ENGINE_CANCEL':
                if (msg.targetId) cancelled.add(msg.targetId);
                reply(msg.requestId, { ok: true });
                break;
        }
    });

    // Mensagens recebidas (para os gatilhos por palavra-chave). Só conversas individuais e só
    // mensagens novas de verdade: o histórico que o WhatsApp carrega ao abrir não conta.
    const ENGINE_START = Date.now();
    function watchIncoming() {
        try {
            WPP.on('chat.new_message', (m) => {
                try {
                    if (!m || !m.id || m.id.fromMe || m.isNewMsg === false) return;
                    const remote = m.id.remote;
                    const chatId = remote && (remote._serialized || String(remote));
                    if (!chatId || !/@(c\.us|lid)$/.test(chatId)) return; // grupos, status, canais: nunca
                    const t = (Number(m.t) || 0) * 1000;
                    if (t && (t < ENGINE_START - 5000 || t < Date.now() - 120000)) return;
                    const text = m.type === 'chat' ? (m.body || '') : (m.caption || '');
                    const msgId = m.id._serialized || String(m.id);
                    contactInfo(chatId).catch(() => null).then((info) => {
                        window.postMessage({
                            type: 'ZF_ENGINE_INCOMING', msgId, chatId,
                            name: (info && info.name) || m.notifyName || chatId.split('@')[0], text, msgType: m.type, t: t || Date.now(),
                            phone: info ? info.phone : (/@c\.us$/.test(chatId) ? chatId.split('@')[0] : null),
                            isMyContact: !!(info && info.isMyContact),
                        }, '*');
                    });
                } catch (e) { console.warn('ZapFlow engine: mensagem recebida ignorada:', e && e.message); }
            });
        } catch (e) { console.warn('ZapFlow engine: não foi possível ouvir mensagens recebidas:', e && e.message); }
    }

    // Conversa aberta mudou: a aba "Lead" da extensão acompanha.
    function watchActiveChat() {
        let seq = 0;
        const send = async (chat) => {
            const my = ++seq;
            const base = chatInfo(chat);
            const info = base ? (await contactInfo(base.chatId).catch(() => base)) : null;
            if (my === seq) window.postMessage({ type: 'ZF_ENGINE_ACTIVE', chat: info }, '*');
        };
        try {
            WPP.on('chat.active_chat', (chat) => { send(chat); });
            send(WPP.chat.getActiveChat());
        } catch (e) { console.warn('ZapFlow engine: não foi possível acompanhar a conversa aberta:', e && e.message); }
    }

    // Você pôs/tirou uma etiqueta numa conversa pelo próprio WhatsApp (Business)
    function watchLabels() {
        try {
            WPP.on('chat.update_label', async (ev) => {
                try {
                    const chat = ev && ev.chat;
                    const id = chat && chat.id && (chat.id._serialized || String(chat.id));
                    if (!id || !/@(c\.us|lid)$/.test(id)) return;
                    const info = await contactInfo(id).catch(() => null);
                    if (!info) return;
                    window.postMessage({
                        type: 'ZF_ENGINE_LABEL_CHANGE', chat: info,
                        change: ev.type === 'remove' ? 'remove' : 'add',
                        labels: (ev.labels || []).filter(Boolean).map(labelOut),
                    }, '*');
                } catch (e) { console.warn('ZapFlow engine: etiqueta ignorada:', e && e.message); }
            });
        } catch (e) { console.warn('ZapFlow engine: não foi possível acompanhar as etiquetas:', e && e.message); }
    }

    waitReady(120000).then((ok) => {
        if (ok) { watchIncoming(); watchActiveChat(); watchLabels(); }
        if (ok) console.log('✅ ZapFlow engine pronto — WA-JS', WPP.version);
        else console.warn('⚠️ ZapFlow engine: WA-JS não ficou pronta em 120s. Versão do WhatsApp Web pode ser incompatível.');
    });
})();
