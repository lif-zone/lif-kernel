import fs from 'fs';
import os from 'os';
import tls from 'tls';
import './browser_env.js';
import {esleep} from './util.js';
import x509 from '@peculiar/x509';
import dnss from './dnss.js';
import acme from './acme.js';
const efs = fs.promises;

// DNS Setup
// #web: godaddy setup:
// https://dcc.godaddy.com/control/portfolio/arik.center/settings?tab=dns
// on https://dcc.godaddy.com/control/portfolio/arik.center/settings?tab=dns&subtab=hostnames
// verify two entries (ns1, ns2) that set to 50.7.176.34
// on https://dcc.godaddy.com/control/portfolio/arik.center/settings?tab=dns&subtab=nameservers
// verify two entries ns1.arik.center and ns2.arik.center
//
// DNS Testing
// #web: https://dns.google/query?name=arik.center
// $ dig @50.7.176.34 ns1.arik.center # verify dns is running properly on 50.7.176.34
// $ dig @8.8.8.8 ns1.arik.center # verify dns is correct on google dns
// $ dig ns1.arik.center # verify dns is correct on local dns

const MS = {
  SEC: 1000,
  WEEK: 7*24*3600*1000,
  MONTH: 30*24*3600*1000,
};
const ssl_dir = '/var/lif/ssl';
let acme_cert_key, acme_account_key;

// XXX: copy from date.js
function pad(num, size){ return ('000'+num).slice(-size); }
function to_sql_ms(d){
  d = d||new Date();
  if (isNaN(d))
    return '0000-00-00 00:00:00.000';
  return pad(d.getUTCFullYear(), 4)+'-'+pad(d.getUTCMonth()+1, 2)
    +'-'+pad(d.getUTCDate(), 2)
    +' '+pad(d.getUTCHours(), 2)+':'+pad(d.getUTCMinutes(), 2)
    +':'+pad(d.getUTCSeconds(), 2)
    +'.'+pad(d.getUTCMilliseconds(), 3);
}
function to_sql(d){ return to_sql_ms(d).replace(/( 00:00:00)?....$/, ''); }

export function sni_cb(server_name, cb){
  console.log('XXX sni_cb %s', server_name);
  let domain = dnss.get_our_domain(server_name);
  if (!domain){
    let err = 'domain not handled '+server_name;
    console.error('server: %s', err);
    return cb(err, null);
  }
  let ctx = ssl_cert[domain.name]?.ctx;
  if (!ctx){
    let err = 'failed to get ssl ctx for '+server_name;
    console.error('server: %s', err);
    return cb(err, null);
  }
  cb(null, ctx);
}

function get_acme_cert_files(domain){
  domain = domain.replace(/\./g, '_');
  return {cert: ssl_dir+'/acme_star_'+domain+'.crt',
    key: ssl_dir+'/acme_star_'+domain+'.key'};
}

async function load_cert(domain, opt){
  let file_cert = opt.cert, file_key = opt.key, cert, key;
  cert = await efs.readFile(file_cert);
  key = await efs.readFile(file_key);
  await set_cert(domain, file_cert, file_key, cert, key);
}

const ssl_cert = {};

function cert_valid_for(valid_from, valid_to){
  let ts = new Date();
  if (!valid_from || !valid_to)
    return 0;
  if (valid_from > ts)
    return 0;
  if (valid_to < ts)
    return 0;
  return valid_to - ts;
}

async function get_key(opt){
  let file = ssl_dir+'/'+opt.file, pem;
  await efs.mkdir(ssl_dir, {recursive: true});
  try {
    pem = await efs.readFile(file);
  } catch(err){ console.log('ssl: acme key not found at %s ', file); }
  if (pem)
    return new Buffer(pem);
  let key = await opt.func();
  console.log('ssl: save acme key at %s', file);
  await efs.writeFile(file, key.toString());
  return key;
}
const get_acme_account_key = ()=>get_key({file: 'acme_account_key.pem',
  func: acme.create_account_key});
