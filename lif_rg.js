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

// from npm:binet/lib/ip.js
const ip_no_route = [
  '255.255.255.255', // broadcast
  '10.0.0.0/8', // RFC 1918
  '192.168.0.0/16', // RFC 1918
  '172.16.0.0/255.240.0.0', // RFC 1918
  '198.18.0.0/255.254.0.0', // RFC 2544 RFC 3300 inter-networking communication
  '169.254.0.0/16', // RFC 3927
  '100.64.0.0/255.192.0.0', // RFC 6598
  '127.0.0.0/8', // loopback
  '0.0.0.0/8', // loopback
  '224.0.0.0/4', // multicast
];

function ip_to_array(ip){
  let p = ip.split('.');
  let _p = [];
  if (p.length!=4 || !ip.match(/^[0-9.]+$/))
    return;
  for (let i=0; i<4; i++){
    _p[i] = +p[i];
    if (_p[i]>255)
      return;
  }
  return _p;
}

function ip_aton(ip){
  let p = ip_to_array(ip);
  return p[0]<<24 | p[1]<<16 | p[2]<<8 | p[3];
}

function ip_range_aton(ip_range){
  let p = ip_range.split('/');
  if (p.length>2)
    return;
  let ip = ip_aton(p[0]);
  if (ip==null)
    return;
  let mask = 0xffffffff;
  if (p.length==2){
    if (p[1].match(/^[0-9]+$/)){
      let prefix = +p[1];
      if (prefix>32)
        return;
      // bug in 8086 ROR, which got into JS with rotate >=32
      let bits = prefix==32 ? 0 : 0xffffffff >>> (prefix-32);
      mask = ~bits >>> 0;
    } else {
      mask = ip_aton(p[1]);
      if (mask==null)
        return;
    }
  }
  return {ip, mask};
}
function ip_range_ntoa(ip_range){
  if (ip_range.mask==0xffffffff)
    return ip_ntoa(ip_range.ip);
  return ip_ntoa(ip_range.ip)+'/'+ip_ntoa(ip_range.mask);
}

function ip_ntoa(n){
  if (n<0 || n>0xffffffff)
    return;
  return ''+(n>>>24 & 0xff)+'.'+(n>>>16 & 0xff)+'.'+(n>>8 & 0xff)
    +'.'+(n & 0xff);
}

function test(){
  let t = (n, a)=>{
    assert_eq(ip_ntoa(n), a);
    assert_eq(ip_aton(a), n);
  };
  t(0xff0102fe, '255.1.2.254');
  t(0x00ff0201, '0.255.2.1');
  t = (a, range)=>assert_eq(ip_range_ntoa(ip_range_aton(a)), range || a);
  t('255.255.255.255');
  t('192.168.4.1');
  t('192.168.4.1/32', '192.168.4.1');
  t('0.0.0.0');
  t('10.0.0.0/8', '10.0.0.0/255.0.0.0');
  t('192.168.0.0/16', '192.168.0.0');
  t('172.16.0.0/255.240.0.0');
}
