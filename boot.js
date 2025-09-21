// LIF bootloader: Boot the kernel and then load the application
let lif = globalThis.lif = {};
let lif_version = '1.2.0';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, assert_eq,
  path_file, path_dir, OF, OA, assert, T, T_npm_to_lpm, npm_str,
  T_npm_url_base, uri_enc, qs_enc, qs_append,
  lpm_parse, npm_to_lpm, lpm_to_npm, lpm_ver_missing,
  _debugger} = util;
let json = JSON.stringify;

let modules = {};
let modules_cache = {};
let modules_cache_url = {};
let kernel_chan;
let npm_root;
let npm_map = {};

let process = globalThis.process ||= {env: {}};
let is_worker = typeof window=='undefined';

const lpm_2url = (mod_self, url, opt)=>{
  let u = T_npm_url_base(url, mod_self);
  if (u.is.url)
    return url;
  let q = {};
  if (opt?.raw)
    q.raw = 1;
  if (u.is.uri)
    return qs_append(url, q);
  let _url = '/.lif/'+T_npm_to_lpm(u.path);
  if (opt?.cjs && u.is.rel)
    q.cjs = 1;
  if (opt?.worker)
    q.worker = 1;
  if (opt?.type=='module')
    q.mjs = 1;
  if (0 && opt?.worker)
    q.cjs_es5 = 1;
  if (0 && opt?.es5)
    q.cjs_es5 = 1;
  if (1 || lpm_ver_missing(u.lmod) && !npm_map[u.lmod.name])
    q.mod_self = mod_self;
  return qs_append(_url, q);
};

const lpm_2uri = (mod_self, url)=>{
  let u = T_npm_url_base(url, mod_self);
  if (u.is.url)
    return url;
  if (u.is.uri)
    return url;
  return '/.lif/'+T_npm_to_lpm(u.path);
};

function test(){
  let t;
  t = (mod_self, url, v)=>assert_eq(v, lpm_2uri(mod_self, url));
  t('mod@1.2.3', './a/file.js', '/.lif/npm/mod@1.2.3/a/file.js');
  t('.local/other.js', './a/file.js', '/.lif/local/a/file.js');
  t('.local/mod/', './a/file.js', '/.lif/local/mod//a/file.js');
  t('react@1.2.3', 'mod/file.js', '/.lif/npm/mod/file.js');
  t('react@1.2.3', 'mod@4.5.6/file.js', '/.lif/npm/mod@4.5.6/file.js');
  t = (mod_self, url, opt, v)=>assert_eq(v, lpm_2url(mod_self, url, opt));
  t('mod@1.2.3', './a/file.js', {cjs: 1},
    '/.lif/npm/mod@1.2.3/a/file.js?cjs=1&mod_self=mod@1.2.3');
  t('.local/other.js', './a/file.js', {cjs: 1},
    '/.lif/local/a/file.js?cjs=1&mod_self=.local/other.js');
  t('.local/mod/', './a/file.js', {cjs: 1},
    '/.lif/local/mod//a/file.js?cjs=1&mod_self=.local/mod/');
  t('react@1.2.3', 'mod/file.js', {cjs: 1},
    '/.lif/npm/mod/file.js?mod_self=react@1.2.3');
  t('react@1.2.3', 'mod@4.5.6/file.js', {cjs: 1},
    '/.lif/npm/mod@4.5.6/file.js?mod_self=react@1.2.3');
}
test();

let url_expand = T(url=>(new URL(url, globalThis.location)).href || url);

async function define_amd(mod_id, args, m){
  let _mod_id /* ignored */, imps, factory;
  let imps_default = ['require', 'exports', 'module'];
  let exports_val; /* not supported */
  if (args.length==1){
    // define(function(){...})
    // define(function(require, exports, module){...});
    factory = args[0];
    imps = imps_default;
  } else if (args.length==2){
    if (typeof args[0]=='string'){
      // define('my_mod', function(require, exports, module){...});
      _mod_id = args[0];
      imps = imps_default;
    } else {
      // define(['imp1', 'imp2'], function(imp1, imp2){...});
      imps = args[0];
    }
    factory = args[1];
  } else if (args.length==3)
    // define('my_mod', ['imp1', 'imp2'], function(imp1, imp2){...});
    [_mod_id, imps, factory] = args;
  else
    throw Error('define() invalid num args');
  if (typeof factory!='function'){
    throw Error('define() non-function factory not supported');
    exports_val = factory;
    factory = undefined;
  }
  return await _define_amd(mod_id, imps, factory, m);
}
async function _define_amd(mod_id, imps, factory, m){
  if (!m){
    if (modules[mod_id])
      throw Error('define('+mod_id+') already defined');
    m = modules[mod_id] = {mod_id, imps, factory, loaded: false,
      wait: ewait(), exports: {}};
  }
  let _imps = await require_amd(m, imps);
  let exports = factory(..._imps);
  if (exports)
    m.exports = exports;
  m.loaded = true;
  return m.wait.return(m.exports);
}

