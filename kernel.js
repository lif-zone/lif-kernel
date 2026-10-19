// LIF Kernel: Service Worker BIOS (Basic Input Output System)
export const lif_version = '2026.9.28';
let D = 0; // debug
const $lif = globalThis.$lif ||= {};

const util = await import('./util.js');
const {str, OE, OA, OV, assert, ecache, json_cp, ewait, Donce,
  _path_ext, path_starts, qs_enc, qs_append, qs_split, uri_dec,
  T_url_parse, str_to_buf, eslow, Scroll, assert_eq, assert_obj_f,
} = util;
const {ipc_postmessage} = await import('./rpc.js');
const {lpm_ver_from_base, lpm_to_sw_passthrough, lpm_in_test,
  file_ctype, file_ctype_binary, ctype_get,
  url_uri_type, T_npm_to_lpm, T_lpm_to_npm, lpm_imp_rel,
  lpm_parse, T_lpm_lmod, lpm_to_npm, npm_to_lpm,
  T_lpm_parse, T_lpm_str, lpm_ver_missing, lpm_ver_final,
  pkg_import_lookup, pkg_exports_lookup, pkg_web_exports_lookup,
  pkg_transform_type, npm_ver_lookup, patch_json,
} = await import('./lpm.js');
const {reg_cache_enable, gh_ver, reg_get, reg_http_get, reg_file_t,
} = await import('./reg.js');
const {tr_tsx_to_js, tr_js_to_meta} = await import('./ast.js');
const {qw} = str;
const clog = console.log.bind(console);
const cerr = console.error.bind(console);
const json = JSON.stringify;
const sha256 = await import('./sha256.js');
let lif_kernel_base;

let g_indexedDB = globalThis.indexedDB;
let g_caches = globalThis.caches;
// micro idb npm implementation, that works also on storageBuckets
function idb_wrap(request){
  return new Promise((resolve, reject)=>{
    request.onsuccess = ()=>resolve(request.result);
    request.onerror = ()=>reject(request.error);
  });
}
function idb_wrap_db(raw_db){
  raw_db.get = (table, key)=>
    idb_wrap(raw_db.transaction(table).objectStore(table).get(key));
  raw_db.put = (table, val, key)=>
    idb_wrap(raw_db.transaction(table, 'readwrite')
      .objectStore(table).put(val, key));
  return raw_db;
}
let idb_api = {
  openDB: async function(name, version, callbacks={}){
    const {upgrade} = callbacks;
    const request = g_indexedDB.open(name, version);
    if (upgrade){
      request.addEventListener('upgradeneeded', event=>{
        upgrade(request.result, event.oldVersion, event.newVersion,
          request.transaction, event);
      });
    }
    return idb_wrap_db(await idb_wrap(request));
  },
};

let cache_ver = 29;
let storage_bucket;
async function storage_bucket_init(){
  let storageBuckets = navigator.storageBuckets; // chrome >=122
  if (!storageBuckets)
    return;
  storage_bucket = await storageBuckets.open('lif-cache-'+cache_ver, {
    persisted: false,
    durability: 'relaxed',
  });
  g_indexedDB = storage_bucket.indexedDB;
  g_caches = storage_bucket.caches;
}
await storage_bucket_init();

let db;
function db_upgrade(db, table, opt){
  let exist = db.objectStoreNames.contains(table);
  if (opt.del){
    if (exist)
      db.deleteObjectStore(table);
  } else if (opt.del_create){
    if (exist)
      db.deleteObjectStore(table);
    db.createObjectStore(table, opt);
  } else {
    if (!exist)
      db.createObjectStore(table, opt);
  }
}

async function db_open(){ // use storageBuckets
  if (db)
    return db;
  db = await idb_api.openDB('lif-kernel-'+cache_ver, 1, {
    upgrade(db, old_ver, new_ver){
      let opt = {del_create: true};
      console.log('upgrade cache db '+old_ver+' -> '+new_ver);
      db_upgrade(db, 'js_to_meta', {keyPath: ['h_js'], ...opt});
      db_upgrade(db, 'tsx_to_js', {keyPath: ['h_tsx'], ...opt});
      db_upgrade(db, 'lpm_file', {keyPath: ['lmod'], ...opt});
      db_upgrade(db, 'lpm_ver', {keyPath: ['lmod'], ...opt});
    }
  });
  return db;
}

function ecache_delete(del_all){
  function cc(table){
    for (let [k, v] of OE(table)){
      if (del_all || str.starts(k, 'local/'))
        delete table[k];
    }
  }
  cc(lpm_pkg_t);
  cc(lpm_pkg_ver_t);
  cc(lpm_file_t);
  cc(reg_file_t);
}

async function caches_delete_all() {
  return await g_caches.keys().then(names=>
    Promise.all(names.map(name => g_caches.delete(name)))
  );
}

function db_delete(){
  ecache_delete(true);
  try {
    // should be await, be did without so it will start the operation
    navigator.storageBuckets.delete('lif-cache-'+cache_ver);
  } catch(err){
    console.log('failed deleting storageBucket');
  }
  try {
    // should be await, be did without so it will start the operation
    g_indexedDB.deleteDatabase('lif-kernel-'+cache_ver);
  } catch(err){
    console.log('failed deleting indexedDB');
  }
  try {
    // should be await, be did without so it will start the operation
    caches_delete_all();
  } catch(err){
    console.log('failed deleting caches');
  }
}

// 0 no-cache, 1 cache registry, 2 cache http/https, 3 cache local
let cache_enable = 1;
reg_cache_enable(cache_enable);

function cache_lmod(lmod){
  if (!cache_enable)
    return;
  if (str.starts(lmod, 'npm/', 'git/'))
    return cache_enable>=1;
  if (str.starts(lmod, 'http/', 'https/'))
    return cache_enable>=2;
  if (str.starts(lmod, 'local/'))
    return cache_enable>=3;
  return true;
}

async function cache_get(table, k, opt){
  let db = await db_open();
  let v = await db.get(table, k);
  if (opt?.cache=='check'){
    if (cache_opt.refresh_tm && v.cache_tm<cache_opt.refresh_tm)
      return;
  }
  return v;
}

async function cache_set(table, v, k){
  let db = await db_open();
  await db.put(table, {...v, cache_tm: Date.now()}, k);
}

let cache_opt = {refresh_tm: Date.now()};
function cache_refresh(){
  cache_opt.refresh_tm = Date.now();
  // XXX should also update lpm_app_date?
  // lpm_app_date = +new Date();
}

function sha256_hex(v){
  v = new sha256.Buffer(str_to_buf(v));
  return sha256.digest(v).toHex();
}

let lpm_app;
let lpm_pkg_app;
let lpm_app_date = +new Date();
let app_init_wait = ewait();
let lpm_pkg_root;
let lpm_pkg_t = {};
let lpm_pkg_ver_t = {};
let lpm_file_t = {};

