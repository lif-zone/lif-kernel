// LICENSE_CODE JPL hi world!
import {OE, html_elm, html_elm_frag_append, str, qs_append, qs_enc,
  lif_domain_parse, esleep,
} from './util.js';
import {hosts} from './hosts.js';
import {load_progress, load_error} from './load_progress.js';
let $lif = globalThis.$lif;

function demo_index(){
  let body = document.querySelector('body');
  for (let [k, v] of OE(hosts)){
    let p = html_elm('p');
    let e = html_elm('a', {href: '/?'+v});
    e.innerText = k;
    p.appendChild(e);
    body.appendChild(p);
  }
}

function page_domain_not_found(sub){
  let body = document.querySelector('body');
  let domain = location.hostname;
  let domain_rest = domain.slice(sub.length);
  let host_rest = location.host.slice(sub.length);
  let pre = location.protocol+'//';
  let wallet = pre+'wallet'+host_rest;
  html_elm_frag_append(body, `
    <h1>Domain <a href="${location.host}"><b>${sub}</b>${domain_rest}</a> is available!</h1>
    <h2>
      No one registered <b>${sub}</b>${domain_rest} domain yet.
      You may register it with LIF for free.
    </h2>
    <div>
      <a href="${wallet}${qs_enc({get_domain: domain})}"
        style="display: inline-block; padding: 14px 28px; background-color: #0066ff; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.2s ease;" >
        Make <b>${sub}</b>${domain_rest} your own
      </a> - In 5 minute, for free!
    </div>
  `);
}

function page_not_found(){
  let body = document.querySelector('body');
  let uri = location.pathname+location.search;
  html_elm_frag_append(body, `
    <h1>Page ${uri} 404 page not found</h1>
    <a href=/
      style="display: inline-block; padding: 14px 28px; background-color: #0066ff; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.2s ease;">
      Return home
    </a>
  `);
}

function page_error(error){
  console.error(error);
  load_error(error, {title: 'Lif Error'});
  return error;
}

async function lif_kv_get(key){
  let url = qs_append(location.origin+'/.lif.net/lif_kv', {key});
  let res = await fetch(url);
  if (res.status!=200)
    return {error: 'failed lif kv: '+res.status};
  let kv = await res.json();
  if (!kv)
    return {error: 'failed invalid lif kv'};
  if (kv.not_found)
    return;
  if (!kv.val)
    return {error: 'failed invalid lif kv'};
  return kv.val;
}

// A webapp given by ?webapp= is played on a tmp domain of its own: tmp--1,
// tmp--2... of the current origin (a separate origin, so its own
// localStorage). The assignments are kept, so the same webapp gets the same
// domain again.
function tmp_webapp_url(webapp){
  let t = {};
  let s = localStorage.getItem('lif.tmp_webapps');
  if (s){
    try {
      t = JSON.parse(s);
    } catch(err){
      console.error('invalid lif.tmp_webapps: '+s, err);
    }
  }
  let n = t[webapp];
  if (!n){
    n = t[webapp] = Math.max(0, ...Object.values(t))+1;
    localStorage.setItem('lif.tmp_webapps', JSON.stringify(t));
  }
  return location.protocol+'//tmp--'+n+'.'+location.host+'/'
    +qs_enc({webapp});
}

async function webapp_resolve(){
  let v, sub;
  if (sub = lif_domain_parse(location.hostname).sub){
    let name = sub;
    if (v = hosts[name])
      return {site: v};
    let name_prefix = name.split('--')[0];
    if (v = hosts[name_prefix])
      return {site: v};
    v = await lif_kv_get('dns/'+name_prefix);
    if (v?.error)
      return v;
    if (v?.site)
      return {site: v.site};
    return {page: ()=>page_domain_not_found(sub)};
  }
  // root domain: http://localhost https://lifcoin.org
  if (location.pathname!='/')
    return {page: ()=>page_not_found()};
  let q = new URLSearchParams(location.search);
  if (v=q.get('webapp'))
    return {redirect: tmp_webapp_url(v)};
  let qe = [...q.entries()];
  if (qe.length==1 && qe[0][0] && !qe[0][1])
    return {redirect: tmp_webapp_url(qe[0][0])};
  let redirect = hosts[''].redirect;
  let u = new URL(redirect, location);
  u.protocol = location.protocol;
  if (u.hostname.endsWith('.lif'))
    u.hostname = u.hostname.replace(/\.lif$/, '.'+location.hostname);
  u.port = location.port;
  return {redirect: ''+u};
}

async function sw_unregister(){
  if (!navigator.serviceWorker.controller)
    return;
  console.log('force reload - unreegister sw');
  let reg = await navigator.serviceWorker.getRegistrations();
  await Promise.all(reg.map(r=>r.update()));
  await Promise.all(reg.map(r=>r.unregister()));
}

async function wait_timeout(timeout, promise){
  let ret;
  await Promise.any([
    (async function(){ ret = await promise; })(),
    esleep(timeout),
  ]);
  return ret;
}

async function do_load_retry(){
  if (!await wait_timeout(2000, fetch('/.lif/kernel/cache_clear')))
    console.log('failed /.lif/kernel/cache_clear');
  await wait_timeout(2000, sw_unregister());
  window.location.reload(true);
}
async function life(){
  let w = await webapp_resolve();
  if (w?.error)
    return page_error(w.error);
  if (w.redirect){
    window.location = w.redirect;
    return;
  }
  if (w.site=='*demo_index')
    w.page = ()=>demo_index();
  if (w.page)
    return await w.page();
  let l = load_progress();
  try {
    return await $lif.boot.boot_app({lif: {webapp: w.site}});
  } catch(err){
    l.remove();
    load_error(err, {title: 'Error loading', retry: do_load_retry});
  } finally {
    l.remove();
  }
}

await life();

export default life;
