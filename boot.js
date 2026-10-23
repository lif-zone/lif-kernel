// LIF bootloader: Boot the kernel and then load the application
let lif_version = '2026.9.30';
let D = globalThis.localStorage?.getItem('lif_boot_D'); // Debug
let in_test;

import {ewait, esleep, eslow, assert_eq, str,
  Buffer, path_file, path_dir, _path_ext, OE, OA, assert, Tf, TUf,
  uri_enc, qs_enc, qs_append, qs_trim, qs_split, json, json_cp, str_to_buf,
  html_elm, version as util_version, T_url_parse,
} from './util.js';
import {
  T_npm_to_lpm, T_npm_url_base, url_uri_type, T_lpm_lmod, T_lpm_to_npm,
  T_lpm_parse, lpm_ver_from_base, T_npm_parse,
  npm_to_lpm, lpm_to_npm, npm_norm, lpm_is_perm, __uri_parse,
} from './lpm.js';
import {ipc_sync} from './ipc.js';
import {ipc_postmessage} from './rpc.js';

let lif = globalThis.$lif ||= {};
assert(!lif.lif_loaded, 'lif already loaded');
lif.lif_loaded = true;
lif.assert = assert;
lif.Buffer = Buffer;
let sha256 = (await import('./sha256.js')).default;
let mod_t = {};
let kernel_chan;
let npm_root;

