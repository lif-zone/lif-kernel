// LICENSE_CODE JPL rpc.js
let rpc_version = '2026.8.30';
export const version = rpc_version;
const is_worker = !globalThis.window;
export const is_node = globalThis.process?.versions?.node!==undefined;
let D = 0; // Debug

const {eslow, ewait, assert, CE, CEL, OE, str} = await import('./util.js');
const EventEmitter = (await import(is_node ? 'events' : './compat/events.js')).default;

export class rpc_base extends EventEmitter {
  method_fn = {};
  id_fn = {};
  id = 0;
  req = {};
  _wait_open = ewait();
  error;
  state;
  jsonrpc;
  D = 0;
  is_json = false;
  is_connect;
  constructor(opt={}){
    super();
    if (opt.D)
      this.D = 1;
    this.pre = opt.pre||'rpc';
    this.D && console.log(this.pre+'>>connect');
    if (opt.is_json)
      this.is_json = opt.is_json;
    if (opt.is_connect!=undefined)
      this.is_connect = opt.is_connect;
  }
  id_get(){
    return this.id++;
  }
  set_client_name(client_name){
    this.client_name = client_name;
  }
  async wait_open(){
    return await this._wait_open;
  }
  async T_call(method, params){
    let res = await this._call(method, params);
    if ('error' in res){
      throw res.error;
    }
    return res.result;
  }
  async U_call(method, params){
    let res = await this._call(method, params);
    if ('error' in res)
      return;
    return res.result;
  }
  async call(method, params){
    let res = await this._call(method, params);
    if ('error' in res)
      return res;
    return res.result==null ? false : res.result;
  }
  async _call(method, params, opt){
    assert(typeof method=='string', 'invalid method type');
    let id = this.id_get();
    let req = this.req[id] = {wait: ewait(), method};
    const request = req.request = {id, method};
    if (params)
      request.params = params;
    if (this.jsonrpc)
      request.jsonrpc = this.jsonrpc;
    let res;
    let slow = eslow(5000, 'rpc '+method);
    try {
      if (!await this._wait_open)
        throw Error('rpc not open');
      this.send(request, opt);
      this.D && console.log(this.pre+id+'>> '+method, params);
      let ret = await req.wait;
      if ('error' in ret){
        assert(ret.error, 'invalid false error val: '+ret.error);
        res = ret;
      } else if ('result' in ret)
        res = ret;
      else
        res = {error: 'invalid msg: no result or error'};
    } catch(err){ CE(err);
      console.error('rpc failed '+method+' call:', err, request);
      res = {error: ''+err};
    }
    slow.end();
    0 && this.D && console.log(
      this.pre+id+'>< '+(res.error!==undefined ? 'error ' : '')+method, res);
    return res;
  }
  notify(method, params, opt){
    assert(typeof method=='string', 'invalid method type');
    const request = {method};
    if (params)
      request.params = params;
    if (this.jsonrpc)
      request.jsonrpc = this.jsonrpc;
    return this.send(request, opt);
  }
  async _emit_res(msg, opt){
    let {id} = msg, req;
    if (typeof id!='string' && typeof id!='number')
      return console.error('rpc: invalid msg id', msg);
    if (!(req = this.req[id]))
      return console.error('rpc: unexpected msg id', msg);
    delete this.req[id];
    req.wait.return(msg);
  }
  async _emit_call(msg, opt){
    let {id, method, params} = msg;
    let method_fn = this.method_fn[method] || this.method_fn[''];
    let res;
    if (this.jsonrpc)
      msg.jsonrpc ??= this.jsonrpc;
    this.D && console.log(this.pre+JSON.stringify(id)+'<> '+method, params);
    let slow = eslow('rpc on handler '+method);
    try {
      if (!method_fn)
        throw 'unsupported method '+method;
      let ret = await method_fn(msg);
      if (ret===rpc_base.sym_filter)
        return;
      if (ret && 'error' in ret){
        assert(ret.error, 'invalid false error val: '+ret.error);
        res = ret;
      } else if (ret && 'result' in ret)
        res = ret;
      else
        res = {result: ret};
    } catch(err){ CE(err);
      console.error(err);
      res = {error: ''+err};
    } finally {
      slow.end();
    }
    res = {...res, id};
    if (this.D || 'error' in res){
      console.log(this.pre+id+'<< '+(res.error ? 'err ' : '')+method, /*params,*/
        res.error||res.result);
    }
    this.send(res, opt);
  }
  async _emit_notify(msg, opt){
    let {method, params} = msg;
    let method_fn = this.method_fn[method] || this.method_fn[''];
    if (!method_fn)
      return console.error('rpc: invalid cmd', method);
    this.D && console.log(this.pre+'<= '+method, params);
    let slow = eslow('rpc notify '+method);
    try {
      await method_fn(msg);
    } catch(err){ CE(err);
      console.error('rpc failed notify', msg, err);
    } finally {
      slow.end();
    }
  }
  emit_msg(msg, opt){
    if (this.jsonrpc && !msg.jsonrpc)
      return console.error('rpc: not jsonrpc msg', msg);
    if (!msg)
      return console.error('rpc: invalid empty msg');
    let fn;
    if (Array.isArray(msg.id)){
      let key = JSON.stringify(msg.id[0]);
      if (fn=this.id_fn[key]){
        let ret = fn({msg, opt});
        if (ret!==rpc_base.sym_filter)
          return ret;
      }
    } else if (msg.id!=null && (fn=this.id_fn[msg.id])){
      let ret = fn({msg, opt});
      if (ret!==rpc_base.sym_filter)
        return ret;
    }
    if (msg.method==null)
      return this._emit_res(msg, opt);
    if (msg.id==null)
      return this._emit_notify(msg, opt);
    return this._emit_call(msg, opt);
  }
  emit_connect(){
    if (str.is(this.state, 'open', 'error', 'close'))
      return;
    this._wait_open.return(true);
    this.state = 'open';
  }
  emit_error(err){
    if (str.is(this.state, 'error', 'close'))
      return;
    this.D && console.log(this.pre+'>! error: '+err);
    this.state = 'error';
    this.error = err || 'rpc error';
    this._wait_open.throw('error');
    this.emit('error', err);
    this.emit_close();
  }
  emit_close(){
    if (this.state=='close')
      return;
    this.D && console.log(this.pre+'>! close');
    this.state = 'close';
    this._wait_open.throw('close');
    for (let [id, req] of OE(this.req)){
      delete this.req[id];
      req.wait.throw('close');
    }
    for (let [id, fn] of OE(this.id_fn)){
      fn({close: true});
      delete this.id_fn[id];
    }
    this.emit('close');
  }
  method(method, fn){
    if (!fn)
      return this.method_close(method);
    this._method(method, async({params})=>{
      return await fn(params);
    });
  }
  _method(method, fn){
    if (!fn)
      return this.method_close(method);
    assert(!this.method_fn[method], 'rpc double listen('+method+')'); 
    this.method_fn[method] = fn;
  }
  method_close(method){
    for (let [id, req] of OE(this.req)){
      if (req.method==method)
        req.wait.throw('close');
    }
    delete this.method_fn[method];
  }
  on_id(id, fn){
    if (!fn){
      delete this.id_fn[id];
      return;
    }
    if (this.state=='close')
      return void fn({close: true});
    this.id_fn[id] = fn;
  }
  close(){
    this.emit_close();
  }
}
rpc_base.sym_filter = Symbol('filter');

