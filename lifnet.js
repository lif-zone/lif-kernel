// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer, assert, rpc_websocket, version as util_version,
  is_node, url_http_to_ws, ewait, OA, sock_pair, rpc_sock_pipe, OV,
} from './util.js';
import etask from './etask.js';
import EventEmitter, {once} from './compat/events.js';
let D = 0;

let trunk_url_base = is_node ? 'http://localhost:1842' : location.origin;
let trunk_url_ws = url_http_to_ws(trunk_url_base)+'/.lif.net';
let RETRY_MS = 1000;

class Trunk_loopback extends EventEmitter {
  status = 'online';
  rpc;
  constructor(lifnet){
    super();
    this.lifnet = lifnet;
    let [a, b] = sock_pair();
    this.rpc = a;
    rpc_sock.listen(b, 'rconnect', async({msg, sock: c_sock})=>{
      let {method, params} = msg.params;
      let {fn, is_listen} = this.lifnet.method_fn[method]||{};
      if (!fn || !is_listen)
        return {error: 'no loopback listen '+method};
      let [svc_c, svc_s] = sock_pair();
      rpc_sock_pipe(c_sock, svc_c);
      this.lifnet.base_methods(svc_s);
      return await fn({msg: {method, params}, sock: svc_s});
    });
  }
  topic_get(topic){
    if (this.lifnet.pub_t[topic])
      return [this.lifnet.rg_id];
    return [];
  }
  async rcall(method, params){
    let {fn, is_listen} = this.lifnet.method_fn[method]||{};
    if (!fn)
      return {error: 'no method '+method};
    if (is_listen)
      return {error: 'listen not supported for rcall'};
    return await fn({params});
  }
}

// throw to {error: ...}
function T2E(fn){
  try {
    return fn();
  } catch(error){
    return {error};
  }
}

function T2E_et(fn){
  return etask(function*(){
    try {
      return yield fn();
    } catch(error){
      return {error};
    }
  });
}

class Trunk extends EventEmitter {
  status = 'offline';
  rpc;
  last = 0;
  et_connect;
  constructor(lifnet, url){
    super();
    this.lifnet = lifnet;
    this.url = url;
  }
  start(){
    if (this.et_connect)
      return;
    this.et_connect = this._connect_loop();
    this.et_connect.on('finally', ()=>this.et_connect = null);
    this.on('close', ()=>this.et_connect.return({error: 'close'}));
    return this.et_connect;
  }
  emit_status(status){
    if (this.status==status)
      return;
    console.log('lifnet trunk '+this.url+' '+status);
    this.status = status;
    this.emit('status', status);
  }
  _connect_single(){ return etask(function*(et){
    assert(!this.rpc);
    et.on('finally', ()=>{
      if (this.status=='closed')
        return;
      this.emit_status('offline');
      this.rpc?.close();
      this.rpc = null;
    });
    this.last = Date.now();
    D && console.log('lifnet trunk connect attempt '+this.url);
    let rpc = this.rpc = new rpc_websocket({D: 1, pre: this.lifnet.client_name});
    rpc.on('error', err=>et.return({error: 'lifnet trunk error '+this.url+' '+err}));
    rpc.on('close', ()=>et.return({error: 'closed'}));
    let ret = yield T2E_et(()=>rpc.connect({url: this.url}));
    if (ret?.error)
      return ret;
    ret = yield rpc.call('version',
      {name: this.lifnet.client_name, version: this.lifnet.client_version});
    if (ret?.error)
      return {error: 'server version err: '+ret.error};
    this.lifnet.server_version = ret;
    ret = yield rpc.call('rg_id', {rg_id: this.lifnet.rg_id});
    if (ret?.error)
      return {error: 'rg_id err: '+ret.error};
    for (let topic in this.lifnet.pub_t){
      let t = this.lifnet.pub_t[topic];
      rpc.call('topic_pub', {topic, data: t.data});
    }
    for (let method in this.lifnet.method_fn)
      this._rpc_method_set(rpc, method);
    this.emit_status('online');
    yield etask.wait();
   }.bind(this)); }
  _connect_loop(){ return etask(function*(et){
    for (;;){
      this.last = Date.now();
      yield this._connect_single();
      let delay = Math.max(this.last+RETRY_MS-Date.now(), 0);
      if (delay)
        yield etask.sleep(delay);
    }
  }.bind(this)); }
  _rpc_method_set(rpc, method){
    let {fn, is_listen} = this.lifnet.method_fn[method];
    assert(fn);
    if (is_listen){
      rpc_sock.listen(rpc, method, ({msg, sock})=>{
        this.lifnet.base_methods(sock);
        return fn({msg, sock});
      });
    } else
      rpc._method(method, fn);
  }
  _rpc_method_del(rpc, method){
    let {is_listen} = this.lifnet.method_fn[method];
    if (is_listen)
      rpc_sock.listen(rpc, method);
    else
      rpc._method(method);
  }
  async trunk_call(method, params){
    if (this.status!='online')
      return {error: 'offline'};
    return await this.rpc.call(method, params);
  }
  async topic_pub(topic, data){
    return await this.trunk_call('topic_pub', {topic, data});
  }
  async topic_unpub(topic){
    return await this.trunk_call('topic_unpub', {topic});
  }
  async topic_get(topic){
    let ret = await this.trunk_call('topic_get', {topic});
    if (ret.error)
      return [];
    return ret.addr||[];
  }
  close(){
    this.status = 'closed';
    this.rpc?.close();
    this.rpc = null;
  }
}