function lpm_import_lookup({lpm_pkg, imp}){
  let D = 0;
  let u;
  let ret_err = err=>{
    D && console.log('lpm_import_lookup('+lpm_pkg.lmod+') imp '+imp+': '+err);
  };
  if (!(u = lpm_parse(imp)))
    return ret_err('invalid lpm uri import');
  // no need to lookup final versioned imports and local imports
  if (!lpm_ver_missing(u))
    return imp;
  // if same package, use self
  let _imp = lpm_ver_from_base(imp, lpm_pkg.lmod);
  if (_imp)
    return _imp;
  let l = pkg_import_lookup({lmod_self: lpm_pkg.lmod, pkg: lpm_pkg.pkg, imp});
  // collect parents info
  let par = {}; // in npm: peer==parent.children, dep==child==import
  for (let p = lpm_pkg.parent; p; p = p.parent){
    let _l = pkg_import_lookup({lmod_self: p.lmod, pkg: p.pkg, imp});
    par.reg ||= _l.reg;
    par.dev ||= _l.dev;
    par.over ||= _l.over;
  }
  // lookup overrides of current and parents
  if (l.over)
    return l.over;
  if (par.over)
    return par.over;
  // lookup optionalDependencies: current
  if (l.optional)
    return l.optional;
  // lookup dependencies (regular imports): current
  if (l.reg)
    return l.reg;
  // lookup parent peer/global imports (peerDependencies, overrides)
  if (l.peer){
    if (par.reg)
      return par.reg;
    return l.peer;
  }
  // lookup devDependencies: current
  if (l.dev)
    return l.dev;
  // last resort - parent imported it
  if (par.reg)
    return par.reg;
  return ret_err('imp missing');
}

function tr_import_lpm({imp, imported, lmod_self, pkg}){
  let v = passthrough_lmod({pkg, lmod: T_npm_to_lpm(imp)});
  if (v)
    return v;
  v = lpm_imp_rel(imp, lmod_self);
  let q = {};
  q.imp = imported?.join(',') || '';
  v += qs_enc(q);
  return v;
}

function tr_mjs_import(f){
  let s = Scroll(f.js), v, _v;
  for (let d of f.meta.imports||[]){
    let imp = d.module;
    if (url_uri_type(imp)=='rel'){
      s.splice(d.start, d.end, json(imp+'?mjs'));
      continue;
    }
    _v = tr_import_lpm({imp, imported: d.imported,
      lmod_self: f.lmod, pkg: f.lpm_pkg.pkg});
    if (d.imported_dyn){
      let dyn = d.imported_dyn;
      let name = f.js.slice(dyn.name_start, dyn.name_end);
      let lif_name = '__lif_'+name;
      s.splice(dyn.name_start, dyn.name_end, lif_name);
      s.splice(dyn.stmt_end, dyn.stmt_end,
        ` const ${name} = $lif.boot.import_cjs_namespace(${lif_name});`);
    }
    s.splice(d.start, d.end, json(_v));
    continue;
  }
  for (let d of f.meta.imports_dyn||[])
    s.splice(d.start, d.end, 'import_lif');
  return s.out();
}

function file_tr_mjs_worker(f, opt){
  let uri_s = json('/.lif/'+f.lmod);
  // double space between await and import, to prevent tr import_module
  let js = `
    let lif_worker = {
      queue: [],
      cb: e=>{
        console.log('push worker message queue');
        lif_worker.queue.push(e);
      }
    };
    globalThis.addEventListener('message', lif_worker.cb);
    // Chrome 148 Worker bug: must use dynamic import() to force correct order
    // see also lif-coin/browser/node_env.js
    let lif = (await  import(${json(lif_kernel_base+'/boot.js')})).default;
    let importScripts = (...mods)=>lif.boot._importScripts(import.meta.url, mods);
    let import_lif = function(){
      return globalThis.$lif.boot.import_esm(import.meta.url, arguments);
    };
    let mod = await import_lif(${json('/.lif/'+f.lmod)});
    globalThis.removeEventListener('message', lif_worker.cb);
    lif_worker.queue.forEach(e=>globalThis.dispatchEvent(e));
  `;
  return js;
}

function file_tr_mjs(f, opt){
  let uri_s = json('/.lif/'+f.lmod);
  let tr = tr_mjs_import(f);
  let slow = 0; // has problem with lif-kernel/util.js
  let pre = '', post = '';
  let _import = f.meta.imports?.length;
  if (opt?.worker)
    return file_tr_mjs_worker(f, opt);
  if (f.meta.imports_dyn?.length)
    pre += `let import_lif = function(){ return globalThis.$lif.boot.import_esm(import.meta.url, arguments); }; `;
  if (slow)
    pre += `let slow = globalThis.$lif.boot.util.eslow(5000, 'load module '+import.meta.url); `;
  if (slow)
    post += `slow.end(); `;
  let _tr = tr;
  if (tr.startsWith('#!')) // #!/usr/bin/node shebang
    _tr = '//'+tr;
  return pre+_tr+post;
}

function mjs_import_cjs(path, q){
  let imported = q.get('imp')?.split(',').filter(i=>i);
  let js = '';
  if (q.has('worker')){
    // double space between await and import, to prevent tr import_module
    js += `let $lif_message = {q: [], fn: e=>$lif_message.q.push(e)}; `;
    js += `globalThis.addEventListener('message', $lif_message.fn); `;
    js += `let lif = (await  import(${json(lif_kernel_base+'/boot.js')})).default; `;
  }
  js += `let exports = (await globalThis.$lif.boot.require_cjs_async(null, ${json(path)}));\n`;
  if (q.has('worker')){
    js += `globalThis.removeEventListener('message', $lif_message.fn); `;
    js += `$lif_message.q.forEach(e=>globalThis.dispatchEvent(e)); `;
  }
  imported?.forEach(i=>js += `export const ${i} = exports.${i};\n`);
  js += `export const __esModule = exports.__esModule;\n`; // unused
  js += `export const __es_lif_cjs = true;\n`;
  js += `if (exports.__esModule && exports.default) exports = exports.default;\n`;
  js += `export default exports;\n`;
  return js;
}

function mjs_import_amd(path, q){
  let imported = q.get('imp')?.split(',').filter(i=>i);
  let uri_s = json(path);
  let js = '';
  js += `let exports = await globalThis.$lif.boot.import_amd(null, [${uri_s}]);\n`;
  imported?.forEach(i=>js += `export const ${i} = exports.${i};\n`);
  js += `export const __esModule = exports.__esModule;\n`; // unused
  js += `export const __es_lif_cjs = true;\n`;
  js += `export default exports;\n`;
  return js;
}

function mjs_import_mjs(export_default, path){
  let _path = json(path);
  let js = `export * from ${_path};\n`;
  if (export_default)
    js += `export {default} from ${_path};\n`;
  return js;
}

function pkg_alt_get(pkg, file){
  let ext = _path_ext(file);
  // this can cause a bug if imported dir/list.ts which needs
  // dir/list.ts/index.js or dir/list.ts.js loaded
  if (ext && str.is(ext, 'js', 'ts', 'jsx', 'tsx', 'css'))
    return;
  let alt = pkg.lif?.alt || ['.js', '/index.js'];
  if (alt.find(e=>file.endsWith(e)))
    return;
  return alt;
}

let max_redirect = 8;
function assert_lmod(lmod){
  assert(T_lpm_parse(lmod).path=='', 'invalid pkg lmod: '+lmod);
}