// rpc messages today:
// - rpc call: (with responce)
//   ab> {id: 18, method: 'calc', params: '6x9'}
//   ab< {id: 18, result: '42'} // or error: 'ITSH'
// - rpc notify: (no responce)
//   ab> {method: 'info', params: 'sixnine'}
// - rpc_sock call sock: (bidir socket)
//   ab> {id: 18, seq: 0, method: 'calc', params: '6x9'}
//   ab< {id: 18, seq: 0, result: 'thinking'}
//   ab< {id: 18, seq: 0, method: 'update', params: 'thinking'} // seq 0 collision bug
//   ab> {id: 18, seq: 0, result: 'well?'}
//   ab< {id: 18, seq: 1, close: true, method: 'calc_done', params: '42?'}
// XXX: currently there is a bug in implementation of rpc_sock that msg.id
// initiated from each side are not unique, thus they get mixed up.
// also a problem is that you cannot put an rpc_sock in an rpc_sock.
// solution: the side openng the sock (that sends {seq: 0, method: '...'}
// its requests will be marked as 'c' (client) and the responder as
// 's' (server)
// - rpc_sock call sock: (bidir socket)
//   ab> {id: [{c: 18}, 0], method: 'calc', params: '6x9'}
//   ab< {id: [{c: 18}, 0], result: 'thinking'}
//   ab< {id: [{c: 18}, 0], method: 'update', params: 'thinking'}
//   ab> {id: [{c: 18}, 0], result: 'well?'}
//   ab< {id: [{c: 18}, 1], close: true, method: 'calc_done', params: '42?'}
//   which allows in-between to have the server also initiate a sock,
//   re-using the same id without any problems:
//   ab< {id: [{s: 18}, 0], method: 'stats'}
//   ab> {id: [{s: 18}, 0], result: 'thinking'}
//   ab> {id: [{s: 18}, 0], method: 'update', params: 'reached beach 6'}
//   ab< {id: [{s: 18}, 0], result: 'shalom and thanks for the feed!'}
//   ab> {id: [{s: 18}, 1], close: true, method: 'calc_done', params: '48'}
// - and it allows rpc_sock over rpc_sock:
//   ab> {id: [{c: 18}, 0], method: 'mine', params: 'forty'}
//   ab< {id: [{c: 18}, 0], result: 'ok'}
//   ab> {id: [{c: 18}, {c: 1}, 0], method: 'sub mine', params: 'and'}
//   ab< {id: [{c: 18}, {c: 1}, 0], result: 'added and two'}
//   ab> {id: [{c: 18}, {c: 1}, 1], method: 'sub mine', params: 'rich lif'}
//   ab< {id: [{c: 18}, {c: 1}, 1], close: true, result: '10 18'}
// - to send a notify: (no responce)
//   ab> {id: [{c: 18}, {c: 1}], method: 'mark deep sock'}
//   ab> {id: [{c: 18}], method: 'mark'}
export class rpc_sock extends rpc_base {
  rpc;
  _id;
  req = {};
  send(msg, opt){
    if (this.state=='close')
      return void console.log(this.pre+': send() after close', msg);
    let inner = msg.id;
    let id;
    if (inner==null)
      id = [...this._id];
    else if (Array.isArray(inner))
      id = [...this._id, ...inner];
    else
      id = [...this._id, inner];
    msg = {...msg, id};
    this.rpc.send(msg, opt);
  }
  emit_close(){
    if (this._id && this.rpc)
      this.rpc.on_id(JSON.stringify(this._id[0]));
    super.emit_close();
  }
  set_events(){
    let key = JSON.stringify(this._id[0]);
    this.rpc.on_id(key, ({msg, opt, close})=>{
      if (close){
        this.D && console.log(this.pre+': parent close closing id', this._id);
        return this.emit_close();
      }
      let rest = msg.id.slice(1);
      let inner_id;
      if (!rest.length)
        inner_id = null;
      else if (rest.length==1 && typeof rest[0]=='number')
        inner_id = rest[0];
      else
        inner_id = rest;
      let _msg = {...msg};
      if (inner_id==null)
        delete _msg.id;
      else
        _msg.id = inner_id;
      if (inner_id!=null || _msg.method!=null)
        this.emit_msg(_msg, opt);
      if (msg.close)
        this.emit_close();
    });
    this.emit_connect();
  }
  async connect(rpc, method, params){
    assert(!this.rpc, 'sock already connected/accepted');
    this.is_connect = true;
    this.rpc = rpc;
    if (this.rpc.state=='close'){
      this.close();
      return {error: 'rpc closed'};
    }
    this._id = [{[this.rpc.is_connect ? 'c' : 's']: this.rpc.id_get()}];
    this.set_events();
    console.log('rpc_sock connect '+method);
    return await this._call(method, params);
  }
  accept({rpc, msg}){
    assert(!this.rpc, 'sock already connected/accepted');
    this.is_connect = false;
    this.rpc = rpc;
    this._id = [msg.id[0]];
    this.set_events();
  }
  static listen_close(rpc, method){
    for (let sock of rpc.listen_req[method]||[])
      sock.close();
    delete rpc.listen_req[method];
    rpc._method(method);
  }
  static listen(rpc, method, fn){
    rpc.listen_req ||= {};
    if (!fn)
      return rpc_sock.listen_close(rpc, method);
    rpc._method(method, async(msg)=>{
      if (!Array.isArray(msg.id) || msg.id.length < 2)
        return {error: 'sock listen: invalid msg.id'};
      let seq = msg.id[msg.id.length-1];
      if (typeof seq!='number')
        return {error: 'sock listen: invalid seq in msg.id'};
      let sock = new rpc_sock({D: rpc.D, pre: rpc.pre+':'+method});
      rpc.listen_req[method] ||= [];
      rpc.listen_req[method].push(sock);
      sock.on('error', ()=>{});
      sock.accept({rpc, msg});
      let res;
      try {
        res = await fn({msg, sock});
        if (!res || !('result' in res))
          res = {result: res};
      } catch(err){ CEL(err);
        res = {error: ''+err};
      }
      if ('error' in res)
        sock.emit_error(res.error);
      sock.send({...res, id: seq});
      return rpc_base.sym_filter;
    });
  }
  close(){
    if (this._id)
      this.send({close: true});
    super.close();
  }
}

