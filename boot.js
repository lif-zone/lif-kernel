// LIF bootloader: Boot the kernel and then load the application
let lif = globalThis.lif = {};
let lif_version = '1.3.0';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, assert_eq, str, ipc_sync,
  path_file, path_dir, OF, OA, assert, T, T_npm_to_lpm, npm_str,
  T_npm_url_base, uri_enc, qs_enc, qs_append,
  lpm_parse, npm_to_lpm, lpm_to_npm, lpm_ver_missing,
  _debugger} = util;
let json = JSON.stringify;

let modules = {};
let kernel_chan;
let npm_root;
let npm_map = {};

let process = globalThis.process ||= {env: {}};
let is_worker = typeof window=='undefined';

function fetch_sync(url){
  console.log('fetch_sync not supported: '+url);
  return {status: 404};
  let req = new XMLHttpRequest();
  let v = {};
  req.open('GET', url, false); // `false` makes the request synchronous
  req.setRequestHeader('Cache-Control', 'no-cache');
  req.send(); // blocking until request is sent
  v.status = req.status;
  v.text = req.responseText; // blocking until response data received
  return v;
}

function sync_worker_fetch(url){
  const request = new XMLHttpRequest();
  request.open('GET', url, false);
  request.send(null);
  if (request.status!=200)
    return {status: request.status};
  return {status: 200, text: request.responseText};
}

let kernel_ipc_sync;
let boot_worker;
function kernel_fetch_sync(url, opt){
  let ipc = kernel_ipc_sync;
  ipc.write(json({url, opt}));
  let buf = ipc.read('string');
  let res = JSON.parse(buf);
  if (!res.data)
    return {status: 500};
  let text = ipc.read('string');
  return {status: 200, text};
}

async function kernel_sync_connect(){
  let res;
  let ipc = kernel_ipc_sync = new ipc_sync();
  let controller = navigator.serviceWorker.controller;
  boot_worker = new Worker(lif_kernel_base+'/boot_worker.js',
    {type: 'module'});
  boot_worker.addEventListener("message", event=>{
    console.log('main got message', event.data, event);
  });
  console.log('master worker started');
  boot_worker.postMessage({fetch_init: {sab: ipc.sab}});
}
// junk example of Worker from Blob. Possible also to do dynamic import().
const senderWorker = 0 && new Worker(URL.createObjectURL(new Blob([`
  self.onmessage = ({ data: { sharedArray } }) => {
    const arr = new Int32Array(sharedArray);
    let message = 42; // Example message to send
    // Write message data
    Atomics.store(arr, 1, message);
    // Set flag atomically
    Atomics.store(arr, 0, 1);
    // Notify the receiver (wake up to 1 waiter)
    Atomics.notify(arr, 0, 1);
    console.log('Sender: Message sent');
  };
`], { type: 'application/javascript' })));