async function npm_ver_get({log, lmod}){
  return await ecache({table: lpm_pkg_ver_t, id: lmod, opt: cache_opt},
    async function run(pv)
{
  D && console.log('npm_ver_get '+lmod);
  pv.lmod = lmod;
  pv.log = log;
  let ver_file = pv.lmod+'/--ver';
  let get = await reg_get({log, lmod: ver_file});
  if (get.not_exist)
    return get;
  if (get.err)
    throw get.err;
  try {
    pv.pkg_ver = JSON.parse(get.body);
    pv.src_ver = get.src_ver;
    return pv;
  } catch(err){
    throw Error('invalid package.json parse '+ver_file);
  }
}); }

async function npm_ver_resolve({log, lmod}){
  let u = T_lpm_parse(lmod);
  assert(!lpm_ver_final(u));
  assert(u.reg=='npm');
  let pv = await npm_ver_get({log, lmod: u.reg+'/'+u.name});
  if (pv.not_exist)
    return pv;
  let ver = npm_ver_lookup({pkg_ver: pv.pkg_ver, date: lpm_app_date,
    range: u.ver.slice(1)});
  if (!ver)
    throw Error('failed lmod '+u.lmod+' getting pkg_ver list');
  u.ver = '@'+ver;
  return T_lpm_str(u);
}

async function git_ver_resolve({log, lmod}){
  return await ecache({table: lpm_pkg_ver_t, id: lmod, opt: cache_opt},
    async function run(pv)
{
  let u = T_lpm_parse(lmod);
  let url, v;
  // XXX add support for getting branch+date lpm_app_date
  let _ver = u.ver.slice(1);
  let is_c = cache_enable>=1;
  if (!u.ver || _ver=='latest')
    url = `https://api.github.com/repos/${u.name}/commits/HEAD`;
  else if (str.is(u.ver_type, 'final_commitish',  'final')){
    url = `https://api.github.com/repos/${u.name}/commits/${_ver}`;
    if (is_c && (v=await cache_get('lpm_ver', [lmod]))){
      u.ver = v.ver;
      return T_lpm_str(u);
    }
  } else if (u.ver_type=='tag')
    url = `https://api.github.com/repos/${u.name}/commits/${_ver}`;
  else if (u.ver_type=='semver'){
    // XXX need proper semver handling
    let semver = _ver.replace(/^.*semver:[=^~]?/, '');
    url = `https://api.github.com/repos/${u.name}/commits/v${semver}`;
  } else
    assert(0, 'invalid ver_type');
  let reg = await reg_http_get({log, url});
  if (reg.not_exist)
    return reg;
  if (!reg.blob)
    throw 'failed git ver fetch '+url;
  let body = await reg.blob.text();
  try {
    v = JSON.parse(body);
  } catch(err){
    throw Error('git '+url+' invalid JSON: '+err);
  }
  let sha = v.sha;
  if (sha.length!=40 && sha.length!=64)
    throw Error('git '+url+' sha invalid: '+sha);
  u.ver = '@'+sha;
  if (is_c && str.is(u.ver_type, 'final_commitish', 'final'))
    cache_set('lpm_ver', {lmod, ver: u.ver});
  return T_lpm_str(u);
}); }

async function lpm_ver_resolve({log, lmod}){
  let u = lpm_parse(lmod);
  let v;
  if (u.reg=='npm'){
    if (u.ver_type=='final')
      return;
    v = await npm_ver_resolve({log, lmod});
  } else if (u.reg=='git'){
    if (u.ver_type=='final')
      return;
    v = await git_ver_resolve({log, lmod});
  } else
    return;
  if (v.not_exist){
    console.error('pkg not found: '+lmod);
    return v;
  }
  D && console.log('redirect ver '+lmod+' -> '+v);
  return {redirect: v};
}

// http://localhost:3001/.lif/local/lif-os//public/Program%20Files/Xterm.js/xterm.css
async function lpm_file_get({log, lmod}){
  let is_c = cache_lmod(lmod);
  let opt = is_c ? {} : cache_opt;
  return await ecache({table: lpm_file_t, id: lmod, opt},
    async function run(lpm_file)
{
  D && console.log('lpm_file_get', lmod);
  let f = is_c && await cache_get('lpm_file', [lmod]);
  if (f)
    return f;
  lpm_file.lmod = lmod;
  lpm_file.log = log;
  let reg = await reg_get({log, lmod, opt});
  lpm_file.reg = reg; // for logging
  lpm_file.url = reg.url; // for logging
  if (reg.err)
    return reg;
  if (reg.not_exist){
    f = {lmod, not_exist: true};
    is_c && cache_set('lpm_file', f);
    return f;
  }
  // create result lpm file, and cache it
  lpm_file.blob = reg.blob;
  lpm_file.body = reg.body;
  let h_body = sha256_hex(lpm_file.body);
  is_c && cache_set('lpm_file', {lmod, body: lpm_file.body, blob: lpm_file.blob,
    h_body, url: lpm_file.url});
  return lpm_file;
}); }

async function lpm_file_get_alt({log, lmod, alt}){
  // fetch the file
  let first;
  alt = ['', ...(alt||[])];
  for (let a of alt){
    let f = await lpm_file_get({log, lmod: lmod+a});
    first ||= f;
    f = {...f};
    f.alt = a;
    if (f.not_exist)
      continue;
    if (!f.err)
      return f;
    if (f.err)
      throw Error('fetch failed '+lmod+' '+(f.url||''));
  }
  console.error('module('+log.mod+(alt.length>1 ? ' alt '+alt.join(' ') : '')+
    ') failed fetch not exist '+lmod);
  return first; // not_exist
}

// http://localhost:3001/.lif/local/lif-os//public/Program%20Files/Xterm.js/xterm.css
async function lpm_file_get_follow({log, lmod, lpm_pkg, alt}){
  D && console.log('lpm_file_get_follow', lmod);
  let pkg;
  let f = {lmod, lpm_pkg, log};
  pkg = f.pkg = lpm_pkg.pkg;
  lpm_pkg.log ||= log;
  if (lpm_pkg.redirect)
    return OA(f, {redirect: lpm_pkg.redirect+T_lpm_parse(lmod).path});
  let path = T_lpm_parse(lmod).path;
  let _path = pkg_exports_lookup(pkg, '.'+path);
  if (_path && _path!='.'+path){
    let _uri;
    if (_path[0]=='.')
      _uri = T_lpm_lmod(lmod)+_path.slice(1);
    else
      _uri = T_npm_to_lpm(_path);
    D && console.log('redirect export '+lmod+' -> '+_uri);
    return OA(f, {redirect: _uri});
  }
  if (alt)
    alt = pkg_alt_get(pkg, lmod);
  let f_get = await lpm_file_get_alt({log, lmod, alt});
  f.f_get = f_get; // for logging
  if (f_get.not_exist)
    return f_get;
  if (f_get.alt){
    D && console.log('redirect alt '+lmod+' -> '+f_get.alt);
    return OA(f, {redirect: lmod+f_get.alt});
  }
  f.blob = f_get.blob;
  f.body = f_get.body;
  f.h_body = f_get.h_body;
  f.url = f_get.url; // for logging
  f.cache = f_get.cache;
  return f;
}

