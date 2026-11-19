// Resumo do dia automático na extensão: carrega o agent.js real com o núcleo real e um Supabase simulado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extension = path.join(__dirname, '../../extension');
const read = (f) => fs.readFileSync(path.join(extension, f), 'utf8');

function fakeSb({ settings, claim = true }) {
  const log = { inserts: [], claims: 0 };
  const tables = {
    leads: [{ id: 1, name: 'Ana', status: 'hot', created_at: '2026-11-10T10:00:00Z', last_contact_at: '2026-11-14T10:00:00Z', lead_tags: [], kanban_cards: [{ column_id: 7, board_id: 1, value: 300 }], phone: '5511999990000' }],
    kanban_columns: [{ id: 7, board_id: 1, title: 'Proposta', outcome: null }], kanban_boards: [{ id: 1, title: 'Vendas' }], tags: [], tasks: [],
  };
  return {
    log,
    from(name) {
      const q = {
        select() { return q; }, order() { return q; }, in() { return q; }, eq() { return q; }, gte() { return q; },
        maybeSingle() { return Promise.resolve({ data: name === 'ai_settings' ? settings : null, error: null }); },
        range(a, b) { return Promise.resolve({ data: (tables[name] || []).slice(a, b + 1), error: null }); },
        insert(row) { log.inserts.push({ table: name, row }); return Promise.resolve({ error: null }); },
      };
      return q;
    },
    rpc() { log.claims++; return Promise.resolve({ data: claim, error: null }); },
  };
}

const aiBody = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ titulo: 'Foque na Ana', resumo: 'ok', prioridades: [{ lead: 'L1', motivo: 'quente', acao: 'ligar' }] }) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, model: 'm' });

function openAgent({ sb, ai = true }) {
  const toasts = [];
  const timers = [];
  const sandbox = {
    ZF_BRIDGE: { sb: () => sb, showToast: (m) => toasts.push(m) }, addEventListener() {}, document: { addEventListener() {}, getElementById: () => null, createElement: () => ({}), querySelector: () => null },
    console: { log() {}, info() {}, warn: (...a) => process.env.ZF_DEBUG && console.error(...a), error() {} }, chrome: { runtime: { sendMessage() {} } },
    setTimeout: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, setInterval: (fn, ms) => { timers.push([fn, ms]); return timers.length; },
    clearTimeout() {}, clearInterval() {}, Date, Intl, JSON, Promise, Map, Set, Math, Array, Object, Number, String, Error, URL, TextEncoder, AbortController, FormData, DOMException,
    fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => aiBody, json: async () => JSON.parse(aiBody) }),
  };
  sandbox.window = sandbox.self = sandbox.globalThis = sandbox;
  const window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('zf_ai.js'), sandbox);
  assert.ok(window.ZF_AI && typeof window.ZF_AI.autoBriefing === 'function', 'zf_ai.js da extensão tem o resumo automático');
  // chamadas à IA pelo proxy do background (aiFetch usa chrome.runtime.sendMessage): responde como o fornecedor
  sandbox.chrome.runtime.sendMessage = (msg, cb) => cb({ ok: true, status: 200, headers: {}, body: aiBody });
  vm.runInContext(read('agent.js'), sandbox);
  // depois de carregar, os timers do núcleo da IA (tempo limite das chamadas) voltam a ser reais
  sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
  return { agent: window.ZF_AGENT, toasts, timers };
}

const on = (extra) => ({ provider: 'anthropic', anthropic_key: 'k', profile: { briefing: { auto: true, hour: 0, ...extra } } });

test('agent.js agenda a conferência do resumo ao abrir e a cada 10 minutos', () => {
  const { timers } = openAgent({ sb: fakeSb({ settings: on() }) });
  assert.ok(timers.some(([, ms]) => ms === 20000), 'primeira conferência logo após abrir');
  assert.ok(timers.some(([, ms]) => ms === 600000), 'depois a cada 10 min');
});

test('desligado: lê só a configuração, não reserva nem grava', async () => {
  const sb = fakeSb({ settings: { provider: 'anthropic', anthropic_key: 'k', profile: {} } });
  const { agent, toasts } = openAgent({ sb });
  await agent.checkBriefing();
  assert.equal(sb.log.claims, 0);
  assert.equal(sb.log.inserts.length, 0);
  assert.deepEqual(toasts, []);
});

test('ligado e já na hora: gera, grava como automático e avisa na tela', async () => {
  const sb = fakeSb({ settings: on() });
  const { agent, toasts } = openAgent({ sb });
  await agent.checkBriefing();
  const rep = sb.log.inserts.find((i) => i.table === 'agent_reports');
  assert.ok(rep, 'resumo gravado');
  assert.equal(rep.row.content.auto, true);
  assert.equal(rep.row.content.briefing.titulo, 'Foque na Ana');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Resumo do dia pronto: Foque na Ana/);
});

test('outra aba já reservou o dia: não gera nem avisa', async () => {
  const sb = fakeSb({ settings: on(), claim: false });
  const { agent, toasts } = openAgent({ sb });
  await agent.checkBriefing();
  assert.equal(sb.log.inserts.length, 0);
  assert.deepEqual(toasts, []);
});

test('duas conferências ao mesmo tempo na mesma aba geram um resumo só', async () => {
  const sb = fakeSb({ settings: on() });
  const { agent } = openAgent({ sb });
  await Promise.all([agent.checkBriefing(), agent.checkBriefing()]);
  assert.equal(sb.log.inserts.filter((i) => i.table === 'agent_reports').length, 1);
});