const get_acme_cert_key = ()=>get_key({file: 'acme_cert_key.pem',
  func: acme.create_cert_key});

const set_cert = async(domain, file_cert, file_key, cert, key)=>{
  let cert_o = new x509.X509Certificate(cert);
  if (cert_o.subject.toLowerCase().search(domain)==-1) // XXX need api
    throw Error('domain not found in cert '+domain);
  let ts = new Date(), ctx;
  let valid_from = new Date(cert_o.notBefore);
  let valid_to = new Date(cert_o.notAfter);
  let valid_for = cert_valid_for(valid_from, valid_to);
  if (!valid_for){
    console.error('ssl: %s cert expired valid from %s to %s now %s', domain,
      to_sql(valid_from), to_sql(valid_to), to_sql(ts));
  } else if (valid_for < MS.WEEK){
    console.error('ssl: %s cert expire soon valid from %s to %s', domain,
      to_sql(valid_from), to_sql(valid_to));
  }
  // XXX TODO: check *.domain
  ctx = tls.createSecureContext({key, cert});
  ssl_cert[domain] = {ts, file_cert, file_key, cert, key, valid_from, valid_to,
    ctx};
  console.log('ssl: set cert %s valid from %s to %s', domain,
    to_sql(valid_from), to_sql(valid_to));
};

const _acme_check_if_need_ssl = async()=>{
  try {
    console.log('ssl: acme_check_if_need_ssl %O', dnss.domains);
    let queue = [];
    if (!dnss.domains)
      return;
    for (let name in dnss.domains){
      if (dnss.domains[name].ssl)
        queue.push(name);
    }
    for (let name of queue){
      let cert;
      console.log('ssl: load_cert domain %s', name);
      try { await load_cert(name, get_acme_cert_files(name)); }
      catch(err){ console.log('ssl: failed load acme cert %s', err); }
      let info = ssl_cert[name];
      if (info){
        let valid_for = cert_valid_for(info.valid_from,
          info.valid_to);
        if (valid_for > MS.MONTH)
          continue;
        console.log('ssl: cert %s will expire soon, renew', name);
      }
      try {
        console.log('ssl: requet_cert %s', name);
        cert = await acme.requet_cert({domain: name,
          account_key: acme_account_key, cert_key: acme_cert_key});
      } catch(err){
        console.error('ssl: failed issue acme cert %s %s', name, err);
        continue;
      }
      let o = get_acme_cert_files(name);
      try { await efs.writeFile(o.cert, cert.toString()); }
      catch(err){
        console.error('ssl: failed save cert %s %s', o.cert, err);
      } try {
        await efs.writeFile(o.key, acme_cert_key.toString());
      }
      catch(err){
        console.error('ssl: failed save key %s %s', o.key, err); }
      await set_cert(name, o.cert, o.key, cert, acme_cert_key);
    }
  } catch(err){ console.error('acme: check_if_need_ssl failed %O',
    err.stack);
  }
};

const acme_check_if_need_ssl = async()=>{
  while (1){
    await _acme_check_if_need_ssl();
    await esleep(MS.WEEK);
  }
};

function get_wan_ips(){
  let interfaces = os.networkInterfaces();
  let ret = [];
  for (let [name, infos] of Object.entries(interfaces)){
    for (const info of infos){
      if (!info.internal && info.family=='IPv4')
        ret.push({name, address: info.address});
    }
  }
  return ret;
}

export async function do_ssl(opt){
  let wan_ips = get_wan_ips();
  let dnss_opt = {ips: []};
  let sport = opt?.sport||443;
  for (let o of wan_ips)
    dnss_opt.ips.push({address: o.address, port: 53});
  dnss.start(dnss_opt);
  console.log('service DNS port 53');
  acme.init({dnss: dnss});
  acme_account_key = await get_acme_account_key();
  acme_cert_key = await get_acme_cert_key();
  dnss.set_domains({
    'arik.center': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
    'venao.center': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']}
  });
  acme_check_if_need_ssl(); // background: dont wait
  console.log('SSL: auto '+ssl_dir);
  return {sport};
}

