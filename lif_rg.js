// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version, date_time, CEL,
  rpc_base, rpc_sock, ewait,
} from './util.js';
import {WebSocket} from 'ws';
import net from 'net';

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
  rpc_sock.listen(rpc, 'rconnect', async({msg, sock})=>{
    let {method, params, rg_id} = msg.params;
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
    for (let [_c, _s] of [[c, s], [s, c]]){
      _s.sock._method('', async(msg)=>{
        let {id, method, params} = msg;
        if (id==null)
          return void _c.sock.notify(method, params);
        try {
          return await _c.sock._call(method, params);
        } catch(err){ CEL();
          return {error: ''+err};
        }
      });
      _c.sock.on('error', err=>{
        console.error('lif_net error', err);
      });
      _c.sock.on('close', ()=>{
        _s.sock.close();
        delete br_t[br_id];
      });
    }
    return s.sock.connect(s.rpc, method, params);
  });
  // TCP Proxy
  rpc_sock.listen(rpc, 'tcp_connect', async({msg, sock})=>{
    let {host, port} = msg.params;
    if ((port&0xffff)!==port || typeof host!='string' || !host.length)
      throw 'invalid host/port';
    const tcp = net.connect(port, host);
    let wait = ewait();
    tcp.once('connect', ()=>wait.return(tcp));
    tcp.once('error', err=>wait.throw(err));
    tcp.on('data', data=>{
      sock.notify('data', {data: data.toString('hex')});
    });
    tcp.on('error', err=>{
      sock.notify('error', {message: err.message, code: err.code||null});
    });
    tcp.on('close', ()=>{
      sock.notify('close');
      sock.close();
    });
    sock.method('data', ({data})=>{
      tcp.write(Buffer.from(data, 'hex'));
    });
    sock.method('keep_alive', ({enable, delay})=>{
      tcp.setKeepAlive(enable, delay);
    });
    sock.method('no_delay', ({enable})=>{
      tcp.setNoDelay(enable);
    });
    sock.method('set_timeout', ({timeout})=>{
      tcp.setTimeout(timeout);
    });
    sock.method('pause', ()=>tcp.pause());
    sock.method('resume', ()=>tcp.resume());
    sock.on('close', ()=>tcp.destroy());
    return {addr: tcp.remoteAddress, port: tcp.remotePort, tcp};
  });
  rpc.on('close', ()=>{
    if (!rpc.rg_id)
      return;
    delete rg_conn[rpc.rg_id];
    for (let t in topics)
      delete topics[t][rpc.rg_id];
  });
  rpc.accept({ws});
  let res = await rpc.U_call('ping');
  return res;
}

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

