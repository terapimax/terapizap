const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const extension = path.join(__dirname, '../../extension');
const engine = fs.readFileSync(path.join(extension, 'wa_engine.js'), 'utf8');

async function exerciseStartup(t, renamedExports) {
  const errors = [];
  const modules = Object.fromEntries(['WAWebUserPrefsIsLoggedIn', 'WAWebMsgKey', 'WAWebChatCollection',
    'WAWebMsgCollection', 'WAWebContactModel'].map(name => [name, { factory() {} }]));
  let chatVisible = false;
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, debug() {}, error: (message) => errors.push(String(message)) },
    location: { href: 'https://web.whatsapp.com/', hostname: 'web.whatsapp.com' },
    document: { querySelector: () => chatVisible ? {} : null, addEventListener() {} },
    navigator: { userAgent: 'Chrome' }, localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {}, URL, TextEncoder, TextDecoder, Blob,
    __d() {}, require: () => ({ modulesMap: modules }),
    importNamespace: (id) => modules[id]?.exports, ErrorGuard: { skipGuardGlobal() {} },
    WPPConfig: { disableGoogleAnalytics: true }
  };
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  Object.assign(sandbox, { window: sandbox, self: sandbox, Date, setTimeout, clearTimeout, setInterval, clearInterval });
  vm.runInNewContext(fs.readFileSync(path.join(extension, 'wppconnect-wa.js'), 'utf8'), sandbox, { filename: 'wppconnect-wa.js' });
  async function advance(ms) {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      t.mock.timers.tick(100);
      await new Promise(setImmediate);
    }
  }
  await advance(1500);
  assert.equal(sandbox.WPP.isInjected, false, 'o QR não precisa do motor de disparos');
  chatVisible = true;
  await advance(2500);
  assert.equal(sandbox.WPP.isInjected, false, 'abrir a interface ainda não garante MsgKey ou ChatStore');
  assert.deepEqual(errors, []);
  assert.match(sandbox.WPP.loader.zapflowWaitingFor, /MsgKey/);

  // Mesmos IDs no registro. Os módulos recebem suas implementações em etapas.
  class MsgKey {
    constructor(value) { if (!value) throw new Error('MsgKey error: obj is null/undefined'); }
  }
  class NamedMsgKey {
    static fromString() {}
    equals(key) { return key === this; }
  }
  class MsgCollection { on() {} }
  class ContactModel {}
  ContactModel.prototype.proxyName = 'Contact';
  modules.WAWebMsgKey.exports = { default: renamedExports ? NamedMsgKey : MsgKey };
  modules.WAWebUserPrefsIsLoggedIn.exports = renamedExports ? { isAuthenticated: () => true } : { isLoggedIn: () => true };
  modules.WAWebChatCollection.exports = { ChatCollection: { get() {} } };
  modules.WAWebMsgCollection.exports = { MsgCollectionImpl: MsgCollection, MsgCollection: new MsgCollection() };
  await advance(4500);
  assert.equal(sandbox.WPP.isInjected, false);
  assert.equal(sandbox.WPP.loader.zapflowWaitingFor, 'os contatos (ContactModel)');
  assert.deepEqual(errors, []);
  modules.WAWebContactModel.exports = { default: ContactModel };
  for (let i = 0; i < 60 && !sandbox.WPP.isInjected; i++) await advance(100);
  assert.equal(sandbox.WPP.isInjected, true, 'a extensão deve iniciar sem pedir para atualizar a página');
  assert.equal(sandbox.WPP.loader.zapflowWaitingFor, null);
}

test('o pacote distribuído aguarda os módulos de uma abertura lenta do WhatsApp', t => exerciseStartup(t, false));
test('o pacote reconhece a chave e a autenticação pelo módulo nativo quando a assinatura muda', t => exerciseStartup(t, true));

