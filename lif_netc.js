// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer} from './util.js';
import EventEmitter from './compat/events.js';

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
  connect(port, host){
    this.remoteAddress = host;
    this.remotePort = port;
    (async()=>{
      try {
        const sock = new rpc_sock();
        this.sock = sock;
        // Data
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
        this.remoteAddress = res.addr;
        this.remotePort = res.port;
        // Flush buffered writes
        for (const {data, cb} of this.sendBuffer){
          sock.notify('data', {data: data.toString('hex')});
          if (cb)
            cb();
        }
        this.sendBuffer = [];
        this.emit('connect');
      } catch(err){
        this.closed = true;
        this.emit('error', err instanceof Error ? err : new Error(''+err));
      }
    })();
  }
  write(data, callback){
    this.bytesWritten += data.length;
    if (!this.sock){
      this.sendBuffer.push({data, cb: callback});
      return true;
    }
    this.sock.notify('data', {data: data.toString('hex')});
    if (callback)
      callback();
    return true;
  }
  setKeepAlive(enable, delay){
    this.sock?.notify('keep_alive', {enable, delay});
  }
  setNoDelay(enable){
    this.sock?.notify('no_delay', {enable});
  }
  setTimeout(timeout, callback){
    this.sock?.notify('set_timeout', {timeout});
    if (callback)
      this.on('timeout', callback);
  }
  pause(){
    this.paused = true;
    this.sock?.notify('pause');
  }
  resume(){
    this.paused = false;
    const recv = this.recvBuffer;
    this.recvBuffer = [];
    for (const data of recv){
      this.bytesRead += data.length;
      this.emit('data', data);
    }
    this.sock?.notify('resume');
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
