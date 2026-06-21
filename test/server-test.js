import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 3097;
let proc;

before(async ()=>{
  proc = spawn('node', ['server.js', '-p', ''+port], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject)=>{
    let timeout = setTimeout(()=>reject(new Error('server start timeout')), 8000);
    proc.stdout.on('data', data=>{
      if ((''+data).includes('Serving')){
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('error', err=>{ clearTimeout(timeout); reject(err); });
    proc.on('exit', code=>{ clearTimeout(timeout); reject(new Error('server exited early: '+code)); });
  });
});

after(()=>{
  proc?.kill();
});

it('GET /lif-kernel/hi.js returns 200 with JS content', async ()=>{
  let res = await fetch(`http://localhost:${port}/lif-kernel/hi.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')||'', /javascript/);
  let body = await res.text();
  assert.ok(body.includes('hi world'), 'body should contain "hi world"');
});
