// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
// local testing port 5d: dig @localhost -p 54 test.com A
import dns2 from 'dns2';
import net from 'net';
let D = +process.env.D || 0;
const {Packet} = dns2;
// based: dig @8.8.8.8 google.com SOA
const DEF_PORT = 53;
const DEF_TTL = 300;
const DEF_TTL_REFRESH = 900;
const DEF_TTL_RETRY = 900;
const DEF_TTL_EXPIRATION = 1800;
const DEF_TTL_MINIMUM = 60;

const Packet_TYPE_HTTPS = 65; // missing from dns2
const Packet_TYPE_SPF = 99; // deprecated

export const E = {};

function pad(num, size){ return (''+num).padStart(size, '0'); }
function str_starts(s, start){
  return s.startsWith(start) ? {start, rest: s.slice(start.length)} : null;
}
function OE(o){ return o ? Object.entries(o) : []; }
const OA = Object.assign;
const OV = Object.values;
const OK = Object.keys;

E.hosts = {};
function get_raw_ip_domain(host){
  let v;
  if (!(v=str_starts(host, 'ip--')))
    return;
  let ip = v.rest.replaceAll('-', '.');
  if (!net.isIPv4(ip))
    return;
  return {ssl: true, ip: [ip]};
}
function get_host_of_domain(host){
  let v;
  if (!(v = E.hosts[host]))
    return;
  return {ssl: true, ip: [v.ip]};
}

export function domain_parent(domain){
  let parts = domain.split('.');
  let host = parts[0];
  let parent = parts.slice(1).join('.');
  return {host, parent, domain};
}

export function domain_lookup(name){
  name = name.toLowerCase();
  let v, p_v;
  let {host, parent} = domain_parent(name);
  // parent domain?
  if (v=E.domains[name])
    return {name, parent: name, ...v};
  // sub-domain?
  if (!(p_v=E.domains[parent]))
    return;
  // handle sub-domain
  let info = {soa: p_v.soa, parent, name};
  let host_part = host.split('--')[0];
  if (v=get_host_of_domain(host))
    return {...info, ...v};
  if (v=get_host_of_domain(host_part))
    return {...info, ...v};
  if (v=get_raw_ip_domain(host))
    return {...info, ...v};
  return {...info, ...p_v};
}

E.domains = {};
export function set_domains(domains){
  E.domains = domains;
}
E.caa_issuers = ['letsencrypt.org'];
export function get_txt(name, val){
  E.txt[name.toLowerCase()];
}
export function set_txt(name, val){
  name = name.toLowerCase();
  E.txt[name] = val;
}
export function rm_txt(name, val){
  name = name.toLowerCase();
  delete E.txt[name];
  delete E.domains[name];
}
// XXX: need caching
function res_type_a(name, info){
  let type = Packet.TYPE.A, c = Packet.CLASS.IN;
  let ret = [];
  if (!info.ip)
      return ret;
  let ips = info.ip;
  ips.forEach(ip=>ret.push({name, type, class: c, ttl: E.ttl, address: ip}));
  return ret;
}

function res_type_ns(name, info){
  let type = Packet.TYPE.NS, c = Packet.CLASS.IN;
  let ret = [];
  if (!info.ns)
    return ret;
  info.ns.forEach(ns=>ret.push({name, type, class: c, ttl: E.ttl, ns}));
  return ret;
}

function res_type_any(name, info){
  let ret = res_type_a(name, info);
  ret = ret.concat(res_type_soa(name, info));
  ret = ret.concat(res_type_ns(name, info));
  ret = ret.concat(res_type_mx(name, info));
  ret = ret.concat(res_type_txt(name, info));
  ret = ret.concat(res_type_caa(name, info));
  return ret;
}

function res_type_txt(name, info){
  let type = Packet.TYPE.TXT, c = Packet.CLASS.IN;
  let data = E.txt[name.toLowerCase()];
  if (data) // XXX: allow to set ttl per TXT
    return [{name, type, class: c, ttl: 5, data}];
}

function res_type_mx(name, info){
  let type = Packet.TYPE.MX, c = Packet.CLASS.IN;
  return [{name, type, class: c, ttl: E.ttl,
    exchange: 'mail5.holaspark.com', priority: 10}];
}