// AMD async require(['imp1', 'imp2'], function(imp1, imp2){...})
async function require_amd(m, imps){
  let _imps = [];
  for (let i=0; i<imps.length; i++){
    let imp = imps[i], v;
    switch (imp){
    case 'require': // implementation of AMD require(imps, cb)
      v = async(imps, cb)=>{
        let _imps = await require_amd(m, imps);
        cb(..._imps);
      };
      break;
    case 'exports': v = m.exports; break;
    case 'module': v = m; break;
    default:
      // TOOO validate npm module or relative file
      v = await require_cjs(m.mod_self, imp);
    }
    _imps[i] = v;
  }
  return _imps;
}

function require_cjs_cache(mod_self, mod_id){
  let url = lpm_2url(mod_self, mod_id, {cjs: 1});
  let m = modules_cache_url[url];
  if (m)
    return m.exports;
  let mod_self_id = mod_self+' '+url;
  m = modules[mod_self_id];
  if (!m)
    throw Error('module '+url+' not loaded beforehand');
  if (!m.loaded)
    throw Error('module '+url+' not loaded completion');
  return m.module.exports;
}

function require_register_cb({npm_uri, url, parent_mod, log}){
  let m;
  if (m = modules_cache_url[url]){
    console.error('module '+url+' loaded twice: 1st '+
      m.parent_mod+' '+m.parent_url+
      '\n2nd '+parent_mod+' '+log.mod+' '+log.imp);
  }
  if (m = modules_cache[npm_uri]){
    console.error('module '+npm_uri+' loaded twice: 1st '+
      m.parent_mod+' '+m.parent_url+
      '\n2nd '+parent_mod+' '+log.mod+' '+log.imp);
  }
  m = modules_cache[npm_uri] = modules_cache_url[url] = {
    exports: {},
    parent_mod,
    lmod: npm_uri,
    npm_uri,
    url,
  };
  m.log = {...log};
  m.require = imp=>require_cjs_cache(npm_uri, imp);
  m.require_async = async(imp)=>await require_cjs(npm_uri, imp);
  return m;
}
async function require_cjs(mod_self, mod_id){
  let u = T_npm_url_base(mod_id, mod_self);
  let npm_uri;
  if (u.is.mod)
    npm_uri = npm_str(u.lmod);
  let _mod_id = lpm_2uri(mod_self, mod_id);
  let _url = lpm_2url(mod_self, mod_id, {cjs: 1});
  let url = url_expand(_url);
  let m;
  if (m = npm_uri&&modules_cache[npm_uri] || modules_cache_url[_url]){
    assert(m.loaded, 'not loaded '+_url);
    return m.exports;
  }
  let mod_self_id = mod_self+' '+_url;
  if (m = modules[mod_self_id])
    return await m.wait;
  m = modules[mod_self_id] = {mod_id: _url, npm_uri,
    imps: [], wait: ewait(),
    loaded: false, module: {exports: {}}};
  let opt = mod_id.endsWith('.json') ? {with: {type: 'json'}} : {};
  let slow;
  try {
    slow = eslow(15000, 'require_cjs import('+mod_id+') '+url);
    m.mod = await /*keep*/ import(url, opt);
    slow.end();
  } catch(err){
    console.error('import('+mod_id+') failed. required from '+mod_self,
      err);
    slow.end();
    throw m.wait.throw(err);
  }
  m.loaded = true;
  m.module.exports = m.mod.default || m.mod;
  return m.wait.return(m.module.exports);
}

function require_register_cb_end(m){
  m.loaded = 1;
}
// web worker importScripts()/require() implementation
let fetch_opt = url=>
  (url[0]=='/' ? {headers: {'Cache-Control': 'no-cache'}} : {});
let import_modules = {};
let import_module_script = async({mod_self, imp, url, opt})=>{
  let m;
  if (m = modules[imp]){
    assert(m.url==url, 'different url for '+imp+': '+m.url+' -> '+url);
    return await m.wait;
  }
  m = modules[imp] = {id: imp, url, wait: ewait(), mod_self,
    exports: {}, loaded: false};
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    m.script = await response.text();
  } catch(err){
    console.error('import('+url+') failed', err);
    throw m.wait.throw(err);
  }
  let js = `//# sourceURL=${url}\n`;
  if (opt.amd){
    // implementation of AMD define()
    m.define = async function(id, imps, factory){
      return await define_amd(imp, arguments, m);
    };
    m.define.amd = {};
    m.define.module = m;
    js += `let define = lif.boot.import_modules_get(${json(imp)}).define;`;
  }
  js += m.script;
  try {
    eval?.(js); // script return value is ignored
    await m.wait;
    if (opt.amd)
      assert(m.loaded, 'module not loaded: '+imp);
    else
      m.loaded = true;
    return m.wait.return(m.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw m.wait.throw(err);
  }
};