let process = globalThis.process ||= {
  env: {},
  browser: true,
  version: lif_version,
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
let T_fetch_text = TUf(fetch_text);

function fetch_sync_worker(url){
  const request = new XMLHttpRequest();
  request.open('GET', url, false);
  request.send(null);
  if (request.status!=200)
    return {status: request.status};
  return {status: 200, text: request.responseText};
}

let boot_worker_ipc_sync = {read: null, write: null};
let boot_worker;
let boot_worker_fail;
function fetch_sync_main(url, opt){
  let ipc = boot_worker_ipc_sync;
  assert(ipc.read, 'no ipc_sync setup');
  assert(ipc.write, 'no ipc_sync setup');
  if (boot_worker_fail){
    console.error('fetch_sync ipc in fail state');
    return {status: 500};
  }
  let header, body, state;
  try {
    state = 'write';
    ipc.write.write(json({url, opt}));
    state = 'read headers';
    header = ipc.read.read('string');
    state = 'read body';
    body = ipc.read.read('string', url);
  } catch(err){
    boot_worker_fail = state;
    console.error('fetch_sync_main('+url+') req err: '+err);
    return {status: 500};
  }
  let res;
  try {
    res = JSON.parse(header);
  } catch(err){
    boot_worker_fail = 'json';
    console.error('ipc bad json');
    return {status: 500};
  }
  if (!res.body)
    return {status: 500};
  return {status: 200, text: body};
}

function fetch_sync(url, opt){
  if (is_worker)
    return fetch_sync_worker(url, opt);
  return fetch_sync_main(url, opt);
}

async function boot_worker_sync_connect(){
  let res;
  let ipc = boot_worker_ipc_sync;
  ipc.read = new ipc_sync();
  ipc.write = new ipc_sync();
  let controller = navigator.serviceWorker.controller;
  boot_worker = new Worker(lif_kernel_base+'/boot_worker.js',
    {type: 'module'});
  let wait = ewait();
  boot_worker.addEventListener("message", event=>{
    if (event.data.fetch_inited)
      return wait.return();
    console.error('boot_worker unknown message', event.data, event);
  });
  D && console.log('master worker started');
  // read and write are reveresed
  boot_worker.postMessage({fetch_init:
    {sab: {write: ipc.read.sab, read: ipc.write.sab}}});
  let slow = eslow(1000, 'boot_worker connect');
  await wait;
  slow.end();
}

function url_self_clean(url){
  if (!url)
    return url;
  url = qs_trim(url);
  if (url[0]=='/')
    return url;
  let u = T_url_parse(url);
  if (u.origin!=location.origin)
    throw Error('invalid uri - expected / local: '+url);
  return u.path;
}

function npm_imp_uri(uri_self, imp){
  if (uri_self)
    uri_self = url_self_clean(uri_self);
  let t = url_uri_type(imp);
  if (t=='url'){
    let u = T_url_parse(imp);
    if (u.origin==location.origin)
      return u.path;
    return imp;
  }
  if (t=='uri')
    return imp;
  if (t=='rel'){
    if (!uri_self)
      throw Error('npm_imp_uri('+imp+') rel without base');
    let u = __uri_parse(imp, uri_self);
    return u.path;
  }
  assert(t=='mod');
  if (uri_self){
    let lmod_self = str.starts(uri_self, '/.lif/').rest;
    let u_self = T_lpm_parse(lmod_self);
    let u = T_npm_parse(imp);
    if (u.lmod==u_self.lmod)
      return '/.lif/'+T_npm_to_lpm(imp);
    let with_ver = lpm_ver_from_base(u, u_self);
    if (with_ver)
      return '/.lif/'+with_ver;
    return '/.lif/'+u_self.lmod+'/.lif.imp/'+imp;
  }
  return '/.lif/'+T_npm_to_lpm(imp);
}

function npm_imp_q(opt){
  let q = {};
  if (opt?.worker)
    q.worker = '';
  if (opt?.type=='module')
    q.imp = '';
  return q;
}

function npm_imp_uri_qs(uri_self, imp, opt){
  let {url: _imp, qs} = qs_split(imp);
  let uri = npm_imp_uri(uri_self, _imp);
  let q = Object.fromEntries((new URLSearchParams(qs)).entries());
  OA(q, npm_imp_q(opt));
  return uri+qs_enc(q);;
}

function npm_to_uri(url){
  let u = T_npm_url_base(url);
  if (u.is.url)
    return u.is.blob || u.is.data ? url : u.origin+u.path;
  if (u.is.uri)
    return u.path;
  return '/.lif/'+T_npm_to_lpm(u.path);
}

function require_cjs_get_mod(url){
  let m;
  assert(m = mod_t[url], 'module '+url+' not loaded');
  return m;
}

function require_cjs_load_meta_sync(m){
  let _m = m._meta;
  function do_ret(res){ return _m.res = res; }
  if (_m.res=='done' || _m.res=='err')
    return _m.res;
  _m.res = 'loading';
  let v;
  if (!(v=str.starts(m.url, '/.lif/')))
    return do_ret('done');
  let lmod = v.rest;
  let qs = {meta: '', follow: ''};
  let url = m.url+qs_enc(qs);
  let req;
  req = fetch_sync(url);
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  let text = req.text;
  try {
    m.meta = JSON.parse(text);
  } catch(err){
    return do_ret('err');
  }
  return do_ret('done');
}

let db;
async function e_db_req(req){
  if (!req)
    return req;
  let wait = ewait();
  req.onsuccess = res=>wait.return(res.target.result);
  req.onerror = err=>{
    console.error('e_db_req: '+err);
    wait.return();
  };
  return await wait;
}

async function db_open(){
  if (db!==undefined)
    return db;
  // version 0 = never create
  return db = (await e_db_req(indexedDB.open('lif-kernel')))||null;
}

async function cache_get(table, k){
  let db = await db_open();
  if (!db)
    return;
  return await e_db_req(db.transaction(table, 'readonly')
    .objectStore(table).get(k));
}

function sha256_hex(v){
  v = new Buffer(str_to_buf(v));
  return sha256.digest(v).toHex();
}

async function require_cjs_load_meta_async(m){
  let _m = m._meta;
  function do_ret(res){
    _m.res = res;
    if (_m.wait)
      _m.wait.return(res);
    return _m.res;
  }
  if (_m.res=='done' || _m.res=='err')
    return _m.res;
  _m.res = 'loading';
  let v;
  if (!(v=str.starts(m.url, '/.lif/')))
    return do_ret('done');
  let lmod = v.rest;
  let qs = {meta: '', follow: ''};
  let url = m.url+qs_enc(qs);
  let req;
  if (_m.wait)
    return await _m.wait;
  _m.wait = ewait();
  let meta_c;
  lookup: {
    if (!enable_cache_idb || !lpm_is_perm(lmod))
      break lookup;
    let f_raw = await cache_get('lpm_file', [lmod]);
    if (!f_raw || f_raw.not_exist || f_raw.redirect)
      break lookup;
    let f_js = await cache_get('tsx_to_js', [f_raw.h_body]);
    if (!f_js)
      f_js = {h_js: f_raw.h_body}; // if plain js
    meta_c = await cache_get('js_to_meta', [f_js.h_js]);
    if (!meta_c)
      break lookup;
    if (enable_cache_idb=='debug')
      break lookup;
    m.meta = meta_c;
    return do_ret('done');
  }
  req = await fetch(url);
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  let text = await req.text();
  try {
    m.meta = JSON.parse(text);
  } catch(err){
    assert(0, 'invalid json meta '+url);
    return do_ret('err');
  }
  if (enable_cache_idb=='debug' && meta_c)
    assert.obj(m.meta, meta_c);
  return do_ret('done');
}

async function require_cjs_load_file_sync(m){
  let f = m.file;
  function do_ret(res){ return f.res = res; }
  if (f.res=='done' || f.res=='err')
    return f.res;
  f.res = 'loading';
  let url = m.url;
  let req;
  req = fetch_sync(url);
  if (req.status==200)
    m.script = f.text = req.text;
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  try {
    if (m.is_json)
      m.json = f.json = JSON.parse(f.text);
  } catch(err){
    console.error('invalid json module: '+url);
    return do_ret('err');
  }
  return do_ret('done');
}

async function require_cjs_load_file_async(m){
  let f = m.file;
  function do_ret(res){
    return f.wait.return(f.res = res);
  }
  if (f.res=='done' || f.res=='err')
    return f.res;
  f.res = 'loading';
  let url = m.url;
  let req;
  if (f.wait)
    return await f.wait;
  f.wait = ewait();
  req = await fetch(url);
  if (req.status==200)
    m.script = f.text = await req.text();
  if (req.status!=200){
    console.error('no mod meta: '+url);
    return do_ret('err');
  }
  try {
    if (m.is_json)
      m.json = f.json = JSON.parse(f.text);
  } catch(err){
    return do_ret('err');
  }
  return do_ret('done');
}

function require_cjs_load_requires_sync(m){
  if (m.load_requires)
    return;
  for (let req of m.meta.requires||[]){
    if (!require_cjs_cond_static(req, m.script))
      continue;
    require_cjs_load_follow_sync({uri_self: m.url, imp: req.module});
  }
  m.load_requires = 1;
}

function require_cjs_cond_static(req, text){
  if (req.type!='program')
    return;
  if (!req.cond)
    return true;
  if (!req.cond.static)
    return false;
  let cond = text.slice(req.cond.start, req.cond.end);
  let _static = false;
  let _else = req.cond.else ? '!' : '';
  let _f;
  try {
    let f = _f = new Function('return '+_else+'('+cond+');');
    _static = f();
  } catch(err){
    console.error('require cjs cond'+_else+'('+cond+'): '+err);
    return false;
  }
  D && console.log('require cjs cond'+_else+'('+cond+'): '+_static);
  return _static;
}

async function require_cjs_load_requires_async(m, loading){
  if (m.load_requires)
    return;
  for (let req of m.meta.requires||[]){
    if (!require_cjs_cond_static(req, m.script))
      continue;
    let slow = eslow(15000, 'require_cjs_load_require('+m.url+' -> '
      +req.module+')');
    await require_cjs_load_follow_async({uri_self: m.url, imp: req.module, loading});
    slow.end();
  }
  m.load_requires = 1;
}
async function import_amd_load_requires(m, loading){
  if (m.load_requires)
    return;
  let reqs = [];
  for (let req of m.define.reqs||[]){
    let e;
    if (!(e = req.e))
      e = await require_cjs_async(m.url, req.imp);
    reqs.push(e);
  }
  m.load_requires = reqs;
}
function define_amd_run(m){
  if (m.run)
    return m.run;
  m.run = 'running';
  try {
    if (m.define.factory)
      m.exports = m.define.factory(...m.load_requires);
  } catch(err){
    m.run = 'err';
    console.error('define('+m.url+') failed eval', err);
    return m.run;
  }
  m.loaded = true;
  return m.run = 'done';
}
function require_cjs_run(m){
  if (m.run)
    return m.run;
  if (m.type=='amd')
    return define_amd_run(m);
  if (m.type=='mjs')
    throw Error('cannot dynamic sync require('+m.url+') mjs from '+m.parent);
  m.run = 'running';
  if (m.is_json){
    m.exports = m.file.json;
    return m.run = 'done';
  }
  m.require = function(imp){
    return require_cjs_sync(m.url, imp);
  };
  m.require.require_async = async function(imp){
    return await require_cjs_async(m.url, imp);
  };
  m.require.module = m; // debug
  let script = m.script;
  assert(typeof script=='string', 'invalid script type');
  if (script.startsWith('#!'))
    script = '//'+script;
  // dont put \n before script to keep original line locations synced
  let js =
    `'use strict'; `
    +`let module = globalThis.$lif.boot.require_cjs_get_mod(${json(m.url)}); `
    +`let exports = module.exports; `
    +`let require = module.require; `
    +`let __dirname = ${json(path_dir(m.url))}; `
    +`let __filename = ${json(path_file(m.url))}; `
    +`(function(){ `
    +`${script}\n`
    +`})();\n`
    +`//# sourceURL=${m.url}\n`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    m.run = 'err';
    console.error('require('+m.url+') failed eval', err);
    return m.run;
  }
  m.loaded = true;
  return m.run = 'done';
}

