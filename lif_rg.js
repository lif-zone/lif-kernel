// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version, date_time,
  rpc_base,
} from './util.js';
import {WebSocket} from 'ws';

const topics = {};
const rg_conn = {};
let g_br_id = 0;
const br_t = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
export async function ws_on_connect_rg(ws){
  let rpc = new rpc_websocket({D: 1});
  rpc.topics = {};
  rpc.method('ping', ()=>({pong: 1}));
  rpc.method('version', ()=>({name: 'lif-kernel', version: util_version}));
  rpc.method('rg_id', ({rg_id})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    rpc.rg_id = rg_id;
    rg_conn[rg_id] = rpc;
    return {rg_id: g_rg_id};
  });
  rpc.method('topic_pub', ({topic})=>{
    if (!rpc.rg_id)
      throw 'no rg_id for conn';
    if (typeof topic!='string')
      throw 'invalid topic';
    let t = topics[topic] ||= {};
    t[rpc.rg_id] = rpc;
    rpc.topics ||= {};
    rpc.topics[topic] = true;
    return {};
  });
  rpc.method('topic_unpub', ({topic})=>{
    if (!rpc.rg_id)
      throw 'no rg_id for conn';
    if (typeof topic!='string')
      throw 'invalid topic';
    if (topics[topic]?.[rpc.rg_id])
      delete topics[topic][rpc.rg_id];
    delete rpc.topics[topic];
    return {};
  });
  rpc.method('topic_get', ({topic})=>{
    return Object.keys(topics[topic]||{});
  });
  rpc.method('_rcall', async({rg_id, method, params})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    let rg;
    if (!(rg=rg_conn[rg_id]))
      throw 'no connection to rg';
    let ret = await rg._call(method, params);
    return {remote: ret};
  });
  rpc._method('rcall', async({rg_id, method, params})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    let rg;
    if (!(rg=rg_conn[rg_id]))
      throw 'no connection to rg';
    let ret = await rg._call(method, params);
    return ret;
  });
  rpc._method('rconnect', async({rg_id})=>{
    let rg;
    if (typeof rg_id!='string')
      throw 'invalid id';
    if (!(rg=rg_conn[rg_id]))
      throw 'no connection to rg';
    if (rg_id==rpc.rg_id)
      throw 'cannot connect to loop';
    if (rg_id==g_rg_id)
      throw 'cannot connect to self';
    let br_id = g_br_id++;
    let br = {br_id, time: date_time()};
    br.rpc_c = rpc;
    br.rpc_s = rg;
    let res = await br.rpc_c._call('rconnect.connect', {br_id});
    if ('error' in res)
      return res;
    br_t[br_id] = br;
    br.rpc_c.br_t[br_id] = br;
    br.rpc_s.br_t[br_id] = br;
    br.close = function(){
      delete br.rpc_c.br_t[br_id];
      delete br.rpc_s.br_t[br_id];
      this.rpc_c.notify('rconnect.close', {br_id}, {no_fail: 1});
      this.rpc_s.notify('rconnect.close', {br_id}, {no_fail: 1});
    };
    return {result: {br_id}};
  });
  rpc._method('rconnect.call', async({br_id, id, method, params})=>{
  });
  rpc.on('close', ()=>{
    if (!rpc.rg_id)
      return;
    if (0) for (let br in this.br_t)
      br.close();
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
  });
  rpc.accept({ws});
  //let rconnect = rpc_tun();
  //rconnect.connect({rpc});
  let res = await rpc.call('ping');
}

export function rpc_tun_s(rpc){
  if (rpc.tun_s)
    return rpc;
  rpc.tun_set_events = function(){
    this.method('tun.connect', async({method, params, id})=>{
      await this.rpc.
      this.on_msg({method, params, id});
    });
    this.rpc.on('error', err=>this.on_error(err));
    this.rpc.on('close', ()=>this.on_close());
  };
  let tun_s = rpc.tun_s = {};
  return rpc;
}

export class rpc_tun extends rpc_base {
  rpc;
  constructor(opt={}){
    super(opt);
  }
  async send(json){
    this.rpc.call('', json);
  }
  _set_events(){
    this.rpc.on('open', ()=>{
      this.open.return(true);
    });
    this.rpc.method('rconnect.call', async({method, params, id})=>{
      await this.rpc.
      this.on_msg({method, params, id});
    });
    this.rpc.on('error', err=>this.on_error(err));
    this.rpc.on('close', ()=>this.on_close());
  }
  async connect({rpc, rg_id}){
    this.rpc = rpc;
    this._set_events();
    return await this.open;
    let ret = await this.rpc._call('rconnect', {rg_id});
    if ('error' in ret)
      return ret;
    let {br_id} = ret.result;
    return {br_id};
  }
  accept({rpc}){
    this.rpc = rpc;
    this.open.return(true);
    this._set_events();
  }
  close(){
    super.close();
    this.rpc?.close();
  }
};

const electrum_ws_url = 'ws://localhost:8432/';
export async function ws_on_connect_electrum(ws){
  let upstream = new WebSocket(electrum_ws_url);
  upstream.on('open', ()=>{
    ws.on('message', data=>upstream.send(data));
    upstream.on('message', data=>ws.send(data));
    ws.on('close', ()=>upstream.close());
    upstream.on('close', ()=>ws.close());
  });
  upstream.on('error', err=>{
    console.error('electrum ws proxy error: %s', err.message);
    ws.close();
  });
}

