// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version} from './util.js';

const topics = {};
const rg_conn = {};
let g_rg_id = ''+Math.floor(Math.random()*1000000000);
export async function ws_on_connect(ws){
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
  rpc.__method('rcall', async({rg_id, method, params})=>{
    if (typeof rg_id!='string')
      throw 'invalid id';
    let rg;
    if (!(rg=rg_conn[rg_id]))
      throw 'no connection to rg';
    let ret = await rg._call(method, params);
    return ret;
  });
  ws.on('close', ()=>{
    if (!rpc.rg_id)
      return;
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
  });
  rpc.accept({ws});
  let res = await rpc.call('ping');
}


