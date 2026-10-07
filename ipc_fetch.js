// LIF ipc fetch sync worker: assistance for sync operations
const {eslow} = await import('./util.js');
const {ipc_sync} = await import('./ipc.js');
let D = 0;
let ipc = {read: null, write: null};
let json = JSON.stringify;

// mem debug tracking of last 10 states, without slowing down with console.log
let d_a = globalThis.ipc_fetch_state = ['init'];
function d(s){
  d_a.push(s);
  if (d_a.length>10)
    d_a.shift();
  return s;
}
export async function ipc_fetch(){
  let slow;
  d('waiting req');
  let b = await ipc.read.E_read('string');
  d('got req');
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

export async function ipc_fetch_init(fetch_init){
  d('ipc_fetch_init');
  let {sab} = fetch_init;
  ipc.read = new ipc_sync(sab.read);
  ipc.write = new ipc_sync(sab.write);
  D && console.log('ipc_fetch_init');
  while (1){
    try {
      await ipc_fetch();
    } catch(err){
      console.error(d('ipc_fetch err'), err);
    }
  }
}


