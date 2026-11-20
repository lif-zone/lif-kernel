# lif-kernel

## Jungo Language

Jungo: Simplified Technical English. Minimal words, maximal clarity.
Every word needed, none redundant. Each text is whole (complete),
self-contained, integral (every part serves the whole).

All project text uses Jungo: code, comments, docs, commits, errors.

## lif-kernel

JS OS and Network. Service worker module loader. Browser Node.js
core modules, lifnet overlay networking, dev server.

## Dev server

```
cd ~/lif-<app>
node ~/lif-kernel/web/serve.js -p <port>
```

Serves the app via lif-kernel service worker: module resolution,
Node.js polyfills, SPA routing.

Background:

```
nohup node ~/lif-kernel/web/serve.js -p <port> > /tmp/serve-<port>.log 2>&1 &
```

## Browser testing

### 1. Launch Chrome

```bash
/opt/google/chrome/chrome --remote-debugging-port=9223 \
  --user-data-dir=/tmp/chrome-debug-profile-claude --no-first-run &
```

Opens a real Chrome on the user's display. Use a unique port
(9222 often taken) and unique user-data-dir. No extension needed.

### 2. CDP control

Open URL:

```bash
curl -s -X PUT "http://127.0.0.1:9223/json/new?http://localhost:<port>/path"
```

List tabs:

```bash
curl -s http://127.0.0.1:9223/json
```

Close tab:

```bash
curl -s -X PUT "http://127.0.0.1:9223/json/close/<tab-id>"
```

### 3. Console output

TAB_ID from `curl /json` (`id` field):

```bash
node -e "
let ws = new (require('ws'))('ws://127.0.0.1:9223/devtools/page/<TAB_ID>');
ws.on('open', ()=>{
  ws.send(JSON.stringify({id:1, method:'Runtime.enable'}));
  ws.send(JSON.stringify({id:2, method:'Log.enable'}));
});
ws.on('message', d=>{
  let msg = JSON.parse(d);
  if (msg.method=='Runtime.consoleAPICalled')
    console.log(msg.params.args.map(a=>a.value||a.description).join(' '));
  if (msg.method=='Log.entryAdded')
    console.log('['+msg.params.entry.level+']', msg.params.entry.text);
});
setTimeout(()=>process.exit(), 30000);
"
```

### 4. Screenshot

```bash
node -e "
let ws = new (require('ws'))('ws://127.0.0.1:9223/devtools/page/<TAB_ID>');
ws.on('open', ()=>ws.send(JSON.stringify({id:1,method:'Page.captureScreenshot'})));
ws.on('message', d=>{
  let msg = JSON.parse(d);
  if (msg.id==1 && msg.result)
    require('fs').writeFileSync('/tmp/screenshot.png',
      Buffer.from(msg.result.data, 'base64'));
  ws.close();
});
"
```

Read `/tmp/screenshot.png` to see the page.

### 5. Cleanup

```bash
kill $(lsof -ti:<debug-port>) 2>/dev/null
kill $(lsof -ti:<server-port>) 2>/dev/null
```

## Node.js compatibility

`lif.overrides` in package.json maps Node.js modules to browser
implementations:

```json
"lif": {
  "overrides": {
    "net": "lif-kernel/net",
    "fs": "npm:some-fs-polyfill",
    "crypto": "npm:crypto-browserify"
  }
}
```

`lif-kernel/net` (`compat/net.js`): `Socket` (`tcp_sock` from
`net/tcpip.js`), `connect`, `createConnection`, `isIP`, `isIPv4`,
`isIPv6`. Tunneled over lifnet `tcp/out` to a lif-net out node.

## package.json patches

Patch a dependency's package.json under `lif.patches`:

```json
"lif": {
  "patches": {
    "some-package": {
      "./package.json": {
        "json": { "exports": { ".": "./index.js" } }
      }
    }
  }
}
```

## Coding conventions

- `(a, b)=>code` no spaces around arrows
- `a==b` no spaces around `===` `==`
- `==` for string and simple number comparison
- `await` not `.then()`
- `if (x)\n  stmt;` not `if (x) stmt;` same for `for` `while`
- `async()=>` no space after `async`
- `catch(e){` no space before `(`
- `// Section Name` no box-drawing