function import_modules_get(imp){
  let m = modules[imp];
  assert(m, 'module not found: '+imp);
  return m;
}

async function import_amd(mod_self, [imp, opt]){
  D && console.log('import_amd', imp, mod_self);
  let _imp = lpm_2uri(mod_self, imp);
  let uri = qs_append(_imp, {raw: 1});
  return await import_module_script({mod_self, imp: _imp, url: uri,
    opt: {amd: 1}});
}

// worker
async function worker_import({mod_self, imp, opt}){
  let url = lpm_2url(mod_self, imp, opt);
  let q;
  if (opt?.type=='script')
    q = {raw: 1};
  else
    assert(0, 'module import not yet supportedd');
  url = qs_append(url, q);
  let _imp = lpm_2uri(mod_self, imp);
  return await import_module_script({mod_self, imp: _imp, url, opt: {worker: 1}});
}

async function import_esm(mod_self, [imp, opt]){
  let _url = lpm_2url(mod_self, imp, opt);
  _url = url_expand(_url);
  let slow;
  try {
    slow = eslow(15000, 'import_esm('+_url+')');
    D && console.log('boot.js: import '+_url);
    let ret;
    if (is_worker)
      ret = await worker_import({mod_self, imp, opt});
    else
      ret = await /*keep*/ import(_url, opt);
    slow.end();
    return ret;
  } catch(err){
    console.error('import_esm('+_url+' '+mod_self+')', err);
    slow.end();
    throw err;
  }
}

function sync_worker_fetch(url){
  const request = new XMLHttpRequest();
  request.open("GET", url, false); // `false` makes the request synchronous
  request.send(null);
  if (request.status!=200)
    return;
  return request.responseText;
}

// worker
function importScripts_single(mod_self, [mod, opt]){
  let url = lpm_2url(mod_self, mod, opt?.type=='script' ? {raw: 1} : {});
  let script = sync_worker_fetch(url);
  let exports = eval.call(globalThis,
    `//# sourceURL=${url}\n;${script}`);
}

function _importScripts(mod_self, mods){
  for (let m of mods)
    importScripts_single(mod_self, [m, {worker: 1, type: 'script'}]);
}

function new_importScripts(...mods){
  _importScripts(globalThis.origin, mods);
}

function init_worker(){
  if (init_worker.inited)
    return;
  init_worker.inited = true;
  console.log('lif init_worker '+globalThis.location+' '+(globalThis.name||''));
  globalThis.orig_importScripts = globalThis.importScripts;
  globalThis.importScripts = new_importScripts;
}

let lif_kernel_base = import.meta.resolve('./x').slice(0, -1);
let boot_kernel = async()=>{
  console.log('lif boot version: '+lif_version+' util '+util.version
    +' from '+lif_kernel_base);
  if (boot_kernel.wait)
    return await boot_kernel.wait;
  let wait = boot_kernel.wait = ewait();
  try {
    const conn_kernel = async()=>{
      console.log('conn kernel');
      if (kernel_chan){
        console.log('conn closing');
        kernel_chan.close();
        kernel_chan = null;
      }
      kernel_chan = null;
      let controller = navigator.serviceWorker.controller;
      if (!controller){
        console.log('no sw controllier - reloading');
        window.location.reload();
        return;
      }
      kernel_chan = new postmessage_chan();
      kernel_chan.connect(controller);
      kernel_chan.add_server_cmd('version', arg=>({version: lif_version}));
      let slow = eslow('conn_kernel chan');
      D && console.log('conn_kernel chan start');
      console.log('lif kernel sw version: '+
        (await kernel_chan.cmd('version')).version);
      D && console.log('conn_kernel chan end');
      slow.end();
      wait.return();
    };
    let slow = eslow('sw register');
    const registration = await navigator.serviceWorker.register(
      '/lif_kernel_sw.js?'+qs_enc({lif_kernel_base}));
    const sw = await navigator.serviceWorker.ready;
    slow.end();
    // this boots the app if the SW has been installed before or
    // immediately after registration
    // https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle#clientsclaim
    navigator.serviceWorker.addEventListener('controllerchange', conn_kernel);
    await conn_kernel();
    slow = eslow('sw conn');
    await wait;
    slow.end();
    return await wait;
  } catch(err){
    console.error('ServiceWorker registration failed', err, err.stack);
    throw wait.throw(err);
  }
};

