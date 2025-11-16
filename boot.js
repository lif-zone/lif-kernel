// LIF bootloader: Boot the kernel and then load the application
let lif_version = '25.11.4';
let D = 0; // Debug

import util from './util.js';
let {ewait, esleep, eslow, postmessage_chan, assert_eq, str, ipc_sync,
  path_file, path_dir, _path_ext, OF, OA, assert, T, TU, T_npm_to_lpm, npm_str,
  T_npm_url_base, uri_enc, qs_enc, qs_append, url_uri_type,
  lpm_parse, npm_to_lpm, lpm_to_npm, lpm_ver_missing, npm_expand,
  json, json_cp,
  html_elm, _debugger} = util;

assert(!globalThis.$lif, 'lif already loaded');
let lif = globalThis.$lif = {};
let modules = {};
let kernel_chan;
let npm_root;

let process = globalThis.process ||= {
  env: {},
  browser: true,
  version: '25.1.0',
};
let is_worker = typeof window=='undefined';

async function fetch_text(url){
  let req = await fetch(url);
  if (req.status!=200){
    console.error('failed fetch: '+url);
    return;
  }
  let text = await req.text();
  return text;
}
let T_fetch_text = TU(fetch_text);

function fetch_sync_worker(url){
  const request = new XMLHttpRequest();
  request.open('GET', url, false);
  request.send(null);
  if (request.status!=200)
    return {status: request.status};
  return {status: 200, text: request.responseText};
}

let boot_worker_ipc_sync;
let boot_worker;
function fetch_sync_main(url, opt){
  assert(boot_worker_ipc_sync, 'no ipc_sync setup');
  let ipc = boot_worker_ipc_sync;
  try {
    ipc.write(json({url, opt}));
  } catch(err){
    console.error('fetch_sync_main('+url+') req err: '+err);
    return {status: 500};
  }
  let buf;
  try {
    buf = ipc.read('string');
  } catch(err){
    console.error('fetch_sync_main('+url+') resp err: '+err);
    return {status: 500};
  }
  let res = JSON.parse(buf);
  let text;
  if (!res.data)
    return {status: 500};
  try {
    text = ipc.read('string', url);
  } catch(err){
    console.error('fetch_sync_main('+url+') data err: '+err);
    return {status: 500};
  }
  return {status: 200, text};
}

function fetch_sync(url, opt){
  if (is_worker)
    return fetch_sync_worker(url, opt);
  return fetch_sync_main(url, opt);
}

async function boot_worker_sync_connect(){
  let res;
  let ipc = boot_worker_ipc_sync = new ipc_sync();
  let controller = navigator.serviceWorker.controller;
  boot_worker = new Worker(lif_kernel_base+'/boot_worker.js',
    {type: 'module'});
  boot_worker.addEventListener("message", event=>{
    console.log('main got message', event.data, event);
  });
  D && console.log('master worker started');
  boot_worker.postMessage({fetch_init: {sab: ipc.sab}});
}

const npm_2url_opt = (url, mod_self, opt)=>{
  let u = T_npm_url_base(url, mod_self);
  if (u.is.url)
    return (u.is.blob ? u.protocol : u.origin)+u.path;
  let q = {};
  if (opt?.raw)
    q.raw = 1;
  if (u.is.uri)
    return qs_append(u.path, q);
  // mod
  let _url = '/.lif/'+T_npm_to_lpm(u.path);
  if (opt?.worker)
    q.worker = 1;
  if (opt?.type=='module')
    q.mjs = 1;
  if (mod_self && url_uri_type(mod_self)=='mod')
    q.mod_self = mod_self;
  return qs_append(_url, q);
};

const npm_2url = (url, mod_self)=>{
  let u = T_npm_url_base(url, mod_self);
  if (u.is.url)
    return (u.is.blob ? u.protocol : u.origin)+u.path;
  if (u.is.uri)
    return u.path;
  return '/.lif/'+T_npm_to_lpm(u.path);
};