function mod_add(_m){
  assert(!mod_t[_m.url]);
  let m = mod_t[_m.url] = {
    url: _m.url,
    imp: _m.imp,
    is_json: _m.url.endsWith('.json'),
    parent: _m.uri_self,
    exports: {},
  };
  if (_m.loaded!=undefined)
    m.loaded = _m.loaded;
  if (_m.wait!=undefined)
    m.wait = _m.wait;
  m.file = {};
  m._meta = {};
  return m;
}

function require_cjs_load_follow_sync({uri_self, imp}){
  let url = npm_imp_uri(uri_self, imp);
  D>=2 && console.log('sync load', uri_self, imp);
  uri_self ||= '';
  let m;
  if (!(m=mod_t[url]))
    m = mod_add({url, imp, uri_self});
  if (m.redirect)
    return m.redirect;
  if (m.run || m.load_requires || m.loading)
    return m;
  m.loading = 1;
  D && console.log('sync load', uri_self, url);
  require_cjs_load_meta_sync(m);
  if (m._meta.res!='done')
    return m;
  if (m.meta.redirect){
    if (m.meta.redirect_file)
      require_cjs_meta_add({imp: m.meta.redirect, uri_self, meta: m.meta.redirect_file});
    m.redirect = require_cjs_load_follow_sync({imp: m.meta.redirect});
    return m.redirect;
  }
  require_cjs_load_sync({m});
  return m;
}

