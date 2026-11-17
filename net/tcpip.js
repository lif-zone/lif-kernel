// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
//
// nodejs like network API (net, tls, fetch, WebSocket, dns), for the browser
// and for nodejs processes that proxy their traffic: the real connections
// are made by an out node (net/tcpip_s.js), reached over lifnet.
import EventEmitter from '../compat/events.js';
import {lifnet} from './lifnet.js';

// data travels as hex inside the rpc json messages
const hex_enc = buf=>buf.toHex();
const hex_dec = hex=>Uint8Array.fromHex(hex);
const utf8_enc = new TextEncoder();

function to_bytes(data){
  if (typeof data=='string')
    return utf8_enc.encode(data);
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw Error('invalid data type');
}

// options of this module, for all its connections:
// secure: the default of opt.secure of a TLS socket (see tcp_sock)
export const tcpip_opt = {secure: false};

// connects a sock to an out topic. returns {sock, result} or {error}
// sock_init(sock): set the sock methods. called before the connect, since
// the out node may send right after it
async function out_connect(topic, params, sock_init, timeout=10000){
  let res;
  try {
    res = await lifnet.connect(topic, params, {timeout, sock_init});
  } catch(err){
    res = {error: ''+err};
  }
  let error = res?.error || res?.ret?.error;
  if (error){
    res?.sock?.close();
    return {error: ''+(error.message||error)};
  }
  return {sock: res.sock, result: res.ret?.result ?? res.ret ?? {}};
}

// HTTP/HTTPS request over 'http/out': one request, no redirects.
// body: string or bytes
// Returns {status, status_text, headers, body: Uint8Array} or {error}
export async function http_sock_c({url, method='GET', headers={}, body}){
  let chunks = [], resp;
  let done = Promise.withResolvers();
  let {sock, error} = await out_connect('http/out', {url, method, headers},
    sock=>{
      sock.method('response', res=>resp = res);
      sock.method('data', ({data})=>void chunks.push(data));
      sock.method('close', ()=>done.resolve());
      sock.method('error', ({message})=>done.resolve({error: message}));
      sock.on('close', ()=>done.resolve());
    });
  if (error)
    return {error};
  if (body!=null)
    sock.notify('data', {data: hex_enc(to_bytes(body))});
  sock.notify('end', {});
  let res = await done.promise;
  sock.close();
  if (res?.error)
    return res;
  if (!resp)
    return {error: 'connection closed without a response'};
  return {...resp, body: hex_dec(chunks.join(''))};
}

// fetch() over 'http/out'. Returns a standard Response.
// opt: {method, headers, body, redirect: 'follow'|'manual'|'error'}
// A redirect is followed here: every hop is a new request through the out
// node, so every hop is checked by its ip policy.
export async function lif_fetch(url, opt={}){
  let {method='GET', body, redirect='follow'} = opt;
  let headers = Object.fromEntries(new Headers(opt.headers||{}));
  url = ''+url;
  for (let hop=0; ; hop++){
    let res = await http_sock_c({url, method, headers, body});
    if (res.error)
      throw new TypeError('lif_fetch failed: '+res.error);
    let {status} = res;
    let loc = res.headers.location;
    if (loc && [301, 302, 303, 307, 308].includes(status) &&
      redirect!='manual')
    {
      if (redirect=='error' || hop>=20)
        throw new TypeError('lif_fetch failed: redirect '+url);
      if (status==303 || status<303 && method.toUpperCase()=='POST'){
        method = 'GET';
        body = undefined;
      }
      url = new URL(loc, url).href;
      continue;
    }
    let h = new Headers();
    for (let [name, val] of Object.entries(res.headers)){
      for (let v of Array.isArray(val) ? val : [val])
        h.append(name, v);
    }
    let no_body = [101, 204, 205, 304].includes(status);
    let response = new Response(no_body ? null : res.body,
      {status, statusText: res.status_text||'', headers: h});
    Object.defineProperty(response, 'url', {value: url});
    Object.defineProperty(response, 'redirected', {value: hop>0});
    return response;
  }
}

