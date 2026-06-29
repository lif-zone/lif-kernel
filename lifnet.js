// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer, assert, rpc_websocket, version as util_version,
  ewait, is_node, OE, rpc_sock_pipe, str, url_http_to_ws, sock_error_log,
} from './util.js';
import etask from './etask.js';
import EventEmitter from './compat/events.js';
let D = 0;

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
  let resp_resolve, resp_reject;
  let resp_p = new Promise((res, rej)=>{ resp_resolve=res; resp_reject=rej; });
  let chunks = [];
  let done_resolve;
  let done_p = new Promise(res=>{ done_resolve=res; });
  sock.method('response', ({status, headers})=>{
    resp_resolve({status, headers});
  });
  sock.method('data', ({data})=>{
    chunks.push(data);
  });
  sock.method('close', ()=>{
    done_resolve();
  });
  sock.method('error', ({message, code})=>{
    let err = Object.assign(new Error(message), {code: code||null});
    resp_reject(err);
    done_resolve();
  });
  let res = await sock.connect(rpc, 'http_connect', {url, method, headers});
  if (res.error)
    return res;
  if (body){
    let buf = typeof body=='string' ? Buffer.from(body) : Buffer.from(body);
    sock.notify('data', {data: buf.toString('hex')});
  }
  sock.notify('end', {});
  let resp;
  try { resp = await resp_p; }
  catch(err){ return {error: err.message}; }
  await done_p;
  let body_hex = chunks.join('');
  let body_buf = Buffer.from(body_hex, 'hex');
  return {...resp, body: body_buf};
}

let trunk_url_base = is_node ? 'http://localhost:4000' : location.origin;
let trunk_url_ws = url_http_to_ws(trunk_url_base)+'/.lif.net';
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