export class Lifnet extends EventEmitter {
  method_fn = {};
  trunk_t = {};
  pub_t = {};
  rg_id = rg_id_get();
  client_name;
  client_version;
  server_version;
  error;
  status = 'offline';
  constructor({url, client_name, client_version}={}){
    super();
    this.client_name = client_name||'lifnet-leaf';
    this.client_version = client_version||util_version;
    this.trunk_t.loopback = new Trunk_loopback(this);
    if (url)
      this.trunk_add(url);
    this.base_methods();
  }
  _status_update(){
    let prev = this.status;
    this.status = this._trunk_online() ? 'online' : 'offline';
    if (prev!=this.status)
      this.emit('status', this.status);
  }
  trunk_add(url){
    if (this.trunk_t[url])
      return;
    let trunk = new Trunk(this, url);
    this.trunk_t[url] = trunk;
    trunk.on('status', ()=>this._status_update());
    trunk.start();
  }
  _trunks_retry(){
    for (let t of this._ws_trunks())
      t.start();
  }
  _ws_trunks(){
    return OV(this.trunk_t).filter(t=>t instanceof Trunk);
  }
  _trunk_online(){
    return this._ws_trunks().find(t=>t.status=='online');
  }
  async trunk_connect(){
    if (this.status=='online')
      return {ok: true};
    let t = this._ws_trunks();
    if (!t.length){
      console.error('failed trunk_connect: no trunks defined');
      return {error: 'no trunks'};
    }
    this._trunks_retry();
    let status = await once(this, 'status');
    return status=='online' ? {ok: true} : {error: 'offline'};
  }
  base_methods(sock){
    let rpc = sock || this;
    rpc.method('ping', ()=>({pong: 1}));
    rpc.method('version',
      ()=>({name: this.client_name, version: this.client_version}));
  }
  close(){
    for (let trunk of OV(this.trunk_t)){
      if (trunk instanceof Trunk)
        trunk.close();
    }
  }
  connect(rg_id, method, params){
    let sock = new rpc_sock();
    this.base_methods(sock);
    let wait = (async()=>{
      let trunk = rg_id==this.rg_id ? this.trunk_t.loopback
        : this._trunk_online();
      if (!trunk)
        return {error: 'no trunk online'};
      let ret = await sock.connect(trunk.rpc, 'rconnect',
        {rg_id, method, params});
      if (ret?.error){
        console.warn('failed connect', ret);
        return ret;
      }
      let ping = await sock._call('ping');
      if (ping.error || !ping.result.pong){
        console.warn('failed ping', ping);
        return {error: 'no pong'};
      }
      return ret;
    })();
    return {sock, wait};
  }
  method(method, fn){
    this._method(method, !fn ? null : async({params})=>{
      return await fn(params);
    });
  }
  _method(method, fn){
    if (!fn){
      delete this.method_fn[method];
      for (let trunk of this._ws_trunks()){ // XXX what about loopback?
        if (trunk.rpc)
          trunk._rpc_method_del(trunk.rpc, method);
      }
      return;
    }
    this.method_fn[method] = {fn, is_listen: false};
    for (let trunk of this._ws_trunks()){ // XXX what about loopback
      if (trunk.rpc)
        trunk._rpc_method_set(trunk.rpc, method);
    }
  }
  async trunk_call(method, params){
    let trunk = this._trunk_online();
    if (!trunk)
      return {error: 'offline'};
    return await trunk.rpc.call(method, params);
  }
  async topic_get(topic){
    let addr = new Set();
    // XXX is it possible to merge loopback into _ws_trunks loop?
    for (let id of this.trunk_t.loopback.topic_get(topic))
      addr.add(id);
    for (let trunk of this._ws_trunks()){
      for (let id of await trunk.topic_get(topic))
        addr.add(id);
    }
    return {addr: [...addr]};
  }
  async topic_pub(topic, data){
    this.pub_t[topic] = {topic, data};
    for (let trunk of this._ws_trunks())
      await trunk.topic_pub(topic, data);
    return {};
  }
  async topic_unpub(topic){
    delete this.pub_t[topic];
    for (let trunk of this._ws_trunks())
      await trunk.topic_unpub(topic);
    return {};
  }
  async rcall(rg_id, method, params){
    if (rg_id==this.rg_id)
      return await this.trunk_t.loopback.rcall(method, params);
    return await this.trunk_call('rcall', {rg_id, method, params});
  }
  rpc_method_set(method){
    for (let trunk of this._ws_trunks()){
      if (trunk.rpc)
        trunk._rpc_method_set(trunk.rpc, method);
    }
  }
  rpc_method_del(method){
    for (let trunk of this._ws_trunks()){
      if (trunk.rpc)
        trunk._rpc_method_del(trunk.rpc, method);
    }
  }
  listen_close(method){
    this.rpc_method_del(method);
    delete this.method_fn[method];
  }
  listen(method, fn){
    if (!fn)
      return this.listen_close(method);
    assert(!this.method_fn[method], 'lifnet double listen('+method+')');
    this.method_fn[method] = {fn, is_listen: true};
    this.rpc_method_set(method);
  }
}

