// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.7.21';
import {assert_eq, rpc_websocket, version as util_version, date_time, CEL,
  rpc_sock, assert, rpc_sock_pipe, OV, sock_pair,
} from '../util.js';
import etask from '../etask.js';

const topics = {};       // topic → {rg_id: rpc} (locally published)
const peer_topics = {};  // topic → {rg_id: trunk_id} (published on peer trunks)
const rg_conn = {};
const peer_conn = {};    // trunk_id → rpc
const rg_peer = {};      // rg_id → trunk_id
const peer_urls = {};    // url → {url, last}
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
let g_br_id = 0;
const br_t = {};
const PEER_RETRY_MS = 5000;

export function rpc_methods_basic(rpc){
  rpc.method('ping', ()=>({pong: 1}));
  rpc.method('version', ({name})=>{
    if (name)
      rpc.pre = name;
    return {name: 'lif-trunk', version: util_version};
  });
}

export function trunk_router(){
  let [c, s] = sock_pair();
  rpc_methods_basic(s);
  rpc_methods_lifnet_trunk(s);
  return c;
}

export function ws_trunk_accept(ws, opt={full: 1}){
  let rpc = new rpc_websocket({D: 1, pre: 'trunk_s'});
  rpc.topics = {};
  rpc_methods_basic(rpc);
  rpc.accept({ws});
  return rpc;
}

export async function rpc_sock_rconnect({msg, sock}){
  let {method, params, rg_id} = msg.params;
  let {rpc} = sock;
  if (typeof rg_id!='string')
    throw 'invalid id';
  if (rg_id==rpc.rg_id)
    throw 'loopback not valid in rconnect';
  if (rg_id==g_rg_id)
    throw 'localhost not valid in rconnect';
  let c = {rpc, sock};
  let br_id = g_br_id++;
  let rg = rg_conn[rg_id];
  if (rg){
    let s = {rpc: rg, sock: new rpc_sock()};
    br_t[br_id] = {br_id, time: date_time(), c, s};
    rpc_sock_pipe(c.sock, s.sock);
    c.sock.on('close', ()=>delete br_t[br_id]);
    return await s.sock.connect(s.rpc, method, params);
  }
  // Cross-trunk routing via peer
  let trunk_id = rg_peer[rg_id];
  if (!trunk_id)
    throw 'no connection to rg';
  let peer = peer_conn[trunk_id];
  if (!peer)
    throw 'peer trunk disconnected';
  let s = {rpc: peer, sock: new rpc_sock()};
  br_t[br_id] = {br_id, time: date_time(), c, s};
  rpc_sock_pipe(c.sock, s.sock);
  c.sock.on('close', ()=>delete br_t[br_id]);
  return await s.sock.connect(peer, 'peer_rconnect', {rg_id, method, params});
}

function my_topics_snapshot(){
  let snap = {};
  for (let topic in topics)
    snap[topic] = Object.keys(topics[topic]);
  return snap;
}