let RETRY_MS = 1000;
export class Lifnet extends EventEmitter {
  method_fn = {};
  listen_fn = [];
  trunk_t = [];
  trunk;
  pub_t = [];
  rg_id = rg_id_get();
  rpc;
  status = 'offline';
  client_name;
  client_version;
  server_version;
  _wait_open;
  error;
  constructor({url, client_name, client_version}={}){
    super();
    this.client_name = client_name||'lifnet-leaf';
    this.client_version = client_version||util_version;
    if (url)
      this.trunk_add(url);
  }
  trunk_add(url){
    if (!this.trunk_t.some(t=>t.url==url))
      this.trunk_t.push({url, last: null});
    this.trunk_connect();
  }
  trunk_get_next(){
    function cmp(a, b){ return (a.last||0)<=(b.last||0); }
    let next = this.trunk_t[0];
    for (let t of this.trunk_t){
      if (cmp(next, t))
        next = t;
    }
    return next;
  }
  trunk_connect_step(){
    if (this.status=='closed')
      return;
    if (this.trunk_wait)
      this.trunk_wait.return('close');
    if (this.status=='online')
      return;
    if (this.rpc)
      return;
    let next = this.trunk_get_next();
    if (!next)
      return;
    if (Date.now()-next.last<RETRY_MS){
      (async()=>{
        await etask.sleep(next.last+RETRY_MS);
        this.trunk_connect_step();
      })();
      return;
    }
    this.trunk_connect();
  }
  set_events(){
    this.base_methods();
    this.rpc.on('close', ()=>{
      this.set_error('close');
      this.trunk_connect();
    });
    this.rpc.on('error', err=>this.set_error(err));
    for (let [method, fn] of OE(this.method_fn))
      this.rpc._method(method, fn);
    for (let [method, fn] of OE(this.listen_fn)){
      rpc_sock.listen(this.rpc, method, ({msg, sock})=>{
        this.base_methods(sock);
        return fn({msg, sock});
      });
    }
    for (let t of this.pub_t)
      this.call('topic_pub', {topic: t.topic, data: t.data});
  }
  async trunk_connect(){
    if (this._wait_open)
      return await this._wait_open;
    if (this.status=='closed')
      return;
    if (this.status=='online')
      return;
    if (this.rpc)
      return;
    let next = this.trunk_get_next();
    if (!next)
      return this.set_error('no trunks defined');
    let now = Date.now();
    let next_ms = Math.max(next.last+RETRY_MS-now, 0);
    if (next_ms){
      (async()=>{
        D && console.log('lifnet waiting reconnect');
        await etask.sleep(next_ms);
        this.trunk_connect();
      })();
      return;
    }
    this.trunk  = next;
    this.trunk.last = now;
    this._wait_open = ewait();
    this.rpc = new rpc_websocket({D: 1});
    D && console.log('lifnet connecting');
    this.set_events();
    try {
      await this.rpc.connect({url: this.trunk.url});
    } catch(e){
      return this.set_error('rpc_connect '+e);
    }
    let ret = await this.rpc.call('version',
      {name: this.client_name, version: this.client_version});
    if (ret.error)
      return this.set_error('server version err: '+ret.error);
    this.server_version = ret;
    ret = await this.rpc.call('rg_id', {rg_id: this.rg_id});
    if (ret.error)
      return this.set_error('rg_id err: '+ret.error);
    this.status = 'online';
    D && console.log('lifnet online');
    this.emit('online');
    ret = this._wait_open.return({status: 'online'});
    this._wait_open = null;
    return ret;
  }
  base_methods(sock){
    let rpc = sock || this;
    rpc.method('ping', ()=>({pong: 1}));
    rpc.method('version',
      ()=>({name: this.client_name, version: this.client_version}));
  }
  set_error(err){
    if (this.status!='offline')
      D && console.log('lifnet offline');
    this.status = 'offline';
    console.error(err);
    this.error = err;
    if (this.rpc)
      this.rpc.close();
    this.rpc = null;
    if (this._wait_open)
      this._wait_open.return({error: 'close'});
    this._wait_open = null;
    this.trunk_connect();
    return {error: err};
  }
  close(){
    this.set_error('close');
    this.status = 'closed';
  }
  async connect_loopback(sock, method, params){
    let fn = this.method_fn[method];
    if (!fn)
      return sock_error_log('no loopback method '+method);
    assert(0, 'rpc loopback not yet supported');
    // untested
    let msg = {method, params};
    let s = new rpc_sock();
    s._method(method, fn);
    s.accept({sock, msg});
    let ret = await fn({method, params});
    rpc_sock_pipe(sock, s);
    return ret;
  }
  connect(rg_id, method, params){
    let sock = new rpc_sock();
    this.base_methods(sock);
    let wait = (async()=>{
      let ret;
      if (rg_id==this.rg_id)
        ret = await this.connect_loopback(sock, method, params);
      else {
        ret = await sock.connect(this.rpc, 'rconnect',
          {rg_id, method, params});
      }
      if (ret.error){
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
    this._method(method, async({params})=>{
      return await fn(params);
    });
  }
  _method(method, fn){
    if (this.rpc)
      this.rpc._method(method, fn);
    if (!fn)
      return delete this.method_fn[method];
    this.method_fn[method] = fn;
  }
  async trunk_T_call(method, params){
    if (!this.rpc) // XXX check loopback
      return {error: 'offline'};
    return await this.rpc.T_call(method, params);
  }
  async trunk_call(method, params){
    if (!this.rpc) // XXX check loopback
      return {error: 'offline'};
    return await this.rpc.call(method, params);
  }
  async topic_get(topic){
    let addr = [];
    if (this.pub_t[topic])
      addr.push(g_rg_id);
    let ret = await this.trunk_call('topic_get', {topic});
    if (!ret.error && ret.addr?.length)
      addr.push(...ret.addr);
    return {addr};
  }
  async topic_pub(topic, data){
    this.pub_t[topic] = {topic, data};
    return await this.trunk_call('topic_pub', {topic, data});
  }
  async topic_unpub(topic){
    this.pub_t[topic] = null;
    return await this.trunk_call('topic_unpub', {topic});
  }
  async rcall(rg_id, method, params){
    if (rg_id==g_rg_id){ // loopback
      let fn = this.method_fn[method];
      if (!fn)
        return {error: 'no method '+method};
      return await fn({method, params});
    }
    return await this.trunk_call('rcall', {rg_id, method, params});
  }
  listen(method, fn){
    this.listen_fn[method] = fn;
    if (this.rpc){
      rpc_sock.listen(this.rpc, method, ({msg, sock})=>{
        this.base_methods(sock);
        return fn({msg, sock});
      });
    }
  }
}

let g_rg = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
export function rg_id_get(){
  return g_rg_id;
}
let g_lifnet;
export function lifnet_get(){
  if (g_lifnet)
    return g_lifnet;
  g_lifnet = new Lifnet();
  g_lifnet.trunk_add(trunk_url_ws);
  return g_lifnet;
}

export async function lifnet_online(){
  let lifnet = await lifnet_get();
  await lifnet.trunk_connect(); // wait for network to be 'online'
  return lifnet;
}

export async function lifnet_connect(topic, params, opt={}){
  let lifnet = await lifnet_online();
  let ret = await lifnet.topic_get(topic);
  let addr = ret?.addr;
  if (!addr)
    return {error: 'lifnet error: failed get topic '+topic};
  if (!addr.length)
    return {error: 'no '+topic+' servers online'};
  let rg, sock, _error, res;
  for (let id of addr){
    let _rg = g_rg[id] ||= {id};
    if (opt.rg_block?.(_rg))
      continue;
    let {sock: _sock, wait} = lifnet.connect(id, topic, params);
    let _ret = await wait;
    if (_ret.error){
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

export async function lifnet_listen(topic, fn){
  const lifnet = await lifnet_online();
  lifnet.listen(topic, fn);
  lifnet.topic_pub(topic);
}

export async function lifnet_call(topic, params){
  // TODO: use net._call() directly, dont connect with a socket first
  // TODO: add support for connection re-use: pooling by rg_id+topic
  let {sock, ret, error} = await lifnet_connect(topic, params);
  sock?.close();
  return {ret, error};
}

export async function lif_fetch(url, {method='GET', headers={}, body}={}){
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