const npm_norm = (mod_self, url)=>{
  let u = T_npm_url_base(url, mod_self);
  let v;
  if (u.is.url)
    return (u.is.blob ? u.protocol : u.origin)+u.path;
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
  t('http://a.b/c', 'http:/x.y/z', 'http://x.y/z');
  t('http://a.b/c', 'https:/x.y/z', 'https://x.y/z');
  t('http://a.b/c', 'blob:http://x.y/z', 'blob:http://x.y/z');
  t('http://a.b/c', 'blob:https://x.y/z', 'blob:https://x.y/z');
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
  t('http://a.b/c', 'http:/x.y/z', 'http://x.y/z');
  t('http://a.b/c', 'https:/x.y/z', 'https://x.y/z');
  t('http://a.b/c', 'blob:http://x.y/z', 'blob:http://x.y/z');
  t('http://a.b/c', 'blob:https://x.y/z', 'blob:https://x.y/z');
  t('http://a.b/c', 'b/file.js', '/.lif/npm/b/file.js');
  t('http://a.b/c', './b/file.js', 'http://a.b/b/file.js');
  t('http://a.b/c/', './b/file.js', 'http://a.b/c/b/file.js');
  t('http://a.b/c/', '/b/file.js', '/b/file.js');
  t('http://a.b/c/d/', '../b/file.js', 'http://a.b/c/b/file.js');
  t('/a.b/c/', '/b/file.js', '/b/file.js');
  t('/a.b/c/', './b/file.js', '/a.b/c/b/file.js');
  t('/a.b/c/', '../b/file.js', '/a.b/b/file.js');
  t = (mod_self, url, opt, v)=>assert_eq(v, npm_2url_opt(url, mod_self, opt));
  t('mod@1.2.3', './a/file.js', {},
    '/.lif/npm/mod@1.2.3/a/file.js?mod_self=mod@1.2.3');
  t('/dir/dir2/file', './a/file.js', {},
    '/dir/dir2/a/file.js');
  t('.local/other.js', './a/file.js', {worker: 1},
    '/.lif/local/a/file.js?worker=1&mod_self=.local/other.js');
  t('.local/mod/', './a/file.js', {type: 'module'},
    '/.lif/local/mod//a/file.js?mjs=1&mod_self=.local/mod/');
  t('react@1.2.3', 'mod/file.js', {},
    '/.lif/npm/mod/file.js?mod_self=react@1.2.3');
  t('react@1.2.3', 'mod@4.5.6/file.js', {},
    '/.lif/npm/mod@4.5.6/file.js?mod_self=react@1.2.3');
  t('http://a.b/c', 'http:/x.y/z', {}, 'http://x.y/z');
  t('http://a.b/c', 'https:/x.y/z', {}, 'https://x.y/z');
  t('http://a.b/c', 'blob:http://x.y/z', {}, 'blob:http://x.y/z');
  t('http://a.b/c', 'blob:https://x.y/z', {}, 'blob:https://x.y/z');
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
    m = modules[id] = {id, imps, factory, loaded: false, parent: {},
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
  let opt = {meta: 1, follow: 1};
  if (p.mod_self)
    opt.mod_self = p.mod_self;
  let url = m.url+qs_enc(opt);
  let req;
  req = fetch_sync(url);
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
  let opt = {meta: 1, follow: 1};
  if (p.mod_self)
    opt.mod_self = p.mod_self;
  let url = m.url+qs_enc(opt);
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
  req = fetch_sync(url);
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
      require_cjs_load_sync({mod_self: m.id, imp: req.module});
  }
  m.load_requires = 1;
}