function lpm_patch_pkg_json(lpm_pkg){
  // handle {lif: {patches: {"mod": {"./package.json": {diff}}}}}
  let u = T_lpm_parse(lpm_pkg.lmod);
  u.ver = '';
  let lmod_no_ver = T_lpm_str(u);
  let u_self = T_lpm_parse(lpm_pkg.lmod);
  let patch, patch_p;
  for (let p = lpm_pkg.parent; p; p = p.parent){
    let mods;
    if (!(mods=p.pkg.lif?.patches))
      continue;
    let files;
    for (let [mod, _files] of OE(mods)){
      let lmod = npm_to_lpm(mod);
      if (lmod==lpm_pkg.lmod || lmod==lmod_no_ver){
        files = _files;
        break;
      }
    }
    if (!files)
      continue;
    let v;
    if (!(v=files['./package.json']))
      continue;
    patch = v;
    patch_p = p;
  }
  if (!patch)
    return;
  lpm_pkg.pkg_orig = lpm_pkg.pkg;
  let pkg = patch_json(json_cp(lpm_pkg.pkg), patch);
  if (!pkg){
    console.error('failed patch_json '+lpm_pkg.lmod+' by '+patch_p.lmod,
      patch);
    return;
  }
  lpm_pkg.pkg = pkg;
}

let allow_no_package_json = true;
async function lpm_pkg_get({log, lmod, mod_self}){
  let is_c = cache_lmod(lmod);
  // let opt = is_c || lmod=='local/.lif.boot/' ? {} : cache_opt;
  let opt; // lpm_pkg cleared upon every page load
  return await ecache({table: lpm_pkg_t, id: lmod, opt},
    async function run(lpm_pkg)
{
  D && console.log('lpm_pkg_get', lmod, mod_self);
  lpm_pkg.lmod = lmod;
  assert_lmod(lmod);
  let lpm_self;
  if (mod_self){
    assert_lmod(mod_self);
    lpm_self = lpm_pkg_t[mod_self];
  }
  if (!lpm_self)
    lpm_self = lpm_pkg_app || lpm_pkg_root;
  assert(lpm_self, 'module('+lmod+') req before app set');
  // add to tree
  for (let p=lpm_self; p; p = p.parent)
    assert(lpm_pkg!=lpm_self, 'cyclic lpm_self');
  lpm_pkg.parent = lpm_self;
  lpm_self.child.push(lpm_pkg);
  lpm_pkg.child = [];
  lpm_pkg.log = log;
  lpm_pkg.parent_mod = mod_self;
  // resolve ver
  let ver = await lpm_ver_resolve({log, lmod});
  if (ver){
    if (ver.redirect)
      D && console.log('lpm_pkg_get '+lmod+' -> '+ver.redirect);
    if (ver.not_exist)
      console.error('lpm_pkg_get '+lmod+' ver not exist');
    return OA(lpm_pkg, ver);
  }
  // fetch pkg
  let pkg_json = lmod+'/package.json';
  let f = await lpm_file_get({log, lmod: pkg_json});
  if (f.not_exist){
    let u = lpm_parse(lmod);
    if (u.reg!='git' || u.submod || u.ver_type!='final' ||
      !allow_no_package_json)
    {
      lpm_pkg.not_exist = f.not_exist;
      console.error('lpm_pkg_get('+pkg_json+') not found');
      return lpm_pkg;
    }
    let v = await git_ver_resolve({log, lmod});
    if (!v){
      lpm_pkg.not_exist = true;
      console.error('lpm_pkg_get('+lmod+' raw) not found');
      return lpm_pkg;
    }
    console.warn('using raw package without package.json');
    // minimal valid package.json
    f = {body: json({name: u.name.replaceAll('/', '-')})};
  }
  if (f.err)
    throw f.err;
  lpm_pkg.blob = f.blob;
  lpm_pkg.body = f.body;
  lpm_pkg._body = f.body;
  try {
    lpm_pkg.pkg = JSON.parse(lpm_pkg.body);
  } catch(err){
    throw Error('lmod('+pkg_json+') invalid JSON: '+err);
    lpm_pkg.pkg = {};
    console.log('failed parse package.json', pkg_json);
  }
  // check for package.json overrides
  lpm_patch_pkg_json(lpm_pkg);
  return lpm_pkg;
}); }

let local_dev_redirect_t = {
  'git/github.com/lif-zone/lif-coin@latest': 'local/lif-coin/',
  'git/github.com/lif-zone/lif-kernel@latest': 'local/lif-kernel/',
  'git/github.com/lif-zone/lif-os@latest': 'local/lif-os/',
  'git/github.com/lif-zone/lif-net@latest': 'local/lif-net/',
};
let local_dev_enable;
if (local_dev_enable)
  console.log('local dev enabled');
function lpm_local_dev_redirect(imp){
  if (!local_dev_enable || !imp)
    return imp;
  let v;
  for (let [from, to] of OE(local_dev_redirect_t)){
    if (v = path_starts(imp, from)){
      let _imp = to+v.rest;
      console.log('local dev redirect', imp, '->', _imp);
      return _imp;
    }
  }
  return imp;
}

// npm/lif-os/basic.js:
// import 'npm/components/file.js'
// lpm_pkg_resolve:
// - if mod_self:
//   - name check vs base:
//     - same name & ver: npm/react@1.2.3 part of mod_self: npm/react@1.2.3
//       FINAL: load pkg npm/react@1.2.3
//       no need to resolve. can just load package
//     - same name: local/lif-os/ part of mod_self: local/lif-os/
//       FINAL: load pkg local/lif-os/
//       no need to resolve. can just load package
//     - ver complete: npm/react part of mod_self: npm/react@1.2.3
//       -> redir to @1.2.3
//   - load mod_self npm/lif-os -> local/lif-os/
//   - is lif-os/basic in mod_self pkg dependencies?
// - is lif-os/basic in app_main and root? (local/lif-os/)
// Example imp scheduler from react-dom@18.3.1:
// - not same base name
// - check local/--boot/ - not there
// - load npm/react-dom@18.3.1 pkg. find dep scheduler, return redirect to
//   scheduler@0.23.2
// Example imp npm/components from npm/lif-os (-> local/lif-os)
// - not same base name
// - check local/--boot/ - found dep (should be forceDependencies):
//   npm/lif-os -> local/lif-of/
// - load npm/lif-os --> need to get to local/lif-os/
// - check componenets in local/lif-of/package.json
async function lpm_pkg_resolve({log, imp, mod_self}){
  D && console.log('lpm_pkg_resolve', imp, mod_self);
  assert_lmod(imp);
  let lmod_self, lpm_self;
  if (mod_self){
    lmod_self = T_lpm_lmod(mod_self);
    // same module, empty ver and base completes it? use base to complete ver
    let _imp = lpm_ver_from_base(imp, lmod_self);
    if (_imp && _imp!=imp)
      return {redirect: _imp};
    // different modules: load pkg, and lookup imports.
    lpm_self = await lpm_pkg_resolve({log, imp: lmod_self});
    if (lpm_self.not_exist)
      return {not_exist: true};
    // same package?
    if (lmod_self==imp)
      return lpm_self;
  } else
    lpm_self = lpm_pkg_app || lpm_pkg_root;
  // lookup for imports in parent
  let _imp = lpm_import_lookup({lpm_pkg: lpm_self, imp});
  let lmod = _imp || imp;
  // load the module, even if redirect later, so its loaded with mod_self
  let lpm_pkg = await lpm_pkg_get({log, lmod: T_lpm_lmod(lmod),
    mod_self: lpm_self.lmod});
  // local dev: allow to force modules to load from local
  if (local_dev_enable)
    _imp = lpm_local_dev_redirect(_imp);
  // located import, and it got changed
  if (_imp && _imp!=imp)
    return {redirect: _imp};
  return lpm_pkg;
}

