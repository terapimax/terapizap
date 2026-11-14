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
                result = await WPP.chat.sendTextMessage(chatId, msg.text, { createChat: false, waitForAck: true });
            } else if (kind === 'audio') {
                if (!msg.dataUrl) throw new Error('Áudio sem conteúdo.');
                await holdPresence(requestId, chatId, 'recording', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendFileMessage(chatId, msg.dataUrl, {
                    type: 'audio', isPtt: true, mimetype: msg.mimetype || undefined, createChat: false, waitForAck: true,
                });
            } else if (kind === 'file') {
                if (!msg.dataUrl) throw new Error('Arquivo sem conteúdo.');
                await holdPresence(requestId, chatId, 'composing', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendFileMessage(chatId, msg.dataUrl, {
                    type: 'auto-detect', filename: msg.filename || undefined, mimetype: msg.mimetype || undefined,
                    caption: msg.caption || undefined, createChat: false, waitForAck: true,
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
                const info = chatInfo(WPP.chat.getActiveChat());
                if (!info) return reply(msg.requestId, { ok: false, error: 'Abra uma conversa primeiro.' });
                reply(msg.requestId, Object.assign({ ok: true }, info));
                break;
            }
            case 'ZF_ENGINE_SEND':
                handleSend(msg);
                break;
            case 'ZF_ENGINE_CANCEL':
                if (msg.targetId) cancelled.add(msg.targetId);
                reply(msg.requestId, { ok: true });
                break;
        }
    });

    waitReady(120000).then((ok) => {
        if (ok) console.log('✅ ZapFlow engine pronto — WA-JS', WPP.version);
        else console.warn('⚠️ ZapFlow engine: WA-JS não ficou pronta em 120s. Versão do WhatsApp Web pode ser incompatível.');
    });
})();
