// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '2026.8.23';
import {node_is_main} from '../util/node_util.js';
import {assert_eq, version as util_version, date_time, CEL,
  ewait, assert, qs_enc, str,
} from '../util.js';
import {rpc_websocket, rpc_base, rpc_sock, rpc_sock_pipe,
  websocket_fix, sock_error_log,
} from '../rpc.js';
import {WebSocket as ws_WebSocket} from 'ws';
import {once, EventEmitter} from 'events';
import tls from 'tls';
import net from 'net';
import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import {lifnet} from './lifnet.js';

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
  if (!p)
    return;
  return (p[0]<<24 | p[1]<<16 | p[2]<<8 | p[3])>>>0;
}

function ip_ntoa(n){
  if (n<0 || n>0xffffffff)
    return;
  return ''+(n>>>24 & 0xff)+'.'+(n>>>16 & 0xff)+'.'+(n>>8 & 0xff)
    +'.'+(n & 0xff);
}

function ip_range_ntoa(ip_range){
  if (ip_range.mask==0xffffffff)
    return ip_ntoa(ip_range.ip);
  return ip_ntoa(ip_range.ip)+'/'+ip_ntoa(ip_range.mask);
}

// from npm:binet/lib/ip.js
const ip_no_route_s = [
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
let ip_no_route_t;

function ip_range_init(){
  ip_no_route_t = ip_no_route_s.map(ip_range=>ip_range_aton(ip_range));
}
ip_range_init();

function is_ip_range(ip_range_t, ip){
  if (typeof ip!='number'){
    ip = ip_aton(ip);
    if (!ip)
      return;
  }
  for (let range of ip_range_t){
    // >>>0: & gives a signed number, negative for ip >= 128.0.0.0
    if (((ip & range.mask)>>>0)==range.ip)
      return true;
  }
}

function is_ip_no_route(ip){
  return is_ip_range(ip_no_route_t, ip);
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

function test(){
  let t = (n, a)=>{
    if (n!=null)
      assert_eq(ip_ntoa(n), a);
    assert_eq(ip_aton(a), n);
  };
  t(0xff0102fe, '255.1.2.254');
  t(0x00ff0201, '0.255.2.1');
  t(undefined, 'x');
  t(undefined, '1.2.3');
  t = (a, range)=>assert_eq(ip_range_ntoa(ip_range_aton(a)), range || a);
  t('255.255.255.255');
  t('192.168.4.1');
  t('192.168.4.1/32', '192.168.4.1');
  t('0.0.0.0');
  t('10.0.0.0/8', '10.0.0.0/255.0.0.0');
  t('192.168.0.0/16', '192.168.0.0/255.255.0.0');
  t('172.16.0.0/255.240.0.0');
  t = (ip, no_route)=>assert_eq(!!is_ip_no_route(ip), no_route);
  t('127.0.0.1', true);
  t('10.1.2.3', true);
  t('192.168.1.1', true);
  t('172.16.0.1', true);
  t('172.31.255.255', true);
  t('172.32.0.1', false);
  t('169.254.169.254', true);
  t('100.64.0.1', true);
  t('224.0.0.1', true);
  t('255.255.255.255', true);
  t('8.8.8.8', false);
  t('193.168.1.1', false);
}
test();

async function host_to_ip(host){
  let ip = host;
  if (!ip_aton(host)){
    let addrs;
    try {
      addrs = await dns.lookup(host, {family: 4, all: true});
    } catch(err){
      return {error: 'cannot resolve '+host+': '+err};
    }
    ip = addrs[0]?.address;
  }
  if (!ip)
    return {error: 'cannot resolve dns '+host};
  // the policy knows only ipv4: an ipv6 address (eg. ::1) is not let through
  if (ip_aton(ip)==null)
    return {error: 'not an ipv4 address: '+host+' '+ip};
  if (is_ip_no_route(ip)){
    console.warn('blocked req to non-routable: '+host+' '+ip);
    return {error: 'ip non routable: '+host+' '+ip};
  }
  return ip;
}

// TCP Client Proxy, for tcp_sock in net/tcpip.js
// params: {host, port, tls, rejectUnauthorized}
// tls: TLS ends here: this node sees the plain data.
// allow_ip: trusted caller: any ip is allowed. Otherwise only public ips,
//   and the connection goes to the ip that was checked.
export async function lif_tcp_out({msg, sock, allow_ip}){
  let {host, port, tls: is_tls, rejectUnauthorized} = msg.params;
  assert((port&0xffff)==port, 'invalid port');
  assert(host && typeof host=='string', 'invalid host');
  let ip = host;
  if (!allow_ip){
    ip = await host_to_ip(host);
    if (ip.error)
      return ip;
  }
  let tcp, connected;
  if (is_tls){
    tcp = tls.connect({host: ip, port,
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: rejectUnauthorized!==false});
  } else
    tcp = net.connect({host: ip, port});
  tcp.on('data', data=>{
    sock.notify('data', {data: data.toString('hex')});
  });
  tcp.on('end', ()=>sock.notify('end'));
  tcp.on('error', err=>{
    // before the connect, the error is the answer of the connect
    if (connected)
      sock.notify('error', {message: err.message, code: err.code||null});
  });
  tcp.on('close', ()=>{
    if (!connected)
      return;
    sock.notify('close');
    sock.close();
  });
  sock.method('data', ({data})=>{
    tcp.write(Buffer.from(data, 'hex'));
  });
  sock.method('end', ()=>tcp.end());
  sock.method('keep_alive', ({enable, delay})=>{
    tcp.setKeepAlive(enable, delay);
  });
  sock.method('no_delay', ({enable})=>{
    tcp.setNoDelay(enable);
  });
  sock.method('pause', ()=>tcp.pause());
  sock.method('resume', ()=>tcp.resume());
  sock.on('close', ()=>tcp.destroy());
  try {
    await once(tcp, is_tls ? 'secureConnect' : 'connect');
  } catch(err){
    tcp.destroy();
    return {error: 'failed connect '+host+':'+port+': '+err};
  }
  connected = true;
  return {addr: tcp.remoteAddress, port: tcp.remotePort};
}

// HTTP/HTTPS Client Proxy for lif_fetch_out()
export async function lif_http_out({msg, sock, allow_ip}){
  let {url, method='GET', headers={}} = msg.params;
  assert(url && typeof url=='string', 'invalid url');
  let u = URL.parse(url);
  if (!u)
    return {error: 'invalid url: '+url};
  let {protocol, hostname: host, pathname, search} = u;
  let port = u.port ? +u.port : (protocol=='https:' ? 443 : 80);
  let is_https = protocol=='https:';
  let mod = is_https ? https : http;
  let path = pathname+(search||'');
  // allow_ip: trusted caller: any ip is allowed. Otherwise only public ips,
  // and the request goes to the ip that was checked.
  let ip = host;
  if (!allow_ip){
    ip = await host_to_ip(host);
    if (ip.error)
      return ip;
  }
  let req_headers = {...headers};
  if (!req_headers.host)
    req_headers.host = host;
  let req_opt = {hostname: ip, port, path, method, headers: req_headers};
  // https to an ip: the certificate is still checked against the host name
  if (is_https && !net.isIP(host))
    req_opt.servername = host;
  let req = mod.request(req_opt);
  req.on('error', err=>{
    sock.notify('error', {message: err.message, code: err.code||null});
    sock.close();
  });
  req.on('response', res=>{
    sock.notify('response', {status: res.statusCode,
      status_text: res.statusMessage, headers: res.headers});
    res.on('data', data=>{
      sock.notify('data', {data: data.toString('hex')});
    });
    res.on('end', ()=>{
      sock.notify('close');
      sock.close();
    });
  });
  sock.method('data', ({data})=>{
    req.write(Buffer.from(data, 'hex'));
  });
  sock.method('end', ()=>{
    req.end();
  });
  sock.on('close', ()=>req.destroy());
  return {};
}

// one http(s) request, the whole answer in memory.
// Every hop (also a redirect) is checked by the ip policy, and goes to the
// ip that was checked. returns {status, headers, body: Buffer} or {error}
async function http_req_checked({url, method='GET', headers={}, body}){
  for (let hop=0; ; hop++){
    let u = URL.parse(url);
    if (!u)
      return {error: 'invalid url: '+url};
    let {protocol, hostname: host, pathname, search} = u;
    if (!str.is(protocol, 'http:', 'https:'))
      return {error: 'invalid protocol: '+url};
    let is_https = protocol=='https:';
    let ip = await host_to_ip(host);
    if (ip.error)
      return ip;
    let req_opt = {hostname: ip, port: u.port ? +u.port : is_https ? 443 : 80,
      path: pathname+(search||''), method, headers: {...headers, host: u.host},
      timeout: 30000};
    if (is_https && !net.isIP(host))
      req_opt.servername = host;
    let res, chunks = [];
    try {
      res = await new Promise((resolve, reject)=>{
        let req = (is_https ? https : http).request(req_opt);
        req.on('response', resolve);
        req.on('error', reject);
        req.on('timeout', ()=>req.destroy(Error('timeout')));
        req.end(body);
      });
      let loc = res.headers.location;
      if (loc && str.is(''+res.statusCode, '301', '302', '303', '307', '308')){
        res.resume();
        if (hop>=5)
          return {error: 'too many redirects: '+url};
        if (res.statusCode==303 ||
          res.statusCode<303 && method.toUpperCase()=='POST')
        {
          method = 'GET';
          body = undefined;
        }
        url = new URL(loc, url).href;
        continue;
      }
      for await (let chunk of res)
        chunks.push(chunk);
    } catch(err){
      return {error: 'failed request '+url+': '+err};
    }
    return {status: res.statusCode, headers: res.headers,
      body: Buffer.concat(chunks)};
  }
}

// HTTP/HTTPS fetch: the whole answer in one message, body as text.
// params: {url, method, headers, body}
// allow_ip: trusted caller: any ip is allowed.
export async function lif_fetch_out({msg, sock, allow_ip}){
  let {url, method='GET', headers={}, body} = msg.params;
  assert(url && typeof url=='string', 'invalid url');
  if (!URL.parse(url))
    return sock_error_log('invalid url: '+url);
  if (!allow_ip){
    let res = await http_req_checked({url, method, headers, body});
    if (res.error)
      return res;
    return {body: res.body.toString(), status: res.status,
      headers: res.headers};
  }
  const res = await fetch(url, {method: method||'GET', headers, body});
  return {body: await res.text(), status: res.status,
    headers: Object.fromEntries(res.headers)};
}

// WebSocket Client Proxy for lif_WebSocket()
// params: {url, protocols, headers}
// allow_ip: trusted caller: any ip is allowed. Otherwise only public ips,
//   and the connection goes to the ip that was checked.
export async function lif_websocket_out({msg, sock, allow_ip}){
  let {url, protocols, headers={}} = msg.params;
  assert(url && typeof url=='string', 'invalid url');
  let u = URL.parse(url);
  if (!u || !str.is(u.protocol, 'ws:', 'wss:'))
    return {error: 'invalid url: '+url};
  let {hostname: host, host: host_port} = u;
  if (!allow_ip){
    let ip = await host_to_ip(host);
    if (ip.error)
      return ip;
    u.hostname = ip;
  }
  let ws_opts = {headers: {host: host_port, ...headers}};
  if (u.protocol=='wss:' && !net.isIP(host))
    ws_opts.servername = host;
  let ws = new ws_WebSocket(u.href, protocols||[], ws_opts);
  let connected;
  websocket_fix(ws);
  // set before the open: a message may come together with it
  ws.on_message(({data})=>{
    let is_bin = typeof data!='string';
    if (is_bin){
      sock.notify('message', {data: Buffer.from(data).toString('hex'),
        binary: true});
    } else
      sock.notify('message', {data: ''+data, binary: false});
  });
  ws.on('close', (code, reason)=>{
    if (!connected)
      return;
    sock.notify('close', {code, reason: ''+reason});
    sock.close();
  });
  ws.on('error', err=>{
    // before the open, the error is the answer of the connect
    if (connected)
      sock.notify('error', {message: err.message});
  });
  sock.method('send', ({data, binary})=>{
    ws.send(binary ? Buffer.from(data, 'hex') : data);
  });
  sock.method('close', ({code, reason}={})=>{
    ws.close(code, reason);
  });
  sock.on('close', ()=>ws.terminate());
  try { await once(ws, 'open'); }
  catch(err){
    ws.terminate();
    return {error: 'ws connect failed: '+err.message};
  }
  connected = true;
  return {protocol: ws.protocol};
}

// DNS Resolution Service
// params: {host, family}. returns {addrs: [{address, family}]}
// allow_ip: trusted caller. Otherwise non public ipv4 addresses are left
//   out, so names of the node's internal network are not told.
export async function lif_dns_out({msg, sock, allow_ip}){
  let {host, family=4} = msg.params;
  assert(host && typeof host=='string', 'invalid host');
  let addrs;
  try { addrs = await dns.lookup(host, {family, all: true}); }
  catch(err){ return {error: 'cannot resolve '+host+': '+err.message}; }
  if (!allow_ip)
    addrs = addrs.filter(a=>a.family!=4 || !is_ip_no_route(a.address));
  if (!addrs.length)
    return {error: 'cannot resolve '+host};
  return {addrs: addrs.map(a=>({address: a.address, family: a.family}))};
}

export async function ws_on_connect_pipe(ws, url){ // XXX unused
  let upstream = new ws_WebSocket(url);
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

// ws_ctor for a url given by a caller: the host is checked by the ip
// policy, and the connection goes to the ip that was checked.
async function ws_ctor_checked(url){
  let is_tcp = str.starts(url, 'tcp:', 'ssl:', 'ussl:');
  let host;
  if (is_tcp)
    host = url.match(rpc_tcp.url_re)?.[2];
  else {
    let u = URL.parse(url);
    if (u && str.is(u.protocol, 'ws:', 'wss:'))
      host = u.hostname;
  }
  if (!host)
    return {error: 'invalid url: '+url};
  let ip = await host_to_ip(host);
  if (ip.error)
    return ip;
  if (is_tcp)
    return function(url){ return new rpc_tcp(url, {ip}); };
  return function(url){
    let u = new URL(url);
    u.hostname = ip;
    let opt = {headers: {host: new URL(url).host}};
    if (u.protocol=='wss:' && !net.isIP(host))
      opt.servername = host;
    return new ws_WebSocket(u.href, opt);
  };
}

// JSON-RPC over a WebSocket, or over a tcp:/ssl:/ussl: line socket.
// url: fixed url of this topic (trusted). Without it the caller gives
//   params.url, which is checked by the ip policy.
export async function lif_rpc_websocket_out(topic, url){
  await lifnet.listen(topic, async({msg, sock})=>{
    let _url = url, ws_ctor;
    if (!_url){
      _url = msg.params?.url;
      if (!_url || typeof _url!='string')
        return sock_error_log('missing url');
      ws_ctor = await ws_ctor_checked(_url);
      if (ws_ctor.error)
        return ws_ctor;
    } else if (str.starts(_url, 'tcp:', 'ssl:', 'ussl:'))
      ws_ctor = rpc_tcp;
    let s = new rpc_websocket({D: 1, jsonrpc: '2.0', ws_ctor});
    rpc_sock_pipe(sock, s, {close: false});
    try {
      await s.connect({url: _url});
    } catch(err){
      return {error: ''+err};
    }
    sock.on('close', ()=>s.close());
    s.on('close', ()=>sock.close());
    return {connected: true};
  });
}

// WebSocket-compatible adapter for a plain TCP or TLS socket.
// Reads JSON messages terminated by \r, sends JSON+\r.
// Used as ws_ctor in rpc_websocket for tcp:/ssl: URLs.
class rpc_tcp extends EventEmitter {
  readyState = 0; // CONNECTING
  websocket_fix = 'tcp'; // prevent websocket_fix() from touching this
  binaryType = null; // unused, satisfies rpc_websocket.connect()
  _buf = '';
  static url_re = /^(tcp|ssl|ussl):\/?\/?([^:]+):(\d+)/;
  // opt.ip: connect to this ip (the checked ip of the host)
  constructor(url, {ip}={}){
    super();
    let m = url.match(rpc_tcp.url_re);
    if (!m)
      throw new Error('invalid tcp url: '+url);
    let [, proto, host, port] = m;
    let opt = {host: ip||host, port: +port};
    let ssl = str.is(proto, 'ssl', 'ussl');
    if (ssl && !net.isIP(host))
      opt.servername = host;
    if (proto=='ussl')
      opt.rejectUnauthorized = false;
    let sock = ssl ? tls.connect(opt) : net.createConnection(opt);
    this._sock = sock;
    let on_connect = ()=>{
      if (this.readyState==1)
        return;
      this.readyState = 1; // OPEN
      this.emit('open');
    };
    // ssl is open only after the TLS handshake (and certificate check)
    sock.on(ssl ? 'secureConnect' : 'connect', on_connect);
    sock.on('data', data=>{
      this._buf += data.toString('utf8');
      let lines = this._buf.split('\n');
      this._buf = lines.pop();
      for (let line of lines){
        line = line.trim();
        if (line)
          this.emit('message', {data: line});
      }
    });
    sock.on('error', err=>this.emit('error', err));
    sock.on('close', ()=>{
      this.readyState = 3; // CLOSED
      this.emit('close');
    });
  }
  on_message(fn){
    return this.on('message', fn);
  }
  send(text){
    assert(typeof text=='string');
    this._sock.write(text+'\r\n');
  }
  close(){
    this._sock.destroy();
  }
}

export function lif_tcpip_out(){
  lifnet.listen('tcp/out', lif_tcp_out); // unused
  lifnet.listen('http/out', lif_http_out); // unused
  lifnet.listen('websocket/out', lif_websocket_out); // unused
  lif_rpc_websocket_out('rpc/websocket/out'); // unused
  lifnet.listen('dns/out', lif_dns_out); // unused
}

async function start_tcpip_s(opt={}){
  lif_tcpip_out();
}

export async function run(opt={}){
  let [...argv] = [...process.argv];
  let a;
  argv.shift();
  argv.shift();
  while ((a=argv[0])!=undefined){
    argv.shift();
    if (a=='--no-peer')
      opt.no_peer = true; // XXX not yet properly designed
    else if (a=='--peer') // url, or a port of a server on localhost
      opt.peer = argv.shift();
    else
      throw 'invalid argv '+a;
  }
  if (argv.length)
    throw 'invalid args '+JSON.stringify(argv);
  let uplink = opt.no_peer ? null : 'default';
  if (opt.peer){
    uplink = +opt.peer ? 'ws://localhost:'+opt.peer+'/.lif.net' : opt.peer;
    // only the given peer: no default uplinks from lifnet.init()
    lifnet.inited = true;
  }
  lifnet.set_opt({client_name: 'tcpip_s', uplink});
  start_tcpip_s(opt);
}

if (node_is_main(import.meta.url))
  run();
