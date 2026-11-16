// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
import {Buffer, ewait, OA} from '../util.js';
import {rpc_sock} from '../rpc.js';
import EventEmitter from '../compat/events.js';
import {lifnet} from './lifnet.js';

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
  let {sock, error} = lifnet.connect('http/out');
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
  return await lifnet.call('dns/out', {host, family});
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

// data travels as hex inside the rpc json messages
const hex_enc = buf=>buf.toHex();
const hex_dec = hex=>Uint8Array.fromHex(hex);
const utf8_enc = new TextEncoder();

// TCP socket proxy — mirrors net.Socket API over lifnet 'tcp/out'.
// The out node (net/tcpip_s.js) makes the real TCP connection.
// opt.tls: the out node makes a TLS connection. TLS ends at the out node: the
//   out node sees the plain data.
// opt.rejectUnauthorized: false accepts any server certificate (tls)
// opt.timeout: ms to wait for the connection (default 10000)
export class tcp_sock extends EventEmitter {
  constructor(opt={}){
    super();
    this.opt = opt;
    this.sock = null;
    this.sendBuffer = [];
    this.recvBuffer = [];
    this.paused = false;
    this.bytesWritten = 0;
    this.bytesRead = 0;
    this.remoteAddress = null;
    this.remotePort = 0;
    this.connecting = false;
    this.destroyed = false;
    this.closed = false;
  }
  // connect(port, host, cb) or connect({port, host}, cb)
  connect(port, host, cb){
    if (typeof port=='object'){
      cb = host;
      ({port, host} = port);
    }
    if (typeof host=='function'){
      cb = host;
      host = undefined;
    }
    host ||= 'localhost';
    if (cb)
      this.once('connect', cb);
    this.connecting = true;
    this._connect(+port, host);
    return this;
  }
  async _connect(port, host){
    let {tls, rejectUnauthorized, timeout=10000} = this.opt;
    this.remoteAddress = host;
    this.remotePort = port;
    this._timeout_set();
    let params = {host, port};
    if (tls)
      params.tls = true;
    if (rejectUnauthorized!==undefined)
      params.rejectUnauthorized = rejectUnauthorized;
    let res;
    try {
      // sock_init: data may arrive right after the connect, so the methods
      // must be there before
      res = await lifnet.connect('tcp/out', params,
        {timeout, sock_init: sock=>this._sock_init(sock)});
    } catch(err){
      res = {error: ''+err};
    }
    let error = res?.error || res?.ret?.error;
    if (this.destroyed){
      res?.sock?.close();
      return;
    }
    if (error){
      this.connecting = false;
      return this._close(error);
    }
    let sock = this.sock = res.sock;
    let addr = res.ret?.result || res.ret || {};
    this.remoteAddress = addr.addr||host;
    this.remotePort = addr.port||port;
    this.connecting = false;
    // Flush buffered writes
    for (let data of this.sendBuffer)
      sock.notify('data', {data: hex_enc(data)});
    this.sendBuffer = [];
    if (this._end)
      sock.notify('end');
    this.emit('connect');
    if (tls)
      this.emit('secureConnect');
  }
  _sock_init(sock){
    sock.method('data', ({data})=>{
      if (sock!=this.sock && this.sock)
        return;
      data = hex_dec(data);
      if (this.paused)
        return void this.recvBuffer.push(data);
      this._data(data);
    });
    sock.method('error', ({message, code})=>{
      let err = new Error(message);
      err.code = code;
      this._error = err;
    });
    sock.method('end', ()=>this.emit('end'));
    sock.method('close', ()=>this._close());
    sock.on('close', ()=>{
      if (sock==this.sock)
        this._close();
    });
  }
  _data(data){
    this._timeout_set();
    this.bytesRead += data.length;
    if (this._decoder)
      data = this._decoder.decode(data, {stream: true});
    else if (globalThis.Buffer)
      data = globalThis.Buffer.from(data);
    this.emit('data', data);
  }
  // like net.Socket: 'error' (if any) and then 'close'
  _close(error){
    if (this.closed)
      return;
    this.closed = this.destroyed = true;
    clearTimeout(this._timer);
    if (typeof error=='string')
      error = new Error(error);
    error ||= this._error;
    try {
      this.sock?.close();
    } catch(err){}
    if (error)
      this.emit('error', error);
    this.emit('close', !!error);
  }
  write(data, encoding, cb){
    if (typeof encoding=='function')
      cb = encoding;
    if (this.destroyed)
      return false;
    if (typeof data=='string')
      data = utf8_enc.encode(data);
    this._timeout_set();
    this.bytesWritten += data.length;
    if (this.sock)
      this.sock.notify('data', {data: hex_enc(data)});
    else
      this.sendBuffer.push(data);
    cb?.();
    return true;
  }
  // no more writes: the other side gets FIN
  end(data, encoding, cb){
    if (data!=null && typeof data!='function')
      this.write(data, encoding);
    this._end = true;
    this.sock?.notify('end');
    return this;
  }
  setEncoding(encoding='utf8'){
    this._decoder = new TextDecoder(encoding);
    return this;
  }
  setKeepAlive(enable, delay){
    this.sock?.notify('keep_alive', {enable, delay});
    return this;
  }
  setNoDelay(enable=true){
    this.sock?.notify('no_delay', {enable});
    return this;
  }
  // 'timeout' is emitted after timeout ms without data in or out.
  // 0 disables it. as in net.Socket, the socket is not closed by it
  setTimeout(timeout, fn){
    this._timeout = timeout;
    if (fn)
      this.once('timeout', fn);
    this._timeout_set();
    return this;
  }
  _timeout_set(){
    clearTimeout(this._timer);
    if (!this._timeout || this.destroyed)
      return;
    this._timer = setTimeout(()=>this.emit('timeout'), this._timeout);
  }
  pause(){
    this.paused = true;
    this.sock?.notify('pause');
    return this;
  }
  resume(){
    this.paused = false;
    let recv = this.recvBuffer;
    this.recvBuffer = [];
    for (let data of recv)
      this._data(data);
    this.sock?.notify('resume');
    return this;
  }
  destroy(error){
    if (this.destroyed)
      return this;
    this.destroyed = true;
    // 'close' is emitted after destroy() returned, as net.Socket does
    queueMicrotask(()=>this._close(error));
    return this;
  }
  ref(){ return this; }
  unref(){ return this; }
  static connect(port, host, opt){
    return new this(opt).connect(port, host);
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