export class browser_EventEmitter extends EventEmitter {
  _set_handler(event, fn){
    if (this['_h_'+event])
      this.off(event, this['_h_'+event]);
    this['_h_'+event] = fn;
    if (fn)
      this.on(event, fn);
  }
  addEventListener(event, fn){ this.on(event, fn); }
  removeEventListener(event, fn){ this.off(event, fn); }
  get onopen(){ return this._h_open||null; }
  set onopen(fn){ this._set_handler('open', fn); }
  get onmessage(){ return this._h_message||null; }
  set onmessage(fn){ this._set_handler('message', fn); }
  get onclose(){ return this._h_close||null; }
  set onclose(fn){ this._set_handler('close', fn); }
  get onerror(){ return this._h_error||null; }
  set onerror(fn){ this._set_handler('error', fn); }
}

// WebSocket-like object over 'websocket/out'.
// new lif_WebSocket(url, protocols, {headers})
// A binary message is given as an ArrayBuffer.
export class lif_WebSocket extends browser_EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0; // CONNECTING
  binaryType = 'arraybuffer';
  protocol = '';
  sock = null;
  constructor(url, protocols, opt={}){
    super();
    this.url = ''+url;
    this.protocols = protocols;
    this._connect(opt);
  }
  async _connect(opt){
    let early = [];
    let params = {url: this.url, headers: opt.headers||{}};
    if (this.protocols)
      params.protocols = this.protocols;
    let {sock, result, error} = await out_connect('websocket/out', params,
      sock=>{
        sock.method('message', ({data, binary})=>{
          if (binary)
            data = hex_dec(data).buffer;
          // a message that came together with the open: after 'open'
          if (early)
            return void early.push(data);
          this._message(data);
        });
        sock.method('close', ({code=1000, reason=''}={})=>
          this._close(code, reason));
        sock.method('error', ({message})=>this._error(message));
        // a failed connect is reported below, with its error
        sock.on('close', ()=>{
          if (sock==this.sock)
            this._close(1006, '');
        });
      });
    if (error){
      this._error(error);
      return this._close(1006, '');
    }
    if (this.readyState>=2) // close() during the connect
      return void sock.notify('close', {code: 1000, reason: ''});
    this.sock = sock;
    this.protocol = result.protocol||'';
    this.readyState = 1; // OPEN
    this.emit('open', {type: 'open', target: this});
    let msgs = early;
    early = null;
    for (let data of msgs)
      this._message(data);
  }
  _message(data){
    this.emit('message', {data, type: 'message', target: this});
  }
  _error(message){
    this.emit('error', {message, type: 'error', target: this});
  }
  _close(code, reason){
    if (this.readyState==3)
      return;
    this.readyState = 3;
    try {
      this.sock?.close();
    } catch(err){}
    this.emit('close', {code, reason, wasClean: code!=1006, type: 'close',
      target: this});
  }
  send(data){
    if (this.readyState!=1)
      throw Error('WebSocket is not open');
    if (typeof data=='string')
      this.sock.notify('send', {data, binary: false});
    else
      this.sock.notify('send', {data: hex_enc(to_bytes(data)), binary: true});
  }
  close(code=1000, reason=''){
    if (this.readyState>=2)
      return;
    this.readyState = 2; // CLOSING
    this.sock?.notify('close', {code, reason});
  }
}

// DNS lookup over 'dns/out', as dns.promises.lookup() of nodejs.
// Returns {address, family}, or with opt.all an array of them. Throws on
// failure.
export async function lif_dns_lookup(host, {family=4, all}={}){
  let {sock, result, error} = await out_connect('dns/out', {host, family});
  sock?.close();
  if (error)
    throw Error(error);
  return all ? result.addrs : result.addrs[0];
}