function require_cjs_load_sync({m}){
  m.type = m.meta.type;
  if (m.type=='mjs')
    return;
  require_cjs_load_file_sync(m);
  if (m.file.res!='done')
    return;
  require_cjs_load_requires_sync(m);
}

function amd_define_args(args){
  let url, reqs, factory;
  let reqs_default = ['require', 'exports', 'module'];
  let exports_val; /* not supported */
  if (args.length==1){
    // define(function(){...})
    // define(function(require, exports, module){...});
    factory = args[0];
    reqs = reqs_default;
  } else if (args.length==2){
    if (typeof args[0]=='string'){
      // define('my_mod', function(require, exports, module){...});
      url = args[0];
      reqs = reqs_default;
    } else {
      // define(['imp1', 'imp2'], function(imp1, imp2){...});
      reqs = args[0];
    }
    factory = args[1];
  } else if (args.length==3)
    // define('my_mod', ['imp1', 'imp2'], function(imp1, imp2){...});
    [url, reqs, factory] = args;
  else
    throw Error('define() invalid num args');
  if (typeof factory!='function'){
    throw Error('define() non-function factory not supported');
    exports_val = factory;
    factory = undefined;
  }
  return {url, reqs, factory};
}

// AMD async require(['imp1', 'imp2'], function(imp1, imp2){...})
function define_amd_require(m, reqs){
  let _reqs = [], _m;
  for (let i=0; i<reqs.length; i++){
    let imp = reqs[i], v;
    switch (imp){
    case 'require': // implementation of AMD require(reqs, cb)
      v = {e: function _amd_require(_imp, cb){
        assert(0, 'amd require() not yet implemented correctly');
        if (!cb){
          // sync require - only to previously loaded modules
          let url = npm_imp_uri(m.url, _imp);
          let _m = mod_t[url];
          if (_m)
            return _m.exports;
          throw Error('amd sync require('+_imp+') not already loaded');
          return require_cjs_sync(m.url, _imp);
        }
        (async function __amd_require(){
          let exports = await require_cjs_async(m.url, _imp);
          cb(exports);
        })();
      }};
      break;
    case 'exports': v = {e: m.exports}; break;
    case 'module': v = {e: m}; break;
    default:
      v = {imp};
    }
    _reqs[i] = v;
  }
  return _reqs;
}

function define_amd_multi(url, reqs, factory, m){
  let imp = url;
  url = npm_imp_uri(m.url, imp);
  let _id = url+(url!=m.url ? ' from '+m.url : '');
  assert(0, 'multi AMD define('+_id+') per-file not supported yet');
  // TOOO validate/normalize url vs m.url -> npm module, and call
  // _mod_id is ignored. 1st define() in file should ignore it, or maybe
  // create an alias for it.
  if (!m){
    if (mod_t[url])
      throw Error('define('+_id+') already defined');
    mod_add({url, imp, loaded: false, wait: ewait()});
  }
  // TODO not yet implemented loading of multi-define() per file AMD
  return m;
}

function import_amd_run_define(m, loading){
  // define() was detected, so run the module to get the define import list,
  // and the export_fn
  // implementation of AMD define()
  let called = 0;
  let eval_completed = false;
  m.define = function(url, reqs, factory){
    ({url, reqs, factory} = amd_define_args(arguments));
    let _m = m;
    assert(!eval_completed, 'got define('+m.url+') after script completed');
    if (called++)
      _m = define_amd_multi(url, reqs, factory, m);
    m.define.reqs = define_amd_require(_m, reqs);
    m.define.factory = factory;
  };
  m.define.amd = {};
  m.amd_imp = [];
  m.define.module = m; // debug
  // dont put \n before script to keep original line locations synced
  let js =
    `let define = globalThis.$lif.boot.define_amd_get_mod(${json(m.url)}).define; `
    +`(function(){ `
    +`${m.script}\n`
    +`}());\n`
    +`//# sourceURL=${m.url}\n`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    console.error('import('+m.url+') failed eval', err, err?.stack);
    throw err;
  } finally {
    eval_completed = true;
  }
  if (!m.define.reqs)
    console.log('AMD module '+m.url+' did not call define()');
}

function require_cjs_meta_add({imp, uri_self, meta}){
  let url = npm_imp_uri(uri_self, imp);
  if (mod_t[url])
    return;
  let m = mod_add({url, imp, uri_self});
  m.meta = meta;
  m._meta = {res: 'done'};
  return m;
}

