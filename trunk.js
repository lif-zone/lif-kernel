// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version, date_time, CEL,
  rpc_sock, assert, rpc_sock_pipe, OV,
} from './util.js';

const topics = {};
const rg_conn = {};
const peer_conn = {}; // trunk_id → rpc (connected peer trunks)
const rg_peer = {};   // rg_id → trunk_id (which peer trunk hosts this rg_id)
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
  if (typeof rg_id!='string')
    throw 'invalid id';
  if (rg_id==rpc.rg_id)
    throw 'loopback not supported'; // XXX add loopback sock
  if (rg_id==g_rg_id)
    throw 'localhost not yet supported'; // XXX add localhost sock
  let c = {rpc, sock};
  let br_id = g_br_id++;
  let rg = rg_conn[rg_id];
  if (rg){
    // Local routing
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

export function rpc_methods_lifnet_trunk(rpc){
  rpc.method('rg_id', ({rg_id})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    rpc.rg_id = rg_id;
    rg_conn[rg_id] = rpc;
    // Gossip to all peer trunks
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
    let rg = rg_conn[rg_id];
    if (rg)
      return await rg._call(method, params);
    // Forward to peer trunk
    let trunk_id = rg_peer[rg_id];
    if (!trunk_id)
      throw 'no connection to rg';
    let peer = peer_conn[trunk_id];
    if (!peer)
      throw 'peer trunk disconnected';
    return await peer.call('peer_rcall', {rg_id, method, params});
  });
  // Peer trunk methods — registered on all connections so peers can call us
  rpc.method('peer_hello', ({trunk_id, rg_ids})=>{
    if (typeof trunk_id!='string')
      throw 'invalid trunk_id';
    rpc.trunk_id = trunk_id;
    peer_conn[trunk_id] = rpc;
    for (let id of (rg_ids||[]))
      rg_peer[id] = trunk_id;
    return {trunk_id: g_rg_id, rg_ids: Object.keys(rg_conn)};
  });
  rpc.method('peer_rg_add', ({rg_id})=>{
    if (rpc.trunk_id)
      rg_peer[rg_id] = rpc.trunk_id;
  });
  rpc.method('peer_rg_remove', ({rg_id})=>{
    if (rg_peer[rg_id]==rpc.trunk_id)
      delete rg_peer[rg_id];
  });
  rpc.method('peer_rcall', async({rg_id, method, params})=>{
    let rg = rg_conn[rg_id];
    if (!rg)
      throw 'rg_id not locally connected: '+rg_id;
    return await rg._call(method, params);
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
      // Peer trunk disconnected — remove its clients from routing table
      delete peer_conn[rpc.trunk_id];
      for (let rg_id in rg_peer){
        if (rg_peer[rg_id]==rpc.trunk_id)
          delete rg_peer[rg_id];
      }
    }
    if (!rpc.rg_id)
      return;
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
    // Gossip removal to all peer trunks
    for (let peer of OV(peer_conn))
      peer.call('peer_rg_remove', {rg_id: rpc.rg_id});
  });
}

// Connect to a peer trunk to join the mesh.
// Call on startup with the URL of each known peer trunk.
export async function trunk_peer_connect(url){
  let rpc = new rpc_websocket({D: 1});
  rpc_methods_basic(rpc);
  rpc_methods_lifnet_trunk(rpc);
  await rpc.connect({url});
  let ret = await rpc.call('peer_hello', {
    trunk_id: g_rg_id,
    rg_ids: Object.keys(rg_conn),
  });
  if (ret.error)
    throw new Error('peer_hello failed: '+ret.error);
  rpc.trunk_id = ret.trunk_id;
  peer_conn[ret.trunk_id] = rpc;
  for (let rg_id of (ret.rg_ids||[]))
    rg_peer[rg_id] = ret.trunk_id;
  return rpc;
}
