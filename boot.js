// LIF bootloader: Boot the kernel and then load the application
let lif = globalThis.lif = {};
let lif_version = '0.2.125';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, ipc_sync,
  path_file, OF, OA, assert,
  TE_url_uri_parse, TE_url_uri_parse2, uri_enc, qs_enc, qs_append,
  npm_uri_parse, TE_npm_uri_parse, npm_modver, _debugger} = util;
let json = JSON.stringify;

let modules = {};
let kernel_chan;
let mod_root;
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
  if (u.is.url || u.is.uri)
    return url;
  let _url = '/.lif/npm/'+u.path;
  let q = {};
  if (!u.mod.version && !npm_map?.[u.mod.name])
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
  return _url+qs_enc(q, '?');
  //return qs_append(_url, q);
};

async function require_single(mod_self, module_id){
  let m;
  if (m = modules[module_id])
    return await m.wait;
  m = modules[module_id] = {module_id, deps: [], wait: ewait(),
    loaded: false, module: {exports: {}}};
  let slow;
  slow = eslow(1000, ['require_single modver('+module_id+')']);
  let url = lpm_2url(mod_self, module_id, {cjs: 1});
  slow.end();
  try {
    slow = eslow(15000, ['require_single import('+module_id+')', url]);
    D && console.log('boot.js: import '+url);
    m.mod = await import(url);
    slow.end();
  } catch(err){
    console.error('import('+module_id+') failed. required from '+mod_self, err);
    slow.end();
    throw m.wait.throw(err);
  }
  m.loaded = true;
  m.module.exports = m.mod.default || m.mod;
  return m.wait.return(m.module.exports);
}

// web worker importScripts()/require() implementation
let fetch_opt = url=>(url[0]=='/' ? {headers: {'Cache-Control': 'no-cache'}} : {});
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
  let _url = lpm_2url(mod_self, url);
  let slow;
  try {
    slow = eslow(15000, ['_import('+_url+')']);
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
  let ipc = new ipc_sync();
  globalThis.postMessage({fetch: {url, sab: ipc.sab}});
  let buf = ipc.read('string');
  let res = JSON.parse(buf);
  if (!res.data)
    return;
  return ipc.read('string');
}

async function main_on_fetch(event){
  let ipc = new ipc_sync(event.data.fetch.sab);
  let url = event.data.fetch.url;
  let response = await fetch(url, fetch_opt(url));
  let res = {status: response.status};
  if (response.status!=200){
    console.log('main_on_fetch('+url+') failed fetch');
    await ipc.write(json({status: response.status}));
    return;
  }
  let blob = await response.blob();
  let data = await blob.arrayBuffer();
  res.length = blob.length;
  res.ctype = blob.type;
  res.data = 1;
  await ipc.Ewrite(json(res));
  await ipc.Ewrite(data);
}

// worker
function importScripts_single(mod_self, [mod, opt]){
  let url = lpm_2url(mod_self, mod);
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
async function init_worker(){
  if (init_worker.wait)
    return await init_worker.wait;
  let wait = init_worker.wait = ewait();
  console.log('lif init_worker '+globalThis.location+' '+(globalThis.name||''));
  let chan = new util.postmessage_chan();
  chan.add_server_cmd('version', arg=>({version: lif_version}));
  let slow = eslow(1000, ['init_worker']);
  let _wait = ewait();
  globalThis.addEventListener("message", event=>{
    if (chan.listen(event))
      return _wait.return();
  });
  await _wait;
  slow.end();
  globalThis.importScripts = globalThis.orig_importScripts;
  globalThis.importScripts = new_importScripts;
  return wait.return();
}

let boot_kernel = async()=>{
  if (boot_kernel.wait)
    return await boot_kernel.wait;
  let wait = boot_kernel.wait = ewait();
  try {
    const registration = await navigator.serviceWorker.register('/lif_kernel_sw.js');
    await navigator.serviceWorker.ready;
    const conn_kernel = async()=>{
      kernel_chan = new postmessage_chan();
      kernel_chan.connect(navigator.serviceWorker.controller);
      kernel_chan.add_server_cmd('version', arg=>({version: lif_version}));
      console.log('lif boot version: '+lif_version+' util '+util.version);
      console.log('lif kernel sw version: '+(await kernel_chan.cmd('version')).version);
      wait.return();
    };
    // this boots the React app if the SW has been installed before or
    // immediately after registration
    // https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle#clientsclaim
    if (navigator.serviceWorker.controller)
      await conn_kernel();
    else
      navigator.serviceWorker.addEventListener('controllerchange', conn_kernel);
    return await wait;
  } catch(err){
    console.error('ServiceWorker registration failed', err, err.stack);
    throw wait.throw(err);
  }
};

let do_pkg_map = function({map}){
  npm_map = {...map};
  let i = 0;
  for (let [name, mod] of OF(map)){
    if (!i++)
      mod_root = name;
    if (typeof mod=='string')
      npm_map[name] = mod = mod.endsWith('/') ? {net: mod} : {base: mod};
    if (!mod.base && mod.net)
      mod.base = mod.net+name;
  }
};

// https://github.com/gzuidhof/coi-serviceworker
// Cross-Origin-Isolation is required for SharedArrayBuffer feature
// also, in browser, you need to activate
// the required COI headers to enable SAB is added by service worker:
// 'cross-origin-embedder-policy': 'require-corp'
// 'cross-origin-opener-policy': 'same-origin'
let coi_reload = async()=>{
  return; // XXX remove
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
let boot_app = async({app, map})=>{
  // init kernel
  await boot_kernel();
  console.log('boot: boot '+app);
  let _app = npm_uri_parse(app);
  if (npm_map = {...map}){
    do_pkg_map({map});
    await kernel_chan.cmd('pkg_map', {map: map});
  }
  // reload page for cross-origin-isolation
  await coi_reload();
  // load app
  try {
    return await _import(app, [app]);
  } catch(err){
    console.error('import('+app+') failed', err);
    throw err;
  }
  console.log('boot: boot complete');
};

if (!is_worker){
  // TODO: add SharedWorker
  let _Worker = Worker;
  class lif_Worker extends Worker {
    constructor(url, opt){
      let _url = url.href || url, es5 = opt?.type!='module';
      _url = lpm_2url(mod_root, _url, {worker: 1, type: opt?.type});
      let worker = super(_url, ...[...arguments].slice(1));
      worker.addEventListener("message", event=>{
        if (event.data?.fetch)
          return main_on_fetch(event);
      });
      console.log('Worker start', url);
      let worker_chan = new postmessage_chan();
      worker_chan.connect(worker);
      worker_chan.add_server_cmd('version', ()=>({version: lif_version}));
      worker_chan.add_server_cmd('module_dep',
        async({arg})=>await kernel_chan.cmd('module_dep', arg));
      worker_chan.add_server_cmd('fetch',
        async({arg})=>await kernel_chan.cmd('module_dep', arg));
    }
  }
  globalThis.Worker = lif_Worker;
}

lif.boot = {
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
  await init_worker();
}
if (!is_worker)
  OA(lif.boot, {boot_kernel, boot_app});
// globalThis.define = define;
// globalThis.require = require;

export default lif;
