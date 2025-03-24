// LIF bootloader: Boot the kernel and then load the application
let lif = globalThis.lif = {};
let lif_version = '0.2.125';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, path_file,
  TE_url_uri_parse, TE_url_uri_parse2, uri_enc, qs_enc,
  npm_uri_parse, TE_npm_uri_parse, npm_modver, _debugger} = util;

let modules = {};
let kernel_chan;
let npm_map = {};

let process = globalThis.process ||= {env: {}};
let is_worker = !window?.document;
let is_main = !!window?.document;

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
    q = {cjs: 1};
  return _url+qs_enc(q, '?');
};

async function require_single(mod_self, module_id){
  is_worker && await boot_worker();
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

async function _import(mod_self, [url, opt]){
  is_worker && await boot_worker();
  let _url = lpm_2url(mod_self, url);
  let slow;
  try {
    slow = eslow(15000, ['_import('+_url+')']);
    D && console.log('boot.js: import '+_url);
    let ret = await import(_url, opt);
    slow.end();
    return ret;
  } catch(err){
    console.error('_import('+_url+' '+mod_self+')', err);
    slow.end();
    throw err;
  }
}

async function boot_worker(){
  if (boot_worker.wait)
    return await boot_worker.wait;
  let wait = boot_worker.wait = ewait();
  console.log('lif boot_worker');
  kernel_chan = new util.postmessage_chan();
  kernel_chan.add_server_cmd('version', arg=>({version: lif_version}));
  let slow = eslow(1000, ['boot_worker']);
  globalThis.addEventListener("message", event=>{
    if (kernel_chan.listen(event)){
      slow.end();
      return wait.return();
    }
  });
  return await wait;
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
  } catch (err){
    console.error('ServiceWorker registration failed', err, err.stack);
    throw wait.throw(err);
  }
};

let boot_app = async({app, map})=>{
  await boot_kernel();
  console.log('boot: boot '+app);
  let _app = npm_uri_parse(app);
  if (npm_map = map)
    await kernel_chan.cmd('pkg_map', {map: map});
  try {
    return await _import(app, [app]);
  } catch (err){
    console.error('import('+app+') failed', err);
    throw err;
  }
  console.log('boot: boot complete');
};

if (is_worker){
  // TODO: add SharedWorker
  let _Worker = Worker;
  class lif_Worker extends Worker {
    constructor(url, ...arg){
      let worker = super(url, ...arg);
      console.log('Worker start', url);
      let worker_chan = new postmessage_chan();
      worker_chan.connect(worker);
      worker_chan.add_server_cmd('version', ()=>({version: lif_version}));
      worker_chan.add_server_cmd('module_dep',
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
  _import,
  version: lif_version,
  util,
};
if (is_worker)
  lif.boot.boot_worker = boot_worker;
if (is_main){
  lif.boot.boot_kernel = boot_kernel;
  lif.boot.boot_app = boot_app;
}
// globalThis.define = define;
// globalThis.require = require;

export default lif;
