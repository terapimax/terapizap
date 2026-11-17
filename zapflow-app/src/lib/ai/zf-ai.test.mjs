// Teste do núcleo da IA (sem rede: o fetch é simulado). Rodar: node src/lib/ai/zf-ai.test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Z = require('./zf-ai.js');

let pass = 0;
const fails = [];
async function t(name, fn) {
  try { await fn(); pass++; } catch (e) { fails.push(name + ' -> ' + (e && e.message)); }
}

/** fetch simulado: responde da fila e guarda o que foi enviado */
function mockFetch(queue) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
    const next = queue.shift();
    if (!next) throw new Error('fila vazia: chamada inesperada a ' + url);
    if (next instanceof Error) throw next;
    const status = next.status || 200;
    const bodyText = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return { ok: status < 400, status, headers: { get: (k) => (next.headers || {})[k] || null }, text: async () => bodyText, json: async () => JSON.parse(bodyText) };
  };
  fn.calls = calls;
  return fn;
}

const library = [
  { ref: 'msg:1', id: 1, kind: 'text', title: 'Preço da consulta', text: 'A consulta custa R$ 150, {nome}.', whenToUse: 'cliente pergunta o preço', summary: 'Valor da consulta', tags: ['preço', 'consulta'], favorite: true, createdAt: '2026-11-01' },
  { ref: 'aud:5', id: 5, kind: 'audio', title: 'Boas-vindas', transcript: 'Oi, tudo bem? Aqui é a Clara, vou te ajudar.', whenToUse: 'primeiro contato', summary: 'Áudio de boas-vindas', tags: ['saudação'], createdAt: '2026-11-02' },
  { ref: 'img:3', id: 3, kind: 'image', title: 'Antes e depois', caption: 'Resultado', createdAt: '2026-11-03' },
  { ref: 'doc:2', id: 2, kind: 'document', title: 'Tabela de valores', transcript: 'Massagem relaxante 90 min R$ 220', summary: 'Tabela completa', whenToUse: 'cliente quer ver todos os valores', tags: ['valores'], createdAt: '2026-11-04' },
  { ref: 'fun:1', id: 1, kind: 'funnel', title: 'Funil de boas-vindas', steps: 'texto → áudio → imagem', summary: 'Sequência inicial', createdAt: '2026-11-05' },
];
const stages = [
  { id: 10, board_id: 1, board: 'Vendas', title: 'Novo' },
  { id: 11, board_id: 1, board: 'Vendas', title: 'Negociação' },
  { id: 12, board_id: 2, board: 'Pós-venda', title: 'Novo' },
  { id: 13, board_id: 1, board: 'Vendas', title: 'Ganho', outcome: 'won' },
];
const tags = [{ id: 1, name: 'VIP' }, { id: 2, name: 'Fora', blocking: true }];
const now = new Date('2026-11-16T12:00:00-03:00');

await t('norm tira acento e caixa', () => {
  assert.equal(Z.norm('  Ação É ÓTIMO '), 'acao e otimo');
});

