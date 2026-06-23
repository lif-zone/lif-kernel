// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let sw_boot_version = '26.6.18';
let $lif = globalThis.$lif ||= {};
let D = 0; // debug

// TORAT SHALO
// BIRKAT HAMAZON: SHALOM, AND THANKS FOR ALL THE FEED!
// meaning of feed: food that is feeded to you. "animal feed".
// MSMOUT MZON: HDVR SMISHU ZAN AUTK

let sw_boot = {
  whoami: 'IBEYOURGODDONTCREATEOTHERGODSOVERMEDONTUSEBEYOURGODSNAMEINVAINREMEMBERTODEDICATETHESATURDAYOBEYYOURFATHERANDMOTHERDONTMURDERDONTCHEATDONTSTEALDONTTORTUREFAKELIEDONTGREEDFELLOWSHOME',
  on_message: null,
  on_fetch: null,
  wait_activate: ewait(),
  version: sw_boot_version,
};

// util.js
function ewait(){
  let _return, _throw;
  let promise = new Promise((resolve, reject)=>{
    _return = ret=>{ resolve(ret); return ret; };
    _throw = err=>{ reject(err); return err; };
  });
  promise.return = _return;
  promise.throw = _throw;
  promise.catch(err=>{}); // catch un-waited wait() objects. avoid Uncaught in promise
  return promise;
}

// assert.js
function assert(ok, ...msg){
  if (ok)
    return;
  console.error('assert FAIL:', ...msg);
  debugger; // eslint-disable-line no-debugger
  throw Error('assert FAIL');
}
function assert_eq(exp, res){
  assert(exp===res, 'exp', exp, 'got', res);
}

async function _on_fetch(event){
  if (sw_boot.on_fetch){
    try {
      return sw_boot.on_fetch(event);
    } catch(err){
      console.error('lif kernel sw: '+err);
    }
    return;
  }
  let wait = ewait();
  let {request, request: {url}} = event;
  let u = new URL(url);
  let external = u.origin!=location.origin;
  let path = u.pathname;
  if (external || path=='/' || request.method!='GET'){
    console.log('passed req', url);
    return await fetch(request);
  }
  console.warn('sw pending fetch('+event.request.url+') event before inited');
  await sw_boot.wait_activate;
  console.info('sw complete fetch('+event.request.url+')');
  return await sw_boot.on_fetch(event);
}
function on_fetch(event){
  event.respondWith(_on_fetch(event));
}
// service worker must register handlers on first run (not async)
function sw_init_pre(){
  globalThis.addEventListener('install', event=>event.waitUntil((async()=>{
    await globalThis.skipWaiting(); // force sw reload - dont wait for pages to close
    console.log('kernel install', sw_boot_version);
  })()));
  // this is needed to activate the worker immediately without reload
  // @see https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle#clientsclaim
  globalThis.addEventListener('activate', event=>event.waitUntil((async()=>{
    console.log('kernel activate');
    await sw_boot.wait_activate;
    console.log('kernel claim');
    await globalThis.clients.claim(); // move all pages immediatly to new sw
    console.log('kernel activated', sw_boot_version);
  })()));
  globalThis.addEventListener('message', event=>event.waitUntil((async()=>{
    if (!sw_boot.on_message){
      console.warn('sw message event before inited', event);
      await sw_boot.wait_activate;
      console.log('sw message event finished wait');
    }
    sw_boot.on_message(event);
  })()));
  globalThis.addEventListener('fetch', on_fetch);
}
sw_init_pre();
console.log('pre_init');

// service worker import() implementation
// 0 no-cache, 1 cache registry, 2 cache http/https, 3 cache local
let enable_cache = 1;
function fetch_opt(url){
  let no_cache = url.startsWith('/') ? !enable_cache : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}}: {};
}
function esm_kernel_tr(src){
  // hack for util.js
  src = src.replace(/await import\(/g, 'await import_module(');
  // collect all exports
  let re = /($|\n)export +(default|class|let|const|function|async function|\*function) +([A-Za-z0-9_]+)([^\n]+)/g;
  return src.replace(re, (match, pre, type, name, rest)=>{
    let s;
    if (type=='let' || type=='const')
      s = `${type} ${name} = exports.${name}`;
    else if (type=='default')
      s = `module.exports = ${name}`;
    else if (type=='class' || type=='function' || type=='async function'
      || type=='*function')
    {
      s = `const ${name} = exports.${name} = ${type} ${name}`;
    }
    return `${pre}${s}${rest}`;
  });
}

const json = JSON.stringify;
let sw_q = new URLSearchParams(location.search);
let lif_kernel_base = sw_boot.lif_kernel_base = sw_q.get('lif_kernel_base');
let local_dev_enable = sw_boot.local_dev_enable = sw_q.get('local_dev_enable');
let import_modules = {};
async function import_module(url, mod_self=lif_kernel_base+'/'){
  let imod;
  url = (new URL(url, mod_self)).href;
  if (imod = import_modules[url])
    return await imod.wait;
  imod = import_modules[url] = {url, wait: ewait()};
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    let body = await response.text();
    let tr = esm_kernel_tr(body);
    imod.script = `'use strict';
      let module = {exports: {}};
      let exports = module.exports;
      let import_module = (mod, mod_self)=>globalThis.$lif.import_module(mod, mod_self||${json(url)});
      module.wait = (async()=>{
      ${tr}
      })();
      module;
    `;
  } catch(err){
    console.error('import('+url+') failed', err);
    throw imod.wait.throw(err);
  }
  try {
    let module = eval?.(
      `//# sourceURL=${url}\n${imod.script}`);
    await module.wait;
    imod.exports = module.exports;
    if (imod.exports.default===undefined)
      imod.exports.default = imod.exports;
    return imod.wait.return(imod.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw imod.wait.throw(err);
  }
}
$lif.import_module = import_module;

async function kernel_boot(){
  console.log('kernel import');
  let util = await import_module('./util.js');
  $lif.assert = util.assert;
  $lif.Buffer = util.Buffer;
  let kernel = await import_module('./kernel.js');
  console.log('kernel import end');
  try {
    kernel.boot(sw_boot);
  } catch(err){
    console.error('lif kernel failed sw init', err);
  }
}

function test_kernel(){
  let t;
  t = (js, v)=>assert_eq(`\n${v}\n`, esm_kernel_tr(`\n${js}\n`));
  t('export default func;', 'module.exports = func;');
  t('export let RICH = 10;', 'let RICH = exports.RICH = 10;');
  t('export let mean = 42;\nexport let life = 18;',
    'let mean = exports.mean = 42;\nlet life = exports.life = 18;');
  t('export const name = 42;', 'const name = exports.name = 42;');
  t('export class Life {', 'const Life = exports.Life = class Life {');
  t('export function wc(s){', 'const wc = exports.wc = function wc(s){');
  t('export async function strlen(',
    'const strlen = exports.strlen = async function strlen(');
  t('export *function split_words(',
    'const split_words = exports.split_words = *function split_words(');
}
test_kernel();
kernel_boot();

