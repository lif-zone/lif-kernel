// LICENSE_CODE ZON
'use strict'; /*jslint node:true*/
import acme from 'acme-client';
export const E = {};
const email = 'lif.zone.main@gmail.com';
E.TIMEOUT = 60*1000;

export function set_debug(){
  acme.setLogger(msg=>console.log('acme: log %s', msg));
}
E.create_account_key = acme.forge.createPrivateKey;
E.create_cert_key = acme.forge.createPrivateKey;

function dns_add_cb(auth, challenge, val){
  if (challenge.type!='dns-01')
    return console.error('acme: unexected types %s', challenge.type);
  let host = '_acme-challenge.'+auth.identifier.value;
  console.log('acme: set challenge dns %s %s', host, val);
  E.set_txt(host, val);
}

function dns_rm_cb(auth, challenge, val){
  return function()
{
  if (challenge.type!='dns-01')
    return console.error('acme: unexected types %s', challenge.type);
  let host = '_acme-challenge.'+auth.identifier.value;
  console.log('acme: remove challenge dns %s %s', host, val);
  E.rm_txt(host);
}; }

// XXX: configure directory in conf
export async function request_cert(opt){
  let {cert_key, account_key, domain, timeout} = opt;
  timeout = timeout||E.TIMEOUT;
  // XXX: how to cancel acme on timeout
  const client = new acme.Client({accountKey: account_key,
    directoryUrl: acme.directory.letsencrypt.production});
  const [, csr] = await acme.forge.createCsr({commonName: domain,
    altNames: [domain, '*.'+domain]}, cert_key);
  const cert = await client.auto({csr, email, termsOfServiceAgreed: true,
    challengePriority: ['dns-01'], challengeCreateFn: dns_add_cb,
    challengeRemoveFn: dns_rm_cb});
  console.log('acme: got new cert for %s', domain);
  return cert;
}

export function init(op){
  E.set_txt = op.set_txt;
  E.rm_txt = op.rm_txt;
}