export function rpc_methods_lifnet_trunk(rpc){
  rpc.method('rg_id', ({rg_id})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    rpc.rg_id = rg_id;
    rg_conn[rg_id] = rpc;
    for (let peer of OV(peer_conn))
      peer.call('peer_rg_add', {rg_id});
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
    for (let peer of OV(peer_conn))
      peer.call('peer_topic_add', {topic, rg_id: rpc.rg_id});
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
    for (let peer of OV(peer_conn))
      peer.call('peer_topic_remove', {topic, rg_id: rpc.rg_id});
    return {};
  });
  rpc.method('topic_get', ({topic})=>{
    let local = Object.keys(topics[topic]||{});
    let remote = Object.keys(peer_topics[topic]||{});
    return {addr: [...local, ...remote]};
  });
  rpc.method('rcall', async({rg_id, method, params})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    let rg = rg_conn[rg_id];
    if (rg)
      return await rg._call(method, params);
    let trunk_id = rg_peer[rg_id];
    if (!trunk_id)
      throw 'no connection to rg';
    let peer = peer_conn[trunk_id];
    if (!peer)
      throw 'peer trunk disconnected';
    return await peer.call('peer_rcall', {rg_id, method, params});
  });
  // Peer trunk methods
  rpc.method('peer_hello', ({trunk_id, rg_ids, topics: peer_t})=>{
    if (typeof trunk_id!='string')
      throw 'invalid trunk_id';
    rpc.trunk_id = trunk_id;
    peer_conn[trunk_id] = rpc;
    for (let id of (rg_ids||[]))
      rg_peer[id] = trunk_id;
    for (let topic in (peer_t||{})){
      let t = peer_topics[topic] ||= {};
      for (let rg_id of peer_t[topic])
        t[rg_id] = trunk_id;
    }
    return {trunk_id: g_rg_id, rg_ids: Object.keys(rg_conn),
      topics: my_topics_snapshot()};
  });
  rpc.method('peer_rg_add', ({rg_id})=>{
    if (rpc.trunk_id)
      rg_peer[rg_id] = rpc.trunk_id;
  });
  rpc.method('peer_rg_remove', ({rg_id})=>{
    if (rg_peer[rg_id]==rpc.trunk_id)
      delete rg_peer[rg_id];
  });
  rpc.method('peer_topic_add', ({topic, rg_id})=>{
    if (!rpc.trunk_id)
      return;
    let t = peer_topics[topic] ||= {};
    t[rg_id] = rpc.trunk_id;
  });
  rpc.method('peer_topic_remove', ({topic, rg_id})=>{
    if (peer_topics[topic]?.[rg_id]==rpc.trunk_id)
      delete peer_topics[topic][rg_id];
  });
  rpc.method('peer_rcall', async({rg_id, method, params})=>{
    let rg = rg_conn[rg_id];
    if (!rg)
      throw 'rg_id not locally connected: '+rg_id;
    return await rg._call(method, params);
  });
  rpc.method('peer_introduce', ({url})=>{
    if (typeof url=='string')
      trunk_peer_add(url);
  });
  rpc_sock.listen(rpc, 'peer_rconnect', async({msg, sock})=>{
    let {rg_id, method, params} = msg.params;
    let rg = rg_conn[rg_id];
    if (!rg)
      return {error: 'rg_id not locally connected: '+rg_id};
    let c = {rpc, sock};
    let s = {rpc: rg, sock: new rpc_sock()};
    let br_id = g_br_id++;
    br_t[br_id] = {br_id, time: date_time(), c, s};
    rpc_sock_pipe(c.sock, s.sock);
    c.sock.on('close', ()=>delete br_t[br_id]);
    return await s.sock.connect(s.rpc, method, params);
  });
  rpc_sock.listen(rpc, 'rconnect', rpc_sock_rconnect);
  rpc.on('close', ()=>{
    if (rpc.trunk_id){
      delete peer_conn[rpc.trunk_id];
      for (let rg_id in rg_peer){
        if (rg_peer[rg_id]==rpc.trunk_id)
          delete rg_peer[rg_id];
      }
      for (let topic in peer_topics){
        for (let rg_id in peer_topics[topic]){
          if (peer_topics[topic][rg_id]==rpc.trunk_id)
            delete peer_topics[topic][rg_id];
        }
      }
    }
    if (!rpc.rg_id)
      return;
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
    for (let peer of OV(peer_conn))
      peer.call('peer_rg_remove', {rg_id: rpc.rg_id});
    for (let topic in rpc.topics){
      for (let peer of OV(peer_conn))
        peer.call('peer_topic_remove', {topic, rg_id: rpc.rg_id});
    }
  });
}

export function trunk_peer_add(url){
  if (peer_urls[url])
    return;
  peer_urls[url] = {url, last: 0};
  _peer_connect(url);
}

async function _peer_connect(url){
  let entry = peer_urls[url];
  if (!entry || entry.self)
    return;
  let delay = Math.max(entry.last + PEER_RETRY_MS - Date.now(), 0);
  if (delay)
    await etask.sleep(delay);
  if (!peer_urls[url])
    return;
  entry.last = Date.now();
  let rpc = new rpc_websocket({D: 1, pre: 'trunk_c'});
  rpc_methods_basic(rpc);
  rpc_methods_lifnet_trunk(rpc);
  rpc.on('error', ()=>{});
  try {
    await rpc.connect({url});
    let ret = await rpc.call('peer_hello', {
      trunk_id: g_rg_id,
      rg_ids: Object.keys(rg_conn),
      topics: my_topics_snapshot(),
    });
    if (ret.error)
      throw new Error(ret.error);
    if (ret.trunk_id==g_rg_id){
      console.log('trunk peer '+url+': disconnecting from self');
      entry.self = true;
      rpc.close();
      return;
    }
    rpc.trunk_id = ret.trunk_id;
    peer_conn[ret.trunk_id] = rpc;
    for (let rg_id of (ret.rg_ids||[]))
      rg_peer[rg_id] = ret.trunk_id;
    for (let topic in (ret.topics||{})){
      let t = peer_topics[topic] ||= {};
      for (let rg_id of ret.topics[topic])
        t[rg_id] = ret.trunk_id;
    }
    for (let e of OV(peer_urls)){
      if (e.url!=url)
        rpc.call('peer_introduce', {url: e.url});
    }
    rpc.on('close', ()=>{
      if (peer_urls[url])
        _peer_connect(url);
    });
  } catch(e){
    console.error('trunk peer connect '+url+': '+e);
    _peer_connect(url);
  }
}
