// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer, assert, rpc_websocket, version as util_version,
  ewait,
} from './util.js';
import EventEmitter from './compat/events.js';

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
    const res = await sock.connect(this.rpc, 'server/ip_bridge/tcp_out',
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

function ws_origin(){
  let protocol = location.protocol=='http:' ? 'ws:' :
    location.protocol=='https:' ? 'wss:' : assert();
  return protocol+'//'+location.host;
}
let lif_rg_url = ws_origin()+'/.lif.rg';

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

let g_rpc_t = {};
function net_rg_connect(){
  let rpc = new rpc_websocket({D: 1});
}

export class Lif_net {
  rpc;
  url;
  _wait_open;
  error;
  constructor(){
    this.url = ws_origin()+'/.lif.rg';
    this.rpc = new rpc_websocket({D: 1});
    this.set_events();
    this.rpc.on('close', ()=>this.is_closed = true);
  }
  set_events(){
    this.rpc.method('ping', ()=>({pong: 1}));
    this.rpc.method('version',
      ()=>({name: 'lif-coin-wallet', version: util_version}));
  }
  set_error(err){
    console.error('server version rpc', err);
    this.error = err;
    this.close();
    return {error: err};
  }
  connect(rg_id, method, params){
    let sock = new rpc_sock();
    this.set_events(sock);
    let wait = (async()=>{
      let ret = await sock.connect(this.rpc, 'rconnect',
        {rg_id, method, params});
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
  async _connect(){
    if (this._wait_open)
      return await this._wait_open;
    this._wait_open = ewait();
    try {
      await this.rpc.connect({url: this.url});
    } catch(e){
      console.error('rpc_connect', e);
      this.rpc.close();
      throw e; // return
    }
    let ret = await this.rpc.call('version',
      {name: 'lif_netc', version: util_version});
    if (ret.error)
      return this.set_error('server version err: '+ret.error);
    this.server_version = ret;
    return this._wait_open.return();
  }
  async T_call(method, params){
    return await this.rpc.T_call(method, params);
  }
  async call(method, params){
    return await this.rpc.call(method, params);
  }
  close(){
    this._wait_open.throw('close');
    this.rpc.close();
  }
  async topic_get(topic){
    return await this.call('topic_get', {topic});
  }
  async topic_pub(topic, data){
    return await this.call('topic_pub', {topic, data});
  }
  async topic_unpub(topic){
    return await this.call('topic_unpub', {topic});
  }
  async rcall(rg_id, method, params){
    return await this.call('rcall', {rg_id, method, params});
  }
  async rg_id(rg_id){
    return await this.call('rg_id', {rg_id});
  }
  listen(method, fn){
    rpc_sock.listen(this.rpc, method, ({msg, sock})=>{
      sock.method('ping', ()=>({pong: 1}));
      return fn({msg, sock});
    });
  }
}

let g_rg = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
export function lif_rg_id_get(){
  return g_rg_id;
}
let g_lif_net;
export function lif_net_get(){
  if (g_lif_net?.error){
    g_lif_net.close();
    g_lif_net = null;
  }
  if (g_lif_net)
    return g_lif_net;
  g_lif_net = new Lif_net();
  return g_lif_net;
}

export async function lif_net_connect(topic, opt={}){
  let net = lif_net_get();
  await net._connect();
  let ret = await net.topic_get(topic);
  let addr = ret?.addr;
  if (!addr)
    return {error: 'lif_net error: failed get topic '+topic};
  if (!addr.length)
    return {error: 'no '+topic+' servers online'};
  let rg, sock, _error;
  for (let id of addr){
    let _rg = g_rg[id] ||= {id};
    if (opt.rg_block?.(_rg))
      continue;
    let {sock: _sock, wait} = net.connect(id, topic);
    ret = await wait;
    if (ret.error){
      console.log('failed connecting to '+id);
      _error = ret.error;
      continue;
    }
    sock = _sock;
    rg = _rg;
  }
  if (!rg)
    return {error: 'no good '+topic+' servers online: '+_error};
  return {sock, rg};
}

export async function lif_fetch(url, {method='GET', headers={}, body}={}){
  let {sock, rg} = lif_net_connect('server/ip_bridge/http_out');
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
      let res = await sock.connect(this.rpc, 'server/ip_bridge/websocket_out',
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