// https://web.dev/articles/cross-origin-isolation-guide
// https://developer.chrome.com/blog/coep-credentialless-origin-trial
// https://github.com/gzuidhof/coi-serviceworker
// Cross-Origin-Isolation is required for SharedArrayBuffer feature
// also, in browser, you need to activate
// the required COI headers to enable SAB is added by service worker:
// 'cross-origin-embedder-policy': 'require-corp'
// 'cross-origin-opener-policy': 'same-origin'
let coi_enable = false;
let coi_reload = async()=>{
  const reloaded = window.sessionStorage.getItem("coi_reload");
  window.sessionStorage.removeItem("coi_reload");
  if (window.crossOriginIsolated)
    return true;
  if (reloaded){
    console.error('failed enabling coi');
    return;
  }
  window.sessionStorage.setItem("coi_reload", true);
  console.log('reload: to enable cross origin isolation for SAB');
  window.location.reload();
};

// http://localhost:3000/?lif-basic@1.2.0/main.tsx
// http://localhost:3000/?lif-os@1.2.0/lif-basic/main.tsx
// http://localhost:3000/?webapp=lif-os@1.2.9/lif-basic/main.tsx
// http://localhost:3000/?.git/github/xderry/lif-os@main/lif-basic/main.tsx
let app_pkg_default = ()=>{
  let q = new URLSearchParams(location.search);
  let e = q.entries();
  let pkg = {}, v;
  if (e[0] && !e[1])
    pkg.webapp = e[0];
  if (v=q.get('webapp'))
    pkg.webapp = v;
  if (!pkg.webapp)
    pkg.webapp = 'lif-basic@1.2.0/main.tsx';
  if (v=q.get('src')){
    let u = lpm_parse(npm_to_lpm(pkg.webapp));
    u.path = '';
    pkg.dependencies ||= [];
    pkg.dependencies[lpm_to_npm(u)] = v;
  }
  return {lif: pkg};
};

let boot_app = async(app_pkg)=>{
  if (!app_pkg)
    app_pkg = app_pkg_default();
  app_pkg = JSON.parse(JSON.stringify(app_pkg));
  let lif = app_pkg.lif;
  let webapp = lif?.webapp;
  // init kernel
  await boot_kernel();
  console.log('boot: boot '+webapp);
  npm_map = lif?.dependencies||{};
  npm_root = webapp;
  let slow = eslow('app_pkg');
  await kernel_chan.cmd('app_pkg', app_pkg);
  slow.end();
  // reload page for cross-origin-isolation
  if (coi_enable)
    await coi_reload();
  // load app
  try {
    return await import_esm(webapp, [webapp]);
  } catch(err){
    console.error('boot: app('+webapp+') failed');
    throw err;
  }
  console.log('boot: boot complete');
};

if (!is_worker){
  let get_url = (url, opt)=>{
    url = url.href || url;
    let _url = url, es5 = opt?.type!='module';
    _url = lpm_2url(npm_root, _url, {worker: 1, type: opt?.type});
    return _url;
  };
  class lif_Worker extends Worker {
    constructor(url, opt){
      console.log('Worker start', url);
      let _url = get_url(url, opt);
      let worker = super(_url, ...[...arguments].slice(1));
    }
  }
  globalThis.orig_Worker = Worker;
  globalThis.Worker = lif_Worker;
  class lif_SharedWorker extends SharedWorker {
    constructor(url, opt){
      console.log('SharedWorker start', url);
      let _url = get_url(url, opt);
      let worker = super(_url, ...[...arguments].slice(1));
    }
  }
  globalThis.orig_SharedWorker = SharedWorker;
  globalThis.SharedWorker = lif_SharedWorker;
}

lif.boot = {
  miani:  'ANkI YhVh ALOhYk:La YhYh Lk ALOhIM AHRIM EL PNY:La TsA AT SM YhVh ALOhk LSVA:ZkOR AT YOM hSBT LQDSO:KBD AT AVIk VAT AMk:LO TRxH:LO TNAF:LO TGNV:LO TENh BREk ED SQR:LO THMD BYT REk:',
  //miani:'anki yhvh alohyk:la yhyh lk alohim aHrim el pny:la tsa at Sm yhvh alohk lSva:zkor at yom hSbt lqdSo:Kbd at avik vat amk:lo trXH:lo tnaf:lo tgnv:lo tenh brek ed Sqr:lo tHmd byt rek:',
  version: lif_version,
  process,
  require_cjs,
  require_register_cb,
  require_register_cb_end,
  import_esm,
  import_amd,
  import_modules_get,
  // debug
  util,
  modules,
  modules_cache,
  modules_cache_url,
};
if (is_worker){
  OA(lif.boot, {_importScripts});
  init_worker();
}
if (!is_worker)
  OA(lif.boot, {boot_kernel, boot_app});
// globalThis.define = define;
// globalThis.require = require;

export default lif;
