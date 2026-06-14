// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer} from './util.js';
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