// JSON-RPC over a WebSocket ('ws:', 'wss:') or over a line socket ('tcp:',
// 'ssl:', 'ussl:' unverified ssl), over 'rpc/websocket/out'.
// let rpc = new lif_rpc_websocket(url); await rpc.connect();
// await rpc.call(method, params); rpc.method(name, fn) for notifications
export class lif_rpc_websocket extends EventEmitter {
  sock = null;
  constructor(url){
    super();
    this.url = url;
    this._methods = {};
  }
  async connect(){
    let {sock, error} = await out_connect('rpc/websocket/out',
      {url: this.url}, sock=>{
        sock._method('', async msg=>{
          let {id, method, params} = msg;
          let fn = this._methods[method];
          if (id==null){
            if (fn)
              fn(params);
            return;
          }
          if (!fn)
            return {error: 'method not found: '+method};
          try {
            return await fn(params);
          } catch(err){
            return {error: ''+err};
          }
        });
        sock.on('close', ()=>this.emit('close'));
        sock.on('error', err=>this.emit('error', err));
      });
    if (error)
      throw new Error(error);
    this.sock = sock;
    return this;
  }
  method(name, fn){
    this._methods[name] = fn;
  }
  // returns the result. throws the error of the server
  async call(method, params){
    return await this.sock.T_call(method, params);
  }
  notify(method, params){
    this.sock.notify(method, params);
  }
  close(){
    this.sock?.close();
  }
}