await t('índice da biblioteca: favoritos primeiro, referências e conteúdo', () => {
  const idx = Z.buildLibraryIndex(library);
  const first = idx.split('\n')[0];
  assert.match(first, /^msg:1 · TEXTO · "Preço da consulta" ★/);
  assert.match(idx, /aud:5 · ÁUDIO .*fala: "Oi, tudo bem/);
  assert.match(idx, /img:3 · IMAGEM .*\(ainda não lido pela IA\)/);
  assert.match(idx, /fun:1 · FUNIL .*passos: texto → áudio → imagem/);
});

await t('índice respeita o limite e avisa quantos ficaram de fora', () => {
  const many = Array.from({ length: 400 }, (_, i) => ({ ref: 'msg:' + (i + 100), id: i + 100, kind: 'text', title: 'Item ' + i, text: 'x'.repeat(500), summary: 'resumo ' + i }));
  const idx = Z.buildLibraryIndex(many, { maxChars: 8000 });
  assert.ok(idx.length <= 8200, 'tamanho ' + idx.length);
  assert.match(idx, /itens não listados aqui: use buscar_biblioteca/);
});

await t('busca ignora acento e prioriza título/tags', () => {
  const hits = Z.searchLibrary(library, 'preco consulta', { limit: 3 });
  assert.equal(hits[0].ref, 'msg:1');
  assert.deepEqual(Z.searchLibrary(library, 'valores', { kinds: ['document'] }).map((i) => i.ref), ['doc:2']);
  assert.deepEqual(Z.searchLibrary(library, 'zzzz'), []);
});

await t('ferramentas validam referência, duplicata, etapa, data e etiqueta', async () => {
  const tools = Object.fromEntries(Z.makeAgentTools({ library, stages, tags, now }).map((x) => [x.name, x]));
  assert.equal((await tools.enviar_item.run({ ref: 'aud:999' })).isError, true);
  assert.equal((await tools.enviar_item.run({ ref: 'qualquer' })).isError, true);
  const ok = await tools.enviar_item.run({ ref: 'aud:5' });
  assert.equal(ok.action.type, 'send_item');
  assert.equal((await tools.enviar_item.run({ ref: 'aud:5' })).isError, true, 'duplicado na mesma análise');
  assert.equal((await tools.mover_etapa.run({ etapa: 'Novo', motivo: 'x' })).isError, true, 'ambígua');
  assert.equal((await tools.mover_etapa.run({ etapa: 'Novo', quadro: 'Pós-venda', motivo: 'x' })).action.column_id, 12);
  assert.equal((await tools.mover_etapa.run({ etapa: 'negociacao', motivo: 'x' })).action.column_id, 11);
  assert.equal((await tools.mover_etapa.run({ etapa: 'Inexistente', motivo: 'x' })).isError, true);
  assert.equal((await tools.criar_tarefa.run({ titulo: 'a', quando: '2026-11-10T10:00' })).isError, true, 'passado');
  assert.equal((await tools.criar_tarefa.run({ titulo: 'a', quando: 'lixo' })).isError, true);
  assert.equal((await tools.criar_tarefa.run({ titulo: 'a', quando: '2026-11-17T10:00', tipo: 'envio' })).isError, true, 'envio sem texto');
  const task = await tools.criar_tarefa.run({ titulo: 'Retornar', quando: '2026-11-17T10:00' });
  assert.equal(task.action.kind, 'reminder');
  assert.equal((await tools.adicionar_etiqueta.run({ etiqueta: 'vip' })).action.tag_id, 1);
  assert.equal((await tools.adicionar_etiqueta.run({ etiqueta: 'Fora' })).isError, true, 'etiqueta de bloqueio nunca pelo agente');
  assert.equal((await tools.definir_temperatura.run({ temperatura: 'Quente', motivo: 'pediu preço' })).action.value, 'hot');
  assert.equal((await tools.definir_temperatura.run({ temperatura: 'morninha', motivo: '' })).isError, true);
  assert.match(tools.buscar_biblioteca.run({ consulta: 'valores' }), /doc:2/);
  assert.match(tools.ver_item.run({ ref: 'aud:5' }), /Transcrição/);
});

await t('limite de envios por análise', async () => {
  const tools = Object.fromEntries(Z.makeAgentTools({ library, stages, tags, now }).map((x) => [x.name, x]));
  let last;
  for (let i = 0; i < 10; i++) last = await tools.enviar_texto.run({ texto: 'oi ' + i });
  assert.equal(last.isError, true);
});

await t('sentRefs impede reenviar item já enviado antes', async () => {
  const tools = Object.fromEntries(Z.makeAgentTools({ library, stages, tags, now, sentRefs: ['aud:5'] }).map((x) => [x.name, x]));
  assert.equal((await tools.enviar_item.run({ ref: 'aud:5' })).isError, true);
});

await t('prompt: parte fixa em cache, volátil depois, regras do dono presentes', () => {
  const sys = Z.buildSystem({
    profile: { persona_name: 'Clara', business_name: 'Spa Zen', tone: 'profissional', emoji: 'nenhum', rules: '- Nunca dar desconto\nSempre oferecer agendamento', forbidden: 'política', hours_text: 'Seg a Sex 9h às 18h' },
    library, catalog: [{ name: 'Massagem', kind: 'service', priceLabel: 'R$ 220', duration: '90 min' }], stages, tags,
    lead: { name: 'João', temperature: 'warm', stage: 'Vendas › Novo', tags: ['VIP'], notes: 'quer massagem' }, now, tz: 'America/Sao_Paulo',
  });
  assert.equal(sys.length, 2);
  assert.equal(sys[0].cache, true);
  assert.ok(!sys[1].cache);
  assert.match(sys[0].text, /Você é Clara/);
  assert.match(sys[0].text, /- Nunca dar desconto/);
  assert.match(sys[0].text, /Não use emojis/);
  assert.match(sys[0].text, /aud:5 · ÁUDIO/);
  assert.match(sys[0].text, /Massagem \(serviço\) — R\$ 220, 90 min/);
  assert.match(sys[0].text, /Vendas › Negociação/);
  assert.doesNotMatch(sys[0].text, /Fora/, 'etiqueta de bloqueio não aparece');
  assert.match(sys[1].text, /Nome: João/);
  assert.doesNotMatch(sys[0].text, /João/, 'dados do lead ficam fora da parte em cache');
});

await t('conversa formatada com autor, mídia e transcrição', () => {
  const s = Z.formatConversation([
    { from_me: false, kind: 'text', body: 'Oi, quanto custa?', at: '2026-11-16T10:00:00-03:00' },
    { from_me: true, by_zapflow: true, kind: 'audio', body: 'Boas-vindas', at: '2026-11-16T10:01:00-03:00' },
    { from_me: false, kind: 'audio', body: 'queria marcar sábado', at: '2026-11-16T10:02:00-03:00' },
    { from_me: false, kind: 'image', body: null, at: '2026-11-16T10:03:00-03:00' },
  ]);
  assert.match(s, /CLIENTE: "Oi, quanto custa\?"/);
  assert.match(s, /VOCÊ \(agente\/ZapFlow\): enviou um áudio: "Boas-vindas"/);
  assert.match(s, /CLIENTE: enviou um áudio \(conteúdo: "queria marcar sábado"\)/);
  assert.match(s, /CLIENTE: enviou uma foto \(sem transcrição\)/);
});

/* ---------------------------------------------------------------- Claude */

const anthropicToolResp = {
  body: {
    model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Vou responder.' },
      { type: 'tool_use', id: 'tu_1', name: 'enviar_item', input: { ref: 'msg:1' } },
      { type: 'tool_use', id: 'tu_2', name: 'definir_temperatura', input: { temperatura: 'quente', motivo: 'pediu preço' } },
    ],
    usage: { input_tokens: 1000, output_tokens: 80, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
  },
};
const anthropicEndResp = {
  body: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Enviei o preço e marquei como quente.' }], usage: { input_tokens: 1200, output_tokens: 20 } },
};

await t('Claude: laço de ferramentas, cabeçalhos, cache e nada de parâmetros proibidos', async () => {
  const f = mockFetch([anthropicToolResp, anthropicEndResp]);
  const env = { library, stages, tags, now };
  const r = await Z.runAgent({
    provider: 'anthropic', key: 'sk-ant-teste', model: 'claude-sonnet-5-5',
    system: Z.buildSystem({ ...env, profile: {} }), messages: [{ role: 'user', content: Z.buildTurnMessage([{ from_me: false, kind: 'text', body: 'quanto custa?', at: '2026-11-16T10:00:00-03:00' }]) }],
    tools: Z.makeAgentTools(env), fetchFn: f,
  });
  assert.equal(f.calls.length, 2);
  const c1 = f.calls[0];
  assert.equal(c1.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c1.init.headers['x-api-key'], 'sk-ant-teste');
  assert.equal(c1.init.headers['anthropic-version'], '2026-10-21');
  assert.equal(c1.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  for (const bad of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice', 'budget_tokens']) assert.ok(!(bad in c1.body), bad + ' não pode ir');
  assert.deepEqual(c1.body.system[0].cache_control, { type: 'ephemeral' });
  assert.ok(!c1.body.system[1].cache_control);
  assert.ok(c1.body.tools.length === 11 && c1.body.tools.every((x) => x.input_schema && x.name));
  assert.equal(c1.body.messages[0].role, 'user');
  // 2ª chamada: devolve os blocos do assistente como vieram (inclusive o de raciocínio) e os resultados no formato certo
  const c2 = f.calls[1].body.messages;
  assert.equal(c2[1].role, 'assistant');
  assert.equal(c2[1].content[0].type, 'thinking');
  assert.equal(c2[2].role, 'user');
  assert.deepEqual(c2[2].content.map((b) => [b.type, b.tool_use_id]), [['tool_result', 'tu_1'], ['tool_result', 'tu_2']]);
  assert.deepEqual(r.actions.map((a) => a.type), ['send_item', 'set_temperature']);
  assert.equal(r.text, 'Enviei o preço e marquei como quente.');
  assert.equal(r.stop, 'end');
  assert.deepEqual(r.usage, { input: 2200, output: 100, cacheRead: 900, cacheWrite: 0 });
});

await t('Claude: ferramenta com erro volta como is_error e não vira ação', async () => {
  const f = mockFetch([
    { body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'enviar_item', input: { ref: 'aud:777' } }], usage: {} } },
    { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: {} } },
  ]);
  const r = await Z.runAgent({ provider: 'anthropic', key: 'k', model: 'm', messages: [{ role: 'user', content: 'oi' }], tools: Z.makeAgentTools({ library, stages, tags, now }), fetchFn: f });
  assert.equal(r.actions.length, 0);
  assert.equal(f.calls[1].body.messages[2].content[0].is_error, true);
  assert.equal(r.trace[0].isError, true);
});