const npm_2url_opt = (url, mod_self, opt)=>{
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

const npm_2url = (url, mod_self)=>{
  let u = T_npm_url_base(url, mod_self);
  if (u.is.url)
    return u.origin+u.path;
  if (u.is.uri)
    return u.path;
  return '/.lif/'+T_npm_to_lpm(u.path);
};

const npm_norm = (mod_self, url)=>{
  let u = T_npm_url_base(url, mod_self);
  let v;
  if (u.is.url)
    return u.origin+u.path;
  if (u.is.uri){
    if (v=str.starts(u.path, '/.lif/'))
      return lpm_to_npm(v.rest);
    return u.path;
  }
  return u.path;
};

function test(){
  let t;
  t = (mod_self, url, v)=>assert_eq(v, npm_norm(mod_self, url));
  t('mod@1.2.3', './a/file.js', 'mod@1.2.3/a/file.js');
  t('.local/other.js', './a/file.js', '.local/a/file.js');
  t('.local/mod/', './a/file.js', '.local/mod//a/file.js');
  t('react@1.2.3', 'mod/file.js', 'mod/file.js');
  t('react@1.2.3', 'mod@4.5.6/file.js', 'mod@4.5.6/file.js');
  t('http://a.b/c', 'b/file.js', 'b/file.js');
  t('http://a.b/c', './b/file.js', 'http://a.b/b/file.js');
  t('http://a.b/c/', './b/file.js', 'http://a.b/c/b/file.js');
  t('http://a.b/c/', '/b/file.js', '/b/file.js');
  t('http://a.b/c/d/', '../b/file.js', 'http://a.b/c/b/file.js');
  t('/a.b/c/', '/b/file.js', '/b/file.js');
  t('/a.b/c/', './b/file.js', '/a.b/c/b/file.js');
  t('/a.b/c/', '../b/file.js', '/a.b/b/file.js');
  t(null, '/.lif/npm/mod', 'mod');
  t(null, '/.lif/local/mod/a', '.local/mod/a');
  t = (mod_self, url, v)=>assert_eq(v, npm_2url(url, mod_self));
  t('mod@1.2.3', './a/file.js', '/.lif/npm/mod@1.2.3/a/file.js');
  t('.local/other.js', './a/file.js', '/.lif/local/a/file.js');
  t('.local/mod/', './a/file.js', '/.lif/local/mod//a/file.js');
  t('react@1.2.3', 'mod/file.js', '/.lif/npm/mod/file.js');
  t('react@1.2.3', 'mod@4.5.6/file.js', '/.lif/npm/mod@4.5.6/file.js');
  t('http://a.b/c', 'b/file.js', '/.lif/npm/b/file.js');
  t('http://a.b/c', './b/file.js', 'http://a.b/b/file.js');
  t('http://a.b/c/', './b/file.js', 'http://a.b/c/b/file.js');
  t('http://a.b/c/', '/b/file.js', '/b/file.js');
  t('http://a.b/c/d/', '../b/file.js', 'http://a.b/c/b/file.js');
  t('/a.b/c/', '/b/file.js', '/b/file.js');
  t('/a.b/c/', './b/file.js', '/a.b/c/b/file.js');
  t('/a.b/c/', '../b/file.js', '/a.b/b/file.js');
  t = (mod_self, url, opt, v)=>assert_eq(v, npm_2url_opt(url, mod_self, opt));
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
  let id = mod_id;
  if (!m){
    if (modules[id])
      throw Error('define('+id+') already defined');
    m = modules[id] = {id, imps, factory, loaded: false,
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
      // TODO merge cjs and amd modules shared table, and assert on mixes
      v = await require_cjs_load({run: 1, mod_self: m.id, imp});
    }
    _imps[i] = v;
  }
  return _imps;
}

function require_cjs_get_mod(url){
  let m;
  assert(m = modules[url], 'module '+url+' not loaded');
  return m;
}
function require_cjs_load_meta_sync(p){
  let m = p.m;
  function do_ret(res){ return p.res = res; }
  if (p.res=='done' || p.res=='err')
    return p.res;
  p.res = 'loading';
  if (!m.url.startsWith('/.lif/'))
    return do_ret('done');
  let url = m.url+qs_enc({meta: 1, follow: 1, mod_self: p.mod_self});
  let req;
  req = kernel_fetch_sync(url);
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  p.text = req.text;
  try {
    p.meta = JSON.parse(p.text);
  } catch(err){
    return do_ret('err');
  }
  return do_ret('done');
}
async function require_cjs_load_meta(p){
  let m = p.m;
  function do_ret(res){
    p.res = res;
    if (p.wait)
      p.wait.return(res);
    return p.res;
  }
  if (p.res=='done' || p.res=='err')
    return p.res;
  p.res = 'loading';
  if (!m.url.startsWith('/.lif/'))
    return do_ret('done');
  let url = m.url+qs_enc({meta: 1, follow: 1, mod_self: p.mod_self});
  let req;
  if (p.wait)
    return await p.wait;
  p.wait = ewait();
  req = await fetch(url);
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  p.text = await req.text();
  try {
    p.meta = JSON.parse(p.text);
  } catch(err){
    assert(0, 'invalid json meta '+url);
    return do_ret('err');
  }
  return do_ret('done');
}
async function require_cjs_load_file_sync(m){
  let p = m.file ||= {};
  function do_ret(res){ return p.res = res; }
  if (p.res=='done' || p.res=='err')
    return p.res;
  p.res = 'loading';
  let url = m.url;
  if (m.url.startsWith('/.lif/'))
    url += '?raw=1';
  let req;
  req = kernel_fetch_sync(url);
  if (req.status==200)
    m.script = p.text = req.text;
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  try {
    if (m.is_json)
      m.json = p.json = JSON.parse(p.text);
  } catch(err){
    console.error('invalid json module: '+url);
    return do_ret('err');
  }
  return do_ret('done');
}

async function require_cjs_load_file(m){
  let p = m.file ||= {};
  function do_ret(res){
    return p.wait.return(p.res = res);
  }
  if (p.res=='done' || p.res=='err')
    return p.res;
  p.res = 'loading';
  let url = m.url;
  if (m.url.startsWith('/.lif/'))
    url += '?raw=1';
  let req;
  if (p.wait)
    return await p.wait;
  p.wait = ewait();
  req = await fetch(url);
  if (req.status==200)
    m.script = p.text = await req.text();
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  try {
    if (m.is_json)
      m.json = p.json = JSON.parse(p.text);
  } catch(err){
    return do_ret('err');
  }
  return do_ret('done');
}

function require_cjs_load_requires_sync(m){
  if (m.load_requires)
    return;
  for (let req of m.meta.requires||[]){
    if (req.type=='program')
      require_cjs_load_sync({run: false, mod_self: m.id, imp: req.module});
  }
  m.load_requires = 1;
}

async function require_cjs_load_requires(m){
  if (m.load_requires)
    return;
  for (let req of m.meta.requires||[]){
    if (req.type=='program')
      await require_cjs_load({run: false, mod_self: m.id, imp: req.module});
  }
  m.load_requires = 1;
}
function require_cjs_run(m, p){
  if (m.run)
    return m.run;
  if (m.is_json){
    m.exports = m.file.json;
    return m.run = 'done';
  }
  m.require = function(imp){
    imp = npm_norm(m.id, imp);
    let _p = modules[imp]?.parent[m.id];
    let exports;
    if (_p)
      exports = require_cjs_load_sync({run: 1, p: _p, mod_self: m.id, imp});
    else {
      console.warn('dynamic require('+imp+') in '+m.id);
      exports = require_cjs_load_sync({run: 1, mod_self: m.id, imp});
    }
    return exports;
  };
  m.require.require_async = async function(imp){
    return await require_cjs_load({run: 1, mod_self: m.id, imp});
  };
  m.require.module = m; // debug
  let js = `//# sourceURL=${m.url}\n`;
  js += `'use strict';
    let module = globalThis.lif.boot.require_cjs_get_mod(${json(m.id)});
    let exports = module.exports;
    let require = module.require;
    (function(){
    ${m.script}
    })();
    `;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    m.run = 'err';
    console.error('require('+m.id+') failed eval', err);
    return m.run;
  }
  m.loaded = true;
  return m.run = 'done';
}

