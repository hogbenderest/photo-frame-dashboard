// Frame debug via Chrome DevTools Protocol over adb forward tcp:9222.
// Usage: node scripts/frame-devtools.mjs            (reload + capture boot)
//        node scripts/frame-devtools.mjs 'expr'     (evaluate in page)
const res = await fetch('http://localhost:9222/json');
const pages = await res.json();
const page = pages.find((p) => p.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const events = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) events.push(msg);
};
await new Promise((r) => { ws.onopen = r; });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');

const arg = process.argv[2];
if (arg) {
  const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result, null, 1).slice(0, 6000));
} else {
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 10000));
  const reqs = {};
  for (const e of events) {
    if (e.method === 'Network.requestWillBeSent') {
      const d = e.params;
      reqs[d.requestId] = { url: d.request.url, type: d.type, line: d.request.headers ? '' : '' };
    } else if (e.method === 'Network.loadingFailed') {
      const d = e.params;
      if (reqs[d.requestId]) reqs[d.requestId].fail = d.errorText + (d.blockedReason ? ' blocked:' + d.blockedReason : '');
    } else if (e.method === 'Network.responseReceived') {
      const d = e.params;
      if (reqs[d.requestId]) reqs[d.requestId].ok = d.response.status;
    } else if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      console.log('[EXC] ' + d.text + ' ' + (d.exception ? d.exception.description : '') + ' @' + (d.url || '') + ':' + d.lineNumber);
    } else if (e.method === 'Log.entryAdded') {
      const d = e.params.entry;
      console.log('[' + d.level + '] ' + d.source + ' ' + d.text + ' ' + (d.url || ''));
    }
  }
  for (const k in reqs) console.log(JSON.stringify(reqs[k]));
  const st = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({app: typeof window.App !== "undefined" ? "yes" : "NO", ha: typeof window.HA !== "undefined" ? window.HA.status : "NO", current: window.App ? App.current : null, homeHTML: window.App ? document.getElementById("view-home").innerHTML.length : 0, readyState: document.readyState})',
    returnByValue: true
  });
  console.log('STATE ' + st.result.result.value);
}
ws.close();