await t('Claude: ferramenta desconhecida e limite de passos', async () => {
  const loop = () => ({ body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x' + Math.random(), name: 'nada', input: {} }], usage: {} } });
  const f = mockFetch([loop(), loop(), loop()]);
  const r = await Z.runAgent({ provider: 'anthropic', key: 'k', model: 'm', messages: [{ role: 'user', content: 'oi' }], tools: [], fetchFn: f, maxSteps: 3 });
  assert.equal(r.stop, 'max_steps');
  assert.equal(f.calls.length, 3);
});

await t('Claude: recusa vira stop=refusal', async () => {
  const f = mockFetch([{ body: { stop_reason: 'refusal', content: [], usage: {} } }]);
  const r = await Z.runAgent({ provider: 'anthropic', key: 'k', model: 'm', messages: [{ role: 'user', content: 'oi' }], tools: [], fetchFn: f });
  assert.equal(r.stop, 'refusal');
});

await t('erros: chave inválida, saldo, modelo, rede e nova tentativa em 429', async () => {
  const run = (queue) => Z.callLLM({ provider: 'anthropic', key: 'k', model: 'm', system: [], messages: [{ role: 'user', content: 'oi' }], fetchFn: mockFetch(queue) });
  await assert.rejects(run([{ status: 401, body: { error: { message: 'invalid x-api-key' } } }]), (e) => e.kind === 'auth' && /chave/i.test(e.message));
  await assert.rejects(run([{ status: 400, body: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }]), (e) => e.kind === 'quota' && /saldo/i.test(e.message));
  await assert.rejects(run([{ status: 404, body: { error: { message: 'model: nope' } } }]), (e) => e.kind === 'model');
  const net = Object.assign(new TypeError('fetch failed'));
  await assert.rejects(run([net, net, net]), (e) => e.kind === 'network');
  const ok = await run([{ status: 429, body: { error: { message: 'rate' } }, headers: { 'retry-after': '0' } }, { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: {} } }]);
  assert.equal(ok.text, 'ok');
  await assert.rejects(Z.callLLM({ provider: 'anthropic', key: '', model: 'm', messages: [] }), (e) => e.kind === 'auth');
});

/* ---------------------------------------------------------------- OpenAI */

await t('OpenAI: mensagens, ferramentas e resultados no formato do Chat Completions', async () => {
  const f = mockFetch([
    { body: { model: 'gpt-4.1', choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [
      { id: 'call_1', type: 'function', function: { name: 'enviar_texto', arguments: '{"texto":"Oi {nome}!"}' } },
      { id: 'call_2', type: 'function', function: { name: 'anotar', arguments: '{"nota":"quer sábado"}' } },
    ] } }], usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } } } },
    { body: { model: 'gpt-4.1', choices: [{ finish_reason: 'stop', message: { content: 'Pronto.' } }], usage: { prompt_tokens: 1100, completion_tokens: 10 } } },
  ]);
  const env = { library, stages, tags, now };
  const r = await Z.runAgent({ provider: 'openai', key: 'sk-teste', model: 'gpt-4.1', system: Z.buildSystem({ ...env, profile: {} }), messages: [{ role: 'user', content: 'oi' }], tools: Z.makeAgentTools(env), fetchFn: f });
  const c1 = f.calls[0];
  assert.equal(c1.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(c1.init.headers.Authorization, 'Bearer sk-teste');
  assert.equal(c1.body.messages[0].role, 'system');
  assert.match(c1.body.messages[0].content, /Você é/);
  assert.ok(c1.body.max_completion_tokens >= 4096);
  assert.ok(!('temperature' in c1.body) && !('max_tokens' in c1.body));
  assert.equal(c1.body.tools[0].type, 'function');
  assert.ok(c1.body.tools[0].function.parameters.type === 'object');
  const m2 = f.calls[1].body.messages;
  const asst = m2.find((m) => m.role === 'assistant');
  assert.equal(asst.tool_calls.length, 2);
  assert.equal(asst.tool_calls[0].function.arguments, '{"texto":"Oi {nome}!"}');
  assert.deepEqual(m2.filter((m) => m.role === 'tool').map((m) => m.tool_call_id), ['call_1', 'call_2']);
  assert.deepEqual(r.actions.map((a) => a.type), ['send_text', 'add_note']);
  assert.deepEqual(r.usage, { input: (1000 - 800) + 1100, output: 60, cacheRead: 800, cacheWrite: 0 });
});

await t('OpenAI: imagem e PDF vão como image_url e file', async () => {
  const f = mockFetch([{ body: { choices: [{ finish_reason: 'stop', message: { content: '{}' } }], usage: {} } }]);
  await Z.callLLM({ provider: 'openai', key: 'k', model: 'gpt-4.1', system: [], fetchFn: f, messages: [{ role: 'user', content: [
    { type: 'image', mime: 'image/png', data: 'AAA' }, { type: 'document', mime: 'application/pdf', data: 'BBB', name: 'x.pdf' }, { type: 'text', text: 'leia' }] }] });
  const parts = f.calls[0].body.messages[0].content;
  assert.equal(parts[0].image_url.url, 'data:image/png;base64,AAA');
  assert.equal(parts[1].file.file_data, 'data:application/pdf;base64,BBB');
  assert.equal(parts[1].file.filename, 'x.pdf');
});

await t('OpenAI: saldo esgotado (429 insufficient_quota) não repete', async () => {
  const f = mockFetch([{ status: 429, body: { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } } }]);
  await assert.rejects(Z.callLLM({ provider: 'openai', key: 'k', model: 'm', system: [], messages: [{ role: 'user', content: 'oi' }], fetchFn: f }), (e) => e.kind === 'quota');
  assert.equal(f.calls.length, 1);
});

/* ------------------------------------------------- modelos, leitura, voz */

await t('listModels e pickDefaultModels', async () => {
  const fa = mockFetch([{ body: { data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }] } }]);
  const ma = await Z.listModels({ provider: 'anthropic', key: 'k', fetchFn: fa });
  assert.equal(fa.calls[0].url, 'https://api.anthropic.com/v1/models?limit=1000');
  assert.deepEqual(Z.pickDefaultModels('anthropic', ma), { chat: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' });
  assert.deepEqual(Z.pickDefaultModels('anthropic', [{ id: 'claude-sonnet-4-6' }, { id: 'claude-haiku-4-5' }]), { chat: 'claude-sonnet-4-6', fast: 'claude-haiku-4-5' });
  const fo = mockFetch([{ body: { data: [{ id: 'gpt-4.1' }, { id: 'gpt-4o-mini-transcribe' }, { id: 'text-embedding-3-small' }, { id: 'gpt-5-mini' }, { id: 'gpt-5' }, { id: 'whisper-1' }, { id: 'gpt-4o-realtime-preview' }] } }]);
  const mo = await Z.listModels({ provider: 'openai', key: 'k', fetchFn: fo });
  assert.deepEqual(mo.map((m) => m.id).sort(), ['gpt-4.1', 'gpt-5', 'gpt-5-mini']);
  assert.deepEqual(Z.pickDefaultModels('openai', [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }]), { chat: 'gpt-5', fast: 'gpt-5-mini' });
});

