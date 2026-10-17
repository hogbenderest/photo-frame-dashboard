// One-shot verification tour: reload the dashboard, walk Cellar / Calendar /
// Cameras, dump every request result, then run a todo add/remove round-trip
// through the frame's own HA layer (the exact path taps will use).
const res = await fetch('http://localhost:9222/json');
const pages = await res.json();
const page = pages.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const reqs = {};
let evalSeq = 0;
const evaluate = (expression) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, (m) => resolve(m.result && m.result.result ? m.result.result.value : m));
  ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
});
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Network.requestWillBeSent') {
    reqs[msg.params.requestId] = { url: msg.params.request.url, type: msg.params.type };
  } else if (msg.method === 'Network.responseReceived') {
    if (reqs[msg.params.requestId]) reqs[msg.params.requestId].ok = msg.params.response.status;
  } else if (msg.method === 'Network.loadingFailed') {
    if (reqs[msg.params.requestId]) reqs[msg.params.requestId].fail = msg.params.errorText;
  }
};
await new Promise((r) => { ws.onopen = r; });
await send('Network.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 5000));
await evaluate("App.go('cellar')");
await new Promise((r) => setTimeout(r, 4000));
await evaluate("App.go('calendar')");
await new Promise((r) => setTimeout(r, 4000));
await evaluate("App.go('cameras')");
await new Promise((r) => setTimeout(r, 6000));
const wine = await evaluate("JSON.stringify({bottles: HA.num('sensor.cork_dork_total_bottles'), wineCount: (HA.wine && HA.wine.wines ? HA.wine.wines.length : null), calCache: (V => 'skip')(1)})");
const cal = await evaluate("JSON.stringify((App.views.calendar && document.querySelectorAll('.cal-ev').length) + ' events rendered on calendar view')");
const svcAdd = await evaluate("HA.callService('todo.add_item',{entity_id:'todo.shopping_list',item:'frame-verification-test'}).then(()=> HA.invalidateTodo('todo.shopping_list')).then(()=> 'added').catch(e=>'ERR '+e.message)");
await new Promise((r) => setTimeout(r, 2000));
const svcRemove = await evaluate("(async()=>{HA.invalidateTodo('todo.shopping_list');const items=await HA.todoItems('todo.shopping_list');const t=items.find(i=>i.summary==='frame-verification-test');if(!t) return 'not-found';await HA.callService('todo.remove_item',{entity_id:'todo.shopping_list',item:'frame-verification-test'});HA.invalidateTodo('todo.shopping_list');const after=await HA.todoItems('todo.shopping_list');return 'removed; remaining test items: '+after.filter(i=>i.summary==='frame-verification-test').length})()").catch(e => 'ERR ' + e.message);
const state = await evaluate("JSON.stringify({ha: HA.status, current: App.current, camImgs: document.querySelectorAll('.cam-img img').length})");
console.log('--- requests (HA only):');
for (const k in reqs) {
  const r = reqs[k];
  if (r.url.includes('192.168.86.109')) console.log(JSON.stringify(r));
  if (r.url.includes('127.0.0.1:8123/ha.json')) console.log(JSON.stringify(r));
}
console.log('--- checks:');
console.log('wine: ' + wine);
console.log('calendar: ' + cal);
console.log('svc add: ' + svcAdd);
console.log('svc remove: ' + (typeof svcRemove === 'object' ? JSON.stringify(svcRemove) : svcRemove));
console.log('state: ' + state);
ws.close();
