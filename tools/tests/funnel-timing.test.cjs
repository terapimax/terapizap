const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function openFunnelClock() {
  let monotonic = 0, wall = 1_000_000;
  const pending = [];
  const window = { addEventListener() {}, SUPABASE_URL: 'fixture', SUPABASE_KEY: 'fixture' };
  const source = fs.readFileSync(path.join(__dirname, '../../extension/content.js'), 'utf8');
  const code = source.replace('  init();', `
    renderDock = () => {};
    showToast = () => {};
    window.testFunnel = { waitFor, runAction, runLabel, runs, funnelSteps, estimateMs, runScheduledTask,
      connect(db, library) { sb = db; loaded = true; itemIndex = () => library; driveRun = () => {}; return window.ZF_BRIDGE.startFunnelRun; },
      taskUpdates(fn) { updateTask = fn; }
    };
  `);
  vm.runInNewContext(code, {
    window, console, Date: class extends Date { static now() { return wall; } },
    performance: { now: () => monotonic }, setInterval() {},
    setTimeout(fn, ms) { pending.push({ fn, due: monotonic + ms }); },
  });
  pending.length = 0;
  async function advance(ms, wallMs = ms) {
    monotonic += ms;
    wall += wallMs;
    const due = pending.splice(0);
    for (const timer of due) {
      if (timer.due <= monotonic) timer.fn(); else pending.push(timer);
    }
    await new Promise(setImmediate);
  }
  return { ...window.testFunnel, advance };
}

test('o prazo de 24 horas usa unidades explícitas e não cresce com ajustes no relógio', async () => {
  const { runs, waitFor, runLabel, runAction, advance } = openFunnelClock();
  const run = { uid: 1, state: 'running', idx: 0, steps: [{}] };
  runs.push(run);
  let finished = false;
  const waiting = waitFor(run, 86_400_000, 'waiting').then(() => { finished = true; });
  assert.match(runLabel(run), /24 h$/);
  await advance(1_524_000, -3_600_000);
  assert.match(runLabel(run), /23 h 34 min 36 s$/);
  await runAction(1, 'pause');
  await advance(7_200_000);
  assert.match(runLabel(run), /Pausado.*23 h 34 min 36 s$/);
  await runAction(1, 'pause');
  await advance(84_875_000);
  assert.match(runLabel(run), /1 s$/);
  assert.equal(finished, false);
  await advance(1000);
  assert.equal(finished, true);
  await waiting;
});

test('a extensão executa a ordem salva e conserva o intervalo de cada item', () => {
  const { funnelSteps, estimateMs } = openFunnelClock();
  const rows = [
    { id: 7, type: 'message', item_id: 1, delay_minutes: 0, delay_seconds: 0, position: 1 },
    { id: 9, type: 'audio', item_id: 2, delay_minutes: 1440, delay_seconds: 0, position: 0 },
    { id: 8, type: 'message', item_id: 1, delay_minutes: 10, delay_seconds: 15, position: 1 },
  ];
  const steps = funnelSteps({ funnel_items: rows }, new Map([['msg:1', {}], ['audio:2', {}]]));
  assert.deepEqual(Array.from(steps, s => s.delayMs), [86_400_000, 0, 615_000]);
  assert.equal(estimateMs([{ item: null, delayMs: 86_400_000 }]), 0);
});

test('cada novo disparo lê o funil salvo sem modificar um disparo já iniciado', async () => {
  const { runs, connect } = openFunnelClock();
  const list = [
    { id: 11, item_id: 1, type: 'message', position: 0, delay_minutes: 0 },
    { id: 12, item_id: 2, type: 'message', position: 1, delay_minutes: 1440 },
  ];
  const cached = { id: 4, title: 'Funil', funnel_items: list };
  let saved = cached;
  const db = { from() { return this; }, select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: saved, error: null }) };
  const start = connect(db, new Map([['msg:1', { id: 1 }], ['msg:2', { id: 2 }]]));
  const chat = { chatId: 'teste', name: 'Teste' };
  assert.equal(await start(cached, chat), true);
  saved = { ...cached, funnel_items: [{ ...list[1], position: 0, delay_minutes: 2, delay_seconds: 15 }, { ...list[0], position: 1 }] };
  assert.equal(await start(cached, chat), true);
  assert.deepEqual(Array.from(runs[0].steps, step => [step.item.id, step.delayMs]), [[1, 0], [2, 86_400_000]]);
  assert.deepEqual(Array.from(runs[1].steps, step => [step.item.id, step.delayMs]), [[2, 135_000], [1, 0]]);
  db.maybeSingle = async () => ({ error: { message: 'Teste sem conexão' } });
  await assert.rejects(start(cached, chat), /carregar os passos salvos/);
  assert.equal(runs.length, 2);
});

test('um agendamento mantém o estado de envio enquanto o funil recém-carregado está em andamento', async () => {
  const { connect, runScheduledTask, taskUpdates, runs } = openFunnelClock();
  const funnel = { id: 4, title: 'Agendado', funnel_items: [{ id: 1, type: 'message', item_id: 7, position: 0 }] };
  const db = { from() { return this; }, select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: funnel }) };
  connect(db, new Map([['msg:7', { id: 7 }]]));
  const states = [];
  taskUpdates(async (_id, patch) => { states.push(patch.status); return true; });
  await runScheduledTask({ id: 8, title: 'Teste', content_type: 'funnel', funnel_id: 4, attempts: 0,
    options: { chat_id: 'teste', cancel_on_reply: false } });
  assert.deepEqual(states, ['sending']);
  assert.equal(runs[0].task.id, 8);
});
