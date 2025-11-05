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

let ipc;
async function ipc_fetch(){
  let b = await ipc.E_read('string');
  let req = JSON.parse(b);
  let url = req.url;
  let response = await fetch(req.url, req.opt);
  D && console.log('ipc_fetch '+url, response);
  let res = {status: response.status};
  let slow;
  if (response.status!=200){
    console.log('worker fetch('+url+') failed '+response.status);
    slow = eslow(15000, 'ipc_fetch('+url+')');
    await ipc.E_write(json({status: response.status}));
    slow.end();
    return;
  }
  let blob = await response.blob();
  let data = await blob.arrayBuffer();
  res.length = blob.length;
  res.ctype = blob.type;
  res.data = 1;
  slow = eslow(15000, 'ipc_fetch('+url+') resp headers');
  await ipc.E_write(json(res));
  slow.end();
  slow = eslow(15000, 'ipc_fetch('+url+') resp data');
  await ipc.E_write(data, url);
  slow.end();
}
async function ipc_fetch_init(event){
  let {sab} = event.data.fetch_init;
  ipc = new ipc_sync(sab);
  D && console.log('ipc_fetch_init');
  while (1)
    await ipc_fetch();
}