async function require_cjs_load_follow_async({uri_self, imp, loading}){
  let url = npm_imp_uri(uri_self, imp);
  D>=2 && console.log('async load check ', uri_self, imp);
  uri_self ||= '';
  let m;
  if (!(m=mod_t[url]))
    m = mod_add({url, imp, uri_self});
  if (m.redirect)
    return m.redirect;
  if (m.run || m.load_requires)
    return m;
  loading = [...loading];
  if (loading.includes(m))
    return m;
  loading.push(m);
  D && console.log('async load', uri_self, imp);
  await require_cjs_load_meta_async(m);
  if (m._meta.res!='done')
    return m;
  if (m.meta.redirect){
    if (m.meta.redirect_file)
      require_cjs_meta_add({imp: m.meta.redirect, uri_self, meta: m.meta.redirect_file});
    m.redirect = await require_cjs_load_follow_async({
      imp: m.meta.redirect, loading});
    return m.redirect;
  }
  await require_cjs_load_async({m, loading});
  return m;
}
async function require_cjs_load_async({m, loading}){
  m.type = m.meta.type;
  if (m.type=='mjs'){
    if (m.wait)
      return await m.wait;
    m.wait = ewait();
    // hard-coded import()s should be imported and run just before
    // require_cjs_run(). but might be also ok here already to import them
    let e = await /*keep*/ import(m.url+'?mjs');
    m.exports = e.default || e;
    m.run = 'done';
    return m.wait.return(m);
  }
  await require_cjs_load_file_async(m);
  if (m.file.res!='done')
    return;
  if (m.type=='amd'){
    if (m.wait)
      return await m.wait;
    m.wait = ewait();
    import_amd_run_define(m, loading);
    await import_amd_load_requires(m, loading);
    return m.wait.return(m);
  }
  await require_cjs_load_requires_async(m, loading);
}

function require_cjs_sync(uri_self, imp){
  let url = npm_imp_uri(uri_self, imp);
  D && console.log('require_cjs_sync '+(uri_self||'')+' -> '+imp);
  if (!mod_t[url])
    console.log('dynamic sync require('+imp+') in '+uri_self);
  let m = require_cjs_load_follow_sync({uri_self, imp});
  require_cjs_run(m);
  return m.exports;
}

async function require_cjs_async(uri_self, imp){
  D && console.log('require_cjs_async '+(uri_self||'')+' -> '+imp);
  let m = await require_cjs_load_follow_async({uri_self, imp, loading: []});
  require_cjs_run(m);
  return m.exports;
}

function createRequire(uri_self){
  return function require_cjs_sync_mod(imp){
    return require_cjs_sync(uri_self, imp);
  };
}

// web worker importScripts()/require() implementation
let enable_cache = 2; // 0 no-cache, 1 cache remote, 2 cache remote and local
let enable_cache_idb = 0; // 0 - no cache, 1 - cache, 'debug' - dev debug
function fetch_opt(url){
  let no_cache = url.startsWith('/') ? !enable_cache : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}} : {};
}
function define_amd_get_mod(url){
  // let url = npm_imp_uri(null, imp);
  let m = mod_t[url];
  assert(m, 'module not found: '+url);
  return m;
}

async function import_amd(uri_self, [imp, opt]){
  D && console.log('import_amd', imp, uri_self);
  let url = npm_imp_uri(uri_self, imp);
  let m;
  if (m = mod_t[url])
    return await m.wait;
  m = mod_add({url, imp, wait: ewait(), uri_self, loaded: false});
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    m.script = await response.text();
  } catch(err){
    console.error('import('+url+') failed', err);
    throw m.wait.throw(err);
  }
  m.wait = ewait();
  let loading = [];
  import_amd_run_define(m, loading);
  await import_amd_load_requires(m, loading);
  require_cjs_run(m);
  assert(m.loaded, 'module not loaded: '+imp);
  return m.wait.return(m.exports);
}

// worker
async function import_module_script({uri_self, imp}){
  let url = npm_imp_uri(uri_self, imp);
  let m;
  if (m = mod_t[url])
    return await m.wait;
  m = mod_add({url, imp, wait: ewait(), uri_self, loaded: false});
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    m.script = await response.text();
  } catch(err){
    console.error('import('+url+') failed', err);
    throw m.wait.throw(err);
  }
  let js = `(function(){ ${m.script}\n}());\n//# sourceURL=${url}\n`;
  try {
    eval?.(js); // script return value is ignored
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw m.wait.throw(err);
  }
  await m.wait;
  m.loaded = true;
  return m.wait.return(m.exports);
}

function exports_to_esm(exports){
  return {...exports, default: exports};
}

async function import_worker({uri_self, imp, opt}){
  if (opt?.type!='script')
    assert(0, 'module import not yet supportedd');
  let exports = await import_module_script({uri_self, imp, opt: {worker: 1}});
  return exports_to_esm(exports);
}

function import_esm_to_cjs(mod){
  if (mod.__esModule!==false)
    return mod;
  let ret = {default: mod.default};
  for (let [k, v] of OE(mod.default)){
    if (k=='default')
      continue;
    ret[k] = v;
  }
  return ret;
}

async function import_esm(uri_self, [imp, opt={}]){
  let url = npm_imp_uri_qs(uri_self, imp, {...opt, type: 'module'});
  let slow;
  try {
    slow = eslow(15000, 'import_esm('+url+')');
    D && console.log('boot.js: import '+url);
    let ret;
    if (is_worker && opt?.type=='script')
      ret = await import_worker({uri_self, imp, opt});
    else {
      ret = await /*keep*/ import(url, opt);
      ret = import_esm_to_cjs(ret);
    }
    return ret;
  } catch(err){
    console.error('import_esm('+url+' '+uri_self+')', err);
    throw err;
  } finally {
    slow.end();
  }
}

function import_cjs_namespace(module_ns){
  return module_ns.__es_lif_cjs ? module_ns.default : module_ns;
}

