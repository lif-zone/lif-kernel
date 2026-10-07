// LIF bootloader worker: assistance for sync operations
let boot_worker_version = '2026.8.23';
let D = 0;

// must be before any import, since import that inside them call await will
// loose messages.
let lif_worker = {
  queue: [],
  cb: e=>{
    console.log('push worker message queue');
    lif_worker.queue.push(e);
  }
};
globalThis.addEventListener('message', lif_worker.cb);

// dynamic import() since util has await, which makes worker loose initial
// postMessage
const {ipc_fetch_init} = await import('./ipc_fetch.js');

console.log('boot_worker started '+boot_worker_version);
globalThis.addEventListener("message", event=>{
  D && console.log('worker got message', event.data, event);
  if (event.data.fetch_init)
    return ipc_fetch_init(event);
  console.error('invalid message', event.data);
});
globalThis.removeEventListener('message', lif_worker.cb);
lif_worker.queue.forEach(e=>{
  console.log('dispatch');
  globalThis.dispatchEvent(e);
});