async function lpm_import_get({log, imp, lmod_self}){
  D && console.log('lpm_import_get', imp, lmod_self);
  let lpm_pkg = await lpm_pkg_resolve({log, imp: lmod_self});
  if (lpm_pkg.not_exist)
    return lpm_pkg;
  if (lpm_pkg.redirect)
    throw Error('lpm_import_get redirect: '+lmod_self+' -> '+lpm_pkg.redirect);
  let v;
  if (lpm_pkg.pkg.name && (v=path_starts(imp, lpm_pkg.pkg.name)))
    return {redirect: lmod_self+v.rest};
  let lmod = T_npm_to_lpm(imp);
  let _imp = lpm_import_lookup({lpm_pkg, imp: lmod});
  if (!_imp)
    _imp = lmod;
  let ver = await lpm_ver_resolve({log, lmod: _imp, mod_self: lmod_self});
  if (ver){
    if (ver.not_exist){
      console.error('import('+lpm_pkg.lmod+') missing: '+imp);
      return {error: 'missing import'};
    }
    D && console.log('lpm_import_get '+imp+' -> '+ver.redirect);
    _imp = ver.redirect;
  }
  // lpm_pkg_resolve() needed for connecting lmod_self<->imp in module list
  let res = await lpm_pkg_resolve({log, imp: T_lpm_lmod(_imp),
    mod_self: lmod_self});
  if (res.not_found)
    return res;
  return {redirect: _imp};
}

async function lpm_file_resolve({log, imp, alt}){
  D && console.log('lpm_file_resolve', imp);
  let path = T_lpm_parse(imp).path;
  let lpm_pkg = await lpm_pkg_resolve({log, imp: T_lpm_lmod(imp)});
  if (lpm_pkg.not_exist)
    return {not_exist: true};
  if (lpm_pkg.redirect)
    return {redirect: lpm_pkg.redirect+path};
  let lmod = lpm_pkg.lmod+path;
  let lpm_file = await lpm_file_get_follow({log, lmod, lpm_pkg, alt});
  return lpm_file;
}

async function lpm_pkg_resolve_follow({log, imp}){
  try {
    let _imp = imp, lpm_pkg;
    for (; imp;){
      lpm_pkg = await lpm_pkg_resolve({log, imp});
      if (lpm_pkg.not_exist)
        return lpm_pkg;
      if (!(imp = lpm_pkg.redirect))
        return lpm_pkg;
    }
    return lpm_pkg;
  } catch(err){
    console.error(err);
    throw err;
  }
}

async function lpm_file_resolve_follow({log, imp, alt, follow}){
  D && console.log('lpm_file_resolve_follow '+imp);
  let res = {};
  for (let i=0; i<max_redirect; i++){
    let f = await lpm_file_resolve({log, imp, alt});
    if (f.not_exist){
      res.not_exist = f.not_exist; // can have both redirect+not_exist
      return res;
    }
    if (f.redirect){
      if (!follow)
        return {redirect: f.redirect};
      res.redirect = f.redirect;
      res.redirects ||= [];
      res.redirects.push(f.redirect);
      imp = f.redirect;
      continue;
    }
    if (res.redirects){
      res.redirect_file = f;
      return res;
    }
    return f;
  }
  return {not_exist: true, err: 'max redirects'};
}

let coi_set_headers = h=>{
  // COI: Cross-Origin-Isolation, required for SharedArrayBuffer
  h['cross-origin-embedder-policy'] = 'require-corp';
  h['cross-origin-opener-policy'] = 'same-origin';
};

// fetch event.request.destination strings:
// audio, audioworklet, document, embed, fencedframe, font, frame, iframe,
// image, json, manifest, object, paintworklet, report, script,
// sharedworker, style, track, video, worker, xslt
function response_send({body, ext, cache}){
  let v, opt = {}, ctype = ctype_get(ext), h = {};
  if (!ctype){
    D && Donce('ext '+ext, ()=>console.log('no ctype for '+ext));
    ctype = ctype_get('text');
  }
  h['content-type'] = ctype.ctype;
  // added 'immutable' - but did not seem to assist in caching
  h['cache-control'] = cache ? 'public, max-age=31536000' : 'no-cache';
  if (cache){
    h['etag'] = 'fixed-etag'; // XXX put sha256
    // these two are probably useless
    h['date'] = new Date().toUTCString();
    h['last-modified'] = 'Sat, 01 Jan 2000 00:00:00 GMT';
  }
  coi_set_headers(h);
  opt.headers = new Headers(h);
  return new Response(body, opt);
}

let cache_store = {
  // performance - loading lif-os from git, in linux:
  // cache-store 1st   2nd    3rd
  // enable      14.2s 8s     5.7s
  // disable     24s   10.5s  8s
  enable: cache_enable,
  inited: 0,
  cache: null,
};

async function cache_store_init(){
  let cs = cache_store;
  if (!cs.enable || cs.inited)
    return;
  cs.cache = await g_caches.open('lif-cache-v'+cache_ver);
  cs.inited = true;
}
await cache_store_init();

async function cache_store_get(request){
  let cs = cache_store;
  if (!cs.enable || request.method!='GET')
    return;
  let response = await cs.cache.match(request);
  if (!response)
    return;
  D && console.log('cache_store hit', request.url);
  return response;
}

async function cache_store_set(request, response){
  let cs = cache_store;
  if (!cs.enable || request.method!='GET')
    return;
  if (!response.headers.get('etag'))
    return;
  D && console.log('cache_store set', request.url);
  await cs.cache.put(request, response.clone());
  return response;
}

function lpm_redirect({f, qs, lmod}){
  let q = new URLSearchParams(qs);
  let l = lpm_parse(f.redirect);
  if (f.q){
    for (let [k, v] of OE(f.q))
      q.set(k, v);
  }
  let redirect = qs_append('/.lif/'+f.redirect, q);
  D && console.log('lpm_redirect '+lmod+' -> '+f.redirect, qs+' -> '+q);
  return {redirect};
}

function passthrough_lmod({pkg, lmod}){
  return; // XXX is this needed?
  // quick hack for lif-kernel/boot.js lif-kernel/util.js to not use /.lif/
  // URL to avoid them double loading:
  // http://localhost:3000/lif-kernel/boot.js
  // http://localhost:3000/.lif/http/localhost:3000/lif-kernel//boot.js
  let pass = pkg.lif?.passthrough;
  if (!pass)
    return;
  let u = lpm_parse(lmod);
  if (!str.is(u.reg, 'local', 'http', 'https'))
    return;
  let pass_url = lpm_to_sw_passthrough(lmod);
  let file = u.path.slice(1);
  let v;
  for (let p of pass){
    while (v=str.starts(p, './'))
      p = v.rest;
    if (p==file)
      return pass_url;
  }
}