// worker
function importScripts_single(uri_self, [mod, opt={}]){
  let _opt = {};
  if (opt?.type!='script')
    assert(0, 'module import not yet supportedd');
  let url = npm_imp_uri_qs(uri_self, mod, _opt);
  let res = fetch_sync(url);
  if (res.status!=200)
    throw Error('failed fetch '+url);
  let script = res.text;
  // the ';' just before script is very important: it disables the "use strict"
  // from preventing the top level functions and var of the import stript to
  // be be "exported" (added) to the global context.
  let exports = eval.call(globalThis,
    `; ${script}\n//# sourceURL=${url}\n`);
}

function _importScripts(uri_self, mods){
  for (let m of mods)
    importScripts_single(uri_self, [m, {worker: 1, type: 'script'}]);
}

function new_importScripts(...mods){
  _importScripts(location.origin, mods);
}

function init_worker(){
  if (init_worker.inited)
    return;
  init_worker.inited = true;
  console.log('lif init_worker '+location+' '+(globalThis.name||''));
  globalThis.orig_importScripts = globalThis.importScripts;
  globalThis.importScripts = new_importScripts;
}

let lif_kernel_base = import.meta.resolve('./x').slice(0, -2);
async function boot_kernel(){
  if (boot_kernel.wait){
    console.log('lif boot: waiting to complete');
    return await boot_kernel.wait;
  }
  console.log('lif boot version: '+lif_version+' util '+util_version
    +' from '+lif_kernel_base);
  let wait = boot_kernel.wait = ewait();
  try {
    let serviceWorker = navigator.serviceWorker;
    const conn_kernel = async()=>{
      console.log('conn kernel');
      if (kernel_chan){
        console.log('conn closing');
        kernel_chan.close();
        kernel_chan = null;
      }
      kernel_chan = null;
      let controller = serviceWorker.controller;
      if (!controller){
        console.log('no sw controllier - reloading');
        window.location.reload();
        return;
      }
      kernel_chan = new ipc_postmessage();
      kernel_chan.connect(controller);
      kernel_chan.method('version', ()=>({version: lif_version}));
      let slow = eslow('conn_kernel chan');
      D && console.log('conn_kernel chan start');
      console.log('lif kernel sw version: '+
        (await kernel_chan.call('version')).version);
      slow.end();
      if (0 && performance.getEntriesByType('navigation')[0].type=='reload'){
        console.log('page reload - clear kernel cache');
        await kernel_chan.call('reload');
      }
      slow = eslow('boot_worker chan');
      let res = await boot_worker_sync_connect();
      D && console.log('conn_kernel chan end');
      slow.end();
      wait.return();
    };
    let slow = eslow('sw register');
    let kernel_opt = {lif_kernel_base};
    if (localStorage.getItem('local_dev_enable'))
      kernel_opt.local_dev_enable = 1;
    const registration = await serviceWorker.register(
      '/.lif.kernel_sw.js'+qs_enc(kernel_opt));
    slow.end();
    if (0){
      registration.update();
      // Listen for new service worker
      registration.addEventListener('updatefound', ()=>{
        const newWorker = registration.installing;
        if (!newWorker)
          return;
        newWorker.addEventListener('statechange', ()=>{
          // New service worker is ready
          if (newWorker.state=='installed')
            console.log('new worker ready');
        });
      });
    }
    registration.addEventListener('updatefound', ()=>{
      console.log('sw updatefound', event);
    });
    serviceWorker.addEventListener('statechange', ()=>{
      console.log('sw statechange', event);
    });
    slow = eslow(1000, 'sw register ready'); // this is where it gets normally stuck
    const sw = await serviceWorker.ready;
    slow.end();
    // this boots the app if the SW has been installed before or
    // immediately after registration
    // https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle#clientsclaim
    serviceWorker.addEventListener('controllerchange', conn_kernel);
    await conn_kernel();
    slow = eslow('sw conn');
    await wait;
    slow.end();
    return await wait;
  } catch(err){
    console.error('ServiceWorker registration failed', err, err.stack);
    throw wait.throw(err);
  }
}

async function kernel_stats(){
  if (!kernel_chan)
    return;
  return await kernel_chan.call('kernel_stats');
}

function run_html_text(html){
  document.open();
  document.write(html);
  document.close();
  return;
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
      // src=mod --> src=/.lif/../mod?mjs
      // inline scripts: need to parse their ast contents and update imports
      e.appendChild(f);
      // need to wait after appendChild() for load/fail to complete
      script[i].parentNode.removeChild(script[i]);
    }
  }
  script_execute(document.head);
  script_execute(document.body);
}

async function run_html(webapp){
  console.log('run_html start '+webapp);
  let url = '/.lif/'+npm_to_lpm(webapp);
  let html = await T_fetch_text(url);
  run_html_text(html);
  console.log('run_html complete');
}