export class ipc_postmessage extends rpc_base {
  ports;
  port;
  send(msg, opt){
    if (opt?.bin)
      return this.port.postMessage({msg, ' $transfer ArrayBuffer$': opt.bin});
    this.port.postMessage(msg);
  }
  // controller = navigator.serviceWorker.controller
  set_events(){
    this.port.addEventListener('message', ({data})=>{
      let bin;
      if (data?.msg && (bin=data[' $transfer ArrayBuffer$']))
        return this.emit_msg(data.msg, bin);
      this.emit_msg(data);
    });
    this.port.addEventListener('error', event=>this.emit_error(event.data));
    this.port.addEventListener('close', event=>this.emit_close());
    this.port.start();
    this.emit_connect();
  }
  connect(controller){
    this.is_connect = true;
    this.ports = new MessageChannel();
    controller.postMessage({connect: true}, [this.ports.port2]);
    this.port = this.ports.port1;
    this.set_events();
  }
  accept(event){
    this.is_connect = false;
    if (!event.data?.connect)
      return;
    this.port = event.ports[0];
    this.set_events();
    return true;
  }
  close(){
    super.close();
    this.port.close();
  }
}

// json-rpc over websocket
export class rpc_websocket extends rpc_base {
  ws;
  bin_wait = false;
  bin_msg;
  is_ws_npm = false;
  ws_ctor = WebSocket;
  send_q = [];
  constructor(opt={}){
    super({...opt, is_json: true});
    if (opt.jsonrpc)
      this.jsonrpc = opt.jsonrpc;
    if (opt.ws_ctor){
      this.ws_ctor = opt.ws_ctor;
      this.is_ws_npm = is_node && this.ws_ctor!=WebSocket;
    }
  }
  send(msg, opt){
    if (this.state=='close')
      return void console.error(this.pre+': send after close');
    // protect against undefined in JSON making property disappear
    msg = {...msg};
    if ('error' in msg && msg.error===undefined)
      msg.error = null;
    if ('result' in msg && msg.result===undefined)
      msg.result = null;
    if (this.ws.readyState!=1)
      console.error(this.pre+': ws send close state', this.ws.readyState);
    let send_q = {msg: (opt?.bin ? ' ' : '')+JSON.stringify(msg)};
    if (opt?.bin){
      assert(opt.bin instanceof ArrayBuffer, 'invalid websocket bin');
      send_q.bin = opt.bin;
    }
    if (this.state!='open'){
      this.send_q.push(send_q);
      return;
    }
    this._send_msg(send_q);
  }
  _send_msg(send_q){
    this.ws.send(send_q.msg);
    if (send_q.bin)
      this.ws.send(send_q.bin);
  }
  emit_connect(){
    for (let send_q of this.send_q)
      this._send_msg(send_q);
    this.send_q = null;
    super.emit_connect();
  }
  set_events(){
    this.ws.on('open', ()=>{
      assert(this.ws.readyState==WebSocket.OPEN);
      this.emit_connect();
    });
    const on_message = ({data})=>{
      let msg, is_bin = typeof data!='string';
      if (this.bin_wait != is_bin){
        let err = 'expected '+(this.bin_wait ? 'bin' : 'text')+' got '+
          (is_bin ? 'bin' : 'text');
        this.emit_error(err);
        return console.error(err);
      }
      if (this.bin_wait){
        this.emit_msg(this.bin_msg, {bin: data});
        this.bin_msg = null;
        this.bin_wait = false;
        return;
      }
      try {
        msg = JSON.parse(data);
      } catch(e){
        console.log(data);
        this.emit_error('invalid json');
        return console.error('invalid ipc json', data);
      }
      if (data[0]==' '){
        this.bin_wait = true;
        this.bin_msg = msg;
        return;
      }
      this.emit_msg(msg);
    };
    websocket_fix(this.ws);
    this.ws.on_message(on_message);
    this.ws.on('error', err=>{
      let _err = this.is_ws_npm ? ''+err :
        this.state!='open' ? 'failed ws connect '+this.url :
        'ws error '+err.message;
      this.emit_error(_err);
    });
    this.ws.on('close', ()=>this.emit_close());
  }
  async connect(opt){
    this.is_connect = true;
    if (opt.url){
      this.url = opt.url;
      this.ws = new this.ws_ctor(this.url);
      this.ws.binaryType = 'arraybuffer';
      this.ws.on ||= this.ws.addEventListener;
    } else
      throw Error('missing connect opt');
    this.set_events();
    return await this.wait_open();
  }
  accept(opt){
    this.is_connect = false;
    assert(is_node);
    this.is_ws_npm = true;
    this.ws = opt.ws;
    this.set_events();
    this.emit_connect();
  }
  close(){
    super.close();
    this.ws?.close();
  }
};

