async function run() {
  try {
    const base = 'http://localhost:3000';
    const res1 = await (await fetch(base + '/api/health')).json();
    console.log('health:', res1);
    const res2 = await (await fetch(base + '/api/kanban')).json();
    console.log('kanban columns:', JSON.stringify(res2, null, 2));
    const res3 = await (await fetch(base + '/api/messages')).json();
    console.log('messages:', JSON.stringify(res3, null, 2));
  } catch (e) {
    console.error('error calling backend:', e);
  }
}
run();
