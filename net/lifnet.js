// TCP proxy client - browser side, tunnels TCP over rpc_sock via lif_rg tcp_connect
import {rpc_sock, Buffer, assert, rpc_websocket, version as util_version,
  is_node, url_http_to_ws, ewait, OA, sock_pair, rpc_sock_pipe, OV,
} from '../util.js';
import etask from '../etask.js';
import EventEmitter, {once} from '../compat/events.js';
let D = 0;

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
  constructor(lifnet){
    super();
    this.lifnet = lifnet;
  }
  emit_status(status){
    if (this.status==status)
      return;
    this.status = status;
    this.emit('status', status);
  }
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

class Trunk_uplink extends Trunk {
  last = 0;
  et_connect;
  constructor(lifnet, url){
    super(lifnet);
    this.url = url;
  }
  emit_status(status){
    if (this.status==status)
      return;
    console.log('lifnet trunk '+this.url+' '+status);
    super.emit_status(status);
  }
  start(){
    if (this.et_connect)
      return;
    this.et_connect = this._connect_loop();
    this.et_connect.on('finally', ()=>this.et_connect = null);
    this.on('close', ()=>this.et_connect.return({error: 'close'}));
    return this.et_connect;
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
    rpc.on('error', err=>et.return(
      {error: 'lifnet trunk error '+this.url+' '+err}));
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
}

class Trunk_router extends Trunk {
  constructor(lifnet, rpc){
    super(lifnet);
    this.rpc = rpc;
  }
  async start(){
    if (this.status=='online')
      return;
    let ret = await this.rpc.call('rg_id', {rg_id: this.lifnet.rg_id});
    if (ret?.error)
      return console.error('trunk_router rg_id err: '+ret.error);
    for (let topic in this.lifnet.pub_t){
      let t = this.lifnet.pub_t[topic];
      this.rpc.call('topic_pub', {topic, data: t.data});
    }
    for (let method in this.lifnet.method_fn)
      this._rpc_method_set(this.rpc, method);
    this.emit_status('online');
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
    this.client_name = client_name||'client';
    this.client_version = client_version||util_version;
    this.trunk_t.loopback = new Trunk_loopback(this);
    if (url)
      this.trunk_uplink_add(url);
    this.base_methods();
  }
  _status_update(){
    let prev = this.status;
    this.status = this._trunk_online() ? 'online' : 'offline';
    if (prev!=this.status)
      this.emit('status', this.status);
  }
  trunk_uplink_add(url){
    if (this.trunk_t[url])
      return;
    let trunk = new Trunk_uplink(this, url);
    this.trunk_t[url] = trunk;
    trunk.on('status', ()=>this._status_update());
    trunk.start();
  }
  trunk_add_router(rpc){
    if (this.trunk_t.local)
      return;
    let trunk = new Trunk_router(this, rpc);
    this.trunk_t.local = trunk;
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
    let sock = new rpc_sock({D: 1, pre: 'rg'+rg_id+':'+method});
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
  if (is_node){
    lifnet.trunk_uplink_add('ws://localhost:1842/.lif.net');
    lifnet.trunk_uplink_add('wss://lifnet.net/.lif.net');
  } else
    lifnet.trunk_uplink_add(url_http_to_ws(location.origin+'/.lif.net'));
  return lifnet;
}

export function lifnet_init_router(rpc){
  lifnet_inited = true;
  lifnet.trunk_add_router(rpc);
}
export function lifnet_set(opt={}){
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


