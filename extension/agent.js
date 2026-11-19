// ZapFlow — Agente copiloto (content script, depois do content.js)
//
// Quando chega mensagem de um lead (ou quando você clica em "Analisar"), o agente lê a conversa,
// transcreve os áudios do cliente, consulta a IA com a SUA chave e mostra na aba Lead uma sugestão:
// resposta (textos e itens da biblioteca), temperatura, etapa, etiqueta, tarefa e anotação.
// NADA é enviado nem alterado sem você aprovar. Ao aprovar, tudo passa pelas mesmas funções de sempre
// (fila de envio com "digitando/gravando", mover etapa, etiquetas...), via window.ZF_BRIDGE.
//
// Depende de: window.ZF_AI (zf_ai.js, o núcleo compartilhado com o painel) e window.ZF_BRIDGE (content.js).
(function () {
  'use strict';
  if (window.ZF_AGENT) return;
  const Z = window.ZF_AI;
  if (!Z) { console.warn('ZapFlow agente: núcleo da IA (zf_ai.js) não carregou'); return; }
  const B = () => window.ZF_BRIDGE;

  const AI_TTL = 60 * 1000;          // quanto tempo vale a configuração lida do banco
  const AI_TTL_AUTO = 15 * 1000;     // no automático a configuração é relida mais vezes (o botão de emergência vale rápido)
  const AUTO_GAP_MS = 20 * 1000;     // no mínimo isto entre duas respostas automáticas da mesma conversa
  const AUTO_CLAIM_SECS = 60;        // janela da reserva: duas abas não respondem o mesmo lead nesse intervalo
  const NEVER = '2100-01-01T00:00:00.000Z';  // "pausado até você retomar"
  const DEBOUNCE_MS = 9000;          // espera o cliente terminar de mandar várias mensagens seguidas
  const MIN_GAP_MS = 45 * 1000;      // no mínimo isto entre duas análises automáticas da mesma conversa
  const MAX_PER_HOUR = 40;           // teto de análises automáticas por hora (protege o seu bolso)
  const HISTORY_COUNT = 30;
  const MAX_AUDIOS = 3;              // quantos áudios do cliente transcrever por análise
  const AUDIO_MAX_BYTES = 24 * 1024 * 1024;
  const TEMP_WORD = { hot: 'quente', warm: 'morna', cold: 'fria' };
  const TEMP_LABEL = { hot: 'Quente', warm: 'Morna', cold: 'Fria' };

  // (ajustáveis por window.ZF_AGENT_DEBOUNCE_MS / ZF_AGENT_MIN_GAP_MS, só para teste)
  const debounceMs = () => Number(window.ZF_AGENT_DEBOUNCE_MS) || DEBOUNCE_MS;
  const minGapMs = () => (window.ZF_AGENT_MIN_GAP_MS != null ? Number(window.ZF_AGENT_MIN_GAP_MS) : MIN_GAP_MS);
  const claimSecs = () => (window.ZF_AGENT_CLAIM_SECS != null ? Number(window.ZF_AGENT_CLAIM_SECS) : AUTO_CLAIM_SECS);
  const autoGapMs = () => (window.ZF_AGENT_AUTO_GAP_MS != null ? Number(window.ZF_AGENT_AUTO_GAP_MS) : AUTO_GAP_MS);
  const autoDelayMs = (a) => (window.ZF_AGENT_AUTO_DELAY_MS != null ? Number(window.ZF_AGENT_AUTO_DELAY_MS) : Z.pickDelayMs(a.profile && a.profile.auto));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => B().escapeHtml(s == null ? '' : String(s));

  let ai = null;                     // { oldDb, rt, profile }
  let aiAt = 0;
  let aiPromise = null;
  const per = new Map();             // chatId -> { status, result, error, lead, runId, stale, applying, appliedMsg }
  const lastRun = new Map();         // chatId -> quando foi a última análise
  const timers = new Map();          // chatId -> espera antes de analisar
  const stamps = [];                 // horários das análises automáticas (última hora)
  const transcripts = new Map();     // id da mensagem -> texto ('' = não deu)
  const sentRefs = new Map();        // chatId -> itens que o agente já mandou
  const incomingAt = new Map();      // chatId -> quando chegou a última mensagem do cliente (vista por esta aba)
  const ownerAt = new Map();         // chatId -> quando VOCÊ digitou na mão pela última vez (vista por esta aba)
  let catalog = { at: 0, items: [] };

  /* ------------------------------------------------------------ rede */

  // A página do WhatsApp não pode falar com as APIs de IA (CORS): o segundo plano faz a chamada.
  function serializeForm(fd) {
    const jobs = [];
    for (const [k, v] of fd.entries()) {
      if (typeof v === 'string') { jobs.push(Promise.resolve([k, v])); continue; }
      jobs.push(new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve([k, { base64: String(fr.result).split(',')[1] || '', type: v.type, name: v.name }]);
        fr.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
        fr.readAsDataURL(v);
      }));
    }
    return Promise.all(jobs);
  }

  function aiFetch(url, init) {
    return new Promise((resolve, reject) => {
      const base = { type: 'ZAPFLOW_AI_FETCH', url, method: (init && init.method) || 'POST', headers: (init && init.headers) || {} };
      const send = (extra) => {
        try {
          chrome.runtime.sendMessage(Object.assign(base, extra), (res) => {
            if (chrome.runtime.lastError || !res) return reject(new TypeError('Sem resposta do segundo plano da extensão.'));
            if (res.error && !res.status) return reject(new TypeError(res.error));
            resolve({
              ok: !!res.ok, status: res.status,
              headers: { get: (k) => (/^retry-after$/i.test(k) ? res.retryAfter : null) },
              text: async () => res.body || '',
              json: async () => JSON.parse(res.body || 'null'),
            });
          });
        } catch (e) { reject(new TypeError('A extensão foi atualizada: recarregue a página do WhatsApp.')); }
      };
      if (init && init.signal) init.signal.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError')), { once: true });
      if (init && init.body instanceof FormData) serializeForm(init.body).then((form) => send({ form }), reject);
      else send({ body: init && init.body });
    });
  }

  /* ------------------------------------------------------ configuração */

  async function loadAi(force) {
    const sb = B() && B().sb();
    if (!sb) return null;
    const ttl = ai && ai.rt && ai.rt.mode === 'auto' ? AI_TTL_AUTO : AI_TTL;
    if (!force && ai && Date.now() - aiAt < ttl) return ai;
    if (aiPromise) return aiPromise;
    aiPromise = (async () => {
      const { data, error } = await sb.from('ai_settings').select('*').maybeSingle();
      ai = error
        ? { oldDb: true, rt: Z.resolveRuntime(null), profile: {} }
        : { oldDb: false, rt: Z.resolveRuntime(data), profile: (data && data.profile) || {} };
      aiAt = Date.now();
      return ai;
    })().finally(() => { aiPromise = null; });
    return aiPromise;
  }

  async function catalogItems() {
    if (Date.now() - catalog.at < 5 * 60 * 1000) return catalog.items;
    const sb = B().sb();
    const { data, error } = await sb.from('catalog_items').select('*').eq('is_active', true).order('name').limit(80);
    catalog = { at: Date.now(), items: error ? [] : data || [] };
    return catalog.items;
  }

  const phoneKeyOf = (p) => {
    const d = String(p || '').replace(/\D/g, '').replace(/^0+/, '');
    if (d.length < 10) return null;
    return d.length <= 11 ? '55' + d : d;
  };

  /* -------------------------------------------------------------- lead */

  // fresh: lê do banco mesmo que a conversa esteja aberta (o automático não pode decidir com pausa velha)
  async function resolveLead(chat, retry, fresh) {
    const b = B();
    const lc = b.leadChat();
    const ls = b.leadState();
    if (!fresh && lc && lc.chatId === chat.chatId && ls.status === 'lead') return ls.lead;
    const key = phoneKeyOf(chat.phone);
    const ors = [`wa_id.eq."${String(chat.chatId).replace(/"/g, '')}"`];
    if (key) ors.push(`phone_key.eq.${key}`);
    const { data } = await b.sb().from('leads').select('*, lead_tags(tag_id), kanban_cards(id,board_id,column_id,position,value,product)').or(ors.join(',')).order('id').limit(3);
    const lead = (data || []).find((l) => key && l.phone_key === key) || (data || [])[0] || null;
    // o lead pode estar sendo criado agora pela captura automática
    if (!lead && retry !== false) { await sleep(4000); return resolveLead(chat, false, fresh); }
    return lead;
  }

  function isBlocked(lead) {
    const ids = new Set((lead.lead_tags || []).map((t) => t.tag_id));
    return B().crm().tags.some((t) => t.is_blocking && ids.has(t.id));
  }

  /* ---------------------------------------------------------- análise */

  function entry(chatId) {
    let e = per.get(chatId);
    if (!e) { e = { status: 'idle' }; per.set(chatId, e); }
    return e;
  }

  async function transcribeAudios(msgs, rt) {
    const b = B();
    const pending = msgs.filter((m) => m.kind === 'audio' && !m.from_me && !m.body).slice(-MAX_AUDIOS);
    for (const m of pending) {
      if (transcripts.has(m.id)) { if (transcripts.get(m.id)) m.body = transcripts.get(m.id); continue; }
      if (!rt.sttReady) continue;
      try {
        const dl = await b.engineRequest('ZF_ENGINE_DOWNLOAD_MEDIA', { msgId: m.id, maxBytes: AUDIO_MAX_BYTES }, 60000);
        if (!dl.ok || !dl.dataUrl) throw new Error(dl.error || 'sem mídia');
        const blob = await (await fetch(dl.dataUrl)).blob();
        const text = await Z.transcribe({ provider: rt.stt.provider, key: rt.stt.key, model: rt.stt.model, file: blob, filename: 'audio.ogg', fetchFn: aiFetch });
        transcripts.set(m.id, text);
        if (text) m.body = text;
      } catch (err) {
        transcripts.set(m.id, ''); // não tenta de novo a cada análise
        console.warn('ZapFlow agente: não consegui transcrever um áudio:', err && err.message);
      }
    }
  }

  function setError(chatId, message) {
    const e = entry(chatId);
    e.status = 'error';
    e.error = message;
    repaintIfOpen(chatId);
  }

  // Monta o que o agente precisa saber do lead e do negócio (igual para copiloto e automático).
  async function buildEnv(chat, lead, a, auto) {
    const b = B();
    const crm = b.crm();
    const lib = Z.libraryFromRows(b.data());
    const cards = lead.kanban_cards || [];
    const col = cards.length ? crm.columns.find((c) => c.id === cards[0].column_id) : null;
    const tagIds = new Set((lead.lead_tags || []).map((t) => t.tag_id));
    let taskTitles = [];
    try {
      const r = await b.sb().from('tasks').select('title').eq('lead_id', lead.id).in('status', ['scheduled', 'sending']).order('due_at').limit(3);
      taskTitles = (r.data || []).map((t) => t.title);
    } catch (err) { /* sem tarefas: segue */ }
    const env = {
      profile: a.profile, library: lib, catalog: Z.catalogFromRows(await catalogItems()),
      stages: Z.stagesFromRows(crm.boards, crm.columns), tags: Z.tagsFromRows(crm.tags),
      lead: {
        name: lead.name, temperature: TEMP_WORD[lead.status], stage: col ? b.stageLabel(col) : undefined,
        tags: crm.tags.filter((t) => tagIds.has(t.id)).map((t) => t.name), origin: lead.origin, campaign: lead.campaign,
        product: cards.length ? cards[0].product : undefined, notes: lead.notes, tasks: taskTitles,
      },
      now: new Date(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, sentRefs: [...(sentRefs.get(chat.chatId) || [])],
    };
    if (auto) { env.auto = true; env.maxSends = Z.normalizeAuto(a.profile && a.profile.auto).max_sends; }
    return env;
  }

  async function readHistory(chatId) {
    const hr = await B().engineRequest('ZF_ENGINE_CHAT_HISTORY', { chatId, count: HISTORY_COUNT }, 20000);
    if (!hr.ok) throw new Error(hr.error || 'Não consegui ler a conversa.');
    const msgs = (hr.messages || []).slice();
    for (const m of msgs) if (m.kind === 'audio' && !m.from_me && !m.body && transcripts.get(m.id)) m.body = transcripts.get(m.id);
    return msgs;
  }

  /* ---------- piloto automático: travas ---------- */

  async function autoCounts(lead) {
    const sb = B().sb();
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const [h, l] = await Promise.all([
      sb.from('agent_runs').select('id', { count: 'exact', head: true }).eq('source', 'auto').gte('created_at', new Date(Date.now() - 3600000).toISOString()),
      sb.from('agent_runs').select('id', { count: 'exact', head: true }).eq('source', 'auto').eq('lead_id', lead.id).gte('created_at', day.toISOString()),
    ]);
    // sem conseguir conferir os limites, não responde (falha para o lado seguro)
    if (h.error || l.error) throw new Error('Não consegui conferir os limites do automático.');
    return { hour: h.count || 0, leadDay: l.count || 0 };
  }

  async function gate(chat, lead, msgs, a) {
    const cards = lead.kanban_cards || [];
    return Z.autoDecision({
      auto: a.profile && a.profile.auto, now: new Date(), chatId: chat.chatId,
      lead: { paused_until: lead.ai_paused_until, tag_ids: (lead.lead_tags || []).map((t) => t.tag_id), column_ids: cards.map((c) => c.column_id) },
      history: msgs, counts: await autoCounts(lead), triggerReplyAt: B().triggerReplyAt ? B().triggerReplyAt(chat.chatId) : 0,
    });
  }

  // Áudio do cliente que ainda não foi respondido e que não deu para transcrever: o agente não sabe o que foi dito.
  function unheardAudio(msgs) {
    for (let i = msgs.length - 1; i >= 0 && !msgs[i].from_me; i--) if (msgs[i].kind === 'audio' && !msgs[i].body) return true;
    return false;
  }

  function pauseLead(lead, untilIso) {
    lead.ai_paused_until = untilIso;
    return B().sb().from('leads').update({ ai_paused_until: untilIso }).eq('id', lead.id).then((r) => { if (r.error) throw r.error; });
  }

  // O agente (ou uma trava) chama o dono: lembrete em Tarefas + o agente fica quieto neste lead por um tempo.
  async function autoHandoff(chat, lead, a, reason, summary) {
    const cfg = Z.normalizeAuto(a.profile && a.profile.auto);
    await insertTask(lead, chat.chatId, {
      kind: 'reminder', title: 'Assumir conversa: ' + reason, due_at: new Date(Date.now() + 60000).toISOString(),
      notes: summary || null, options: { chat_id: chat.chatId, from_agent: true },
    });
    await pauseLead(lead, new Date(Date.now() + cfg.handoff_hours * 3600000).toISOString());
    B().showToast('O agente chamou você: ' + lead.name);
    const open = B().leadChat();
    if (open && open.chatId === chat.chatId) await B().reloadLead({ quiet: true, force: true });
  }

  async function logAuto(lead, a, text, why) {
    const b = B();
    const { data } = await b.sb().from('agent_runs').insert({
      user_id: await b.userId(), lead_id: lead.id, source: 'auto', provider: a.rt.provider, model: a.rt.modelChat,
      summary: String(text || '').slice(0, 300), actions: [{ type: 'handoff', reason: why, summary: '', applied: true }],
    }).select('id').single();
    return data && data.id;
  }

  /* ---------- executar no automático (o lead não precisa estar aberto) ---------- */

  async function runInternalFor(lead, chat, a, cfgAuto) {
    const b = B();
    const sb = b.sb();
    const upd = async (patch) => { const { error } = await sb.from('leads').update(patch).eq('id', lead.id); if (error) throw error; Object.assign(lead, patch); };
    switch (a.type) {
      case 'set_temperature': return upd({ status: a.value });
      case 'move_stage': return b.setLeadStage(lead, a.column_id);
      case 'add_tag': return b.applyTagTo(lead, a.name, chat.chatId);
      case 'add_note': {
        const d = new Date();
        const stamp = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        return upd({ notes: ((lead.notes ? lead.notes + '\n' : '') + '• ' + stamp + ' (agente) ' + a.text).trim() });
      }
      case 'create_task':
        return insertTask(lead, chat.chatId, {
          kind: a.kind, title: a.title, due_at: a.due_at,
          content_type: a.kind === 'send' ? 'text' : null, text: a.kind === 'send' ? a.text : null,
          options: { chat_id: chat.chatId, cancel_on_reply: true, humanize: true, from_agent: true, created_at_ms: Date.now() },
        });
      case 'handoff': return autoHandoff(chat, lead, { profile: { auto: cfgAuto } }, a.reason, a.summary);
      default: return null;
    }
  }

  async function applyAuto(chat, lead, result, a) {
    const cfgAuto = a.profile && a.profile.auto;
    const picked = result.actions.filter((x) => !isInfo(x) && Z.autoAllows(cfgAuto, x));
    const errors = [];
    const okIds = new Set();
    for (const x of picked.filter((y) => !isSend(y))) {
      try { await runInternalFor(lead, chat, x, cfgAuto); okIds.add(x.id); } catch (err) { errors.push((Z.ACTION_LABEL[x.type] || x.type) + ': ' + ((err && err.message) || 'erro')); }
    }
    let queued = 0;
    for (const x of picked.filter(isSend)) {
      try {
        await enqueueAction(x, chat);
        queued++; okIds.add(x.id);
        if (x.type === 'send_item') { const s = sentRefs.get(chat.chatId) || new Set(); s.add(x.ref); sentRefs.set(chat.chatId, s); }
      } catch (err) { errors.push((err && err.message) || 'erro ao enviar'); }
    }
    return { picked, errors, queued, okIds };
  }

  // Resultado do agente em forma de cartão para você aprovar (copiloto, ou automático que não pode agir agora).
  function showCard(chat, lead, a, res, ms, countStamp) {
    const e = entry(chat.chatId);
    lastRun.set(chat.chatId, Date.now());
    if (countStamp) stamps.push(Date.now());
    e.lead = lead;
    e.result = {
      actions: res.actions.map((x, i) => Object.assign({ id: i, selected: true }, x)),
      note: res.text, usage: res.usage, model: res.model, ms, stop: res.stop, at: Date.now(), name: lead.name,
    };
    e.status = 'ready';
    e.runId = null;
    logRun(lead, a.rt, res, ms).then((id) => { e.runId = id; }).catch(() => {});
    const open = B().leadChat();
    if (!open || open.chatId !== chat.chatId) B().showToast('Sugestão do agente pronta: ' + lead.name);
  }

  async function analyze(chat, opts) {
    const manual = !!(opts && opts.manual);
    const b = B();
    if (!b || !b.sb() || !b.isLoaded() || !chat || !chat.chatId || chat.isGroup) return;
    if (!/@(c\.us|lid)$/.test(chat.chatId)) return;      // grupos, status e canais: nunca
    const e = entry(chat.chatId);
    if (e.status === 'running') { e.rerun = true; return; }
    const a = await loadAi(manual);
    if (!a || a.oldDb) { if (manual) setError(chat.chatId, 'O banco está na versão antiga. Rode o supabase/setup.sql de novo.'); return; }
    if (!a.rt.ready) { if (manual) setError(chat.chatId, 'Conecte a IA no painel (Agente › Conexão).'); return; }
    if (!manual && a.rt.mode !== 'copilot' && a.rt.mode !== 'auto') return;
    const auto = !manual && a.rt.mode === 'auto';
    if (!manual) {
      const now = Date.now();
      const gap = now - (lastRun.get(chat.chatId) || 0);
      if (auto) {
        if (gap < autoGapMs()) { schedule(chat, autoGapMs() - gap + 500); return; }
      } else {
        while (stamps.length && now - stamps[0] > 3600000) stamps.shift();
        if (stamps.length >= MAX_PER_HOUR) return;
        if (gap < minGapMs()) { schedule(chat, minGapMs() - gap + 500); return; }
      }
    }

    e.status = 'running';
    e.error = null;
    e.skip = null;
    e.stale = false;
    repaintIfOpen(chat.chatId);
    const t0 = Date.now();
    let asCard = !auto;                  // false = pode responder sozinho
    try {
      const lead = await resolveLead(chat, undefined, auto);
      if (!lead) { if (manual) throw new Error('Este contato ainda não é um lead. Salve-o como lead primeiro.'); e.status = 'idle'; return; }
      if (isBlocked(lead)) { if (manual) throw new Error('Este lead tem uma etiqueta de “ignorar”: o agente não atua nele.'); e.status = 'idle'; return; }

      const msgs = await readHistory(chat.chatId);
      if (!msgs.length) throw new Error('A conversa ainda não tem mensagens.');
      // quem falou por último foi você: sem o que responder (a menos que peça na mão)
      if (!manual && !auto && msgs[msgs.length - 1].from_me) { e.status = 'idle'; return; }

      if (auto) {
        const d = await gate(chat, lead, msgs, a);
        if (!d.ok) {
          e.skip = { code: d.code, reason: d.reason, at: Date.now() };
          if (d.action === 'handoff') {
            await autoHandoff(chat, lead, a, d.reason, 'Mensagens do cliente aguardando resposta.');
            await logAuto(lead, a, d.reason, d.reason);
            e.status = 'idle';
            return;
          }
          if (d.action !== 'suggest') { e.status = 'idle'; return; }
          asCard = true;                      // fora do horário: deixa a sugestão para você aprovar
        }
      }

      await transcribeAudios(msgs, a.rt);
      if (auto && !asCard) {
        if (unheardAudio(msgs)) {
          const why = 'O cliente mandou um áudio que não consegui ouvir.';
          e.skip = { code: 'audio', reason: why, at: Date.now() };
          await autoHandoff(chat, lead, a, why, 'Ouça o áudio e responda.');
          await logAuto(lead, a, why, why);
          e.status = 'idle';
          return;
        }
        const d2 = await gate(chat, lead, msgs, a);        // o áudio transcrito pode ter palavra de bloqueio
        if (!d2.ok) {
          e.skip = { code: d2.code, reason: d2.reason, at: Date.now() };
          if (d2.action === 'handoff') { await autoHandoff(chat, lead, a, d2.reason, 'Mensagens do cliente aguardando resposta.'); await logAuto(lead, a, d2.reason, d2.reason); }
          e.status = 'idle';
          return;
        }
      }

      const env = await buildEnv(chat, lead, a, auto && !asCard);
      const history = msgs.map((m) => ({ from_me: m.from_me, by_zapflow: m.by_zapflow, kind: m.kind, body: m.body, at: new Date(m.t || Date.now()).toISOString() }));
      const res = await Z.runAgent({
        provider: a.rt.provider, key: a.rt.key, model: a.rt.modelChat,
        system: Z.buildSystem(env), messages: [{ role: 'user', content: Z.buildTurnMessage(history) }],
        tools: Z.makeAgentTools(env), fetchFn: aiFetch,
      });
      const ms = Date.now() - t0;

      if (!(auto && !asCard)) showCard(chat, lead, a, res, ms, !manual && !auto);
      else await deliverAuto(chat, e, res, ms, t0, msgs[msgs.length - 1].id);
    } catch (err) {
      e.status = 'error';
      e.error = (err && err.message) || 'Não foi possível analisar.';
    } finally {
      repaintIfOpen(chat.chatId);
      if (e.rerun) { e.rerun = false; schedule(chat, 1500); }
    }
  }

  // Última checagem antes de falar com o cliente. Qualquer dúvida: não envia.
  async function deliverAuto(chat, e, res, ms, t0, lastMsgId) {
    const b = B();
    const fresh = await loadAi(true);                         // botão de emergência: lê de novo agora
    const mode = fresh && !fresh.oldDb && fresh.rt.ready ? fresh.rt.mode : 'off';
    if (mode === 'off') { e.status = 'idle'; e.skip = { code: 'off', reason: 'O agente foi desligado enquanto pensava.', at: Date.now() }; return; }
    const lead = await resolveLead(chat, false, true);
    if (!lead || isBlocked(lead)) { e.status = 'idle'; return; }
    if (mode === 'copilot') {                                  // pausado pelo botão: vira sugestão
      e.skip = { code: 'paused', reason: 'O piloto automático foi pausado: o agente só sugere.', at: Date.now() };
      showCard(chat, lead, fresh, res, ms, false);
      return;
    }
    const changed = (incomingAt.get(chat.chatId) || 0) > t0 || (ownerAt.get(chat.chatId) || 0) > t0;
    let msgs = null;
    let d = null;
    if (!changed) {
      msgs = await readHistory(chat.chatId);
      if (!msgs.length || msgs[msgs.length - 1].id !== lastMsgId) msgs = null;
      else d = await gate(chat, lead, msgs, fresh);
    }
    if (!msgs) {                                                // chegou mensagem nova (ou você respondeu): refaz com a conversa atual
      e.status = 'idle';
      e.skip = { code: 'changed', reason: 'A conversa mudou enquanto o agente pensava: ele analisa de novo.', at: Date.now() };
      if ((incomingAt.get(chat.chatId) || 0) > (ownerAt.get(chat.chatId) || 0)) schedule(chat, autoDelayMs(fresh));
      return;
    }
    if (!d.ok) {
      e.skip = { code: d.code, reason: d.reason, at: Date.now() };
      if (d.action === 'handoff') { await autoHandoff(chat, lead, fresh, d.reason, 'Mensagens do cliente aguardando resposta.'); await logAuto(lead, fresh, d.reason, d.reason); }
      else if (d.action === 'suggest') { showCard(chat, lead, fresh, res, ms, false); return; }
      e.status = 'idle';
      return;
    }
    // reserva atômica: se outra aba do WhatsApp já está respondendo este lead, esta desiste
    const claim = await b.sb().rpc('zf_agent_claim', { p_lead: lead.id, p_secs: claimSecs() });
    if (claim.error || claim.data == null) {
      e.status = 'idle';
      e.skip = { code: 'claimed', reason: claim.error ? 'Não consegui reservar a resposta (rode o supabase/setup.sql de novo).' : 'O agente já respondeu (ou outra janela do WhatsApp está respondendo) este lead há menos de 1 minuto.', at: Date.now() };
      return;
    }
    const runId = claim.data;
    const result = { actions: res.actions.map((x, i) => Object.assign({ id: i }, x)) };
    let out;
    try { out = await applyAuto(chat, lead, result, fresh); } catch (err) { out = { picked: [], errors: [(err && err.message) || 'erro'], queued: 0, okIds: new Set() }; }
    lastRun.set(chat.chatId, Date.now());
    const sentTexts = out.picked.filter((x) => out.okIds.has(x.id) && x.type === 'send_text').map((x) => x.text);
    e.status = 'auto';
    e.runId = runId;
    e.feedback = null;
    e.skip = null;
    e.auto = {
      at: Date.now(), note: res.text, texts: sentTexts, queued: out.queued, errors: out.errors, model: res.model, usage: res.usage, ms,
      items: out.picked.filter((x) => out.okIds.has(x.id) && x.type === 'send_item').map((x) => x.title),
      did: out.picked.filter((x) => out.okIds.has(x.id) && !isSend(x)).map((x) => Z.ACTION_LABEL[x.type] || x.type),
    };
    const marked = result.actions.map((x) => { const { id, ...rest } = x; return Object.assign(rest, { applied: out.okIds.has(id), auto: true }); });
    b.sb().from('agent_runs').update({
      provider: fresh.rt.provider, model: res.model, input_tokens: res.usage.input, output_tokens: res.usage.output, cache_read_tokens: res.usage.cacheRead,
      duration_ms: ms, summary: String(res.text || '').slice(0, 300), actions: marked, error: out.errors.length ? out.errors.join(' · ').slice(0, 500) : null,
    }).eq('id', runId).then(() => {});
    if (out.queued || out.picked.length) b.showToast('Agente respondeu ' + (lead.name || 'o lead') + (out.queued ? ' (' + out.queued + (out.queued === 1 ? ' envio' : ' envios') + ')' : ''));
    const open = b.leadChat();
    if (open && open.chatId === chat.chatId) b.reloadLead({ quiet: true, force: true });
  }

  async function logRun(lead, rt, res, ms) {
    const b = B();
    const { data, error } = await b.sb().from('agent_runs').insert({
      user_id: await b.userId(), lead_id: lead.id, source: 'copilot', provider: rt.provider, model: res.model,
      input_tokens: res.usage.input, output_tokens: res.usage.output, cache_read_tokens: res.usage.cacheRead,
      duration_ms: ms, summary: String(res.text || '').slice(0, 300), actions: res.actions,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  function schedule(chat, ms) {
    clearTimeout(timers.get(chat.chatId));
    timers.set(chat.chatId, setTimeout(() => { timers.delete(chat.chatId); analyze(chat); }, ms));
  }

  /* ------------------------------------------- mensagens que chegam */

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data) return;
    const m = ev.data;
    if (m.type === 'ZF_ENGINE_INCOMING' && m.chatId) {
      const b = B();
      incomingAt.set(m.chatId, Date.now());
      if (!b || !b.isLoaded()) return;
      loadAi().then((a) => {
        if (!a || a.oldDb || !a.rt.ready || (a.rt.mode !== 'copilot' && a.rt.mode !== 'auto')) return;
        const e = per.get(m.chatId);
        if (e && e.status === 'ready') { e.stale = true; repaintIfOpen(m.chatId); }
        // automático: espera um tempo "de gente" antes de responder (sorteado entre o mínimo e o máximo)
        schedule({ chatId: m.chatId, name: m.name, phone: m.phone }, a.rt.mode === 'auto' ? Math.max(debounceMs(), autoDelayMs(a)) : debounceMs());
      }).catch(() => {});
    } else if (m.type === 'ZF_ENGINE_OUTGOING' && m.chat && m.msg && !m.msg.by_zapflow) {
      // você respondeu na mão: cancela a análise que estava para sair e avisa que a sugestão ficou velha
      ownerAt.set(m.chat.chatId, Date.now());
      clearTimeout(timers.get(m.chat.chatId));
      timers.delete(m.chat.chatId);
      const e = per.get(m.chat.chatId);
      if (e && e.status === 'ready') { e.stale = true; repaintIfOpen(m.chat.chatId); }
    }
  });

  /* ---------------------------------------------------------- executar */

  const isSend = (a) => a.type === 'send_text' || a.type === 'send_item';
  const isInfo = (a) => a.type === 'suggest_item';

  async function insertTask(lead, chatId, row) {
    const b = B();
    const { error } = await b.sb().from('tasks').insert(Object.assign({
      user_id: await b.userId(), lead_id: lead.id, contact: lead.name, phone: lead.phone || null,
    }, row));
    if (error) throw error;
  }

  async function runInternal(a, chatId) {
    const b = B();
    const current = () => (b.leadState().lead) || null;
    switch (a.type) {
      case 'set_temperature': return b.leadUpdate({ status: a.value });
      case 'move_stage': {
        const lead = current();
        const card = lead && (lead.kanban_cards || []).find((c) => c.board_id === a.board_id);
        if (card) { if (card.column_id !== a.column_id) await b.moveCard(card.id, a.column_id); } else await b.addLeadCard(a.column_id);
        return null;
      }
      case 'add_tag': return b.tagLead(a.name);
      case 'add_note': {
        const lead = current();
        const d = new Date();
        const stamp = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        return b.leadUpdate({ notes: ((lead && lead.notes ? lead.notes + '\n' : '') + '• ' + stamp + ' (agente) ' + a.text).trim() });
      }
      case 'create_task': {
        const lead = current();
        return insertTask(lead, chatId, {
          kind: a.kind, title: a.title, due_at: a.due_at,
          content_type: a.kind === 'send' ? 'text' : null, text: a.kind === 'send' ? a.text : null,
          options: { chat_id: chatId, cancel_on_reply: true, humanize: true, from_agent: true, created_at_ms: Date.now() },
        });
      }
      case 'handoff': {
        const lead = current();
        return insertTask(lead, chatId, {
          kind: 'reminder', title: 'Assumir conversa: ' + a.reason, due_at: new Date(Date.now() + 60000).toISOString(),
          notes: a.summary || null, options: { chat_id: chatId, from_agent: true },
        });
      }
      default: return null;
    }
  }

  const REF_TYPE = { msg: 'msg', aud: 'audio', img: 'media', vid: 'media', doc: 'doc' };

  async function enqueueAction(a, chat) {
    const b = B();
    if (a.type === 'send_text') {
      b.enqueueSend({ id: 0, type: 'msg', title: 'Mensagem do agente', content: a.text }, chat);
      return;
    }
    const [prefix, idText] = String(a.ref).split(':');
    const id = Number(idText);
    if (prefix === 'fun') {
      const f = b.funnelById(id);
      if (!f) throw new Error('O funil “' + a.title + '” não existe mais.');
      if (!(await b.startFunnelRun(f, chat, { stopOnReply: !!b.settings().stopOnReply }))) throw new Error('O funil “' + a.title + '” não tem passos.');
      return;
    }
    const type = REF_TYPE[prefix];
    const item = b.items().find((i) => i.type === type && i.id === id);
    if (!item) throw new Error('O item “' + a.title + '” não existe mais na biblioteca.');
    b.enqueueSend(a.caption && item.type !== 'audio' ? Object.assign({}, item, { content: a.caption }) : item, chat);
  }

  async function apply(chatId) {
    const b = B();
    const e = per.get(chatId);
    const lc = b.leadChat();
    if (!e || e.status !== 'ready' || e.applying) return;
    if (!lc || lc.chatId !== chatId) { b.showToast('Abra a conversa de ' + (e.result.name || 'este lead') + ' para aprovar.'); return; }
    e.applying = true;
    repaintIfOpen(chatId);
    const picked = e.result.actions.filter((x) => x.selected && !isInfo(x));
    const errors = [];
    for (const a of picked.filter((x) => !isSend(x))) {
      try { await runInternal(a, chatId); } catch (err) { errors.push((Z.ACTION_LABEL[a.type] || a.type) + ': ' + ((err && err.message) || 'erro')); }
    }
    const chat = { chatId, name: lc.name };
    let queued = 0;
    for (const a of picked.filter(isSend)) {
      try {
        await enqueueAction(a, chat);
        queued++;
        if (a.type === 'send_item') { const s = sentRefs.get(chatId) || new Set(); s.add(a.ref); sentRefs.set(chatId, s); }
      } catch (err) { errors.push((err && err.message) || 'erro ao enviar'); }
    }
    e.applying = false;
    e.status = 'applied';
    const done = picked.length - errors.length;
    e.appliedMsg = done + (done === 1 ? ' ação aplicada' : ' ações aplicadas') + (queued ? ' · ' + queued + ' na fila de envio' : '');
    if (errors.length) { e.status = 'error'; e.error = 'Algumas ações falharam: ' + errors.join(' · '); }
    repaintIfOpen(chatId);
    if (e.status === 'applied') setTimeout(() => { const cur = per.get(chatId); if (cur === e) { per.delete(chatId); repaintIfOpen(chatId); } }, 6000);
  }

  /* ------------------------------------------- botão de emergência e pausa */

  function repaintAll() { const lc = B() && B().leadChat(); if (lc) repaintIfOpen(lc.chatId); }

  // Pausa o automático em TODAS as conversas: volta para copiloto (só sugere). Vale na hora nesta aba e,
  // por causa da checagem antes de cada envio, também nas outras janelas em poucos segundos.
  async function pauseAll() {
    const b = B();
    try {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      const { error } = await b.sb().from('ai_settings').update({ mode: 'copilot', updated_at: new Date().toISOString() }).eq('user_id', await b.userId());
      if (error) throw error;
      await loadAi(true);
      b.showToast('Piloto automático pausado. O agente agora só sugere.');
    } catch (err) {
      b.showToast('Não consegui pausar: ' + ((err && err.message) || 'erro') + '. Desligue no painel (Agente).');
    }
    repaintAll();
  }

  async function setLeadPause(chatId, until, okMsg) {
    const b = B();
    const lead = b.leadState().lead;
    const lc = b.leadChat();
    if (!lead || !lc || lc.chatId !== chatId) return;
    try {
      await pauseLead(lead, until);
      if (until) { clearTimeout(timers.get(chatId)); timers.delete(chatId); }
      b.showToast(okMsg);
      await b.reloadLead({ quiet: true, force: true });
    } catch (err) { b.showToast('Não consegui salvar a pausa: ' + ((err && err.message) || 'erro')); }
    repaintIfOpen(chatId);
  }
  const pauseHere = (chatId) => setLeadPause(chatId, NEVER, 'Agente pausado neste lead.');
  const resumeHere = (chatId) => setLeadPause(chatId, null, 'Agente retomado neste lead.');

  function rate(chatId, value) {
    const e = per.get(chatId);
    if (!e || !e.runId) return;
    e.feedback = e.feedback === value ? null : value;
    B().sb().from('agent_runs').update({ feedback: e.feedback }).eq('id', e.runId).then(() => {});
    repaintIfOpen(chatId);
  }

  /* -------------------------------------------------------------- tela */

  const ICON_BOT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 14h.01M15 14h.01M2 13v3M22 13v3"/></svg>';
  const KIND_NAME = { text: 'Texto pronto', audio: 'Áudio', image: 'Imagem', video: 'Vídeo', document: 'Documento', funnel: 'Funil' };

  function repaintIfOpen(chatId) {
    const lc = B() && B().leadChat();
    if (lc && lc.chatId === chatId) paint(document.getElementById('zf-agent'));
  }

  function itemPreview(a) {
    const b = B();
    if (a.kind === 'text') { const m = (b.data().messages || []).find((x) => x.id === a.id); return b.fillTemplate((m && m.content) || '', (b.leadChat() || {}).name); }
    if (a.kind === 'funnel') { const lib = Z.libraryFromRows({ messages: b.data().messages, media: b.data().media, funnels: b.data().funnels }); const f = lib.find((x) => x.ref === a.ref); return (f && f.steps) || ''; }
    return a.caption || '';
  }

  function actionRow(a) {
    const chk = `<input type="checkbox" data-ag-pick="${a.id}" ${a.selected ? 'checked' : ''} aria-label="Incluir">`;
    switch (a.type) {
      case 'send_text':
        return `<div class="zf-ag-row zf-ag-send">${chk}<textarea data-ag-text="${a.id}" rows="2" aria-label="Mensagem sugerida">${esc(a.text)}</textarea></div>`;
      case 'send_item':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-kind">${esc(KIND_NAME[a.kind] || a.kind)}</span><span class="zf-ag-main"><b>${esc(a.title)}</b>${itemPreview(a) ? `<small>${esc(itemPreview(a))}</small>` : ''}</span></div>`;
      case 'set_temperature':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-main"><b>Temperatura: ${TEMP_LABEL[a.value]}</b><small>${esc(a.reason)}</small></span></div>`;
      case 'move_stage':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-main"><b>Mover para ${esc(a.board)} › ${esc(a.title)}</b><small>${esc(a.reason)}</small></span></div>`;
      case 'add_tag':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-main"><b>Etiqueta: ${esc(a.name)}</b><small>${esc(a.reason)}</small></span></div>`;
      case 'create_task':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-main"><b>${a.kind === 'send' ? 'Agendar mensagem' : 'Lembrete'}: ${esc(a.title)}</b><small>${esc(new Date(a.due_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}${a.text ? ' · “' + esc(a.text) + '”' : ''}</small></span></div>`;
      case 'add_note':
        return `<div class="zf-ag-row">${chk}<span class="zf-ag-main"><b>Anotar no lead</b><small>${esc(a.text)}</small></span></div>`;
      case 'handoff':
        return `<div class="zf-ag-row zf-ag-hand">${chk}<span class="zf-ag-main"><b>Assumir esta conversa</b><small>${esc(a.reason)}${a.summary ? ' — ' + esc(a.summary) : ''}</small></span></div>`;
      case 'suggest_item':
        return `<div class="zf-ag-row zf-ag-info"><span class="zf-ag-main"><b>Ideia para a biblioteca: ${esc(a.title)} (${esc(a.kind)})</b><small>Fica guardada em Agente › Gerente › Sugestões, no painel.</small><small>${esc(a.content)}</small></span></div>`;
      default: return '';
    }
  }

  function paint(el) {
    if (!el) return;
    const b = B();
    const lc = b && b.leadChat();
    if (!lc) { el.hidden = true; el.innerHTML = ''; return; }
    if (!ai) { el.hidden = true; loadAi().then(() => repaintIfOpen(lc.chatId)).catch(() => {}); return; }
    if (ai.oldDb || ai.rt.mode === 'off') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const e = per.get(lc.chatId) || { status: 'idle' };
    const isAuto = ai.rt.mode === 'auto';
    const stop = isAuto ? '<button type="button" class="zf-ag-stop" id="zf-ag-stopall" title="Pausa o piloto automático em todas as conversas: o agente volta a só sugerir">Pausar tudo</button>' : '';
    const head = (extra) => `<header class="zf-ag-head"><span class="zf-ag-title">${ICON_BOT}<b>Agente</b><small${isAuto ? ' class="zf-ag-live"' : ''}>${isAuto ? 'automático' : 'copiloto'}</small></span><span class="zf-ag-head-r">${stop}${extra || ''}</span></header>`;
    const bind = (sel, fn) => { const n = el.querySelector(sel); if (n) n.onclick = fn; };
    const analyzeNow = () => analyze({ chatId: lc.chatId, name: lc.name, phone: lc.phone, isGroup: lc.isGroup }, { manual: true });
    const after = () => { bind('#zf-ag-stopall', pauseAll); bind('#zf-ag-pause', () => pauseHere(lc.chatId)); bind('#zf-ag-resume', () => resumeHere(lc.chatId)); };
    // pausa neste lead (só vale no automático)
    const lead = b.leadState().lead;
    const pausedUntil = lead && lead.ai_paused_until && Date.parse(lead.ai_paused_until) > Date.now() ? Date.parse(lead.ai_paused_until) : 0;
    const pauseBtn = !isAuto || !lead ? '' : pausedUntil
      ? '<button type="button" class="zf-btn" id="zf-ag-resume">Retomar neste lead</button>'
      : '<button type="button" class="zf-btn" id="zf-ag-pause">Pausar neste lead</button>';
    const pausedNote = pausedUntil ? `<p class="zf-ag-stale" role="status">Agente pausado neste lead ${pausedUntil > Date.now() + 60 * 86400000 ? 'até você retomar' : 'até ' + esc(new Date(pausedUntil).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))}. Ele não responde sozinho aqui.</p>` : '';

    if (!ai.rt.ready) {
      el.innerHTML = `<section class="zf-ag">${head()}<p class="zf-ag-hint">Conecte a sua IA no painel (Agente › Conexão) para o agente trabalhar aqui.</p></section>`;
      return;
    }
    if (e.status === 'auto') {
      const r = e.auto;
      const when = new Date(r.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      el.innerHTML = `<section class="zf-ag">${head()}${pausedNote}
        <p class="zf-ag-ok" role="status">✓ Respondeu sozinho às ${esc(when)}${r.queued ? ' · ' + r.queued + (r.queued === 1 ? ' envio' : ' envios') : ''}</p>
        ${r.texts.map((t) => `<div class="zf-ag-row zf-ag-send"><span class="zf-ag-main"><b>${esc(b.fillTemplate(t, lc.name))}</b></span></div>`).join('')}
        ${r.items.map((t) => `<div class="zf-ag-row"><span class="zf-ag-kind">Item</span><span class="zf-ag-main"><b>${esc(t)}</b></span></div>`).join('')}
        ${r.did.length ? `<p class="zf-ag-hint">Também: ${esc(r.did.join(', '))}.</p>` : ''}
        ${r.errors.length ? `<p class="zf-ag-err" role="alert">${esc(r.errors.join(' · '))}</p>` : ''}
        ${r.note ? `<p class="zf-ag-note">“${esc(r.note)}”</p>` : ''}
        <div class="zf-ag-actions">${pauseBtn}<button type="button" class="zf-btn" id="zf-ag-dismiss">Ok</button>
          <span class="zf-ag-rate"><button type="button" id="zf-ag-up" aria-pressed="${e.feedback === 1}" aria-label="Boa resposta">👍</button><button type="button" id="zf-ag-down" aria-pressed="${e.feedback === -1}" aria-label="Resposta ruim">👎</button></span></div>
        <p class="zf-ag-meta">${esc(r.model)} · ${(r.usage.input + r.usage.output).toLocaleString('pt-BR')} tokens · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s</p>
      </section>`;
      after();
      bind('#zf-ag-dismiss', () => { per.delete(lc.chatId); paint(el); });
      bind('#zf-ag-up', () => rate(lc.chatId, 1));
      bind('#zf-ag-down', () => rate(lc.chatId, -1));
      return;
    }
    if (e.status === 'running') {
      el.innerHTML = `<section class="zf-ag" aria-busy="true">${head()}${pausedNote}<p class="zf-ag-hint zf-ag-spin"><i></i>Lendo a conversa e a biblioteca…</p></section>`;
      after();
      return;
    }
    if (e.status === 'error') {
      el.innerHTML = `<section class="zf-ag">${head()}<p class="zf-ag-err" role="alert">${esc(e.error)}</p><div class="zf-ag-actions"><button type="button" class="zf-btn" id="zf-ag-retry">Tentar de novo</button></div></section>`;
      bind('#zf-ag-retry', analyzeNow);
      after();
      return;
    }
    if (e.status === 'applied') {
      el.innerHTML = `<section class="zf-ag">${head()}<p class="zf-ag-ok" role="status">✓ ${esc(e.appliedMsg)}</p></section>`;
      after();
      return;
    }
    if (e.status !== 'ready') {
      const why = e.skip ? `<p class="zf-ag-note" data-ag-skip="${esc(e.skip.code)}">${esc(e.skip.reason)}</p>` : '';
      el.innerHTML = isAuto
        ? `<section class="zf-ag">${head()}${pausedNote}<p class="zf-ag-hint">Piloto automático ligado: ele responde sozinho aqui, dentro das suas regras. Você pode assumir quando quiser.</p>${why}<div class="zf-ag-actions">${pauseBtn}<button type="button" class="zf-btn" id="zf-ag-go">Analisar conversa</button></div></section>`
        : `<section class="zf-ag">${head()}<p class="zf-ag-hint">Ele lê a conversa e sugere resposta, temperatura e etapa. Nada é enviado sem você aprovar.</p><div class="zf-ag-actions"><button type="button" class="zf-btn-primary" id="zf-ag-go">Analisar conversa</button></div></section>`;
      bind('#zf-ag-go', analyzeNow);
      after();
      return;
    }

    const r = e.result;
    const sends = r.actions.filter(isSend);
    const inner = r.actions.filter((x) => !isSend(x));
    const nothing = !r.actions.length;
    el.innerHTML = `<section class="zf-ag">
      ${head('<button type="button" class="zf-ag-ref" id="zf-ag-again" title="Analisar de novo" aria-label="Analisar de novo">↻</button>')}
      ${e.skip ? `<p class="zf-ag-stale" role="status" data-ag-skip="${esc(e.skip.code)}">${esc(e.skip.reason)} Por isso ele só deixou a sugestão abaixo.</p>` : ''}
      ${e.stale ? '<p class="zf-ag-stale" role="status">Chegou mensagem nova (ou você respondeu) depois desta análise. Analise de novo antes de aprovar.</p>' : ''}
      ${r.note ? `<p class="zf-ag-note">“${esc(r.note)}”</p>` : ''}
      ${r.stop === 'refusal' ? '<p class="zf-ag-err">A IA recusou analisar esta conversa. Responda você mesmo.</p>' : ''}
      ${nothing ? '<p class="zf-ag-hint">O agente não viu nada para fazer agora.</p>' : ''}
      ${sends.length ? `<h4 class="zf-ag-h">Resposta sugerida</h4>${sends.map(actionRow).join('')}` : ''}
      ${inner.length ? `<h4 class="zf-ag-h">Classificação e tarefas</h4>${inner.map(actionRow).join('')}` : ''}
      <div class="zf-ag-actions">
        ${nothing ? '' : `<button type="button" class="zf-btn-primary" id="zf-ag-apply"${e.applying ? ' disabled' : ''}>${e.applying ? 'Aplicando…' : sends.length ? 'Aprovar e enviar' : 'Aplicar'}</button>`}
        <button type="button" class="zf-btn" id="zf-ag-dismiss">Descartar</button>
        <span class="zf-ag-rate"><button type="button" id="zf-ag-up" aria-pressed="${e.feedback === 1}" aria-label="Boa sugestão">👍</button><button type="button" id="zf-ag-down" aria-pressed="${e.feedback === -1}" aria-label="Sugestão ruim">👎</button></span>
      </div>
      <p class="zf-ag-meta">${esc(r.model)} · ${(r.usage.input + r.usage.output).toLocaleString('pt-BR')} tokens · ${(r.ms / 1000).toFixed(1).replace('.', ',')} s</p>
    </section>`;

    el.querySelectorAll('[data-ag-pick]').forEach((c) => { c.onchange = () => { const a = r.actions.find((x) => x.id === Number(c.dataset.agPick)); if (a) a.selected = c.checked; }; });
    el.querySelectorAll('[data-ag-text]').forEach((t) => { t.oninput = () => { const a = r.actions.find((x) => x.id === Number(t.dataset.agText)); if (a) a.text = t.value; }; });
    bind('#zf-ag-again', analyzeNow);
    after();
    bind('#zf-ag-dismiss', () => { per.delete(lc.chatId); paint(el); });
    bind('#zf-ag-apply', () => apply(lc.chatId));
    bind('#zf-ag-up', () => rate(lc.chatId, 1));
    bind('#zf-ag-down', () => rate(lc.chatId, -1));
  }

  // A aba Lead redesenha tudo a cada mudança: o cartão do agente é pendurado de novo no topo.
  function onLeadRender(box) {
    let el = document.getElementById('zf-agent');
    if (el && el.parentNode !== box) { el.remove(); el = null; }
    if (!el) { el = document.createElement('div'); el.id = 'zf-agent'; el.className = 'zf-agent'; }
    const head = box.querySelector('.zf-lead-head');
    if (head) head.after(el); else box.prepend(el);
    paint(el);
  }

  /* ------------------------------------------ resumo do dia automático */
  // Sem servidor: com o WhatsApp Web aberto, a extensão confere ao abrir e a cada 10 min. Se estiver ligado
  // (painel › Agente › Gerente) e já passou da hora escolhida, gera o resumo de hoje com a chave da conta.
  // O banco reserva a vez (zf_briefing_claim), então painel e várias abas geram um só. Não depende de a aba
  // estar visível: o resumo fica salvo e o painel mostra quando você abrir.
  let briefingBusy = false;
  let briefingWarned = false;
  async function checkBriefing() {
    const b = B();
    if (briefingBusy || !b || !b.sb()) return;
    briefingBusy = true;
    try {
      const sb = b.sb();
      const { data, error } = await sb.from('ai_settings').select('*').maybeSingle();
      if (error || !data) return;
      const r = await Z.autoBriefing({ sb, settings: data, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, fetchFn: aiFetch });
      if (r && r.ok) b.showToast('☀️ Resumo do dia pronto: ' + r.titulo + ' · veja em Agente › Gerente no painel.');
    } catch (e) {
      console.warn('ZapFlow: resumo do dia automático falhou', e);
      if (!briefingWarned) { briefingWarned = true; b.showToast('Resumo do dia automático falhou: ' + ((e && e.message) || 'tente gerar pelo painel.')); }
    } finally {
      briefingBusy = false;
    }
  }
  setTimeout(checkBriefing, 20000);
  setInterval(checkBriefing, 10 * 60 * 1000);

  window.ZF_AGENT = {
    onLeadRender,
    checkBriefing,
    analyze,
    apply,
    reloadSettings: () => loadAi(true),
    pauseAll,
    pauseHere,
    resumeHere,
    _state: () => ({ ai, per, timers, stamps, transcripts }),
  };
})();