// TCP socket proxy — mirrors net.Socket API over lifnet 'tcp/out'.
// The out node (net/tcpip_s.js) makes the real TCP connection.
// opt.tls: a TLS connection. Without opt.secure its made by the out node:
//   TLS ends there, and the out node sees the plain data.
// opt.secure: (tls) TLS is made here, end to end with the server: the out
//   node makes only the TCP connection, and sees encrypted bytes. The
//   certificate of the server is verified here. The TLS code
//   (net/tcpip_tls.js) is loaded on the first such connection.
//   default: tcpip_opt.secure
// opt.rejectUnauthorized: false accepts any server certificate (tls)
// opt.servername: the name the certificate must be for (default: host)
// opt.timeout: ms to wait for the connection, and for the TLS handshake of a
//   secure connection (default 10000)
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
    let secure = this._secure = !!(tls &&
      (this.opt.secure ?? tcpip_opt.secure));
    this.remoteAddress = host;
    this.remotePort = port;
    this._timeout_set();
    let params = {host, port};
    // secure: a plain TCP connection at the out node. TLS is made here
    if (tls && !secure){
      params.tls = true;
      if (rejectUnauthorized!==undefined)
        params.rejectUnauthorized = rejectUnauthorized;
    }
    // loaded before connecting: the first load takes time, and a server
    // closes a connection that stays silent
    let tls_mod;
    if (secure){
      try {
        tls_mod = await import('./tcpip_tls.js');
      } catch(err){
        this.connecting = false;
        return this._close('tls: failed to load: '+err);
      }
      if (this.destroyed)
        return;
    }
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
    if (secure){
      // writes wait for the TLS handshake
      this.emit('connect');
      return this._tls_start(tls_mod, host, timeout);
    }
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
  // secure TLS: start the handshake, over the connected sock
  _tls_start(tls_mod, host, timeout){
    let {rejectUnauthorized, servername} = this.opt;
    this.encrypted = true;
    this.authorized = rejectUnauthorized!==false;
    this._tls = tls_mod.tls_client({
      host: servername||host,
      verify: this.authorized,
      write: data=>this.sock.notify('data', {data: hex_enc(data)}),
      on_secure: ()=>this._tls_secure(),
      on_data: data=>this._recv(data),
      on_end: err=>{
        if (this.closed)
          return;
        if (err)
          return this._close('tls: '+(err.message||err));
        this.emit('end');
        this._close();
      },
      // a missing certificate of the chain: fetched through the out node
      cert_fetch: async url=>{
        let res = await lif_fetch(url);
        if (!res.ok)
          throw Error('failed to fetch certificate '+url+': '+res.status);
        return new Uint8Array(await res.arrayBuffer());
      },
    });
    this._tls_timer = setTimeout(()=>this._close('tls: handshake timeout'),
      timeout);
    this._tls.start();
  }
  // the TLS handshake is done
  _tls_secure(){
    if (this.destroyed)
      return;
    clearTimeout(this._tls_timer);
    this._tls_ready = true;
    for (let data of this.sendBuffer)
      this._tls_send(data);
    this.sendBuffer = [];
    if (this._end)
      this._end_send();
    this.emit('secureConnect');
  }
  _tls_send(data){
    this._tls_sent = this._tls.send(data);
  }
  // FIN, after the data that is still being encrypted
  async _end_send(){
    if (this._secure){
      if (!this._tls_ready)
        return;
      await this._tls_sent;
    }
    if (!this.destroyed)
      this.sock?.notify('end');
  }
  _sock_init(sock){
    sock.method('data', ({data})=>{
      if (sock!=this.sock && this.sock)
        return;
      data = hex_dec(data);
      if (!this._secure)
        return this._recv(data);
      this._tls?.recv(data);
    });
    sock.method('error', ({message, code})=>{
      let err = new Error(message);
      err.code = code;
      this._error = err;
    });
    sock.method('end', ()=>this.emit('end'));
    sock.method('close', ()=>this._close_remote());
    sock.on('close', ()=>{
      if (sock==this.sock)
        this._close_remote();
    });
  }
  // plain data from the server
  _recv(data){
    if (this.paused)
      return void this.recvBuffer.push(data);
    this._data(data);
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
  // closed by the other side
  _close_remote(){
    if (this._secure && !this._tls_ready && !this._error)
      return this._close('tls: connection closed before the handshake ended');
    this._close();
  }
  // like net.Socket: 'error' (if any) and then 'close'
  _close(error){
    if (this.closed)
      return;
    this.closed = this.destroyed = true;
    clearTimeout(this._timer);
    clearTimeout(this._tls_timer);
    if (typeof error=='string')
      error = new Error(error);
    error ||= this._error;
    this._tls?.end();
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
    data = to_bytes(data);
    this._timeout_set();
    this.bytesWritten += data.length;
    if (this._secure ? !this._tls_ready : !this.sock)
      this.sendBuffer.push(data);
    else if (this._secure)
      this._tls_send(data);
    else
      this.sock.notify('data', {data: hex_enc(data)});
    cb?.();
    return true;
  }
  // no more writes: the other side gets FIN
  end(data, encoding, cb){
    if (data!=null && typeof data!='function')
      this.write(data, encoding);
    this._end = true;
    this._end_send();
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
// tcp_sock that makes a TLS connection (at the out node)
export class tls_sock extends tcp_sock {
  constructor(opt={}){
    super({...opt, tls: true});
  }
}

function sock_connect(sock, args){
  let [port, host, cb] = args;
  if (typeof port=='object'){
    cb = host;
    ({port, host} = port);
  }
  return sock.connect(port, host, cb);
}

// the net and tls modules of nodejs, on tcp_sock:
// net.connect(port, host, cb), net.connect({port, host}, cb)
// tls.connect({port, host, rejectUnauthorized}, cb),
// tls.connect(port, host, {rejectUnauthorized}, cb)
export const net = {
  Socket: tcp_sock,
  connect: (...args)=>sock_connect(new tcp_sock(), args),
  createConnection: (...args)=>net.connect(...args),
};
export const tls = {
  TLSSocket: tls_sock,
  connect(port, host, opt, cb){
    if (typeof port=='object')
      return sock_connect(new tls_sock(port), [port, host]);
    if (typeof host!='string')
      [host, opt, cb] = [undefined, host, opt];
    if (typeof opt=='function')
      [opt, cb] = [{}, opt];
    return sock_connect(new tls_sock(opt||{}), [port, host, cb]);
  },
};
export const dns = {lookup: lif_dns_lookup};