async function require_cjs_load_requires(m, loading){
  if (m.load_requires)
    return;
  for (let req of m.meta.requires||[]){
    if (req.type=='program'){
      let slow = eslow(15000, 'require_cjs_load_require('+m.id+' -> '
        +req.module+')');
      await require_cjs_load({mod_self: m.id, imp: req.module, loading});
      slow.end();
    }
  }
  m.load_requires = 1;
}
function require_cjs_run(m, p){
  if (m.run)
    return m.run;
  m.run = 'running';
  if (m.is_json){
    m.exports = m.file.json;
    return m.run = 'done';
  }
  m.require = function(imp){
    return require_cjs_sync(m.id, imp);
  };
  m.require.require_async = async function(imp){
    return await require_cjs_async(m.id, imp);
  };
  m.require.module = m; // debug
  let js = `//# sourceURL=${m.url}\n`;
  let script = m.script;
  if (script.startsWith('#!'))
    script = '//'+script;
  js += `'use strict';
    let module = globalThis.$lif.boot.require_cjs_get_mod(${json(m.id)});
    let exports = module.exports;
    let require = module.require;
    let __dirname = ${json(path_dir(m.id))};
    let __filename = ${json(path_file(m.id))};
    (function(){\n${script}\n})();`;
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

function require_cjs_load_sync({mod_self, imp, p}){
  imp = npm_norm(mod_self, imp);
  D && console.log('sync load', mod_self, imp);
  let m;
  if (!p){
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
  if (p.redirect)
    return p.redirect;
  if (m.run || m.load_requires || p.loading)
    return m;
  p.loading = 1;
  require_cjs_load_meta_sync(p);
  if (p.res!='done')
    return m;
  if (p.meta.redirect){
    p.redirect = require_cjs_load_sync({mod_self: null, imp: p.meta.redirect});
    return p.redirect;
  }
  if (mod_self){
    p.redirect = require_cjs_load_sync({mod_self: null, imp});
    return p.redirect;
  }
  m.meta = p.meta;
  require_cjs_load_file_sync(m);
  if (m.file.res!='done')
    return m;
  if (m.meta.type=='mjs'){
    console.error('cannot load mjs sync '+m.id);
    return m;
  }
  if (m.meta.type=='amd'){
    console.error('cannot load amd sync '+m.id);
    return m;
  }
  require_cjs_load_requires_sync(m);
  return m;
}

async function require_cjs_load({mod_self, imp, p, loading}){
  imp = npm_norm(mod_self, imp);
  let slow = eslow(15000, 'require_cjs_load('+imp+')');
  try {
  D && console.log('async load', mod_self, imp);
  let m;
  if (!p){
    if (!(m=modules[imp])){
      m = modules[imp] = {id: imp, url: npm_2url(imp), parent: {},
        is_json: imp.endsWith('.json'),
        exports: {}};
    }
    mod_self ||= '';
    if (!(p = m.parent[mod_self]))
      p = m.parent[mod_self] = {m, mod_self};
  } else {
    m = p.m;
    imp = m.id;
    mod_self = p.mod_self;
  }
  if (p.redirect)
    return p.redirect;
  if (m.run || m.load_requires)
    return m;
  loading = loading ? [...loading] : [];
  if (loading.includes(p))
    return m;
  loading.push(p);
  D && console.log('async load', mod_self, imp);
  await require_cjs_load_meta(p);
  if (p.res!='done')
    return m;
  if (p.meta.redirect){
    p.redirect = await require_cjs_load({mod_self: null, imp: p.meta.redirect, loading});
    return p.redirect;
  }
  if (mod_self){
    p.redirect = await require_cjs_load({mod_self: null, imp, loading});
    return p.redirect;
  }
  m.meta = p.meta;
  await require_cjs_load_file(m);
  if (m.file.res!='done')
    return m;
  if (m.meta.type=='mjs'){
    let e = await import(m.url+'?mjs=1');
    m.exports = e.default || e;
    m.run = 'done';
    return m;
  }
  if (m.meta.type=='amd'){
    let e = await import_amd(null, [m.url]);
    m.exports = e;
    m.run = 'done';
    return m;
  }
  await require_cjs_load_requires(m, loading);
  return m;
  } finally { slow.end(); }
}

function require_cjs_sync(mod_self, imp){
  imp = npm_norm(mod_self, imp);
  D && console.log('require_cjs_sync', imp);
  let p = modules[imp]?.parent[mod_self];
  let m;
  if (p)
    m = require_cjs_load_sync({p, mod_self, imp});
  else {
    console.log('dynamic sync require('+imp+') in '+mod_self);
    m = require_cjs_load_sync({mod_self, imp});
  }
  require_cjs_run(m);
  return m.exports;
}

async function require_cjs_async(mod_self, imp){
  imp = npm_norm(mod_self, imp);
  D && console.log('require_cjs_async', imp);
  let m = await require_cjs_load({mod_self, imp});
  require_cjs_run(m);
  return m.exports;
}

// web worker importScripts()/require() implementation
let enable_cache = 2; // 0 no-cache, 1 cache remote, 2 cache remote and local
function fetch_opt(url){
  let no_cache = url.startsWith('/') ? !enable_cache : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}}: {};
}
function define_amd_get_mod(imp){
  let m = modules[imp];
  assert(m, 'module not found: '+imp);
  return m;
}

async function import_amd(mod_self, [imp, opt]){
  D && console.log('import_amd', imp, mod_self);
  imp = npm_norm(mod_self, imp);
  let url = npm_2url(imp);
  let m;
  if (m = modules[imp])
    return await m.wait;
  m = modules[imp] = {id: imp, url, wait: ewait(), mod_self, parent: {},
    exports: {}, loaded: false};
  url += '?raw=1';
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
  // implementation of AMD define()
  m.define = async function(id, imps, factory){
    return await define_amd(imp, arguments, m);
  };
  m.define.amd = {};
  m.define.module = m; // debug
  js += `let define = globalThis.$lif.boot.define_amd_get_mod(${json(imp)}).define;`;
  js += `(function(){\n${m.script}\n}());`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw m.wait.throw(err);
  }
  await m.wait;
  assert(m.loaded, 'module not loaded: '+imp);
  return m.wait.return(m.exports);
}