await t('enrichItem: lê JSON mesmo com cerca de código, normaliza tags e manda imagem', async () => {
  const f = mockFetch([{ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{"summary":"Foto do resultado","when_to_use":"quando pedirem prova","tags":["Resultado","ANTES e depois","resultado"],"content":"Texto: 30 dias"}\n```' }], usage: { input_tokens: 5, output_tokens: 5 } } }]);
  const r = await Z.enrichItem({ provider: 'anthropic', key: 'k', model: 'claude-haiku-5-5', fetchFn: f, item: { kind: 'image', title: 'Antes e depois', image: { mime: 'image/jpeg', data: 'QQ==' } } });
  assert.deepEqual(r.tags, ['resultado', 'antes e depois']);
  assert.equal(r.when_to_use, 'quando pedirem prova');
  assert.equal(r.content, 'Texto: 30 dias');
  assert.equal(f.calls[0].body.messages[0].content[0].type, 'image');
  assert.equal(f.calls[0].body.messages[0].content[0].source.media_type, 'image/jpeg');
  const bad = mockFetch([{ body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'não sei' }], usage: {} } }]);
  await assert.rejects(Z.enrichItem({ provider: 'anthropic', key: 'k', model: 'm', fetchFn: bad, item: { kind: 'text', title: 'x', text: 'y' } }), (e) => e.kind === 'parse');
});

await t('transcribe: multipart com modelo e idioma; Groq usa outro endereço', async () => {
  const f = mockFetch([{ body: { text: ' Olá, tudo bem? ' } }, { body: { text: 'ok' } }]);
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' });
  const text = await Z.transcribe({ provider: 'openai', key: 'sk-x', file, filename: 'a.ogg', fetchFn: f });
  assert.equal(text, 'Olá, tudo bem?');
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer sk-x');
  assert.ok(!('content-type' in f.calls[0].init.headers), 'o navegador define o boundary');
  const fd = f.calls[0].body;
  assert.equal(fd.get('model'), 'gpt-4o-mini-transcribe');
  assert.equal(fd.get('language'), 'pt');
  assert.equal(fd.get('file').name, 'a.ogg');
  await Z.transcribe({ provider: 'groq', key: 'gsk', file, fetchFn: f });
  assert.equal(f.calls[1].url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(f.calls[1].body.get('model'), 'whisper-large-v3-turbo');
  await assert.rejects(Z.transcribe({ provider: 'openai', key: '', file }), (e) => e.kind === 'auth');
});

await t('parseJsonLoose', () => {
  assert.deepEqual(Z.parseJsonLoose('texto antes {"a":1} depois'), { a: 1 });
  assert.equal(Z.parseJsonLoose('nada'), null);
});

await t('resolveRuntime: chave, modelos padrão e a chave de voz reaproveitada', () => {
  const a = Z.resolveRuntime({ provider: 'anthropic', anthropic_key: ' sk-ant ', openai_key: 'sk-o', mode: 'copilot' });
  assert.deepEqual([a.key, a.modelChat, a.modelFast, a.ready, a.mode], ['sk-ant', 'claude-sonnet-5-5', 'claude-haiku-5-5', true, 'copilot']);
  assert.deepEqual(a.stt, { provider: 'openai', key: 'sk-o', model: 'gpt-4o-mini-transcribe' }, 'voz reaproveita a chave da OpenAI mesmo com Claude');
  const b = Z.resolveRuntime({ provider: 'openai', openai_key: 'sk-o', stt_provider: 'groq', stt_key: 'gsk', stt_model: 'whisper-large-v3' });
  assert.deepEqual([b.modelChat, b.stt.provider, b.stt.key, b.stt.model, b.sttReady], ['gpt-4.1', 'groq', 'gsk', 'whisper-large-v3', true]);
  const c = Z.resolveRuntime({ provider: 'anthropic', stt_provider: 'groq', openai_key: 'sk-o' });
  assert.equal(c.sttReady, false, 'Groq não usa a chave da OpenAI');
  assert.equal(c.ready, false);
  assert.equal(Z.resolveRuntime(null).mode, 'off');
  assert.equal(Z.resolveRuntime({ mode: 'robo' }).mode, 'off');
});

await t('libraryFromRows / stagesFromRows / catalogFromRows (mesma saída para painel e extensão)', () => {
  const lib = Z.libraryFromRows({
    messages: [{ id: 1, title: 'Preço', content: 'R$ 150', is_favorite: true, ai_when_to_use: 'preço', ai_tags: ['x'] }],
    media: [{ id: 2, title: 'Oi', type: 'audio', ai_transcript: 'olá', ai_summary: 's' }, { id: 3, title: 'Estranho', type: 'sticker' }],
    funnels: [{ id: 4, title: 'Funil', description: 'd', funnel_items: [{ id: 2, position: 1, type: 'audio', item_id: 2 }, { id: 1, position: 0, type: 'message', item_id: 1 }] }],
  });
  assert.deepEqual(lib.map((i) => i.ref), ['msg:1', 'aud:2', 'fun:4'], 'tipo desconhecido é ignorado');
  assert.equal(lib[2].steps, 'texto “Preço” → áudio “Oi”', 'passos na ordem, com os títulos');
  assert.equal(Z.libraryFromRows({ funnels: [{ id: 9, title: 'F', items: [{ id: 1, position: 0, type: 'midia', item_id: 77 }] }] })[0].steps, 'mídia “?”');
  const st = Z.stagesFromRows([{ id: 1, title: 'Vendas' }], [{ id: 11, board_id: 1, title: 'B', position: 1 }, { id: 10, board_id: 1, title: 'A', position: 0, outcome: 'won' }, { id: 12, board_id: 99, title: 'órfã', position: 0 }]);
  assert.deepEqual(st.map((s) => s.title + '|' + s.board + '|' + s.outcome), ['A|Vendas|won', 'B|Vendas|null']);
  assert.deepEqual(Z.tagsFromRows([{ id: 1, name: 'VIP' }, { id: 2, name: 'Fora', is_blocking: true }]), [{ id: 1, name: 'VIP', blocking: false }, { id: 2, name: 'Fora', blocking: true }]);
  const cat = Z.catalogFromRows([
    { name: 'Massagem', kind: 'service', price: 220, price_mode: 'fixed', duration_min: 90, is_active: true },
    { name: 'Plano', kind: 'service', price: 99.9, price_mode: 'from', is_active: true },
    { name: 'Sob medida', kind: 'product', price: 0, price_mode: 'quote' },
    { name: 'Arquivado', kind: 'product', price: 1, price_mode: 'fixed', is_active: false },
  ]);
  assert.deepEqual(cat.map((c) => c.name), ['Massagem', 'Plano', 'Sob medida']);
  assert.match(cat[0].priceLabel, /^R\$\s?220$/);
  assert.equal(cat[0].duration, '1 h 30 min');
  assert.match(cat[1].priceLabel, /^a partir de R\$\s?99,90$/);
  assert.equal(cat[2].priceLabel, 'Sob consulta');
  assert.deepEqual(Z.catalogFromRows(null), []);
});

await t('limite de velocidade (429): espera o que o fornecedor pede e tenta de novo', async () => {
  const TPM = { error: { message: 'Rate limit reached for gpt-4.1 in organization org-x on tokens per min (TPM): Limit 30000, Used 29870, Requested 1500. Please try again in 40ms. Visit https://platform.openai.com/account/rate-limits', type: 'tokens', code: 'rate_limit_exceeded' } };
  const f = mockFetch([{ status: 429, body: TPM }, { status: 429, body: TPM }, { body: { ok: 1 } }]);
  const t0 = Date.now();
  const res = await Z.request(f, 'https://api.openai.com/v1/chat/completions', { method: 'POST' }, { label: 'a OpenAI' });
  assert.equal((await res.json()).ok, 1);
  assert.equal(f.calls.length, 3, 'insistiu até passar');
  assert.ok(Date.now() - t0 >= 80, 'esperou o tempo pedido');
});

await t('limite de velocidade (429): mensagem diz qual limite e quanto esperar', async () => {
  const body = { error: { message: 'Rate limit reached for gpt-4.1 in organization org-x on tokens per min (TPM): Limit 30000, Used 29870, Requested 1500. Please try again in 2m10s.', code: 'rate_limit_exceeded' } };
  const f = mockFetch([{ status: 429, body }]);
  const e = await Z.request(f, 'https://api.openai.com/v1/x', { method: 'POST' }, { label: 'a OpenAI' }).then(() => null, (x) => x);
  assert.equal(e.kind, 'rate');
  assert.equal(e.waitMs, 130000, 'leu "2m10s" do corpo');
  assert.equal(f.calls.length, 1, 'espera longa demais: devolve o erro na hora para quem chamou decidir');
  assert.match(e.message, /Limite de velocidade da sua conta na OpenAI \(30\.000 tokens por minuto no modelo gpt-4\.1\)/);
  const r = mockFetch([{ status: 429, body: { error: { message: 'Rate limit reached for whisper-1 on requests per min (RPM): Limit 3, Used 3, Requested 1.' } } }]);
  const e2 = await Z.request(r, 'https://api.openai.com/v1/x', {}, { label: 'a OpenAI', rateRetries: 0 }).then(() => null, (x) => x);
  assert.match(e2.message, /\(3 chamadas por minuto no modelo whisper-1\)/);
});

await t('limite DIÁRIO (429 RPD) não adianta insistir: vira erro da conta', async () => {
  const f = mockFetch([{ status: 429, body: { error: { message: 'Rate limit reached for gpt-4.1-mini in organization org-x on requests per day (RPD): Limit 200, Used 200, Requested 1.' } } }]);
  const e = await Z.request(f, 'https://api.openai.com/v1/x', {}, { label: 'a OpenAI' }).then(() => null, (x) => x);
  assert.equal(e.kind, 'quota'); assert.equal(e.daily, true);
  assert.equal(f.calls.length, 1);
  assert.match(e.message, /limite DIÁRIO.*gpt-4\.1-mini/);
});

await t('limite: cabeçalhos retry-after e x-ratelimit-reset e cancelamento durante a espera', async () => {
  const f = mockFetch([{ status: 429, body: { error: { message: 'slow down' } }, headers: { 'retry-after': '1' } }, { body: { ok: 1 } }]);
  const t0 = Date.now();
  await Z.request(f, 'https://x/y', {}, {});
  assert.ok(Date.now() - t0 >= 1000, 'respeitou retry-after: 1');
  const g = mockFetch([{ status: 429, body: { error: { message: 'x' } }, headers: { 'x-ratelimit-reset-tokens': '6m0s' } }]);
  const e = await Z.request(g, 'https://x/y', {}, {}).then(() => null, (x) => x);
  assert.equal(e.waitMs, 360000, 'leu "6m0s" do cabeçalho');
  const ctl = new AbortController();
  const h = mockFetch([{ status: 429, body: { error: { message: 'Please try again in 20s.' } } }]);
  setTimeout(() => ctl.abort(), 50);
  const t1 = Date.now();
  const ab = await Z.request(h, 'https://x/y', {}, { signal: ctl.signal }).then(() => null, (x) => x);
  assert.equal(ab.kind, 'abort'); assert.ok(Date.now() - t1 < 2000, 'Parar interrompe a espera na hora');
});

await t('piloto automático: configuração é normalizada e limitada', () => {
  const d = Z.normalizeAuto(null);
  assert.equal(d.max_per_hour, 20); assert.equal(d.outside, 'suggest'); assert.deepEqual(d.hours.days, [1, 2, 3, 4, 5, 6]);
  assert.ok(d.handoff_words.includes('cancelar'));
  const a = Z.normalizeAuto({ max_per_hour: 99999, max_per_lead_day: -5, delay_min_s: 90, delay_max_s: 10, pause_owner_min: 1, outside: 'x', hours: { start: '25:00', end: '9:5', days: [1, 1, 9, 'a', 3] }, skip_stage_ids: ['4', 4, 0, 'x'], handoff_words: ['  Preço  ', '', 'preço'], allow_tasks: false });
  assert.equal(a.max_per_hour, 200); assert.equal(a.max_per_lead_day, 1); assert.equal(a.pause_owner_min, 5);
  assert.equal(a.delay_min_s, 90); assert.equal(a.delay_max_s, 90, 'máximo nunca menor que o mínimo');
  assert.equal(a.outside, 'suggest'); assert.equal(a.hours.start, '08:00', 'hora inválida volta ao padrão'); assert.equal(a.hours.end, '20:00');
  assert.deepEqual(a.hours.days, [1, 3]); assert.deepEqual(a.skip_stage_ids, [4]);
  assert.equal(a.allow_tasks, false); assert.equal(a.allow_classify, true);
  assert.deepEqual(a.handoff_words, ['Preço', 'preço']);
  assert.deepEqual(Z.normalizeAuto({ hours: { days: [] } }).hours.days, [], 'nenhum dia marcado = nunca no horário');
});

await t('piloto automático: horário de atendimento', () => {
  const at = (iso) => new Date(iso); // datas locais, sem fuso
  const A = { hours: { enabled: true, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' } };
  assert.equal(Z.inAutoHours(A, at('2026-11-16T10:00:00')), true, 'segunda 10h');
  assert.equal(Z.inAutoHours(A, at('2026-11-16T08:59:00')), false);
  assert.equal(Z.inAutoHours(A, at('2026-11-16T18:00:00')), false, 'o fim não conta');
  assert.equal(Z.inAutoHours(A, at('2026-11-15T10:00:00')), false, 'domingo');
  assert.equal(Z.inAutoHours({ hours: { enabled: false } }, at('2026-11-15T03:00:00')), true, 'sem restrição de horário');
  const N = { hours: { enabled: true, days: [5], start: '22:00', end: '06:00' } }; // sexta à noite até sábado de manhã
  assert.equal(Z.inAutoHours(N, at('2026-11-20T23:00:00')), true, 'sexta 23h');
  assert.equal(Z.inAutoHours(N, at('2026-11-21T05:00:00')), true, 'sábado 5h ainda é a janela de sexta');
  assert.equal(Z.inAutoHours(N, at('2026-11-21T23:00:00')), false, 'sábado 23h não');
  assert.equal(Z.inAutoHours(N, at('2026-11-20T05:00:00')), false, 'sexta 5h é a janela de quinta');
  assert.equal(Z.inAutoHours({ hours: { enabled: true, days: [2], start: '00:00', end: '00:00' } }, at('2026-11-17T15:00:00')), true, 'início = fim: dia inteiro');
});

await t('piloto automático: palavras que chamam o dono e espera humana', () => {
  assert.equal(Z.handoffWordHit(null, 'Quero CANCELAR meu pedido'), 'cancelar');
  assert.equal(Z.handoffWordHit(null, 'vou fazer uma reclamacao no procon'), 'reclamação', 'sem acento e com a palavra inteira');
  assert.equal(Z.handoffWordHit(null, 'quero falar   com  um   atendente humano'), 'atendente humano', 'espaços extras não atrapalham');
  assert.equal(Z.handoffWordHit(null, 'quero falar com uma pessoa'), 'falar com uma pessoa');
  assert.equal(Z.handoffWordHit(null, 'descancelar?'), null, 'não casa no meio de outra palavra');
  assert.equal(Z.handoffWordHit({ handoff_words: [] }, 'cancelar'), null, 'lista vazia desliga');
  assert.equal(Z.pickDelayMs({ delay_min_s: 10, delay_max_s: 30 }, 0), 10000);
  assert.equal(Z.pickDelayMs({ delay_min_s: 10, delay_max_s: 30 }, 1), 30000);
  assert.equal(Z.pickDelayMs({ delay_min_s: 10, delay_max_s: 30 }, 0.5), 20000);
});

await t('piloto automático: decisão (todas as travas)', () => {
  const now = new Date('2026-11-16T10:00:00'); // segunda
  const T = now.getTime();
  const cl = (body, ago = 60000) => ({ from_me: false, body, t: T - ago });
  const base = () => ({ auto: {}, now, chatId: '5511999990000@c.us', lead: { tag_ids: [], column_ids: [] }, history: [cl('oi, quanto custa?')], counts: { hour: 0, leadDay: 0 } });
  const code = (ctx) => { const r = Z.autoDecision(ctx); return r.ok ? 'ok' : r.code + ':' + r.action; };
  assert.equal(code(base()), 'ok');
  let c = base(); c.chatId = '123@g.us'; assert.equal(code(c), 'chat_type:skip', 'grupo nunca');
  c = base(); c.chatId = 'status@broadcast'; assert.equal(code(c), 'chat_type:skip');
  c = base(); c.chatId = '999@lid'; assert.equal(code(c), 'ok', 'lid vale');
  c = base(); c.history = []; assert.equal(code(c), 'no_messages:skip');
  c = base(); c.history = [cl('oi'), { from_me: true, by_zapflow: true, body: 'oi!', t: T - 5000 }]; assert.equal(code(c), 'last_from_me:skip');
  c = base(); c.lead.paused_until = new Date(T + 3600000).toISOString(); assert.equal(code(c), 'lead_paused:skip');
  c = base(); c.lead.paused_until = new Date(T - 1000).toISOString(); assert.equal(code(c), 'ok', 'pausa vencida');
  c = base(); c.auto = { skip_tag_ids: [7] }; c.lead.tag_ids = [3, 7]; assert.equal(code(c), 'tag:skip');
  c = base(); c.auto = { skip_stage_ids: [20] }; c.lead.column_ids = [20]; assert.equal(code(c), 'stage:skip');
  c = base(); c.history = [{ from_me: true, by_zapflow: false, body: 'já te falo', t: T - 30 * 60000 }, cl('ok')]; assert.equal(code(c), 'owner_active:skip');
  c = base(); c.history = [{ from_me: true, by_zapflow: true, body: 'agente', t: T - 30 * 60000 }, cl('ok')]; assert.equal(code(c), 'ok');
  c = base(); c.history = [{ from_me: true, by_zapflow: false, body: 'antigo', t: T - 3 * 3600000 }, cl('ok')]; assert.equal(code(c), 'ok');
  c = base(); c.triggerReplyAt = T - 60000; assert.equal(code(c), 'trigger:skip');
  c = base(); c.triggerReplyAt = T - 10 * 60000; assert.equal(code(c), 'ok');
  c = base(); c.history = [cl('quero cancelar', 90000), cl('???', 30000)]; assert.equal(Z.autoDecision(c).word, 'cancelar'); assert.equal(code(c), 'handoff_word:handoff');
  c = base(); c.history = [cl('quero cancelar', 90000), { from_me: true, by_zapflow: true, body: 'vou ver', t: T - 80000 }, cl('obrigado', 5000)]; assert.equal(code(c), 'ok', 'palavra já respondida não vale');
  c = base(); c.counts = { hour: 20, leadDay: 0 }; assert.equal(code(c), 'hour_cap:skip');
  c = base(); c.counts = { hour: 0, leadDay: 10 }; assert.equal(code(c), 'lead_cap:skip');
  c = base(); c.counts = { hour: 3, leadDay: 9 }; assert.equal(code(c), 'ok');
  c = base(); c.now = new Date('2026-11-15T10:00:00'); assert.equal(code(c), 'hours:suggest', 'domingo fora do horário: deixa sugestão');
  c = base(); c.now = new Date('2026-11-16T22:00:00'); c.auto = { outside: 'silent' }; assert.equal(code(c), 'hours:skip');
  c = base(); c.now = new Date('2026-11-15T10:00:00'); c.lead.paused_until = new Date(c.now.getTime() + 1000).toISOString(); assert.equal(code(c), 'lead_paused:skip');
});

await t('piloto automático: o que pode ser aplicado sozinho', () => {
  const types = ['send_text', 'send_item', 'handoff', 'add_note', 'suggest_item', 'set_temperature', 'move_stage', 'add_tag', 'create_task'];
  assert.deepEqual(types.filter((x) => Z.autoAllows({}, { type: x })), types, 'padrão: tudo');
  const off = types.filter((x) => Z.autoAllows({ allow_classify: false, allow_tasks: false }, { type: x }));
  assert.deepEqual(off, ['send_text', 'send_item', 'handoff', 'add_note', 'suggest_item']);
  assert.equal(Z.autoAllows({}, { type: 'qualquer_outra' }), false, 'ação desconhecida nunca');
});

await t('piloto automático: prompt e limite de envios', async () => {
  const env = { library, now: new Date('2026-11-16T10:00:00'), profile: { business_name: 'Clínica Bem-Estar' } };
  const normal = Z.buildSystem(env).map((b) => b.text).join('\n');
  assert.ok(!normal.includes('MODO AUTOMÁTICO'), 'copiloto não recebe as regras do automático');
  const auto = Z.buildSystem(Object.assign({}, env, { auto: true, maxSends: 3 })).map((b) => b.text).join('\n');
  assert.ok(auto.includes('MODO AUTOMÁTICO') && auto.includes('na dúvida NÃO responda') && auto.includes('assistente virtual de Clínica Bem-Estar') && auto.includes('No máximo 3 mensagens'));
  const tools = Z.makeAgentTools(Object.assign({}, env, { maxSends: 2, stages: [], tags: [] }));
  const send = tools.find((x) => x.name === 'enviar_texto');
  assert.equal(send.run({ texto: 'um' }).action.type, 'send_text');
  assert.equal(send.run({ texto: 'dois' }).action.type, 'send_text');
  const third = send.run({ texto: 'três' });
  assert.ok(third.isError && /Limite/.test(third.content), 'o terceiro envio é recusado');
});

/* ---------- gerente (Fase 4) ---------- */
const MNOW = new Date('2026-11-17T09:00:00');
const mdays = (d) => new Date(MNOW.getTime() - d * 86400000).toISOString();
const MROWS = () => ({
  now: MNOW,
  boards: [{ id: 1, title: 'Vendas' }],
  columns: [{ id: 10, board_id: 1, title: 'Novo', position: 0 }, { id: 11, board_id: 1, title: 'Negociação', position: 1 }, { id: 12, board_id: 1, title: 'Ganho', position: 2, outcome: 'won' }],
  tags: [{ id: 1, name: 'VIP' }, { id: 2, name: 'Fora', is_blocking: true }],
  leads: [
    { id: 1, name: 'Ana', status: 'hot', wa_id: 'a@c.us', phone: '5511', created_at: mdays(10), last_contact_at: mdays(4), last_message: 'quanto fica?', notes: 'quer 2 sessões', lead_tags: [{ tag_id: 1 }], kanban_cards: [{ column_id: 11, value: 400 }] },
    { id: 2, name: 'Bruno', status: 'warm', wa_id: 'b@c.us', created_at: mdays(20), last_contact_at: mdays(6), lead_tags: [], kanban_cards: [{ column_id: 10, value: 0 }] },
    { id: 3, name: 'Carla', status: 'cold', wa_id: 'c@c.us', created_at: mdays(30), last_contact_at: mdays(3), lead_tags: [], kanban_cards: [] },
    { id: 4, name: 'Diego (ganho)', status: 'hot', wa_id: 'd@c.us', created_at: mdays(30), last_contact_at: mdays(8), lead_tags: [], kanban_cards: [{ column_id: 12, value: 900 }] },
    { id: 5, name: 'Tia (Fora)', status: 'warm', wa_id: 'e@c.us', created_at: mdays(30), last_contact_at: mdays(8), lead_tags: [{ tag_id: 2 }], kanban_cards: [] },
    { id: 6, name: 'Sem WhatsApp', status: 'hot', created_at: mdays(30), last_contact_at: mdays(8), lead_tags: [], kanban_cards: [] },
    { id: 7, name: 'Já agendado', status: 'hot', wa_id: 'g@c.us', created_at: mdays(30), last_contact_at: mdays(8), lead_tags: [], kanban_cards: [] },
    { id: 8, name: 'Recente', status: 'hot', wa_id: 'h@c.us', created_at: mdays(0.2), last_contact_at: mdays(0.1), lead_tags: [], kanban_cards: [{ column_id: 10, value: 0 }] },
    { id: 9, name: 'Muito antigo', status: 'warm', wa_id: 'i@c.us', created_at: mdays(200), last_contact_at: mdays(150), lead_tags: [], kanban_cards: [] },
  ],
  tasks: [
    { lead_id: 7, kind: 'send', status: 'scheduled', due_at: mdays(-1), title: 'Retomar' },
    { lead_id: 1, kind: 'reminder', status: 'scheduled', due_at: mdays(1), title: 'Ligar para a Ana' },
    { lead_id: 2, kind: 'reminder', status: 'scheduled', due_at: mdays(-0.1), title: 'Assumir conversa: pediu desconto' },
  ],
  runs: [
    { source: 'auto', created_at: mdays(1), actions: [{ type: 'send_text', applied: true }], feedback: 1 },
    { source: 'auto', created_at: mdays(2), actions: [{ type: 'handoff', applied: true }] },
    { source: 'copilot', created_at: mdays(1), actions: [], feedback: -1 },
    { source: 'auto', created_at: mdays(30), actions: [{ type: 'send_text', applied: true }] },
  ],
  moves: [{ to_column_id: 12, value: 900, at: mdays(2) }, { to_column_id: 12, value: 500, at: mdays(20) }],
  suggestions: [{ title: 'Formas de pagamento', times: 3, status: 'pending' }, { title: 'Velho', status: 'dismissed' }],
  library: { itens: 12, nao_lidos: 2 },
});

await t('gerente: leads parados (quem entra e quem fica de fora)', () => {
  const s = Z.staleLeads(MROWS(), { days: 3 });
  assert.deepEqual(s.map((l) => l.id), [1, 2, 3], 'quente primeiro; ganho, ignorado, sem WhatsApp, já agendado, recente e antigo demais ficam fora');
  assert.equal(s[0].stage, 'Vendas › Negociação'); assert.equal(s[0].days, 4); assert.deepEqual(s[0].tags, ['VIP']);
  assert.deepEqual(Z.staleLeads(MROWS(), { days: 5 }).map((l) => l.id), [2], 'prazo maior: só quem está há 5+ dias');
  assert.deepEqual(Z.staleLeads(MROWS(), { days: 3, maxDays: 200 }).map((l) => l.id), [1, 2, 9, 3], 'mornos juntos, o mais recente primeiro');
  assert.equal(Z.staleLeads(MROWS(), { days: 3, limit: 1 }).length, 1);
});

await t('gerente: fotografia da operação', () => {
  const snap = Z.buildManagerSnapshot(MROWS());
  assert.equal(snap.totais.leads, 8, 'lead com etiqueta de ignorar não conta');
  assert.equal(snap.totais.novos_24h, 1); assert.equal(snap.totais.quentes, 5);
  assert.deepEqual(snap.resultados_7d, { vendas: 1, valor_vendido: snap.resultados_7d.valor_vendido, perdidos: 0 });
  assert.match(snap.resultados_7d.valor_vendido, /900/);
  assert.equal(snap.tarefas.atrasadas, 1); assert.equal(snap.tarefas.assumir_conversa, 1);
  assert.deepEqual(snap.agente_7d, { respostas_automaticas: 1, analises_copiloto: 1, chamou_o_dono: 1, aprovadas_pelo_dono: 1, reprovadas_pelo_dono: 1 });
  assert.deepEqual(snap.biblioteca.sugestoes_pendentes, ['Formas de pagamento (3x)']);
  assert.ok(snap.etapas.some((e) => e.etapa === 'Vendas › Negociação' && e.leads === 1 && e.quentes === 1));
  const refs = snap.leads_em_destaque.map((l) => l.ref);
  assert.ok(!refs.includes('L4') && !refs.includes('L5'), 'ganho e ignorado fora dos destaques');
  assert.ok(refs.indexOf('L1') < refs.indexOf('L3'), 'quente vem antes de frio');
  assert.ok(!JSON.stringify(snap).includes('5511'), 'telefone nunca vai na fotografia');
  assert.match(snap.leads_em_destaque.find((l) => l.ref === 'L1').tarefa_aberta, /Ligar para a Ana .ATRASADA./);
});

const anth = (text) => ({ body: { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 900, output_tokens: 200 } } });

await t('gerente: resumo do dia valida o que a IA devolve', async () => {
  const snap = Z.buildManagerSnapshot(MROWS());
  const f = mockFetch([anth('```json\n' + JSON.stringify({
    titulo: 'Dia de fechar a Ana', resumo: 'Operação estável.',
    prioridades: [{ lead: 'L1', motivo: 'pediu preço', acao: 'mandar a tabela' }, { lead: 'L999', motivo: 'inventado', acao: 'x' }, { lead: 'l1', motivo: 'repetido', acao: 'y' }, { lead: 'L2', motivo: 'tarefa atrasada', acao: 'assumir a conversa' }],
    alertas: ['1 tarefa atrasada', '', 'b', 'c', 'd', 'e'], oportunidades: 'não é lista', recomendacoes: [{ texto: 'Criar texto de pagamento', tipo: 'biblioteca' }, { texto: 'x', tipo: 'qualquer' }],
  }) + '\n```')]);
  const b = await Z.runBriefing({ provider: 'anthropic', key: 'k', model: 'claude-sonnet-5-5', snapshot: snap, profile: { business_name: 'Spa Zen' }, fetchFn: f });
  assert.equal(b.titulo, 'Dia de fechar a Ana');
  assert.deepEqual(b.prioridades.map((p) => p.lead_id), [1, 2], 'lead inventado e repetido saem');
  assert.equal(b.prioridades[0].nome, 'Ana');
  assert.equal(b.alertas.length, 4); assert.deepEqual(b.oportunidades, []);
  assert.equal(b.recomendacoes[1].tipo, 'processo', 'tipo desconhecido vira processo');
  const sent = f.calls[0].body;
  assert.match(sent.system[0].text, /gerente comercial de Spa Zen/);
  assert.match(sent.messages[0].content[0].text, /TAREFA: RESUMO DO DIA/);
  const bad = mockFetch([anth('não sei')]);
  await assert.rejects(Z.runBriefing({ provider: 'anthropic', key: 'k', model: 'm', snapshot: snap, fetchFn: bad }), /resumo legível/);
});

