// LIF bootloader: Boot the kernel and then load the application
let lif = globalThis.lif = {};
let lif_version = '1.1.12';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, assert_eq,
  path_file, path_dir, OF, OA, assert, TE_to_null, TE_npm_to_lpm,
  TE_url_uri_parse, TE_url_uri_parse2, uri_enc, qs_enc, qs_append,
  lpm_uri_parse, npm_to_lpm, lpm_to_npm,
  _debugger} = util;
let json = JSON.stringify;

let modules = {};
let kernel_chan;
let npm_root;
let npm_map = {};

let process = globalThis.process ||= {env: {}};
let is_worker = typeof window=='undefined';

function define(){ return define_amd(null, arguments); }
define.amd = {};
function require(){ return require_cjs_amd(null, arguments); }

function define_amd(mod_self, args, module){
  let module_id /* ignored */, deps, factory;
  let deps_default = ['require', 'exports', 'module'];
  let exports_val; /* not supported */
  if (args.length==1){
    factory = args[0];
    deps = deps_default;
  } else if (args.length==2){
    if (typeof args[0]=='string'){
      module_id = args[0];
      deps = deps_default;
    } else
      deps = args[0];
    factory = args[1];
  } else if (args.length==3)
    [module_id, deps, factory] = args;
  else
    throw Error('define() invalid num args');
  if (typeof factory!='function'){
    throw Error('define() non-function factory not supported');
    exports_val = factory;
    factory = undefined;
  }
  if (modules[mod_self])
    throw Error('define('+mod_self+') already defined');
  let promise = ewait();
  let m = modules[mod_self] = {mod_self, deps, factory, loaded: false,
    promise, module: module||{exports: {}}};
  require_amd(mod_self, [deps, function(...deps){
    let exports = m.factory.apply(m.module.exports, deps);
    if (exports)
      m.module.exports = exports;
    m.loaded = true;
    promise.return(m.module.exports);
  }]);
  return promise;
}

function require_amd(mod_self, [deps, cb]){
  let _deps = [];
  let m = modules[mod_self] || {module: {exports: {}}};
  return (async()=>{
    for (let i=0; i<deps.length; i++){
      let dep = deps[i], v;
      switch (dep){
      case 'require':
        v = (deps, cb)=>require_amd(mod_self, [deps, cb]);
        break;
      case 'exports': v = m.module.exports; break;
      case 'module': v = m.module; break;
      default: v = await require_single(mod_self, dep);
      }
      _deps[i] = v;
    }
    cb(..._deps);
  })();
}

function require_cjs(mod_self, module_id){
  let m = modules[module_id];
  if (!m)
    throw Error('module '+module_id+' not loaded beforehand');
  if (!m.loaded)
    throw Error('module '+module_id+' not loaded completion');
  return m.module.exports;
}

function require_cjs_amd(mod_self, args){
  if (args.length==1)
    return require_cjs(mod_self, args[0]);
  if (args.length==2)
    return require_amd(mod_self, args);
  throw Error('invalid call to require()');
}

const lpm_2url = (mod_self, url, opt)=>{
  let u = TE_url_uri_parse(url, mod_self);
  if (u.is.url)
    return url;
  let q = {};
  if (opt?.raw)
    q.raw = 1;
  if (u.is.uri)
    return qs_append(url, q);
  let _url = '/.lif/'+TE_npm_to_lpm(u.path);
  if (!u.mod.ver && !npm_map[u.mod.name])
    q.mod_self = mod_self;
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
  return qs_append(_url, q);
};

function test(){
  return;
  let t;
  t = (v, mod_self, url, opt)=>assert_eq(v, lpm_2url(mod_self, url, opt));
  t('/.lif/npm/react@18.3.1/cjs/react.js?mod_self=react%4018.3.1&cjs=1',
    './cjs/react.js', 'react@18.3.1', {cjs: 1});
}
test();

let url_expand = 
  TE_to_null(url=>(new URL(url, globalThis.location)).href || url);

async function require_single(mod_self, module_id){
  let m;
  if (m = modules[module_id])
    return await m.wait;
  m = modules[module_id] = {module_id, deps: [], wait: ewait(),
    loaded: false, module: {exports: {}}};
  let slow;
  slow = eslow('require_single mod('+module_id+')');
  let url = lpm_2url(mod_self, module_id, {cjs: 1});
  url = url_expand(url);
  slow.end();
  try {
    slow = eslow(15000, 'require_single import('+module_id+') '+url);
    D && console.log('boot.js: import '+url);
    m.mod = await import(url);
    slow.end();
  } catch(err){
    console.error('import('+module_id+') failed. required from '+mod_self,
      err);
    slow.end();
    throw m.wait.throw(err);
  }
  m.loaded = true;
  m.module.exports = m.mod.default || m.mod;
  return m.wait.return(m.module.exports);
}

// web worker importScripts()/require() implementation
let fetch_opt = url=>
  (url[0]=='/' ? {headers: {'Cache-Control': 'no-cache'}} : {});
let import_modules = {};
let import_module_script = async(url)=>{
  let mod;
  if (mod = import_modules[url])
    return await mod.wait;
  mod = import_modules[url] = {url, wait: ewait()};
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    mod.script = await response.text();
  } catch(err){
    console.error('import('+url+') failed', err);
    throw mod.wait.throw(err);
  }
  try {
    mod.exports = await eval.call(globalThis,
      `//# sourceURL=${url}\n;${mod.script}`);
    return mod.wait.return(mod.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw mod.wait.throw(err);
  }
};

// worker
async function worker_import(url, opt){
  let q;
  if (opt?.type=='script')
    q = {raw: 1};
  else
    assert(0, 'module import not yet supportedd');
  return await import_module_script(qs_append(url, q));
}

async function _import(mod_self, [url, opt]){
  let _url = lpm_2url(mod_self, url, opt);
  _url = url_expand(_url);
  let slow;
  try {
    slow = eslow(15000, '_import('+_url+')');
    D && console.log('boot.js: import '+_url);
    let ret;
    if (is_worker)
      ret = await worker_import(_url, opt);
    else
      ret = await import(_url, opt);
    slow.end();
    return ret;
  } catch(err){
    console.error('_import('+_url+' '+mod_self+')', err);
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
  console.log('lif boot version: '+lif_version+' util '+util.version);
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
      console.log('conn_kernel chan start');
      console.log('lif kernel sw version: '+
        (await kernel_chan.cmd('version')).version);
      console.log('conn_kernel chan end');
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

// http://localhost:3000/?lif-os@1.1.16/lif-basic/main.tsx
// http://localhost:3000/?webapp=lif-os@1.1.16/lif-basic/main.tsx
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
    pkg.webapp = 'lif-basic@1.1.14/main.tsx';
  if (v=q.get('src')){
    let u = lpm_uri_parse(npm_to_lpm(pkg.webapp));
    u.path = '';
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
    return await _import(webapp, [webapp]);
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
  miani: '',
  process,
  define,
  require,
  define_amd,
  require_amd,
  require_cjs,
  require_cjs_amd,
  require_single,
  version: lif_version,
  _import,
  util,
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
