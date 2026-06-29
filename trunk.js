// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version, date_time, CEL,
  rpc_sock, assert, rpc_sock_pipe,
} from './util.js';

const topics = {};
const rg_conn = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
let g_br_id = 0;
const br_t = {};

export function rpc_methods_basic(rpc){
  rpc.method('ping', ()=>({pong: 1}));
  rpc.method('version', ()=>({name: 'lif-kernel', version: util_version}));
}

export function ws_trunk_connect(ws, opt={full: 1}){
  let rpc = new rpc_websocket({D: 1});
  rpc.topics = {};
  rpc_methods_basic(rpc);
  rpc.accept({ws});
  return rpc;
}

export async function rpc_sock_rconnect({msg, sock}){
  let {method, params, rg_id} = msg.params;
  let {rpc} = sock;
  let rg;
  if (typeof rg_id!='string')
    throw 'invalid id';
  if (!(rg=rg_conn[rg_id]))
    throw 'no connection to rg';
  if (rg_id==rpc.rg_id)
    throw 'loopback not supported'; // XXX add loopback sock
  if (rg_id==g_rg_id)
    throw 'localhost not yet supported'; // XXX add localhost sock
  let c = {rpc, sock};
  let s = {rpc: rg, sock: new rpc_sock()};
  let br_id = g_br_id++;
  let br = {br_id, time: date_time(), c, s};
  br_t[br_id] = br;
  rpc_sock_pipe(c.sock, s.sock);
  c.sock.on('close', ()=>delete br_t[br_id]);
  return await s.sock.connect(s.rpc, method, params);
}

export function rpc_methods_lifnet_trunk(rpc){
  rpc.method('rg_id', ({rg_id})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    rpc.rg_id = rg_id;
    rg_conn[rg_id] = rpc;
    return {rg_id: g_rg_id};
  });
  rpc.method('topic_pub', ({topic, data})=>{
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
    return {addr: Object.keys(topics[topic]||{})};
  });
  rpc.method('rcall', async({rg_id, method, params})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    let rg;
    if (!(rg=rg_conn[rg_id]))
      throw 'no connection to rg';
    let ret = await rg._call(method, params);
    return ret;
  });
  rpc_sock.listen(rpc, 'rconnect', rpc_sock_rconnect);
  rpc.on('close', ()=>{
    if (!rpc.rg_id)
      return;
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
  });
}