async function boot_app(boot_pkg){
  // init kernel
  await boot_kernel();
  if (!boot_pkg)
    return;
  let pkg = json_cp(boot_pkg);
  let webapp = pkg.lif?.webapp||pkg.webapp;
  if (webapp)
    webapp = npm_norm(webapp);
  console.log('boot: webapp '+webapp);
  npm_root = webapp;
  let slow = eslow('app_pkg');
  let res = await kernel_chan.call('app_pkg', pkg);
  slow.end();
  if (!webapp)
    return;
  if (res.webapp && res.webapp!=webapp){
    console.log('resolved: '+webapp+' -> '+res.webapp);
    webapp = res.webapp;
  }
  // load app
  // TODO: add support for apps missing package.json main- > /index.html
  // Such packages will try to show /index.html -> /index.md -> /README.md
  // also: check /favicon.ico existance
  let ext = _path_ext(webapp);
  let ret;
  try {
    if (ext=='html')
      ret = await run_html(webapp);
    else if (str.is(ext, 'js', 'jsx', 'ts', 'tsx'))
      ret = await import_esm(null, [webapp]);
    else
      throw Error('no app type found: '+webapp);
  } catch(err){
    console.error('boot: app('+webapp+') failed: '+err);
    throw err;
  }
  console.log('boot: boot complete: '+webapp);
  return ret;
}

function mainthread_setup(){
  function imp_url(url, opt){
    url = url.href || url;
    let uri_self = npm_root && npm_to_uri(npm_root);
    let _url = npm_imp_uri_qs(uri_self, url, {worker: 1, type: opt?.type});
    return _url;
  }
  class lif_Worker extends Worker {
    constructor(url, opt){
      console.log('Worker start', url);
      let _url = imp_url(url, opt);
      let worker = super(_url, ...[...arguments].slice(1));
    }
  }
  globalThis.orig_Worker = Worker;
  globalThis.Worker = lif_Worker;
  class lif_SharedWorker extends SharedWorker {
    constructor(url, opt){
      console.log('SharedWorker start', url);
      let _url = imp_url(url, opt);
      let worker = super(_url, ...[...arguments].slice(1));
    }
  }
  globalThis.orig_SharedWorker = SharedWorker;
  globalThis.SharedWorker = lif_SharedWorker;
}

function test(){
  let t;
  in_test = 1;
  t = (url, v)=>assert_eq(v, url_self_clean(url));
  t(null, null);
  t('/path', '/path');
  t('/path?qs', '/path');
  t(location.origin+'/dir/file?qs', '/dir/file');
  t = (uri_self, imp, v)=>assert_eq(v, npm_imp_uri(uri_self, imp));
  t('/.lif/npm/mod@1.2.3/x', '/.lif/npm/mod@4.5.6/x', 
    '/.lif/npm/mod@4.5.6/x');
  t(location.origin+'/.lif/npm/mod@1.2.3/x', '/.lif/npm/mod@4.5.6/x', 
    '/.lif/npm/mod@4.5.6/x');
  t('/.lif/npm/mod@1.2.3/x', location.origin+'/.lif/npm/mod@4.5.6/x', 
    '/.lif/npm/mod@4.5.6/x');
  t('/.lif/npm/mod@1.2.3/x', './a/f', '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/npm/mod@1.2.3/x?qs', './a/f', '/.lif/npm/mod@1.2.3/a/f');
  t(location.origin+'/.lif/npm/mod@1.2.3/x?qs', './a/f',
    '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/local/other', './a/f', '/.lif/local/a/f');
  t('/.lif/local/other/x', './a/f', '/.lif/local/other/a/f');
  t('/.lif/local/mod//x', './a/f', '/.lif/local/mod//a/f');
  t('/.lif/local/mod//x/y', './a/f', '/.lif/local/mod//x/a/f');
  t('/.lif/npm/mod@1.2.3/x', 'MOD/f', '/.lif/npm/mod@1.2.3/.lif.imp/MOD/f');
  t('/.lif/npm/mod@1.2.3/x', 'MOD@1.2.3/f',
    '/.lif/npm/mod@1.2.3/.lif.imp/MOD@1.2.3/f');
  t('/.lif/npm/mod@1.2.3/x', 'MOD@4.5.6/f',
    '/.lif/npm/mod@1.2.3/.lif.imp/MOD@4.5.6/f');
  t('/.lif/npm/mod@1.2.3/x', 'mod/f', '/.lif/npm/mod@1.2.3/f');
  t('/.lif/npm/mod@1.2.3/x', 'mod@1.2.3/f', '/.lif/npm/mod@1.2.3/f');
  t('/.lif/npm/mod@1.2.3/x', 'mod@4.5.6/f',
    '/.lif/npm/mod@1.2.3/.lif.imp/mod@4.5.6/f');
  t(null, 'mod/f', '/.lif/npm/mod/f');
  t('/.lif/npm/mod@1.2.3/x', 'http://x.y/z', 'http://x.y/z');
  t('/.lif/npm/mod@1.2.3/x', 'https://x.y/z', 'https://x.y/z');
  t('/.lif/npm/mod@1.2.3/x', 'blob:abcd', 'blob:abcd');
  t('/.lif/npm/mod@1.2.3/x', 'blob:http://x.y/z', 'blob:http://x.y/z');
  t('/.lif/npm/mod@1.2.3/x', 'node:util',
    '/.lif/npm/mod@1.2.3/.lif.imp/node:util');
  t(null, 'node:util', '/.lif/npm/node:util');
  t('/.lif/npm/mod@1.2.3/c/d', './a/f', '/.lif/npm/mod@1.2.3/c/a/f');
  t('/.lif/npm/mod@1.2.3/c/d', '../a/f', '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/npm/mod@1.2.3/x', 'node:path',
    '/.lif/npm/mod@1.2.3/.lif.imp/node:path');
  t('/.lif/npm/mod@1.2.3/x', 'node:path/a/b',
    '/.lif/npm/mod@1.2.3/.lif.imp/node:path/a/b');
  t = (uri_self, imp, opt, v)=>
    assert_eq(v, npm_imp_uri_qs(uri_self, imp, opt));
  t('/.lif/npm/mod@1.2.3/x', '/.lif/npm/mod@4.5.6/x?qs', {},
    '/.lif/npm/mod@4.5.6/x?qs');
  t('/.lif/npm/mod@1.2.3/x', './a/f', {}, '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/npm/mod@1.2.3/x?qs', './a/f', {}, '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/npm/mod@1.2.3/x', './a/f?qs', {}, '/.lif/npm/mod@1.2.3/a/f?qs');
  t(location.origin+'/.lif/npm/mod@1.2.3/x?qs', './a/f', {},
    '/.lif/npm/mod@1.2.3/a/f');
  t('/.lif/local/other.js', './a/file.js', {worker: 1},
    '/.lif/local/a/file.js?worker');
  t('/.lif/local/mod//x', './a/file.js', {type: 'module'},
    '/.lif/local/mod//a/file.js?imp');
  t(null, 'lif-kernel/hi.js', {type: 'module'},
    '/.lif/npm/lif-kernel/hi.js?imp');
  t = (url, v)=>assert_eq(v, npm_to_uri(url));
  t('mod/file.js', '/.lif/npm/mod/file.js');
  t('mod@4.5.6/file.js', '/.lif/npm/mod@4.5.6/file.js');
  t('http:/x.y/z', 'http://x.y/z');
  t('https:/x.y/z', 'https://x.y/z');
  t('blob:a/b', 'blob:a/b');
  t('data:a/b', 'data:a/b');
  t('node:mod', '/.lif/npm/node:mod');
  t('node:mod/a/b', '/.lif/npm/node:mod/a/b');
  t('b/file.js', '/.lif/npm/b/file.js');
  t('/b/file.js', '/b/file.js');
  in_test = 0;
}
test();

