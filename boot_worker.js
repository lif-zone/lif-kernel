// LIF bootloader worker: assistance for sync operations
let boot_worker_version = '25.11.4';
import util from '/lif-kernel/util.js';
let D = 0;
console.log('boot_worker started '+boot_worker_version);
let {ipc_sync, eslow} = util;
let json = JSON.stringify;
globalThis.addEventListener("message", event=>{
  D && console.log('worker got message', event.data, event);
  if (event.data.fetch_init)
    return ipc_fetch_init(event);
  console.error('invalid message', event.data);
});

let ipc = {read: null, write: null};
function d(s){
  // debug: remember trace last state before getting stuck
  globalThis.ipc_fetch_state = s;
}
async function ipc_fetch(){
  let slow;
  d('start');
  let b = await ipc.read.E_read('string');
  let req = JSON.parse(b);
  let url = req.url;
  slow = eslow(15000, d('ipc_fetch('+url+') fetch()'));
  let response = await fetch(req.url, req.opt);
  slow.end();
  D && console.log('ipc_fetch '+url, response);
  let res = {status: response.status};
  if (response.status!=200){
    console.log('worker fetch('+url+') failed '+response.status);
    slow = eslow(15000, d('ipc_fetch('+url+') err headers'));
    await ipc.write.E_write(json({status: response.status}));
    slow.end();
    slow = eslow(15000, d('ipc_fetch('+url+') err body'));
    await ipc.write.E_write('');
    slow.end();
    d('end err');
    return;
  }
  slow = eslow(15000, d('ipc_fetch('+url+') body'));
  let blob = await response.blob();
  let body = await blob.arrayBuffer();
  slow.end();
  res.length = blob.length;
  res.ctype = blob.type;
  res.body = 1;
  slow = eslow(15000, d('ipc_fetch('+url+') resp headers'));
  await ipc.write.E_write(json(res), 'ipc_fetch resp headers '+url);
  slow.end();
  slow = eslow(15000, d('ipc_fetch('+url+') resp body'));
  await ipc.write.E_write(body, 'ipc_fetch resp body '+url);
  slow.end();
  d('end');
}
async function ipc_fetch_init(event){
  let {sab} = event.data.fetch_init;
  ipc.read = new ipc_sync(sab.read);
  ipc.write = new ipc_sync(sab.write);
  D && console.log('ipc_fetch_init');
  while (1){
    try {
      await ipc_fetch();
    } catch(err){
      console.error('ipc_fetch: ', err);
    }
  }
}