let g_rg = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
export function rg_id_get(){
  return g_rg_id;
}
export const lifnet = new Lifnet();
let lifnet_inited;
function lifnet_init(){
  if (lifnet_inited)
    return lifnet;
  lifnet_inited = true;
  lifnet.trunk_add(trunk_url_ws);
  return lifnet;
}

export function lifnet_client_name(opt={}){
  if (opt.client_name)
    lifnet.client_name = opt.client_name;
}
export function lifnet_get(){
  lifnet_init();
  return lifnet;
}

async function wait_pipe(wait, wait_val){
  try {
    wait.return(await wait_val);
  } catch(err){
    wait.throw(err);
  }
}
export async function lifnet_online({timeout}={}){
  lifnet_init();
  if (lifnet.status=='online')
    return;
  let wait = ewait();
  if (timeout){
    (async()=>{
      await etask.sleep(timeout);
      wait.return({error: 'lifnet connect timeout'});
    })();
  }
  wait_pipe(wait, lifnet.trunk_connect());
  return await wait;
}

export async function lifnet_connect(topic, params, opt={}){
  // XXX after all trunks fail, should not continue waiting 5 seconds
  let ret = await lifnet_online({timeout: 5000});
  if (ret?.error)
    return ret;
  ret = await lifnet.topic_get(topic);
  let addr = ret?.addr;
  if (!addr)
    return {error: 'lifnet error: failed get topic '+topic};
  if (!addr.length){
    if (lifnet.status!='online')
      return {error: 'lifnet offline'};
    return {error: 'no '+topic+' servers online'};
  }
  let rg, sock, _error, res;
  for (let id of addr){
    let _rg = g_rg[id] ||= {id};
    if (opt.rg_block?.(_rg))
      continue;
    let {sock: _sock, wait} = lifnet.connect(id, topic, params);
    let _ret = await wait;
    if (_ret?.error){
      console.log('failed connecting to '+id);
      _error = _ret.error;
      continue;
    }
    sock = _sock;
    rg = _rg;
    ret = _ret;
  }
  if (!rg)
    return {error: 'no good '+topic+' servers online: '+_error};
  return {sock, rg, ret};
}

function lifnet_listen_close(opt){
  lifnet.listen(opt.method);
  if (opt.topic)
    lifnet.topic_unpub(opt.topic);
}
export function lifnet_listen(topic, fn){
  lifnet_init();
  let opt = {};
  if (typeof topic=='string')
    opt = {topic, method: topic, auto_close: true};
  else {
    opt = {...topic};
    opt.method ??= opt.topic;
    opt.auto_close ??= true;
  }
  const lifnet = lifnet_get();
  if (!fn)
    return lifnet_listen_close(topic);
  lifnet.listen(opt.method, fn);
  if (opt.topic)
    lifnet.topic_pub(opt.topic, opt.data);
  return {close: ()=>lifnet_listen_close(opt)};
}

export async function lifnet_call(topic, params){
  lifnet_init();
  let {sock, ret, error} = await lifnet_connect(topic, params);
  sock?.close();
  return {ret, error};
}