// CAA is optional for security that letsencrypt.org and others first request
// this, and if exists, they make sure they are listed.
function res_type_caa(name){
  return []; // disable caa - its not really needed.
  // CAA RDATA: [flags:1][tag_len:1][tag:N][value:rest] — RFC 6844
  // dns2 has no CAA encoder so we pass raw rdata via resource.data
  let c = Packet.CLASS.IN;
  return E.caa_issuers.map(issuer=>{
    let tag = Buffer.from('issue', 'ascii');
    let val = Buffer.from(issuer, 'ascii');
    let data = Buffer.alloc(2 + tag.length + val.length);
    data[0] = 0; // flags
    data[1] = tag.length;
    tag.copy(data, 2);
    val.copy(data, 2 + tag.length);
    return {name, type: Packet.TYPE.CAA, class: c, ttl: E.ttl, data};
  });
}

function res_type_soa(name, info){
  // http://tools.ietf.org/html/rfc1035#section-3.3.13
  let type = Packet.TYPE.SOA, c = Packet.CLASS.IN;
  let ret = [];
  if (!info.soa)
    return ret;
  let d = new Date();
  let serial = d.getFullYear()+pad(d.getMonth()+1, 2)+pad(d.getDate(), 2);
  ret = [{...info.soa, type, class: c, ttl: E.ttl,
    serial, refresh: 900, retry: 900,
    expiration: 1800, minimum: 60}];
  return ret;
}

function dns_server_handler(req, send, rinfo){
  try {
    let res = Packet.createResponseFromRequest(req);
    if (req.questions.length!=1){
      res.header.rcode = 0x4; // not implemented
      return send(res);
    }
    let [query] = req.questions;
    let {name, type} = query;
    let acme = name.toLowerCase().startsWith('_acme-challenge');
    let info = domain_lookup(name);
    if (!info){
      (D>=1 || acme) && console.log('dns '+name+' not handled');
      return send(res);
    }
    if (acme)
      console.log('dns '+name, 'type', type, info);
    else if (D>=2)
      console.log('dns '+name, info.ip?.[0] || info);
    // https://tools.ietf.org/html/rfc1035#section-4.1.1
    res.header.aa = 1; // set authoritive answer
    res.authorities = res_type_soa(name, info);
    switch (type){
    case Packet.TYPE.A: res.answers = res_type_a(name, info); break;
    case Packet.TYPE.NS: res.answers = res_type_ns(name, info); break;
    case Packet.TYPE.SOA: res.answers = res_type_soa(name, info); break;
    case Packet.TYPE.ANY: res.answers = res_type_any(name, info); break;
    case Packet.TYPE.TXT: res.answers = res_type_txt(name, info); break;
    case Packet.TYPE.MX: res.answers = res_type_mx(name, info); break;
    case Packet.TYPE.CNAME: break; // silently ignore
    case Packet.TYPE.AAAA: break; // no answer
    case Packet.TYPE.DNSKEY: break; // silently ignore
    case Packet.TYPE.CAA: res.answers = res_type_caa(name, info); break;
    case Packet_TYPE_HTTPS: break; // silently ignore
    case Packet_TYPE_SPF: break; // silently ignore
    // XXX TODO
    default: console.error('dns_s: unsupported type %s', type);
    }
    if (acme)
      console.log(name, res);
    send(res);
  } catch(err){ console.error('dns_s: error %s', err.stack||err); }
}

function create_dns_server(ips){
  if (E.servers)
    throw new Error('dns_s: already started servers');
  E.servers = [];
  for (let {address, port} of ips){
    port = port||DEF_PORT;
    let server = dns2.createServer({udp: !E.noudp, tcp: !E.notcp,
      handle: dns_server_handler});
    server.on('close', ()=>console.log('dns_s: closed'));
    server.on('error', err=>console.error('dns_s: error', err));
    console.log('dns_s: listen on %s udp+tcp ports %s', address, port);
    server.listen({udp: {host: address, address, port},
      tcp: {host: address, address, port}});
    E.servers.push(server);
  }
}

export function start(opt){
  if (E.servers)
    throw new Error('dns_s: already started');
  opt = opt||{};
  let {ips} = opt;
  E.res_cache = {};
  E.txt = {};
  E.ttl = opt.ttl||DEF_TTL;
  E.ttl_refresh = opt.ttl_refresh||DEF_TTL_REFRESH;
  E.ttl_retry = opt.ttl_refresh||DEF_TTL_RETRY;
  E.ttl_expiration = opt.ttl_expiration||DEF_TTL_EXPIRATION;
  E.ttl_minimum = opt.ttl_refresh||DEF_TTL_MINIMUM;
  E.notcp = opt.notcp;
  E.noudp = opt.noudp;
  create_dns_server(ips);
}

export function stop(){
  if (!E.servers)
    return;
  for (let server of E.servers)
    server.close();
  E.servers = undefined;
}

