// LICENSE_CODE JPL hi world!
import {OE, html_elm, html_elm_frag_append, str, qs_append, qs_enc,
  lif_domain_parse, esleep,
} from './util.js';
import {hosts} from './hosts.js';
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
  let body = document.querySelector('body');
  let elm = html_elm('div', {style: 'padding:32px'});
  let title = html_elm('div', {style: 'font-size:24px;color:#e74c3c'});
  let txt = error instanceof Error ? error.message : ''+error;
  if (error?.stack)
    txt += '\n'+error.stack;
  let header = txt.split('\n')[0];
  title.textContent = 'Lif Error: '+header;
  let pre = html_elm('pre', {style: 'font-size:12px;white-space:pre-wrap'});
  pre.textContent = txt.split('\n').slice(1).join('\n');
  elm.appendChild(title);
  elm.appendChild(pre);
  body.appendChild(elm);
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
  // XXX in the future, if ?webapp=github:... then lookup in localStorage,
  // assign to existing or new webapp--1 webapp--2... and redirect
  // (or maybe tmp--1.lifnet.com/?webapp=github:... tmp--2...)
  // if in development mode - dont redirect: allow playground on parent domain
  if (v=q.get('webapp'))
    return {site: v};
  let qe = [...q.entries()];
  if (qe.length==1 && qe[0][0] && !qe[0][1])
    return {site: qe[0][0]};
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

function div_loader(){
  let elm = html_elm('div', {id: 'lif-loader', style:
    'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;'
    +'align-items:center;justify-content:center;font-family:sans-serif;'
    +'color:#888;font-size:14px'});
  document.body.appendChild(elm);
  return elm;
}

async function do_load_retry(){
  if (!await wait_timeout(2000, fetch('/.lif/kernel/cache_clear')))
    console.log('failed /.lif/kernel/cache_clear');
  await wait_timeout(2000, sw_unregister());
  window.location.reload(true);
}
async function page_load_retry(err){
  let err_lines = (''+err).split('\n').slice(0, 10).join('\n');
  let elm = html_elm('div', {id: 'lif-loader',
    style: 'padding:32px;cursor:pointer'});
  let title = html_elm('div', {style: 'font-size:24px;color:#e74c3c'});
  title.textContent = '🔄 Error loading';
  let pre = html_elm('pre', {style: 'font-size:12px;white-space:pre-wrap'});
  pre.textContent = err_lines;
  elm.appendChild(title);
  elm.appendChild(pre);
  elm.onclick = ()=>do_load_retry();
  document.body.appendChild(elm);
}

function load_progress(){
  let elm = div_loader();
  let img = html_elm('img', {src: import.meta.resolve('./favicon.ico'),
    style: 'height:14px;width:14px;margin-right:6px'});
  if (0) elm.appendChild(img);
  let txt = document.createTextNode('Loading…');
  elm.appendChild(txt);
  document.body.appendChild(elm);
  let last, diff;
  let iv = setInterval(async function(){
    let stats = await $lif.boot.kernel_stats();
    let all = stats?.fetch?.all;
    if (all==null || all==last)
      return;
    if (last==null)
      diff = all;
    last = all;
    txt.textContent = 'Loading… '+(all-diff);
  }, 200);
  let op = {
    elm,
    failed: function(err){
      this.remove();
      page_load_retry(err);
    },
    remove: function(){
      if (this.removed)
        return;
      this.removed = true;
      clearInterval(iv);
      elm.remove();
    },
  };
  return op;
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
    l?.failed(err);
  } finally {
    l?.remove();
  }
}

await life();

export default life;