// fetch()-compatible API over rpc_sock
// Usage: lif_fetch(url, {method, headers, body})
class Lif_response {
  constructor(status, headers, body_buf){
    this.status = status;
    this.ok = status>=200 && status<300;
    this.headers = headers;
    this._buf = body_buf;
  }
  async text(){ return this._buf.toString(); }
  async json(){ return JSON.parse(this._buf.toString()); }
  async arrayBuffer(){ return this._buf.buffer; }
}

export async function lif_fetch(url, {method='GET', headers={}, body}={}){
  lifnet_init();
  let {sock, error} = lifnet_connect('http/out');
  if (error)
    throw new Error(error);
  let res = await http_sock_c(sock, {url, method, headers, body});
  sock.close();
  if (res.error)
    throw new Error(res.error);
  return new Lif_response(res.status, res.headers, res.body);
}

export class browser_EventEmitter extends EventEmitter {
  _set_handler(event, fn){
    if (this['_h_'+event])
      this.off(event, this['_h_'+event]);
    this['_h_'+event] = fn;
    if (fn)
      this.on(event, fn);
  }
  get onopen(){ return this._h_open||null; }
  set onopen(fn){ this._set_handler('open', fn); }
  get onmessage(){ return this._h_message||null; }
  set onmessage(fn){ this._set_handler('message', fn); }
  get onclose(){ return this._h_close||null; }
  set onclose(fn){ this._set_handler('close', fn); }
  get onerror(){ return this._h_error||null; }
  set onerror(fn){ this._set_handler('error', fn); }
}

// WebSocket-like object proxied over rpc_sock via lif_rg websocket_connect
export class lif_WebSocket extends browser_EventEmitter {
  reasyState = 0; // CONNECTING
  sock = null;
  constructor(rpc, url, protocols){
    super();
    this.rpc = rpc;
    this.url = url;
    this.protocols = protocols;
    this._connect();
  }
  async _connect(){
    try {
      let sock = new rpc_sock();
      this.sock = sock;
      sock.method('message', ({data, bin})=>{
        let msg_data = bin ? Buffer.from(data, 'hex') : data;
        this.emit('message', {data: msg_data, type: 'message',
          target: this});
      });
      sock.method('close', ({code=1000, reason=''}={})=>{
        if (this.readyState==3)
          return;
        this.readyState = 3;
        this.emit('close', {code, reason, type: 'close', target: this});
      });
      sock.method('error', ({message})=>{
        this.emit('error', {message, type: 'error', target: this});
      });
      sock.on('close', ()=>{
        if (this.readyState==3)
          return;
        this.readyState = 3;
        this.emit('close', {code: 1006, reason: '', type: 'close',
          target: this});
      });
      let params = {url: this.url, headers: {}};
      if (this.protocols)
        params.protocols = this.protocols;
      let res = await sock.connect(this.rpc, 'websocket/out',
        params);
      if (res.error){
        this.readyState = 3;
        this.emit('error', {message: res.error, type: 'error',
          target: this});
        return;
      }
      this.readyState = 1; // OPEN
      this.emit('open', {type: 'open', target: this});
    } catch(err){
      this.readyState = 3;
      this.emit('error', {message: err.message, type: 'error',
        target: this});
    }
  }
  send(data){
    if (this.readyState!=1)
      throw new DOMException('WebSocket is not open', 'InvalidStateError');
    let is_bin = typeof data!='string';
    if (is_bin){
      let buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      this.sock.notify('send', {data: buf.toString('hex'), binary: true});
    } else
      this.sock.notify('send', {data, binary: false});
  }
  close(code=1000, reason=''){
    if (this.readyState>=2)
      return;
    this.readyState = 2; // CLOSING
    this.sock?.notify('close', {code, reason});
  }
}

// DNS lookup via lif_rg dns/out proxy
// Returns {addrs: [{address, family}]} or {error}
export async function lif_dns_lookup(host, {family=4}={}){
  return await lifnet_call('dns/out', {host, family});
}

