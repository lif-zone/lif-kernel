// LICENSE_CODE JPL ipc.js
let ipc_version = '2026.8.30';
export const version = ipc_version;
const is_worker = !globalThis.window;
let D = 0; // Debug
const {eslow, str_to_buf, buf_to_str, assert} = await import('./util.js');

let disable_timeout = 1;
function Atomics_wait(array, index, value, timeout){
  if (is_worker)
    return Atomics.wait(...arguments);
  let info = 1000, warn = 5000;
  let start;
  if (timeout==undefined)
    timeout = 15000;
  if (disable_timeout)
    timeout = 0;
  if (Atomics.load(array, index)!=value)
    return 'not-equal'; // this is also 'ok' - since we want to wait for change
  start = Date.now();
  while (Atomics.load(array, index)==value){
    let t = Date.now()-start;
    if (info && t>info){
      console.info('Atomics slow');
      info = 0;
    }
    if (warn && t>warn){
      console.warn('Atomics slow');
      warn = 0;
    }
    if (timeout && t>=timeout){
      console.error('Atomics timed-out');
      return 'timed-out';
    }
  }
  return 'ok';
}

// implementation automatic service-worker/direct SharedArrayBuffer
// https://github.com/alexmojaki/sync-message
export class ipc_sync {
  D = 0;
  seq = 0;
  err;
  constructor(ipc_buf){
    this.sab = ipc_buf || {
      data: new SharedArrayBuffer(128*1024),
      cmd: new SharedArrayBuffer(24),
    };
    this._data = this.sab.data;
    this.data = new Uint8Array(this.sab.data);
    let cmd = this.sab.cmd;
    this.lock = new Int32Array(cmd, 4, 1);
    this.sz = new Int32Array(cmd, 8, 1);
    this.len = new Int32Array(cmd, 12, 1);
    this.last = new Int32Array(cmd, 16, 1);
    this._seq = new Int32Array(cmd, 20, 1);
  }
  load_lock(){ return Atomics.load(this.lock, 0); }
  load_sz(){ return Atomics.load(this.sz, 0); }
  load_len(){ return Atomics.load(this.len, 0); }
  load_last(){ return Atomics.load(this.last, 0); }
  load_seq(){ return Atomics.load(this._seq, 0); }
  store_lock(val){ return Atomics.store(this.lock, 0, val); }
  store_sz(val){ return Atomics.store(this.sz, 0, val); }
  store_len(val){ return Atomics.store(this.len, 0, val); }
  store_last(val){ return Atomics.store(this.last, 0, val); }
  store_seq(val){ return Atomics.store(this._seq, 0, val); }
  notify_lock(){
    Atomics.notify(this.lock, 0);
  }
  wait_lock(old_val){
    let res = Atomics_wait(this.lock, 0, old_val);
    if (res!='ok' && res!='not-equal')
      throw Error('failed Atomics.wait()');
  }
  async E_wait_lock(old_val){
    // stupid Atomics.waitAsync() API - it is not an async function
    let _res = Atomics.waitAsync(this.lock, 0, old_val);
    let res = _res.value; // its res.value is *sometimes* async...
    if (typeof res!='string'){
      let slow = D && eslow('ipc E_wait_lock('+old_val+')');
      res = await res;
      D && slow.end();
    }
    if (res!='ok' && res!='not-equal')
      throw Error('failed Atomics.wait()');
    return res;
  }
  write(buf){
    if (this.err)
      throw Error('ipc_sync err state');
    this.err = 'started';
    buf = str_to_buf(buf);
    let sz = buf.byteLength, ofs = 0, len, i;
    this.store_sz(sz);
    for (i=0; !i || ofs<sz; i++, ofs += len){
      // validate ipc channel is free
      if (this.load_lock())
        throw Error('ipc_sync lock busy');
      let len = Math.min(sz-ofs, this._data.byteLength);
      this.store_len(len);
      this.store_last(ofs+len==sz);
      this.seq++;
      this.store_seq(this.seq);
      this.data.set(new Uint8Array(buf, ofs, len), 0);
      this.store_lock(1);
      this.notify_lock();
      this.wait_lock(1);
    }
    this.err = null;
  }
  async E_write(buf, log){
    let x = {};
    if (this.err)
      throw Error('ipc_sync err state');
    this.err = 'started';
    buf = str_to_buf(buf);
    let sz = buf.byteLength, ofs = 0, len, i;
    this.store_sz(sz);
    for (i=0; !i || ofs<sz; i++, ofs += len){
      // validate ipc channel is free (==0)
      if (this.load_lock())
        throw Error('ipc_sync lock busy');
      len = Math.min(sz-ofs, this._data.byteLength);
      this.store_len(len);
      this.store_last(ofs+len==sz ? 1 : 0);
      this.seq++;
      this.store_seq(this.seq);
      this.data.set(new Uint8Array(buf, ofs, len), 0);
      this.store_lock(1);
      this.notify_lock();
      let slow = eslow('E_write('+log+')');
      await this.E_wait_lock(1);
      slow.end();
    }
    if (0 && x.write)
      console.log(x.write);
    this.err = null;
  }
  read(type, log){
    let x = {};
    if (this.err)
      throw Error('ipc_sync err state');
    this.err = 'started';
    let sz, buf, _buf, i = 0, ofs = 0, len, seq, last;
    for (i=0; !i || ofs<sz; i++, ofs += len){
      this.wait_lock(0); // wait for ipc_channel to be busy (!=0)
      if (!i){
        sz = this.load_sz();
        buf = new ArrayBuffer(sz);
        _buf = new Uint8Array(buf);
      }
      len = this.load_len();
      _buf.set(new Uint8Array(this._data, 0, len), ofs);
      last = this.load_last();
      assert(last==(ofs+len==sz ? 1: 0), 'ipc_sync invalid last');
      seq = this.load_seq();
      this.seq++;
      assert(seq==this.seq, 'ipc_sync invalid seq');
      this.store_lock(0);
      this.notify_lock();
    }
    this.err = null;
    if (0 && x.read)
      console.log(x.read);
    if (type)
      buf = buf_to_str(buf, type);
    return buf;
  }
  async E_read(type){
    if (this.err)
      throw Error('ipc_sync err state');
    this.err = 'started';
    let sz, buf, _buf, i = 0, ofs = 0, len, seq, last;
    for (i=0; !i || ofs<sz; i++, ofs += len){
      await this.E_wait_lock(0); // wait for ipc_channel to be busy (!=0)
      if (!i){
        sz = this.load_sz();
        buf = new ArrayBuffer(sz);
        _buf = new Uint8Array(buf);
      }
      len = this.load_len();
      _buf.set(new Uint8Array(this._data, 0, len), ofs);
      last = this.load_last();
      assert(last==(ofs+len==sz ? 1: 0), 'ipc_sync invalid last');
      seq = this.load_seq();
      this.seq++;
      assert(seq==this.seq, 'ipc_sync invalid seq');
      this.store_lock(0);
      this.notify_lock();
    }
    this.err = null;
    if (type)
      buf = buf_to_str(buf, type);
    return buf;
  }
}