function require_cjs_load_sync({run, mod_self, imp, p}){
  D && console.log('sync', run ? 'run' : 'load', mod_self, imp);
  let m;
  if (!p){
    imp = npm_norm(mod_self, imp);
    if (!(m=modules[imp])){
      m = modules[imp] = {id: imp, url: npm_2url(imp), parent: {},
        is_json: imp.endsWith('.json'),
        exports: {}};
    }
    mod_self ||= '';
    if (!(p=m.parent[mod_self]))
      p = m.parent[mod_self] = {m, mod_self};
  } else {
    m = p.m;
    imp = m.id;
    mod_self = p.mod_self;
  }
  if (m.run)
    return m.exports;
  require_cjs_load_meta_sync(p);
  if (p.res!='done')
    return;
  if (p.meta.redirect)
    return require_cjs_load_sync({run, mod_self: null, imp: p.meta.redirect});
  if (mod_self)
    return require_cjs_load_sync({run, mod_self: null, imp});
  m.meta = p.meta;
  require_cjs_load_file_sync(m);
  if (m.file.res!='done')
    return;
  if (m.meta.type=='mjs'){
    console.error('cannot load mjs sync '+m.id);
    return;
  }
  if (m.meta.type=='amd'){
    console.error('cannot load amd sync '+m.id);
    return;
  }
  require_cjs_load_requires_sync(m);
  if (run)
    require_cjs_run(m);
  return m.exports;
}