function openEngine(t) {
  const replies = [];
  const timers = [];
  const sent = [];
  let listener;
  const chat = { id: { _serialized: '123@lid' }, name: 'Teste' };
  const WPP = {
    isReady: true, version: 'test', on() {},
    whatsapp: { MsgKey: class MsgKey {}, ChatStore: { get: () => chat }, MsgStore: { on() {} } },
    conn: { isAuthenticated: () => true, getMyUserLid: () => ({ server: 'lid' }) },
    chat: {
      get: () => chat, getActiveChat: () => chat,
      sendTextMessage: async (...args) => { sent.push(args); return { id: 'text', ack: 1 }; },
      sendFileMessage: async (...args) => { sent.push(args); return { id: 'file', ack: 1 }; },
      markIsPaused: async () => {},
    },
  };
  const window = { WPP, addEventListener: (_event, fn) => { listener = fn; }, postMessage: (msg) => replies.push(msg) };
  const setTimer = (fn, ms) => { const timer = setTimeout(fn, ms); timers.push(timer); return timer; };
  vm.runInNewContext(engine, { window, WPP, document: { querySelector: () => ({}) }, setTimeout: setTimer, console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, setItem() {} } });
  t.after(() => timers.forEach(clearTimeout));
  let id = 0;
  async function request(type, fields = {}) {
    const requestId = String(++id);
    await listener({ source: window, data: { type, requestId, ...fields } });
    await new Promise(setImmediate);
    return replies.find((r) => r.type === 'ZF_ENGINE_RESULT' && r.requestId === requestId);
  }
  return { WPP, request, sent };
}

test('o pacote usa o LID real da conta nos dois formatos de WhatsApp', () => {
  const source = fs.readFileSync(path.join(extension, 'wppconnect-wa.js'), 'utf8');
  const getter = source.match(/t\.getMyUserLid=(function\(\)\{.*?\});const n=r\(/s)[1];
  const own = { server: 'lid', user: 'self' };
  for (const method of ['getMeLidUserOrThrow', 'getMaybeMeLidUser', 'getMaybeMeLid']) {
    const read = vm.runInNewContext('(' + getter + ')', { n: { UserPrefs: { [method]: () => own } } });
    assert.equal(read(), own);
  }
  const noLid = vm.runInNewContext('(' + getter + ')', { n: { UserPrefs: { getMaybeMeLidUser: () => ({ server: 'c.us' }) } } });
  assert.throws(noLid);
  const myPhone = { server: 'c.us', user: 'self' };
  const fromOwnAccount = vm.runInNewContext('(' + getter + ')', {
    n: { UserPrefs: {} },
    WPP: { conn: { getMyUserId: () => myPhone }, whatsapp: { lidPnCache: { getCurrentLid: pn => pn === myPhone ? own : null } } },
  });
  assert.equal(fromOwnAccount(), own);
});

test('motor carregado ainda precisa de uma sessão do WhatsApp', async (t) => {
  const { WPP, request } = openEngine(t);
  WPP.conn.isAuthenticated = () => false;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, false);
  WPP.conn.isAuthenticated = () => true;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, true);
});

test('o painel aguarda a chave de mensagem e o histórico mesmo quando a sessão já abriu', async (t) => {
  const { WPP, request } = openEngine(t);
  const { MsgKey, MsgStore } = WPP.whatsapp;
  delete WPP.whatsapp.MsgKey;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, false);
  WPP.whatsapp.MsgKey = MsgKey;
  delete WPP.whatsapp.MsgStore;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, false);
  WPP.whatsapp.MsgStore = MsgStore;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, true);
});

test('falha na leitura da conversa retorna uma resposta para a interface', async (t) => {
  const { WPP, request } = openEngine(t);
  WPP.chat.getActiveChat = () => { throw Error('ChatStore unavailable'); };
  const result = await request('ZF_ENGINE_ACTIVE_CHAT');
  assert.equal(result.ok, false);
  assert.equal(result.notReady, true);
});

test('carregador que já expõe conversas e sessão pode enviar enquanto termina módulos opcionais', async (t) => {
  const { WPP, request } = openEngine(t);
  WPP.isReady = false;
  WPP.isInjected = true;
  assert.equal((await request('ZF_ENGINE_STATUS')).ready, true);
});

test('texto e voz enviados uma vez, inclusive para uma conversa nova autorizada pela tarefa', async (t) => {
  const { WPP, request, sent } = openEngine(t);
  const audio = await request('ZF_ENGINE_SEND', { chatId: '123@lid', kind: 'audio', dataUrl: 'data:audio/ogg;base64,AA==' });
  assert.equal(audio.ok, true);
  assert.equal(sent[0][2].isPtt, true);
  WPP.chat.get = () => undefined;
  const text = await request('ZF_ENGINE_SEND', { chatId: '321@c.us', kind: 'text', text: 'teste', createChat: true });
  assert.equal(text.ok, true);
  assert.equal(sent[1][0], '321@c.us');
  assert.equal(sent[1][2].createChat, true);
  assert.equal(sent.length, 2);
});