// worker
let import_module_script = async({mod_self, imp, url})=>{
  let m;
  if (m = modules[imp]){
    assert(m.url==url, 'different url for '+imp+': '+m.url+' -> '+url);
    return await m.wait;
  }
  m = modules[imp] = {id: imp, url, wait: ewait(), mod_self, parent: {},
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
  let js = `//# sourceURL=${url}\n(function(){\n${m.script}\n}());`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw m.wait.throw(err);
  }
  await m.wait;
  m.loaded = true;
  return m.wait.return(m.exports);
};

function exports_to_esm(exports){
   return {...exports, default: exports};
}

async function import_worker({mod_self, imp, opt}){
  let url = npm_2url(imp, mod_self);
  let q;
  if (opt?.type=='script')
    q = {raw: 1};
  else
    assert(0, 'module import not yet supportedd');
  url = qs_append(url, q);
  imp = npm_2url(imp, mod_self);
  let exports =  await import_module_script({mod_self, imp, url,
    opt: {worker: 1}});
  return exports_to_esm(exports);
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
      ret = await import_worker({mod_self, imp, opt});
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
  let res = fetch_sync(url);
  if (res.status!=200)
    throw Error('failed fetch '+url);
  let script = res.text;
  let exports = eval.call(globalThis,
    `//# sourceURL=${url}\n${script}`);
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

let lif_kernel_base = import.meta.resolve('./x').slice(0, -2);
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
      let res = await boot_worker_sync_connect();
      D && console.log('conn_kernel chan end');
      slow.end();
      wait.return();
    };
    let slow = eslow('sw register');
    const registration = await navigator.serviceWorker.register(
      '/.lif.kernel_sw.js'+qs_enc({lif_kernel_base}));
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

async function run_html(mod_self, webapp){
  let _webapp = npm_norm(webapp, mod_self);
  console.log('run_html start '+_webapp);
  let url = '/.lif/'+npm_to_lpm(_webapp);
  let html = await T_fetch_text(url);
  let parser = new DOMParser();
  let doc = parser.parseFromString(html, 'text/html');
  document.head.innerHTML = doc.head.innerHTML;
  document.body.innerHTML = doc.body.innerHTML;
  function script_execute(e){
    let script = e.querySelectorAll('script');
    for (let i=0; script[i]; i++){
      // required to bring <script> to life
      let f = document.createRange().createContextualFragment(
        script[i].outerHTML);
      // TODO need to modify type=module scripts:
      // src=mod --> src=/.lif/../mod?mjs=1
      // inline scripts: need to parse their ast contents and update imports
      e.appendChild(f);
      script[i].parentNode.removeChild(script[i]);
    }
  }
  script_execute(document.head);
  script_execute(document.body);
  console.log('run_html complete');
}

let boot_app = async(boot_pkg)=>{
  // init kernel
  await boot_kernel();
  // reload page for cross-origin-isolation
  if (coi_enable)
    await coi_reload();
  if (!boot_pkg)
    return;
  let pkg = json_cp(boot_pkg);
  let webapp = pkg.lif?.webapp||pkg.webapp;
  if (webapp)
    webapp = npm_expand(webapp);
  console.log('boot: webapp '+webapp);
  npm_root = webapp;
  let slow = eslow('app_pkg');
  let res = await kernel_chan.cmd('app_pkg', pkg);
  slow.end();
  if (!webapp)
    return;
  let mod_self = webapp;
  if (res.webapp && res.webapp!=webapp){
    console.log('resolved: '+webapp+' -> '+res.webapp);
    webapp = res.webapp;
  }
  // load app
  let ext = _path_ext(webapp);
  let ret;
  try {
    if (ext=='html')
      ret = await run_html(mod_self, webapp);
    else if (str.is(ext, 'js', 'jsx', 'ts', 'tsx'))
      ret = await import_esm(null, [webapp]);
    else
      throw Error('no app type found: '+webapp);
  } catch(err){
    console.error('boot: app('+webapp+') failed: '+err);
    throw err;
  }
  console.log('boot: boot complete');
  return ret;
};

if (!is_worker){
  let get_url = (url, opt)=>{
    url = url.href || url;
    let _url = npm_2url_opt(url, npm_root, {worker: 1, type: opt?.type});
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
  miani: 'anki yhvh alohyk:la yhyh lk alohim aHrim el pny:la tsa at Sm yhvh alohk lSva:zkor at yom hSbt lqdSo:Kbd at avik vat amk:lo trXH:lo tnaf:lo tgnv:lo tenh brek ed Sqr:lo tHmd byt rek:',
  lif,
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