async function require_cjs_load({run, mod_self, imp, p}){
  let slow = eslow(15000, 'require_cjs('+imp+')');
  try {
  D && console.log('async', run ? 'run' : 'load', mod_self, imp);
  let m;
  if (!p){
    imp = npm_norm(mod_self, imp);
    if (!(m=modules[imp])){
      m = modules[imp] = {id: imp, url: npm_2url(imp), parent: {},
        is_json: imp.endsWith('.json'),
        exports: {}};
    }
    mod_self ||= '';
    if (!(p=m.parent[mod_self]))
      p = m.parent[mod_self] = {m, mod_self};
  } else {
    m = p.m;
    imp = m.id;
    mod_self = p.mod_self;
  }
  if (m.run)
    return m.exports;
  await require_cjs_load_meta(p);
  if (p.res!='done')
    return;
  if (p.meta.redirect)
    return await require_cjs_load({run, mod_self: null, imp: p.meta.redirect});
  if (mod_self)
    return await require_cjs_load({run, mod_self: null, imp});
  m.meta = p.meta;
  await require_cjs_load_file(m);
  if (m.file.res!='done')
    return;
  if (m.meta.type=='mjs'){
    let e = await import(m.url+'?mjs=1');
    m.exports = e.default || e;
    m.run = 'done';
    return m.exports;
  }
  if (m.meta.type=='amd'){
    let e = await import(m.url+'?amd=2');
    m.exports = e.default || e;
    m.run = 'done';
    return m.exports;
  }
  await require_cjs_load_requires(m);
  if (run)
    require_cjs_run(m);
  return m.exports;
  } finally {
    slow.end();
  }
}

async function require_cjs_async(mod_self, imp){
  return await require_cjs_load({run: 1, mod_self, imp});
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
    m.define.module = m; // debug
    js += `let define = lif.boot.define_amd_get_mod(${json(imp)}).define;`;
  }
  js += `(function(){ ${m.script} }());`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw m.wait.throw(err);
  }
  await m.wait;
  if (opt.amd)
    assert(m.loaded, 'module not loaded: '+imp);
  else
    m.loaded = true;
  return m.wait.return(m.exports);
};

function define_amd_get_mod(imp){
  let m = modules[imp];
  assert(m, 'module not found: '+imp);
  return m;
}

async function import_amd(mod_self, [imp, opt]){
  1 && console.log('import_amd', imp, mod_self);
  imp = npm_norm(mod_self, imp);
  let url = qs_append(npm_2url(imp), {raw: 1});
  return await import_module_script({mod_self, imp, url: url,
    opt: {amd: 1}});
}

// worker
async function worker_import({mod_self, imp, opt}){
  let url = npm_2url(imp, mod_self);
  let q;
  if (opt?.type=='script')
    q = {raw: 1};
  else
    assert(0, 'module import not yet supportedd');
  url = qs_append(url, q);
  imp = npm_2url(imp, mod_self);
  return await import_module_script({mod_self, imp, url, opt: {worker: 1}});
}

async function import_esm(mod_self, [imp, opt]){
  let url = npm_2url_opt(imp, mod_self, opt);
  url = url_expand(url);
  let slow;
  try {
    slow = eslow(15000, 'import_esm('+url+')');
    D && console.log('boot.js: import '+url);
    let ret;
    if (is_worker)
      ret = await worker_import({mod_self, imp, opt});
    else
      ret = await /*keep*/ import(url, opt);
    return ret;
  } catch(err){
    console.error('import_esm('+url+' '+mod_self+')', err);
    throw err;
  } finally {
    slow.end();
  }
}
// worker
function importScripts_single(mod_self, [mod, opt]){
  let url = npm_2url_opt(mod, mod_self, opt?.type=='script' ? {raw: 1} : {});
  let res = sync_worker_fetch(url);
  if (res.status!=200)
    throw Error('failed fetch '+url);
  let script = res.text;
  let exports = eval.call(globalThis,
    `//# sourceURL=${url}\n;(function(){ ${script} }())`);
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
      let res = await kernel_sync_connect();
      D && console.log('conn_kernel chan end');
      slow.end();
      wait.return();
    };
    let slow = eslow('sw register');
    const registration = await navigator.serviceWorker.register(
      '/lif_kernel_sw.js'+qs_enc({lif_kernel_base}));
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
    // TOOD use globalThis.location instead of npm_root for relative URLs base
    _url = npm_2url_opt(_url, npm_root, {worker: 1, type: opt?.type});
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
  require_cjs_get_mod,
  require_cjs_async,
  import_esm,
  import_amd,
  define_amd_get_mod,
  util, // debug
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