async function tr_tsx_to_js_cache({tsx, type, h_tsx}){
  h_tsx ||= sha256_hex(tsx);
  let c = await cache_get('tsx_to_js', [h_tsx]);
  if (c && c?.type[type])
    return {js: c.js, h_js: c.h_js};
  let js = tr_tsx_to_js({tsx, type});
  let h_js = sha256_hex(js);
  let _type = c?.type && c.js==js ? c.type : {};
  _type[type] = true;
  cache_set('tsx_to_js', {type: _type, h_tsx, js, h_js}); // bg - no need to await
  return {js, h_js};
}

async function file_tsx_to_js(f){
  if (f.js)
    return f.js;
  let type = _path_ext(f.lmod);
  let path = T_lpm_parse(f.lmod).path;
  let v;
  if (v=pkg_transform_type(f.lpm_pkg.pkg, path))
    type = v;
  if (str.is(type, 'jsx', 'ts', 'tsx')){
    ({js: f.js, h_js: f.h_js} = await tr_tsx_to_js_cache({
      tsx: f.body, h_tsx: f.h_body, type}));
  } else {
    f.js = f.body;
    f.h_js = f.h_body;
  }
  return f.js;
}

async function file_js_to_meta(f){
  if (f.meta)
    return f.meta;
  if (f.js.err)
    return f.meta = {err: f.js.err};
  let h_js = f.h_js || sha256_hex(f.js);
  let meta = await cache_get('js_to_meta', [h_js]);
  if (meta)
    return f.meta = meta;
  f.meta = tr_js_to_meta(f.js);
  cache_set('js_to_meta', {h_js, ...f.meta}); // bg - no need for await
  return f.meta;
}

async function responce_tr_send({f, qs, lmod}){
  if (f.not_exist)
    return {not_exist: true};
  let ext = _path_ext(lmod);
  let q = new URLSearchParams(qs);
  if (f.redirect){
    if (!f.redirect_file)
      return lpm_redirect({f, qs, lmod});
    if (q.has('mjs')){
      q.delete('mjs');
      q.set('imp', '');
    }
    lmod = f.redirect;
    f = f.redirect_file;
  }
  if (!q.has('mjs') && !q.has('imp') && !q.has('cjs') && !q.has('amd'))
    return {body: f.blob, ext, cache: 1};
  // XXX add tr import "mod?type=json" with {type: "json"} for json/css/text
  if (str.is(ext, 'json', 'css', 'wasm', 'text'))
    return {body: f.blob, ext, cache: 1};
  ext = 'js';
  let v;
  let js = await file_tsx_to_js(f);
  let meta = await file_js_to_meta(f);
  if (meta.err)
    return {body: f.blob, ext, err: 'meta err: '+meta.err};
  // XXX is passthrough for /lif-kernel/boot.js still needed?
  if (v=passthrough_lmod({pkg: f.lpm_pkg.pkg, lmod}))
    return {body: mjs_import_mjs(meta.export_default, v), ext};
  let type = meta.type;
  let worker = q.has('worker');
  // mjs - mjs importing an mjs module
  // cjs - mjs importing a cjs module
  // amd - mjs importing an amd module
  // imp - mjs importing an mjs/cjs/amd module
  //       a middle re-export module to solve 302 double import
  if (q.has('mjs')){
    if (type=='cjs')
      return {body: mjs_import_cjs('/.lif/'+lmod, q), ext};
    if (type=='amd')
      return {body: mjs_import_amd('/.lif/'+lmod, q), ext};
    return {body: file_tr_mjs(f, {worker}), ext, cache: 1};
  }
  if (q.has('imp') && (type=='mjs' || !type)){
    return {body: mjs_import_mjs(meta.export_default,
      '/.lif/'+lmod+'?mjs'+(worker?'&worker':'')), ext, cache: 1};
  }
  if (q.has('cjs') || (q.has('imp') && type=='cjs'))
    return {body: mjs_import_cjs('/.lif/'+lmod, q), ext};
  if (q.has('amd') || (q.has('imp') && type=='amd'))
    return {body: mjs_import_amd('/.lif/'+lmod, q), ext};
  throw Error('invalid lpm file type '+type+' '+lmod+' '+qs);
  return {err: 'invalid lpm file type '+type+' '+lmod+' '+qs};
}

let enable_follow = true;
async function fetch_lpm_follow({log, imp, qs, follow}){
  let v, f, redirect, _imp = imp;
  let q = new URLSearchParams(qs);
  let u = T_lpm_parse(imp);
  let alt = q.has('imp') || q.has('mjs') || q.has('meta');
  if (v=str.starts(u.path, '/.lif.imp/')){
    f = await lpm_import_get({log, lmod_self: u.lmod, imp: v.rest});
    if (!follow || !f.redirect)
      return f;
    imp = redirect = f.redirect;
  }
  f = await lpm_file_resolve_follow({log, imp, alt, follow});
  if (redirect && !f.redirect)
    return {redirect_file: f, redirect};
  return f;
}

// meta is used for cjs
async function fetch_lpm_meta({log, imp}){
  let f = await fetch_lpm_follow({log, imp, qs: '?meta', follow: enable_follow});
  if (f.redirect)
    f.redirect = '/.lif/'+f.redirect;
  if (f.not_exist || (f.redirect && !f.redirect_file))
    return f;
  let _f = f.redirect ? f.redirect_file : f;
  let type = file_ctype(_f.lmod);
  if (type!='js')
    return {type};
  await file_tsx_to_js(_f);
  let meta = await file_js_to_meta(_f);
  if (f.redirect)
    return {redirect: f.redirect, redirects: f.redirects, redirect_file: meta};
  return {meta, cache: 1};
}

async function fetch_lpm_meta_res({log, imp}){
  let f = await fetch_lpm_meta({log, imp});
  let res = {ext: 'json'};
  if (f.meta)
    res.body = json(f.meta);
  else
    res.body = json(f);
  res.cache = f.cache;
  return res;
}

async function fetch_lpm_file({log, imp, qs}){
  let f = await fetch_lpm_follow({log, imp, qs, follow: enable_follow});
  return await responce_tr_send({f, qs, lmod: imp});
}

function response_redirect({redirect, cache}){
  return Response.redirect(redirect);
}

async function send_res({err, not_exist, redirect, body, ext, path, cache}){
  if (err && body==undefined){
    console.error('req '+path+': '+err);
    return new Response(''+err, {status: 500, statusText: ''+err});
  }
  if (not_exist){
    console.error('not found: '+path);
    return new Response('not found', {status: 404, statusText: 'not found'});
  }
  let v;
  if (cache)
    cache = (v=str.starts(path, '/.lif/')) && cache_lmod(v.rest);
  if (redirect)
    return response_redirect({redirect, cache});
  if (body)
    return response_send({body, ext, cache});
  throw Error('invalid fetch_lpm response');
}

function fetch_request_document(request){
  if (request.destination!='document')
    return request;
  const headers = new Headers(request.headers);
  headers.set("lif-dest", 'document');
  return new Request(request, {headers});
}

