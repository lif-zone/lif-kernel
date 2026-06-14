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
    const res = await sock.connect(this.rpc, 'tcp_connect', {host, port});
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
export async function http_sock(rpc, {url, method='GET', headers={}, body=null}){
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
// Usage: lif_fetch(url, {rpc, method, headers, body})
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
    try {
      this.server_version = await this.rpc.T_call('version',
        {name: 'lif_netc', version: util_version});
    } catch(e){
      console.error('server version rpc', e);
      this.close();
      throw e; // XXX return
    }
    return this._wait_open.return(this.rpc);
  }
  async call(method, params){
    return await this.rpc.T_call(method, params);
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

export function lif_net_connect(topic){
  let lif_net = lif_net_get();
}

export async function lif_fetch(url,
  {server_http_out, method='GET', headers={}, body=null}={})
{
  server_http_out ||= lif_net_connect('server/ip_bridge/http_out');
  let res = await http_sock(server_http_out, {url, method, headers, body});
  if (res.error)
    throw new Error(res.error);
  return new Lif_response(res.status, res.headers, res.body);
}

