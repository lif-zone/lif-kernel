// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
import {rpc_sock, Buffer, ewait, OA} from '../util.js';
import EventEmitter from '../compat/events.js';
import {lifnet_init, lifnet_connect, lifnet_call} from './lifnet.js';

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