async function fetch_pass(request, type){
  g_stats.fetch.pass++;
  let url = request.url;
  let slow = eslow('fetch_pass');
  try {
    D && console.log('fetch '+type+': '+url);
    return await fetch(request); // type=='external' ? {mode: 'no-cors'} : {}
  } catch(err){
    console.log('failed ext fetch_pass '+type+' '+url+': '+err);
    return new Response(''+err, {status: 500, statusText: ''+err});
  } finally {
    slow.end();
  }
}

function modules_list(path){
  let res = {};
  if (lpm_pkg_app)
    res.app_id = lpm_pkg_app.id;
  if (lpm_pkg_root)
    res.root_id = lpm_pkg_root.id;
  res.root = {};
  add(res.root, lpm_pkg_root.child);
  let lpm_self = lpm_pkg_app || lpm_pkg_root;
  function add(res, root){
    for (let pkg of OV(root)){
      res[pkg.id] = {};
      add(res[pkg.id], pkg.child);
    }
  }
  console.log(res);
  return send_res({body: json(res), ext: 'json', path});
}

let g_stats = {
  fetch: {
    all: 0,
    lif: 0,
    pass: 0,
  },
};
async function _kernel_fetch(event){
  let {request, request: {url}} = event;
  let u = T_url_parse(url);
  let ref = request.headers.get('referer');
  let external = u.origin!=location.origin;
  let path = uri_dec(u.path);
  let qs = u.search;
  let q = u.searchParams;
  let ext = _path_ext(path);
  let log = {
    mod: url+(ref && ref!=u.origin+'/' ? ' ref '+ref : ''),
    imp: url,
  };
  let is_reload = str.is(request.cache, 'no-cache', 'reload') ||
    request.mode=='navigate';
  let is_doc = str.is(request.destination, 'document', 'iframe', 'frame');
  D && console.log('sw '+log.mod);
  // external and non GET requests
  g_stats.fetch.all++;
  if (external)
    return fetch_pass(request, 'external');
  if (request.method!='GET' && request.method!='HEAD')
    return fetch_pass(request, 'non-get');
  g_stats.fetch.lif++;
  log.imp = path;
  // chrome linux: F5 gives cache==no-cache for root document only.
  //   URL Enter: cache==default
  // chrome win: F5 and Enter give cache==reload, for all resources in page,
  //   not just root document.
  // so use mode==navigate and destination==document/iframe to limit refresh to
  // root document only.
  if (str.is(request.cache, 'no-cache', 'reload') &&
    (request.mode=='navigate' || is_doc))
  { 
    console.log('cache_refresh', request.cache, request.mode, 
      request.destination, url);
    cache_refresh();
  }
  // LIF+local GET requests
  // LIF requests
  let v;
  if (path=='/.lif/cache_clear'){ // clear cache command
    db_delete();
    return send_res({body: json({ok: true, msg: 'cache cleared'}),
      ext: 'json', path});
  }
  if (path=='/.lif/modules') // show modules
    return modules_list(path);
  if (v=str.starts(path, '/.lif/')){
    if (!lpm_pkg_app)
      return send_res({err: 'no webapp while loading', path});
    let lmod = v.rest;
    log.imp = lmod;
    let response = await cache_store_get(request);
    if (response)
      return response;
    let res;
    if (q.has('meta'))
      res = await fetch_lpm_meta_res({log, imp: lmod, qs});
    else
      res = await fetch_lpm_file({log, imp: lmod, qs});
    if (res.err)
      console.error('req '+url+': '+res.err);
    response = await send_res({...res, path});
    if (res.cache)
      await cache_store_set(request, response);
    return response;
  }
  if (is_doc){
    // XXX add support for handling SPA: if (!is_reload) return spa_cache();
    // pkg.lif?.spa && str.is(request.destination, 'document', 'iframe')
    // for serve: const des = req.headers['sec-fetch-dest']=='docunment;
    // pkg.lif?.spa && str.is(dest, 'document', 'iframe')
    return await fetch(fetch_request_document(request));
  }
  // lif-kernel passthrough for local dev
  if (path_starts(url, lif_kernel_base))
    return await fetch(request);
  // local requests
  let _path;
  if (!lpm_pkg_app || !lpm_pkg_app.pkg)
    console.info('req before lpm_pkg_app init '+path);
  else if (_path = pkg_web_exports_lookup(lpm_pkg_app.pkg, '.'+path)){
    if (_path.startsWith('./')){
      _path = '/.lif/'+lpm_app+_path.slice(1);
      D && console.log('redirect '+path+' -> '+_path);
      return Response.redirect(_path);
    }
    let lmod = T_npm_to_lpm(_path);
    return Response.redirect('/.lif/'+lmod);
  }
  D && console.log('req default', url);
  let response = await fetch(request);
  let h = Object.fromEntries(response.headers.entries());
  coi_set_headers(h);
  let headers = new Headers(h);
  return new Response(response.body,
    {headers, status: response.status, statusText: response.statusText});
}

async function kernel_fetch(event){
  let slow;
  try {
    slow = eslow(15000, '_kernel_fetch '+event.request.url);
    let res = await _kernel_fetch(event);
    slow.end();
    return res;
  } catch(err){
    console.error('kernel_fetch err', err);
    slow.end();
    return new Response(''+err, {status: 500, statusText: ''+err});
  }
}