await t('gerente: mensagens de retomada (uma por lead, sem inventar lead)', async () => {
  const leads = Z.staleLeads(MROWS(), { days: 3 }).map((l) => Object.assign(l, { history: l.id === 1 ? [{ from_me: false, body: 'quanto fica 2 sessões?', at: mdays(4) }, { from_me: true, body: 'Te mando já', at: mdays(4) }] : [] }));
  const f = mockFetch([anth(JSON.stringify({ mensagens: [
    { lead: 'L1', texto: 'Oi {nome}! Conseguiu ver os valores das 2 sessões?', motivo: 'retoma o preço' },
    { lead: 'L2', texto: '   ', motivo: 'vazio' },
    { lead: 'L77', texto: 'inventado' },
    { lead: 'L1', texto: 'repetida' },
    { lead: 'L3', texto: 'Oi {nome}, ainda posso te ajudar?' },
  ] }))]);
  const r = await Z.writeFollowups({ provider: 'anthropic', key: 'k', model: 'm', leads, profile: { rules: 'Nunca dar desconto', persona_name: 'Clara' }, fetchFn: f });
  assert.deepEqual(r.mensagens.map((m) => m.lead_id), [1, 3]);
  assert.equal(r.mensagens[0].texto, 'Oi {nome}! Conseguiu ver os valores das 2 sessões?');
  const prompt = f.calls[0].body.messages[0].content[0].text;
  assert.match(prompt, /NUNCA invente preço/); assert.match(prompt, /Nunca dar desconto/);
  assert.match(prompt, /CLIENTE: quanto fica 2 sessões\?/, 'a conversa vai junto');
  assert.ok(!prompt.includes('a@c.us') && !prompt.includes('5511'), 'nem conversa do WhatsApp nem telefone vão para a IA');
  assert.deepEqual((await Z.writeFollowups({ provider: 'anthropic', key: 'k', model: 'm', leads: [] })).mensagens, [], 'sem leads: nem chama a IA');
});

