// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
let lif_rg_version = '26.4.23';
import {assert_eq, rpc_websocket, version as util_version, date_time, CEL,
  rpc_base, rpc_sock, ewait, assert, qs_enc, rpc_sock_pipe,
  websocket_fix, sock_error_log,
} from './util.js';
import {WebSocket as ws_WebSocket} from 'ws';
import {once} from 'events';
import tls from 'tls';
import net from 'net';
import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import {lifnet_online, lifnet_listen} from './lifnet.js';

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
    if ((ip & range.mask)==range.ip)
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
  if (is_ip_no_route(ip)){
    console.warn('blocked req to non-routable: '+host+' '+ip);
    return {error: 'ip non routable: '+host+' '+ip};
  }
  return ip;
}

// TCP Client Proxy
export async function rpc_sock_tcp_out({msg, sock}){ // XXX unused
  let {host, port, tls: is_tls} = msg.params;
  assert((port&0xffff)==port, 'invalid port');
  assert(host && typeof host=='string', 'invalid host');
  let tcp;
  if (is_tls)
    tcp = tls.TLSSocket({socket: new net.Socket()});
  else
    tcp = net.Socket();
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
  let ip = await host_to_ip(host);
  if (ip.error)
    return ip;
  if (is_tls)
    tcp.connect({tcp, port, host: ip, servername: host});
  else
    tcp.connect({port, host: ip});
  try {
    await once(tcp, 'connect');
  } catch(err){
    return {error: 'failed connect '+host+':'+port+': '+err};
  }
  return {addr: tcp.remoteAddress, port: tcp.remotePort};
}

// HTTP/HTTPS Client Proxy for lif_fetch()
async function sock_http_out({msg, sock}){
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
  let ip = await host_to_ip(host);
  if (ip.error)
    return ip;
  let req_headers = {...headers};
  if (!req_headers.host)
    req_headers.host = host;
  let req = mod.request({hostname: ip, port, path, method,
    headers: req_headers});
  req.on('error', err=>{
    sock.notify('error', {message: err.message, code: err.code||null});
    sock.close();
  });
  req.on('response', res=>{
    sock.notify('response', {status: res.statusCode, headers: res.headers});
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

export async function leaf_fetch_out({msg, sock, allow_ip}){
  let {url, method='GET', headers={}} = msg.params;
  assert(url && typeof url=='string', 'invalid url');
  let u = URL.parse(url);
  if (!u)
    return sock_error_log('invalid url: '+url);
  let {protocol, hostname: host, pathname, search} = u;
  let port = u.port ? +u.port : (protocol=='https:' ? 443 : 80);
  let is_https = protocol=='https:';
  let mod = is_https ? https : http;
  let path = pathname+(search||'');
  if (!allow_ip){
    let ip = await host_to_ip(host);
    if (ip.error)
      return ip;
  }
  let req_headers = {...headers};
  if (!req_headers.host)
    req_headers.host = host;
  // XXX ip address vs dns not checked very well. use mod.request()
  const res = await fetch(url, {
    method: method||'GET',
    headers: req_headers||{},
  });
  if (res.status!=200)
    return sock_error_log('failed fetch()');
  let body = await res.text();
  return {body};
}

// WebSocket Client Proxy for lif_WebSocket()
async function rpc_sock_websocket_out({msg, sock, allow_ip}){ // XXX unused
  let {url, protocols, headers={}} = msg.params;
  assert(url && typeof url=='string', 'invalid url');
  let u = URL.parse(url);
  if (!u)
    return {error: 'invalid url: '+url};
  let {hostname: host} = u;
  if (!allow_ip){
    let ip = await host_to_ip(host);
    if (ip.error)
      return ip;
    u.hostname = ip;
  }
  let ws_opts = {headers: {host, ...headers}};
  if (u.protocol=='wss:')
    ws_opts.servername = host;
  let ws = new ws_WebSocket(u.href, protocols, ws_opts);
  try { await once(ws, 'open'); }
  catch(err){ return {error: 'ws connect failed: '+err.message}; }
  websocket_fix(ws);
  ws.on_message(({data})=>{
    let is_bin = typeof data!='string';
    if (is_bin)
      sock.notify('message', {data: Buffer.from(data).toString('hex'), binary: true});
    else
      sock.notify('message', {data: ''+data, binary: false});
  });
  ws.on('close', (code, reason)=>{
    sock.notify('close', {code, reason: ''+reason});
    sock.close();
  });
  ws.on('error', err=>{
    sock.notify('error', {message: err.message});
  });
  sock.method('send', ({data, binary})=>{
    ws.send(binary ? Buffer.from(data, 'hex') : data);
  });
  sock.method('close', ({code, reason}={})=>{
    ws.close(code, reason);
  });
  sock.on('close', ()=>ws.terminate());
  return {};
}

// DNS Resolution Service
async function rpc_sock_dns_out({msg, sock}){ // XXX unused
  let {host, family=4} = msg.params;
  assert(host && typeof host=='string', 'invalid host');
  let addrs;
  try { addrs = await dns.lookup(host, {family, all: true}); }
  catch(err){ return {error: 'cannot resolve '+host+': '+err.message}; }
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

async function rpc_sock_lifcoin_node({msg, sock}){ // XXX unused
  let m = {ip: '127.0.0.1', port: 8433};
  return await rpc_sock_tcp_out({msg: m, sock});
}

export async function leaf_rpc_websocket_out(topic, url){
  await lifnet_listen(topic, async({msg, sock})=>{
    let s = new rpc_websocket({D: 1, jsonrpc: '2.0'});
    if (!url){
      url = msg.params?.url;
      // XXX - need to validate URL/allowed ip/dns resolve
    }
    if (!url)
      return sock_error_log('missing url');
    let wait = s.connect({url});
    rpc_sock_pipe(sock, s);
    try {
      await wait;
    } catch(err){
      return sock_error_log('failed connection '+url+': '+err);
    }
    return {connected: true};
  });
}