function test_kernel(){
  let t, pkg;
  t = (lpm_ver, v)=>assert_eq(v, gh_ver(lpm_ver));
  t('', '');
  t('@', '@');
  t('@1.2.3', '@1.2.3');
  t('@semver:=1.2.3', '@=1.2.3');
  0 && t('@^147a849fbc1', '@147a849fbc1'); // XXX git ^commitid
  let lpm_pkg = {lmod: 'npm/self@1.2.3',
    pkg: {lif: {
      dependencies: {
        mod: '/MOD',
        mod2: '.lif/local/MOD/',
        http1: 'http://localhost:3000/MOD',
        http2: '.lif/http/localhost:3000/MOD/',
        react: '18.3.1',
        reactok: 'npm:react@18.3.1',
        reactbad: 'react@18.3.1', // currently not supported in NPM
        dir: './DIR',
        GIT: 'git://github.com/user/repo@v1',
        over: '99.9.9',
        glob2: '99.9.9',
        optional: '1.0.1',
      },
      peerDependencies: {
        peer: '>=1.0.0',
        gpeer: '99.9.9',
        gpeerdev: '96.9.9',
        gpeer2: '14.0.1',
      },
      devDependencies: {
        dev: '2.0.0',
        gpeerdev: '97.9.9',
        gmod: '99.9.9',
      },
      optionalDependencies: {
        glob2: '14.0.0',
        optional: '1.0.0',
      },
      overrides: {
        gmod: '21.0.0',
        glob2: '15.0.0',
      },
    }},
    parent: {lmod: 'npm/par',
      pkg: {
        dependencies: {
          peer: '1.1.1',
          gparent: '99.9.9',
          gparent2: '99.9.9',
          gpeer: '13.0.1',
          gpeerdev: '13.0.1',
        },
        overrides: {
          over: '18.0.0',
          glob2: '99.9.9',
          gparent: '22.0.0',
        },
      },
    },
  };
  t = (imp, v)=>{
    lpm_in_test(1);
    assert_eq(v, lpm_import_lookup({lpm_pkg, imp}));
    lpm_in_test(0);
  };
  t('npm/self/dir/main.tsx', 'npm/self@1.2.3/dir/main.tsx');
  t('npm/mod/dir/main.tsx', 'local/MOD//dir/main.tsx');
  t('npm/mod2/dir/main.tsx', 'local/MOD//dir/main.tsx');
  t('npm/http1/dir/main.tsx', 'http/localhost:3000/MOD//dir/main.tsx');
  t('npm/http2/dir/main.tsx', 'http/localhost:3000/MOD//dir/main.tsx');
  t('npm/react', 'npm/react@18.3.1');
  t('npm/react@16.3.1', 'npm/react@16.3.1');
  t('npm/react/file.js', 'npm/react@18.3.1/file.js');
  t('npm/reactok', 'npm/react@18.3.1');
  t('npm/reactbad');
  t('local/file', 'local/file');
  t('npm/dir', 'npm/self@1.2.3/DIR');
  t('npm/peer', 'npm/peer@1.1.1');
  t('npm/gmod', 'npm/gmod@21.0.0');
  t('npm/gparent', 'npm/gparent@22.0.0');
  t('npm/gparent2', 'npm/gparent2@99.9.9');
  t('npm/gpeer', 'npm/gpeer@13.0.1');
  t('npm/gpeer2', 'npm/gpeer2@14.0.1');
  t('npm/optional', 'npm/optional@1.0.0');
  t('npm/glob2', 'npm/glob2@15.0.0');
  t('npm/gpeerdev', 'npm/gpeerdev@13.0.1');
  t('npm/GIT/dir/file', 'git/github.com/user/repo@v1/dir/file');
  t('git/github.com/user/repo@vX', 'git/github.com/user/repo@vX');
  t = (pkg, imp, v)=>assert_eq(v, lpm_import_lookup({lpm_pkg: {pkg}, imp}));
  t({dependencies: {'lif-kernel': '/lif-kernel'}}, 'npm/lif-kernel/util.js',
    'local/lif-kernel//util.js');
  t = (file, alt, v)=>assert_obj_f(v, pkg_alt_get({lif: {alt}}, file));
  t('a/file.js', undefined, undefined);
  t('a/file', undefined, ['.js']);
  t('a/file.ts', undefined, undefined);
  t('a/file', ['.js'], ['.js']);
  t('a/file', ['.xjs', '.js'], ['.xjs', '.js']);
  t('a/file.xjs', ['.xjs', '.js'], undefined);
  t('a/file.ico', ['.xjs'], ['.xjs']);
  t('a/file.abcxyz', ['.xjs'], ['.xjs']);
  // XXX obsolete comment? check 'package.json' is not modified, even if pkg is null
}
test_kernel();

async function webapp_load({log, webapp}){
  let lmod_webapp = T_npm_to_lpm(webapp);
  let _lpm_app = T_lpm_lmod(lmod_webapp);
  let _lpm_pkg_app;
  let slow = eslow('app_pg lpm_get');
  try {
    _lpm_pkg_app = await lpm_pkg_resolve_follow({log, imp: _lpm_app});
  } catch(err){
    console.error('webapp_load  '+webapp, err);
    return {err};
  } finally {
    slow.end();
  }
  if (_lpm_pkg_app.not_exist){
    console.error('webapp_load not found: '+webapp);
    return {err: 'app not found: '+_lpm_app};
  }
  lpm_app = _lpm_app;
  lpm_pkg_app = _lpm_pkg_app;
  let pkg = lpm_pkg_app.pkg;
  let webapp_f = lpm_parse(lmod_webapp).path.slice(1);
  if (!webapp_f)
    webapp_f = pkg.lif?.webapp||pkg.webapp;
  if (!webapp_f)
    return {ok: true};
  let v;
  while (v=str.starts(webapp_f, './'))
    webapp_f = v.rest;
  let res = {ok: true, webapp: T_lpm_to_npm(_lpm_app+'/'+webapp_f)};
  console.log('webapp_load complete: '+res.webapp);
  return res;
}

async function init_pkg_root(){
}

// builtin nodejs APIs in browser: browserify:
// versions of npm shims
// https://github.com/browserify/browserify/blob/master/package.json
// mappong nodejs npm->browser npm shim
// https://github.com/browserify/browserify/blob/master/lib/builtins.js
let refrash_clear_cache = false;
async function do_app_pkg(boot_pkg){
  boot_pkg = json_cp(boot_pkg);
  let lif = boot_pkg.lif ||= {};
  let lmod_root = 'local/.lif.boot/';
  let log = {lmod: lmod_root};
  // remove previous app setup
  lpm_app = undefined;
  lpm_pkg_app = undefined;
  lpm_app_date = Date.now();
  lpm_pkg_root = undefined;
  lpm_pkg_t = {};
  if (refrash_clear_cache){
    lpm_pkg_ver_t = {};
    lpm_file_t = {};
  }
  // add lif-kernel package
  if (!boot_pkg.overrides?.['lif-kernel'] &&
    !lif.overrides?.['lif-kernel'])
  {
    lif.overrides ||= {};
    // shorten http/localhost:3000/lif-kernel -> local/lif-kernel,
    // so its nicer visually in devtools
    let u = T_url_parse(lif_kernel_base);
    let base = lif_kernel_base;
    if (u.origin==location.origin)
      base = u.path;
    lif.overrides['lif-kernel'] = base;
  }
  // init root pkg
  lpm_pkg_root = await ecache({table: lpm_pkg_t, id: lmod_root},
    async function run(lpm_pkg)
  {
    lpm_pkg.lmod = lmod_root;
    lpm_pkg.pkg = boot_pkg;
    lpm_pkg.child = [];
    return lpm_pkg;
  });
  // load webapp
  let webapp = lif.webapp;
  if (!webapp){
    app_init_wait.return();
    return {ok: true};
  }
  let res = await webapp_load({log, webapp});
  app_init_wait.return();
  return res;
}

function do_kernel_stats(){
  return g_stats;
}

function do_ipc_fetch_init(fetch_init){
  // XXX implement per-tab/boot.js a sab connections with a loop to handle
  // sync ipc via ipc_fetch.js:ipc_fetch_init
}

let boot_chan;
export function boot(sw_boot){
  ({lif_kernel_base, local_dev_enable} = sw_boot);
  boot_chan = new ipc_postmessage();
  boot_chan.method('version', ()=>({version: lif_version}));
  boot_chan.method('app_pkg', async(arg)=>await do_app_pkg(arg));
  boot_chan.method('kernel_stats', ()=>do_kernel_stats());
  boot_chan.method('ipc_fetch_init', fetch_init=>do_ipc_fetch_init(fetch_init));
  sw_boot.on_message = event=>{
    if (boot_chan.accept(event))
      return;
  };
  sw_boot.on_fetch = event=>kernel_fetch(event);
  console.log('lif kernel inited: '+lif_kernel_base
    +' sw '+sw_boot.version+' util '+util.version);
}

