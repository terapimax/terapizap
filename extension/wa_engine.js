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
//   → ZF_ENGINE_CHAT_HISTORY { chatId, count } ← ZF_ENGINE_RESULT { ok, messages: [msg] }  (mensagens recentes da conversa)
//   → ZF_ENGINE_DOWNLOAD_MEDIA { msgId, maxBytes? } ← ZF_ENGINE_RESULT { ok, dataUrl, mimetype, size }  (mídia recebida, para transcrever áudio)
//   ← ZF_ENGINE_OUTGOING { chat: contato, msg }  (sem requestId: mensagem enviada por você ou pelo ZapFlow)
// msg = { id, from_me, by_zapflow, kind: text|audio|image|video|document|sticker|location|contact, body (texto ou legenda), t (ms) }
// contato também traz labels: ids das etiquetas do WhatsApp Business da conversa
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
    let sendingChat = null; // conversa em que o ZapFlow está enviando agora (marca as mensagens como "pelo ZapFlow")

    // Ids das mensagens que o ZapFlow enviou (guardados no navegador, sobrevivem a recarregar a página).
    // Servem para o histórico dizer o que foi o ZapFlow/agente e o que foi você digitando na mão.
    const SENT_KEY = 'zf_sent_ids';
    let sentIds = null;
    function zfSent() {
        if (sentIds) return sentIds;
        try { sentIds = new Set(JSON.parse(localStorage.getItem(SENT_KEY) || '[]')); } catch (e) { sentIds = new Set(); }
        return sentIds;
    }
    function rememberSent(id) {
        if (!id) return;
        const s = zfSent();
        s.add(String(id));
        while (s.size > 600) s.delete(s.values().next().value);
        try { localStorage.setItem(SENT_KEY, JSON.stringify([...s])); } catch (e) { /* sem armazenamento: vale só até recarregar */ }
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // ── Mensagem de voz ─────────────────────────────────────
    // O celular (principalmente o iPhone) só toca mensagem de voz em OGG/Opus. O WhatsApp Web
    // toca qualquer formato que o Chrome entenda, então um MP3/M4A/WebM enviado como voz parece
    // certo no computador e fica com a setinha de download para sempre no celular. Por isso o
    // motor confere os bytes do arquivo (a extensão e o tipo informado podem mentir — ex.: WebM
    // salvo como "audio/ogg") e converte para OGG/Opus mono 48 kHz quando precisa.
    const VOICE_MIME = 'audio/ogg; codecs=opus';
    const VOICE_RATE = 48000;
    const VOICE_FRAME = 960; // 20 ms

    function dataUrlBytes(dataUrl) {
        const comma = String(dataUrl).indexOf(',');
        if (comma < 0) throw new Error('Áudio em formato inválido.');
        const head = dataUrl.slice(0, comma), body = dataUrl.slice(comma + 1);
        if (!/;base64/i.test(head)) return new TextEncoder().encode(decodeURIComponent(body));
        const bin = atob(body);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    const ascii = (b, at, text) => b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));

    // OGG com Opus de verdade: página "OggS" cujo primeiro pacote é o "OpusHead".
    function isOggOpus(b) {
        return ascii(b, 0, 'OggS') && b.length > 27 && ascii(b, 27 + b[26], 'OpusHead');
    }

    const OGG_CRC = (() => {
        const t = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let r = i << 24;
            for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
            t[i] = r >>> 0;
        }
        return t;
    })();

    function oggPage(packets, headerType, granule, serial, seq) {
        const lacing = [];
        for (const p of packets) {
            let n = p.length;
            while (n >= 255) { lacing.push(255); n -= 255; }
            lacing.push(n);
        }
        const bodyLen = packets.reduce((a, p) => a + p.length, 0);
        const page = new Uint8Array(27 + lacing.length + bodyLen);
        const dv = new DataView(page.buffer);
        page.set([0x4f, 0x67, 0x67, 0x53], 0);
        page[5] = headerType;
        dv.setBigUint64(6, BigInt(granule), true);
        dv.setUint32(14, serial, true);
        dv.setUint32(18, seq, true);
        page[26] = lacing.length;
        page.set(lacing, 27);
        let off = 27 + lacing.length;
        for (const p of packets) { page.set(p, off); off += p.length; }
        let crc = 0;
        for (let i = 0; i < page.length; i++) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ page[i]) & 0xff]) >>> 0;
        dv.setUint32(22, crc, true);
        return page;
    }

    async function encodeVoice(bytes) {
        if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
            throw new Error('Este navegador não converte áudio para mensagem de voz. Use o Chrome ou o Edge atualizados.');
        }
        // PCM mono 48 kHz
        const ctx = new AudioContext({ sampleRate: VOICE_RATE });
        let pcm;
        try {
            const decoded = await ctx.decodeAudioData(bytes.slice().buffer);
            pcm = new Float32Array(decoded.length);
            for (let c = 0; c < decoded.numberOfChannels; c++) {
                const ch = decoded.getChannelData(c);
                for (let i = 0; i < pcm.length; i++) pcm[i] += ch[i] / decoded.numberOfChannels;
            }
        } catch (e) {
            throw new Error('Não foi possível ler este áudio para convertê-lo em mensagem de voz.');
        } finally { ctx.close().catch(() => {}); }
        if (!pcm.length) throw new Error('O áudio está vazio.');

        const packets = [];
        let preSkip = 312, failure = null;
        const encoder = new AudioEncoder({
            output: (chunk, meta) => {
                const buf = new Uint8Array(chunk.byteLength);
                chunk.copyTo(buf);
                packets.push(buf);
                const desc = meta && meta.decoderConfig && meta.decoderConfig.description;
                if (desc && packets.length === 1) {
                    const d = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength);
                    if (d.length >= 12 && ascii(d, 0, 'OpusHead')) preSkip = new DataView(d.buffer, d.byteOffset).getUint16(10, true);
                }
            },
            error: (e) => { failure = e instanceof Error ? e : new Error(String(e)); },
        });
        encoder.configure({
            codec: 'opus', sampleRate: VOICE_RATE, numberOfChannels: 1, bitrate: 32000,
            opus: { application: 'voip', signal: 'voice', frameDuration: 20000 },
        });
        const frames = Math.ceil(pcm.length / VOICE_FRAME);
        for (let f = 0; f < frames && !failure; f++) {
            const frame = new Float32Array(VOICE_FRAME);
            frame.set(pcm.subarray(f * VOICE_FRAME, Math.min(pcm.length, (f + 1) * VOICE_FRAME)));
            const data = new AudioData({
                format: 'f32-planar', sampleRate: VOICE_RATE, numberOfFrames: VOICE_FRAME, numberOfChannels: 1,
                timestamp: Math.round((f * VOICE_FRAME * 1e6) / VOICE_RATE), data: frame,
            });
            encoder.encode(data);
            data.close();
            if (encoder.encodeQueueSize > 40) await sleep(0);
        }
        await encoder.flush();
        encoder.close();
        if (failure) throw failure;
        if (!packets.length) throw new Error('O áudio está vazio.');

        const head = new Uint8Array(19);
        head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1], 0); // "OpusHead", versão 1, mono
        new DataView(head.buffer).setUint16(10, preSkip, true);
        new DataView(head.buffer).setUint32(12, VOICE_RATE, true);
        const vendor = new TextEncoder().encode('ZapFlow');
        const tags = new Uint8Array(16 + vendor.length);
        tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags", 0 comentários
        new DataView(tags.buffer).setUint32(8, vendor.length, true);
        tags.set(vendor, 12);

        const serial = (Math.random() * 0xffffffff) >>> 0;
        const parts = [oggPage([head], 0x02, 0, serial, 0), oggPage([tags], 0x00, 0, serial, 1)];
        let seq = 2;
        const PER_PAGE = 50;
        const endGranule = Math.min(packets.length * VOICE_FRAME, preSkip + pcm.length);
        for (let i = 0; i < packets.length; i += PER_PAGE) {
            const slice = packets.slice(i, i + PER_PAGE);
            const last = i + PER_PAGE >= packets.length;
            parts.push(oggPage(slice, last ? 0x04 : 0x00, last ? endGranule : (i + slice.length) * VOICE_FRAME, serial, seq++));
        }
        return parts;
    }

    // Devolve um File pronto para ir como mensagem de voz (OGG/Opus), convertendo só quando precisa.
    async function voiceFile(dataUrl) {
        const bytes = dataUrlBytes(dataUrl);
        if (isOggOpus(bytes)) return new File([bytes], 'ptt.ogg', { type: VOICE_MIME });
        console.log('ZapFlow engine: áudio não é OGG/Opus — convertendo para mensagem de voz…');
        return new File(await encodeVoice(bytes), 'ptt.ogg', { type: VOICE_MIME });
    }

    function wppReady() {
        if (!window.WPP || !(WPP.isReady || (WPP.isInjected && document.querySelector('#pane-side, #main')))) return false;
        if (typeof WPP.chat?.sendTextMessage !== 'function' || typeof WPP.chat?.sendFileMessage !== 'function') return false;
        try {
            const wa = WPP.whatsapp;
            if (typeof wa.ChatStore?.get !== 'function' || typeof wa.MsgKey !== 'function' || typeof wa.MsgStore?.on !== 'function') return false;
            try { return WPP.conn.isAuthenticated() === true; }
            catch {
                try { if (WPP.conn.getMyUserId()) return true; } catch { /* sessão identificada só por LID */ }
                return !!WPP.conn.getMyUserLid();
            }
        } catch { return false; }
    }

    function hasSender(chatId) {
        if (!/@(?:lid|g\.us)$/.test(chatId)) return true;
        try { return !!WPP.conn.getMyUserLid(); } catch { return false; }
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
        return {
            chatId: base.chatId, name, phone: phone ? String(phone).replace(/\D/g, '') : null, isGroup,
            isMyContact: !!(c && c.isMyContact), labels: ((chat && chat.labels) || []).map(String),
        };
    }

    // Mensagem do WhatsApp -> formato do histórico. Mídia vira só o tipo + legenda (o arquivo não é guardado).
    const MSG_KIND = { chat: 'text', ptt: 'audio', audio: 'audio', image: 'image', video: 'video', document: 'document', sticker: 'sticker', location: 'location', vcard: 'contact', multi_vcard: 'contact' };
    function msgOut(m) {
        const kind = m && MSG_KIND[m.type];
        const id = kind && m.id && (m.id._serialized || String(m.id));
        if (!id) return null;
        const text = m.type === 'chat' ? m.body : m.caption; // em mídia, "body" é a miniatura: nunca usar
        return { id, from_me: !!m.id.fromMe, kind, body: text ? String(text).slice(0, 1000) : null, t: (Number(m.t) || 0) * 1000 };
    }
    async function chatHistory(chatId, count) {
        let list = [];
        try { list = (await WPP.chat.getMessages(chatId, { count })) || []; } catch (e) { /* usa só as carregadas */ }
        const chat = WPP.chat.get(chatId);
        const loaded = chat && chat.msgs ? (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : (chat.msgs.models || [])) : [];
        const byId = new Map();
        for (const m of list.concat(loaded)) {
            const o = msgOut(m);
            if (o) { o.by_zapflow = o.from_me && zfSent().has(o.id); byId.set(o.id, o); }
        }
        return [...byId.values()].sort((a, b) => a.t - b.t).slice(-count);
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
        const mark = async () => {
            try {
                if (mode === 'recording') await WPP.chat.markIsRecording?.(chatId);
                else await WPP.chat.markIsComposing?.(chatId);
            } catch (e) { console.warn('ZapFlow engine: presença indisponível', e && e.message); }
        };
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
        sendingChat = chatId;
        try {
            if (!(await waitReady(10000))) {
                return reply(requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp (WA-JS) não carregou.' });
            }
            const stored = chatId && !msg.createChat ? WPP.chat.get(chatId) : null;
            if (!chatId || (!msg.createChat && !stored)) {
                return reply(requestId, { ok: false, error: 'Conversa de destino não encontrada.' });
            }
            if (!hasSender(stored?.id?._serialized || chatId)) return reply(requestId, { ok: false, notReady: true, error: 'O WhatsApp está sincronizando a identidade da conta. Confira a conversa antes de tentar novamente.' });

            let result;
            if (kind === 'text') {
                if (!msg.text) throw new Error('Mensagem vazia.');
                await holdPresence(requestId, chatId, 'composing', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendTextMessage(chatId, msg.text, { createChat: !!msg.createChat, waitForAck: true });
            } else if (kind === 'audio') {
                if (!msg.dataUrl) throw new Error('Áudio sem conteúdo.');
                const voice = await voiceFile(msg.dataUrl); // antes do "gravando", para falhar cedo
                await holdPresence(requestId, chatId, 'recording', msg.presenceMs);
                step(requestId, 'sending');
                result = await WPP.chat.sendFileMessage(chatId, voice, {
                    type: 'audio', isPtt: true, waveform: true, mimetype: VOICE_MIME, createChat: !!msg.createChat, waitForAck: true,
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
            rememberSent(result && result.id && (result.id._serialized || result.id));
            reply(requestId, { ok: true, id: result.id, ack });
        } catch (e) {
            if (e instanceof Cancelled) return reply(requestId, { ok: false, cancelled: true, error: e.message });
            console.error('❌ ZapFlow engine:', e);
            reply(requestId, { ok: false, error: (e && e.message) || String(e) });
        } finally {
            cancelled.delete(requestId);
            if (chatId && wppReady()) { try { await WPP.chat.markIsPaused(chatId); } catch (e) { /* sem impacto */ } }
            // a confirmação da mensagem enviada pode chegar um instante depois
            setTimeout(() => { if (!busy) sendingChat = null; }, 1500);
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
            case 'ZF_ENGINE_STATUS': {
                const ready = wppReady();
                let activeReady = ready;
                if (ready) {
                    try { activeReady = hasSender(chatInfo(WPP.chat.getActiveChat())?.chatId); }
                    catch { activeReady = false; }
                }
                reply(msg.requestId, {
                    ok: true, ready, activeReady,
                    waitingFor: window.WPP?.loader?.zapflowWaitingFor || null,
                    version: (typeof WPP !== 'undefined' && WPP.version) || null,
                    supportedWhatsappWeb: (typeof WPP !== 'undefined' && WPP.supportedWhatsappWeb) || null,
                });
                break;
            }
            case 'ZF_ENGINE_ACTIVE_CHAT': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                let active;
                try { active = chatInfo(WPP.chat.getActiveChat()); }
                catch { return reply(msg.requestId, { ok: false, notReady: true, error: 'A lista de conversas ainda está carregando.' }); }
                if (!active) return reply(msg.requestId, { ok: false, error: 'Abra uma conversa primeiro.' });
                if (!hasSender(active.chatId)) return reply(msg.requestId, { ok: false, notReady: true, error: 'A identidade da conta ainda está sincronizando.' });
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
            case 'ZF_ENGINE_AVATAR': {
                // Endereço da foto de perfil (miniatura). Sem foto, ou escondida pela privacidade da pessoa: url null.
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                try {
                    const url = await Promise.race([
                        WPP.contact.getProfilePictureUrl(msg.chatId, false),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), 9000)),
                    ]);
                    reply(msg.requestId, { ok: true, url: url && /^https:\/\//.test(String(url)) ? String(url) : null });
                } catch (e) {
                    reply(msg.requestId, { ok: false, error: (e && e.message) || 'Não foi possível ver a foto.' });
                }
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
            case 'ZF_ENGINE_CHAT_HISTORY': {
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                try {
                    reply(msg.requestId, { ok: true, messages: await chatHistory(msg.chatId, Math.min(Number(msg.count) || 50, 100)) });
                } catch (e) {
                    reply(msg.requestId, { ok: false, error: (e && e.message) || 'Não foi possível ler as mensagens.' });
                }
                break;
            }
            case 'ZF_ENGINE_DOWNLOAD_MEDIA': {
                // Baixa (já decifrada) a mídia de uma mensagem recebida, para o agente transcrever áudios.
                if (!(await waitReady(5000))) return reply(msg.requestId, { ok: false, notReady: true, error: 'Motor do WhatsApp não carregou.' });
                try {
                    const got = await Promise.race([
                        WPP.chat.downloadMedia(String(msg.msgId)),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('O download da mídia demorou demais.')), 45000)),
                    ]);
                    if (!got) throw new Error('Não foi possível baixar a mídia.');
                    const max = Number(msg.maxBytes) || 24 * 1024 * 1024;
                    if (typeof got === 'string') {
                        if (!got.startsWith('data:')) throw new Error('Formato de mídia inesperado.');
                        if (got.length * 0.75 > max) return reply(msg.requestId, { ok: false, tooLarge: true, error: 'Arquivo grande demais.' });
                        return reply(msg.requestId, { ok: true, dataUrl: got, mimetype: got.slice(5, got.indexOf(';')) || null });
                    }
                    if (got.size > max) return reply(msg.requestId, { ok: false, tooLarge: true, error: 'Arquivo grande demais.' });
                    const dataUrl = await new Promise((res, rej) => {
                        const fr = new FileReader();
                        fr.onload = () => res(fr.result);
                        fr.onerror = () => rej(new Error('Não foi possível ler a mídia.'));
                        fr.readAsDataURL(got);
                    });
                    reply(msg.requestId, { ok: true, dataUrl, mimetype: got.type || null, size: got.size });
                } catch (e) {
                    reply(msg.requestId, { ok: false, error: (e && e.message) || 'Não foi possível baixar a mídia.' });
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
                    if (!m || !m.id || m.isNewMsg === false) return;
                    const remote = m.id.remote;
                    const chatId = remote && (remote._serialized || String(remote));
                    if (!chatId || !/@(c\.us|lid)$/.test(chatId)) return; // grupos, status, canais: nunca
                    const t = (Number(m.t) || 0) * 1000;
                    if (t && (t < ENGINE_START - 5000 || t < Date.now() - 120000)) return;
                    if (m.id.fromMe) {
                        const out = msgOut(m);
                        if (!out) return;
                        out.by_zapflow = sendingChat === chatId || zfSent().has(out.id);
                        if (out.by_zapflow) rememberSent(out.id);
                        contactInfo(chatId).catch(() => null).then((info) => {
                            if (info) window.postMessage({ type: 'ZF_ENGINE_OUTGOING', chat: info, msg: out }, '*');
                        });
                        return;
                    }
                    const text = m.type === 'chat' ? (m.body || '') : (m.caption || '');
                    const msgId = m.id._serialized || String(m.id);
                    contactInfo(chatId).catch(() => null).then((info) => {
                        window.postMessage({
                            type: 'ZF_ENGINE_INCOMING', msgId, chatId,
                            name: (info && info.name) || m.notifyName || chatId.split('@')[0], text, msgType: m.type, t: t || Date.now(),
                            phone: info ? info.phone : (/@c\.us$/.test(chatId) ? chatId.split('@')[0] : null),
                            isMyContact: !!(info && info.isMyContact),
                            labels: info ? info.labels : [],
                            msg: msgOut(m),
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

    function connectEvents() {
        if (!wppReady()) { setTimeout(connectEvents, 2500); return; }
        watchIncoming();
        watchActiveChat();
        watchLabels();
    }
    connectEvents();
})();