await t('gerente: funil proposto só com itens que existem', async () => {
  const lib = Z.libraryFromRows({
    messages: [{ id: 1, title: 'Oi' }, { id: 2, title: 'Preço' }],
    media: [{ id: 5, title: 'Áudio boas-vindas', type: 'audio' }, { id: 6, title: 'Antes e depois', type: 'image' }],
    funnels: [{ id: 9, title: 'Outro funil', items: [] }],
  });
  const f = mockFetch([anth(JSON.stringify({ titulo: 'Reengajar', descricao: 'Para quem pediu preço e sumiu', passos: [
    { ref: 'aud:5', espera_min: 30, motivo: 'conexão' }, { ref: 'fun:9', espera_min: 5 }, { ref: 'msg:99', espera_min: 5 }, { ref: 'img:6', espera_min: 'x' }, { ref: 'aud:5', espera_min: 1 }, { ref: 'msg:2', espera_min: 999999 },
  ] }))]);
  const r = await Z.proposeFunnel({ provider: 'anthropic', key: 'k', model: 'm', library: lib, goal: 'reengajar', fetchFn: f });
  assert.deepEqual(r.passos.map((p) => p.ref), ['aud:5', 'img:6', 'msg:2'], 'funil, item inexistente e repetido saem');
  assert.deepEqual(r.passos.map((p) => p.type), ['audio', 'midia', 'message'], 'tipos do funil');
  assert.deepEqual(r.passos.map((p) => p.delay_minutes), [0, 1, 10080], 'primeiro sem espera; espera inválida = 1 min; máx. 7 dias');
  assert.ok(!f.calls[0].body.messages[0].content[0].text.includes('fun:9'), 'funis não entram no cardápio do funil');
  const one = mockFetch([anth(JSON.stringify({ titulo: 'x', passos: [{ ref: 'aud:5' }] }))]);
  await assert.rejects(Z.proposeFunnel({ provider: 'anthropic', key: 'k', model: 'm', library: lib, fetchFn: one }), /não conseguiu montar/);
  await assert.rejects(Z.proposeFunnel({ provider: 'anthropic', key: 'k', model: 'm', library: lib.slice(0, 1) }), /pelo menos 2 itens/);
});

await t('cópia da extensão idêntica à fonte (quando existir)', () => {
  const ext = path.resolve(here, '../../../../extension/zf_ai.js');
  if (!fs.existsSync(ext)) return;
  assert.equal(fs.readFileSync(ext, 'utf8').replace(/\r\n/g, '\n'), fs.readFileSync(path.join(here, 'zf-ai.js'), 'utf8').replace(/\r\n/g, '\n'), 'extension/zf_ai.js diferente de src/lib/ai/zf-ai.js');
});

console.log(fails.length ? 'FALHAS:\n - ' + fails.join('\n - ') : '');
console.log(`zf-ai: ${pass} ok, ${fails.length} falha(s)`);
process.exit(fails.length ? 1 : 0);