export function rpc_sock_pipe(c, s){
  for (let [_c, _s] of [[c, s], [s, c]]){
    _s._method('', async(msg)=>{
      let {id, method, params} = msg;
      if (id==null)
        return void _c.notify(method, params);
      try {
        return await _c._call(method, params);
      } catch(err){ CEL(err);
        return {error: ''+err};
      }
    });
    _c.on('error', err=>{
      console.error('rpc_sock_pipe error', err);
    });
    _c.on('close', ()=>{
      _s.close();
    });
  }
}

export function sock_pair(c, s){
  c ||= new rpc_sock({is_connect: true});
  s ||= new rpc_sock({is_connect: false});
  for (let [_c, _s] of [[c, s], [s, c]]){
    _c.send = msg=>_s.emit_msg(msg);
    _c.on('error', ()=>{});
    _c.on('close', ()=>_s.close());
    _c.emit_connect();
  }
  return [c, s];
}

export function sock_error_log(error, ...args){
  console.error(error, ...args);
  return {error};
}

// browser WebSocket, node:net WebSocket, npm ws
export function websocket_fix(ws){
  if (ws.websocket_fix)
    return;
  ws.websocket_fix = !is_node ? 'browser' :
    ws instanceof WebSocket ? 'node:net' : 'npm:ws';
  if (!ws.on)
    ws.on = ws.addEventListener;
  if (ws.websocket_fix!='npm:ws'){
    // browser and node:net WebSocket
    ws.on_message = function(fn){ return this.on('message', fn); };
    return;
  }
  // npm ws WebSocket/WebSocketServer
  ws.on_message = function(fn){
    return this.on('message', function(data, binary){
      let _data = data;
      if (!binary)
        data = data.toString('utf8');
      return fn({data});
    });
  };
}

export function websocket_pipe(c, s){
  websocket_fix(c);
  websocket_fix(s);
  for (let [_c, _s] of [[c, s], [s, c]]){
    _c.on_message(({data})=>_s.send(data));
    _c.on('close', ()=>_s.close());
    _c.on('error', err=>{
      console.error('websocket pipe error: %s', err.message);
      _s.close();
    });
  }
}