lif.boot = {
  miani: 'ANKI IHUH ALUHIK:LA IHIH LK ALUHIM AhRIM OL PNI:LA TSA AT SM IHUH ALUHK LSUA:ZKUR AT IUM HSBT LQDSU:KBD AT AUIK UAT AMK:LA TRXh:LA TNAF:LA TGNU:LA TONH BROK OD SQR:LA ThMD BIT ROK:',
  //     'ANKI IHUH ALUHIK:LA IHIH LK ALUHIM AhRIM EL PNI:LA TSA AT SM IHUH ALUHK LSUA:ZKUR AT IUM HSBT LQDSU:KBD AT AUIK UAT AMK:LA TRXh:LA TNAF:LA TGNU:LA TONH BROK OD SQR:LA ThMD BIT ROK:',
  //     'ANKI YHVH ALOHYK:LA YHYH LK ALOHIM AJRIM EL PNY:LA TSA AT SM YHVH ALOHK LSVA:ZKOR AT YOM HSBT LQDSO:KBD AT AVIK VAT AMK:LA TRXJ:LA TNAF:LA TGNV:LA TENH BREK ED SQR:LA TJMD BYT REK:',
  //     'anki yhvh alohyk:la yhyh lk alohim ajrim el pny:la tsa at sm yhvh alohk lsva:zkor at yom hsbt lqdso:kbd at avik vat amk:la trxj:la tnaf:la tgnv:la tenh brek ed sqr:la tjmd byt rek:',
  //     'anki yhvh alohyk:la yhyh lk alohim aHrim el pny:la tsa at Sm yhvh alohk lSva:zkor at yom hSbt lqdSo:Kbd at avik vat amk:lo trXH:lo tnaf:lo tgnv:lo tenh brek ed Sqr:lo tHmd byt rek:',
  //     'anki yeve alueyk:la yeye lk alueim ahrim ol pny:la tsa at sm yeve aluek lsva:zkur at yum hsbt lqdsu:kbd at avik vat amk:la trxh:la tnaf:la tgnv:la tone brok od sqr:la thmd byt rok:',
  lif,
  version: lif_version,
  process,
  require_cjs_get_mod,
  require_cjs_async,
  require_cjs_sync,
  createRequire,
  import_esm,
  import_amd,
  define_amd_get_mod,
  import_cjs_namespace,
  kernel_stats,
};
if (!is_worker){
  mainthread_setup();
  OA(lif.boot, {boot_kernel, boot_app});
} else {
  OA(lif.boot, {_importScripts});
  init_worker();
}

export default lif;