// JSON-RPC over WebSocket via jsonrpc/out proxy — client-side mirror of rpc_sock_jsonrpc_out
export class lif_rpc_websocket extends EventEmitter {
  sock = null;
  constructor(rpc, url){
    super();
    this.rpc = rpc;
    this.url = url;
    this._methods = {};
  }
  async connect(){
    let sock = new rpc_sock();
    this.sock = sock;
    sock._method('', async(msg)=>{
      let {id, method, params} = msg;
      let fn = this._methods[method];
      if (id==null){
        if (fn)
          fn(params);
        return;
      }
      if (!fn)
        return {error: 'method not found: '+method};
      try { return await fn(params); }
      catch(err){ return {error: ''+err}; }
    });
    sock.on('close', ()=>this.emit('close'));
    sock.on('error', err=>this.emit('error', err));
    let res = await sock.connect(this.rpc, 'jsonrpc/out', {url: this.url});
    if (res.error)
      throw new Error(res.error);
    return this;
  }
  method(name, fn){
    this._methods[name] = fn;
  }
  async call(method, params){
    return await this.sock._call(method, params);
  }
  notify(method, params){
    this.sock.notify(method, params);
  }
  close(){
    this.sock?.close();
  }
}

// TCP socket proxy — mirrors net.Socket API over rpc_sock
export class tcp_sock extends EventEmitter {
  constructor(rpc){
    super();
    this.rpc = rpc;
    this.sock = null;
    this.sendBuffer = [];
    this.recvBuffer = [];
    this.paused = false;
    this.bytesWritten = 0;
    this.bytesRead = 0;
    this.remoteAddress = null;
    this.remotePort = 0;
    this.closed = false;
  }
  async connect(port, host){
    this.remoteAddress = host;
    this.remotePort = port;
    const sock = new rpc_sock();
    this.sock = sock;
    sock.method('data', ({data})=>{
      data = Buffer.from(data, 'hex');
      if (this.paused){
        this.recvBuffer.push(data);
        return;
      }
      this.bytesRead += data.length;
      this.emit('data', data);
    });
    sock.method('error', ({message, code})=>{
      const err = new Error(message);
      err.code = code;
      this.emit('error', err);
    });
    sock.method('close', ()=>{
      if (this.closed)
        return;
      this.closed = true;
      this.emit('close');
    });
    sock.on('close', ()=>{
      if (this.closed)
        return;
      this.closed = true;
      this.emit('close');
    });
    const res = await sock.connect(this.rpc, 'tcp/out',
      {host, port});
    if (res.error){
      this.closed = true;
      this.emit('error', res.error);
      return;
    }
    this.remoteAddress = res.addr;
    this.remotePort = res.port;
    // Flush buffered writes
    for (const {data} of this.sendBuffer)
      sock.notify('data', {data: data.toString('hex')});
    this.sendBuffer = [];
    this.emit('connect');
  }
  write(data){
    this.bytesWritten += data.length;
    if (!this.sock){
      this.sendBuffer.push({data});
      return true;
    }
    this.sock.notify('data', {data: data.toString('hex')});
    return true;
  }
  setKeepAlive(enable, delay){
    this.sock?.notify('keep_alive', {enable, delay});
  }
  setNoDelay(enable){
    this.sock?.notify('no_delay', {enable});
  }
  setTimeout(timeout, fn){
    this.sock?.notify('set_timeout', {timeout});
    if (fn)
      this.on('timeout', fn);
  }
  pause(){
    this.paused = true;
    this.sock.notify('pause');
  }
  resume(){
    this.paused = false;
    const recv = this.recvBuffer;
    this.recvBuffer = [];
    for (const data of recv){
      this.bytesRead += data.length;
      this.emit('data', data);
    }
    this.sock.notify('resume');
  }
  destroy(){
    if (this.closed)
      return;
    this.closed = true;
    this.sock?.close();
  }
  static connect(rpc, port, host){
    const sock = new this(rpc);
    sock.connect(port, host);
    return sock;
  }
}

// HTTP/HTTPS request over rpc_sock
// Returns {status, headers, body: Buffer} or {error: string}
export async function http_sock_c(rpc, {url, method='GET', headers={}, body}){
  let sock = new rpc_sock();
  let resp = ewait();
  let done = ewait();
  let chunks = [];
  sock.method('response', ({status, headers})=>{
    resp.return({status, headers});
  });
  sock.method('data', ({data})=>{
    chunks.push(data);
  });
  sock.method('close', ()=>{
    done.return();
  });
  sock.method('error', ({message, code})=>{
    let err = OA(Error(message), {code});
    resp.throw(err);
    done.return();
  });
  let res = await sock.connect(rpc, 'http_connect', {url, method, headers});
  if (res.error)
    return res;
  if (body){
    let buf = Buffer.from(body);
    sock.notify('data', {data: buf.toString('hex')});
  }
  sock.notify('end', {});
  try { resp = await resp; }
  catch(err){ return {error: err.message}; }
  await done;
  let body_hex = chunks.join('');
  let body_buf = Buffer.from(body_hex, 'hex');
  return {...resp, body: body_buf};
}

