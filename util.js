let util_version = '1.1.8';
let exports = {};
exports.version = util_version;
let D = 0; // Debug

let is_worker = typeof window=='undefined';

// Promise with return() and throw()
const ewait = ()=>{
  let _return, _throw;
  let promise = new Promise((resolve, reject)=>{
    _return = ret=>{ resolve(ret); return ret; };
    _throw = err=>{ reject(err); return err; };
  });
  promise.return = _return;
  promise.throw = _throw;
  promise.catch(err=>{}); // catch un-waited wait() objects. avoid Uncaught in promise
  return promise;
};
exports.ewait = ewait;
const esleep = ms=>{
  let p = ewait();
  setTimeout(()=>p.return(), ms);
  return p;
};
exports.esleep = esleep;

const eslow = (ms, arg)=>{
  eslow.seq ||= 0;
  let seq = eslow.seq++;
  let done, timeout, at_end, enable = 1;
  let p = (async()=>{
    await esleep(ms);
    timeout = true;
    if (!done)
      enable && console.error('slow('+seq+') '+ms+' stuck', ...(arg||[]), p.err);
  })();
  eslow.set.add(p);
  p.now = Date.now();
  p.stack = Error('stack'),
  p.end = ()=>{
    if (at_end)
      return;
    at_end = Date.now();
    eslow.set.delete(p);
    if (timeout && !done)
      enable && console.error('slow completed '+(Date.now()-p.now)+'>'+ms, ...arg);
    done = true;
  };
  p.print = ()=>console.log('slow('+seq+') '+(done?'completed ':'')+ms
    +' passed '+((at_end||Date.now())-p.now), ...(arg||[]));
  return p;
};

let once_obj = {};
let once_set = new Set();
const Donce = (once, fn)=>{
  if (typeof once=='object'){
    if (!once_set.has(once)){
      once_set.add(once);
      return void fn();
    }
  } else if (typeof once=='string'){
    if (!once_obj[once]){
      once_obj[once] = true;
      return void fn();
    }
  } else if (once===true || once===1)
    return void fn();
  else if (once==false || once===0);
  else
    console.error('invalid once', once);
};
exports.Donce = Donce;

eslow.set = new Set();
eslow.print = ()=>{
  console.log('eslow print');
  for (let p of eslow.set)
    p.print();
}
exports.eslow = eslow;
self.esb = eslow;

// shortcuts
const OF = o=>o ? Object.entries(o) : [];
exports.OF = OF;
const OA = Object.assign;
exports.OA = OA;
const TV = (fn, v)=>(function(){ // convert throw Error to value
  try {
    return fn(...arguments);
  } catch(err){
    return v;
  }
});
exports.TV = TV;
const TN = fn=>(function(){ // convert throw Error to null
  try {
    return fn(...arguments);
  } catch(err){
    return null;
  }
});
exports.TN = TN;
const TE_to_null = TN;
exports.TE_to_null = TN;
const TE = fn=>(function(){ // Throw error on false/null/0
  let v = fn(...arguments);
  if (!v)
    throw Error('failed '+fn.name);
  return v;
});
exports.TE = TE;

// str.js
const str = {};
exports.str = str;
str.split_ws = s=>s.split(/\s+/).filter(s=>s);
str.es6_str = args=>{
  var parts = args[0], s = '';
  if (!Array.isArray(parts))
    return parts;
  s += parts[0];
  for (var i = 1; i<parts.length; i++){
    s += args[i];
    s += parts[i];
  }
  return s;
};
str.qw = function(s){
  return str.split_ws(!Array.isArray(s) ? s : str.es6_str(arguments)); };
str.starts = (s, start)=>{
  if (Array.isArray(start)){
    let v;
    for (let i=0; i<start.length && !v; i++)
      v = str.starts(s, start[i]);
    return v;
  }
  if (s.startsWith(start))
    return {start, rest: s.slice(start.length)};
};
str.ends = (s, end)=>{
  if (Array.isArray(end)){
    let v;
    for (let i=0; i<end.length && !v; i++)
      v = str.ends(s, end[i]);
    return v;
  }
  if (s.endsWith(end))
    return {end, rest: s.slice(0, s.length-end.length)};
};
str.is = (s, ...is)=>{
  for (let i=0; i<is.length; i++){
    if (Array.isArray(is[i])){
      if (is[i].includes(s))
        return true;
    }
    else if (is[i]==s)
      return true;
  }
  return false;
};
str.splice = (s, at, len, add)=>s.slice(0, at)+add+s.slice(at+len);
str.diff_pos = (s1, s2)=>{
  if (s1==s2)
    return;
  let i;
  for (i=0; i<s1.length && s1[i]==s2[i]; i++);
  return i;
};

// assert.js
let assert = (ok, exp, res)=>{
  if (ok)
    return;
  console.error('test FAIL: exp', exp, 'res', res);
  debugger; // eslint-disable-line no-debugger
  throw Error('test FAIL');
};
let assert_eq = (exp, res)=>{
  assert(exp===res, exp, res);
};
let assert_objv = (exp, res)=>{
  if (exp===res)
    return;
  if (typeof exp=='object'){
    assert(typeof res=='object', exp, res);
    for (let i in exp)
      assert_objv(exp[i], res[i]);
    return;
  }
  assert(0, exp, res);
};
let assert_run = run=>{
  try {
    return run();
  } catch(e){
    assert(0, 'run failed: '+e);
  }
};
let assert_run_ab = (a, b, test)=>{
  let _a = TV(a, {got_throw: 1})();
  let _b = TV(b, {got_throw: 1})();
  assert(!!_a.got_throw==!!_b.got_throw,
    _a.got_throw ? 'a throws, and b does not' : 'b throws, and a does not');
  let ok = assert_run(()=>test(_a, _b));
  assert(ok, 'a and b dont match');
  return {a: _a, b: _b};
};
exports.assert = assert;
exports.assert_eq = assert_eq;
exports.assert_objv = assert_objv;
exports.assert_run_ab = assert_run_ab;

// chan.js
class postmessage_chan {
  req = {};
  cmd_cb = {};
  ports;
  port;
  id = 0;
  async cmd(cmd, arg){
    let id = ''+(this.id++);
    let req = this.req[id] = ewait();
    this.port.postMessage({cmd, arg, id});
    return await req;
  }
  async cmd_server_cb(msg){
    let cmd_cb = this.cmd_cb[msg.cmd];
    if (!cmd_cb)
      throw Error('invalid cmd', msg.cmd);
    try {
      let res = await cmd_cb({cmd: msg.cmd, arg: msg.arg});
      this.port.postMessage({cmd_res: msg.cmd, id_res: msg.id, res});
    } catch(err){
      console.error('cmd failed', msg);
      this.port.postMessage({cmd_res: msg.cmd, id_res: msg.id, err: ''+err});
      throw err;
    }
  }
  on_msg(event){
    let msg = event.data;
    if (typeof msg.cmd=='string' && typeof msg.id=='string')
      return this.cmd_server_cb(msg);
    if (typeof msg.cmd_res=='string' && typeof msg.id_res=='string'){
      let id = msg.id_res;
      if (!this.req[id])
        throw Error('invalid req msg.id', id);
      let req = this.req[id];
      delete this.req[id];
      if (msg.err)
        return req.throw(msg.err);
      return req.return(msg.res);
    }
    throw Error('invalid msg', msg);
  }
  add_server_cmd(cmd, cb){
    this.cmd_cb[cmd] = cb;
  }
  // controller = navigator.serviceWorker.controller
  connect(controller){
    this.ports = new MessageChannel();
    controller.postMessage({connect: true}, [this.ports.port2]);
    this.port = this.ports.port1;
    this.port.addEventListener('message', event=>this.on_msg(event));
    this.port.start();
  }
  listen(event){
    if (event.data?.connect){
      this.port = event.ports[0];
      this.port.addEventListener('message', event=>this.on_msg(event));
      this.port.start();
      return true;
    }
  }
}
exports.postmessage_chan = postmessage_chan;

let utf8_enc = new TextEncoder('utf-8');
let str_to_buf = buf=>{
  if (buf instanceof ArrayBuffer)
    return buf;
  if (ArrayBuffer.isView(buf))
    return buf.buffer;
  if (typeof buf=='string')
    return utf8_enc.encode(buf).buffer;
  throw Error('str_to_buf: invalid buf type');
};
let utf8_dec = new TextDecoder('utf-8');
let buf_to_str = (buf, type)=>{
  if (!type)
    return buf;
  if (type=='string')
    return utf8_dec.decode(buf);
  throw Error('buf_to_str: invalid type');
}

// implementation automatic service-worker/direct SharedArrayBuffer
// https://github.com/alexmojaki/sync-message
class ipc_sync {
  seq = 0;
  constructor(ipc_buf){
    this.sab = ipc_buf || {
      data: new SharedArrayBuffer(8192),
      cmd: new SharedArrayBuffer(24),
    };
    this._data = this.sab.data;
    this.data = new Uint8Array(this.sab.data);
    let cmd = this.sab.cmd;
    this.write_lock = new Int32Array(cmd, 0, 1);
    this.read_lock = new Int32Array(cmd, 4, 1);
    this.sz = new Int32Array(cmd, 8, 1);
    this.len = new Int32Array(cmd, 12, 1);
    this.ofs = new Int32Array(cmd, 16, 1);
    this.last = new Int32Array(cmd, 20, 1);
  }
  write_notify(){
    Atomics.notify(this.write_lock, 0);
  }
  read_notify(){
    Atomics.notify(this.read_lock, 0);
  }
  write_wait(old_val){
    Atomics.wait(this.write_lock, 0, old_val);
  }
  read_wait(old_val){
    Atomics.wait(this.read_lock, 0, old_val);
  }
  async Ewrite_wait(old_val){
    await Atomics.wait(this.write_lock, 0, old_val).value;
  }
  async Eread_wait(old_val){
    await Atomics.waitAsync(this.read_lock, 0, old_val).value;
  }
  write(buf){
    buf = str_to_buf(buf);
    let sz = buf.byteLength, ofs = 0;
    this.sz[0] = sz;
    do {
      let len = Math.min(sz-ofs, this._data.byteLength);
      this.len[0] = len;
      this.ofs[0] = ofs;
      this.last[0] = ofs+len==sz;
      this.data.set(new Uint8Array(buf, ofs, len), 0);
      this.write_lock[0] = ++this.seq;
      this.write_notify();
      this.read_wait(this.seq-1);
      ofs += len;
    } while (ofs<sz);
  }
  async Ewrite(buf){
    buf = str_to_buf(buf);
    let sz = buf.byteLength, ofs = 0;
    this.sz[0] = sz;
    do {
      let len = Math.min(sz-ofs, this._data.byteLength);
      this.len[0] = len;
      this.ofs[0] = ofs;
      this.last[0] = ofs+len==sz;
      this.data.set(new Uint8Array(buf, ofs, len), 0);
      this.write_lock[0] = ++this.seq;
      this.write_notify();
      await this.Eread_wait(this.seq-1);
      ofs += len;
    } while (ofs<sz);
  }
  read(type){
    this.write_wait(this.seq);
    let sz = this.sz[0];
    let buf = new ArrayBuffer(sz);
    let _buf = new Uint8Array(buf);
    let ofs = 0;
    let last;
    while (ofs<sz){
      let len = this.len[0];
      _buf.set(new Uint8Array(this._data, 0, len), ofs);
      let last = this.last[0];
      this.read_lock[0] = ++this.seq;
      this.read_notify();
      ofs += len;
      if (last)
        break;
      this.write_wait(this.seq);
    }
    if (type)
      buf = buf_to_str(buf, type);
    return buf;
  }
  async Eread(type){
    await this.Ewrite_wait(this.seq);
    let sz = this.sz[0];
    let buf = new ArrayBuffer(sz);
    let _buf = new Uint8Array(buf);
    let ofs = 0;
    let last;
    while (ofs<sz){
      let len = this.len[0];
      _buf.set(new Uint8Array(this._data, 0, len), ofs);
      let last = this.last[0];
      this.read_lock[0] = ++this.seq;
      this.read_notify();
      ofs += len;
      if (last)
        break;
      await this.Ewrite_wait(this.seq);
    }
    if (type)
      buf = buf_to_str(buf, type);
    return buf;
  }
}
exports.ipc_sync = ipc_sync;

const path_ext = path=>path.match(/\.[^./]*$/)?.[0];
const _path_ext = path=>path.match(/\.([^./]*)$/)?.[1];
const path_file = path=>path.match(/(^.*\/)?([^/]*)$/)?.[2]||'';
const path_dir = path=>path.match(/(^.*\/)?([^/]*)$/)?.[1]||'';
const path_is_dir = path=>path.endsWith('/');
const path_join = (...path)=>{
  let p = path[0];
  for (let i=1; i<path.length; i++){
    let add = path[i];
    p += (p.endsWith('/') ? '' : '/')+(add[0]=='/' ? add.slice(1) : add);
  }
  return p;
};
const path_prefix = (path, start)=>{
  let v;
  if (!(v=str.starts(path, start)))
    return;
  if (!v.rest || v.rest[0]=='/' || start.endsWith('/'))
    return v;
};
const path_next = path=>{
  let p = path.split('/');
  if (p.length==1)
    return {dir: p[0], rest: null, last: true};
  return {dir: p[0]+'/', rest: path.slice(p[0].length+1), last: false};
};

function test_path(){
  let t;
  t = (v, s, arr)=>assert_eq(v, str.is(s, ...arr));
  t(false, 'ab', ['']);
  t(true, 'ab', ['ab']);
  t(true, 'ab', ['', 'ab']);
  t(true, 'D', ['d', ['abc', '', 'D']]);
  t(false, 'D', ['d', ['abc', '', 'd']]);
  t = (s, pre, v)=>assert_objv(v ? {start: v[0], rest: v[1]} : undefined,
    str.starts(s, pre));
  t('ab:cd', [''], ['', 'ab:cd']);
  t('ab:cd', ['ab:'], ['ab:', 'cd']);
  t('ab:cd', ['ac:'], undefined);
  t('ab:cd', ['ab', 'ab.', 'ac:'], ['ab', ':cd']);
  t('ab:cd', ['ab:', 'ab', 'ac:'], ['ab:', 'cd']);
  t('ab:cd', ['ab:', 'ac:'], ['ab:', 'cd']);
  t('ab:cd', ['cd'], undefined);
  t = (s, pre, v)=>assert_objv(v ? {end: v[0], rest: v[1]} : undefined,
    str.ends(s, pre));
  t('ab:cd', [''], ['', 'ab:cd']);
  t('ab:cd', [':cd'], [':cd', 'ab']);
  t('ab:cd', ['ac:'], undefined);
  t('ab:cd', [':dc'], undefined);
  t('ab:cd', ['cd', 'cd.', 'ac:'], ['cd', 'ab:']);
  t('ab:cd', ['ab:', ':c', ':cd'], [':cd', 'ab']);
  t('ab:cd', ['ab:', ':', 'd'], ['d', 'ab:c']);
  t('ab:cd', ['ab'], undefined);
  t = (v, path)=>assert_eq(v, path_ext(path));
  t(undefined, 'dir.js/file');
  t('.js', 'dir.js/file.js');
  t('.', 'dir.js/file.');
  t = (v, path)=>assert_eq(v, _path_ext(path));
  t(undefined, 'dir.js/file');
  t('js', 'dir.js/file.js');
  t('', 'dir.js/file.');
  t = (v, path)=>assert_eq(v, path_file(path));
  t('file.js', 'another/dir/dir.js/file.js');
  t('file.js', '/file.js');
  t('', '/');
  t('', 'dir/');
  t('', '');
  t = (v, path)=>assert_eq(v, path_dir(path));
  t('another/dir/dir.js/', 'another/dir/dir.js/file.js');
  t('/', '/file.js');
  t('/', '/');
  t('dir/', 'dir/');
  t('', '');
  t = (v, path)=>assert_eq(v, path_is_dir(path));
  t(false, '/file.js');
  t(true, '/');
  t(true, 'dir/');
  t(false, '');
  t = (v, ...path)=>assert_eq(v, path_join(...path));
  t('a/b/c', 'a/b', 'c');
  t('a/b/c', 'a/b', '/c');
  t('a/b/c', 'a/b/', '/c');
  t('a/b//c', 'a/b//', '/c');
}
test_path();

const TE_url_parse = (url, base)=>{
  const u = URL.parse(url, base);
  if (!u)
    throw Error('cannot parse url: '+url);
  // some of these fields are setters, so copy object to normal object
  let _u = {path: u.pathname,
    hash: u.hash, host: u.host, hostname: u.hostname, href: u.href,
    origin: u.origin, password: u.password, pathname: u.pathname,
    port: u.port, protocol: u.protocol, search: u.search,
    searchParams: u.searchParams, username: u.username};
  // add info
  _u.path = u.pathname;
  _u.ext = path_ext(_u.path);
  _u.file = path_file(_u.path);
  _u.dir = path_dir(_u.path);
  return _u;
};
const url_parse = TE_to_null(TE_url_parse);

// https://www.iana.org/assignments/uri-schemes/prov/gitoid
// https://docs.npmjs.com/cli/v11/configuring-npm/package-json
// gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://github.com/pinheadmz/bcoin/blob/05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://raw.githubusercontent.com/pinheadmz/bcoin/05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://cdn.jsdelivr.net/gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://cdn.statically.io/gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
// gh/pinheadmz/bcoin/HEAD/lib/bcoin-browser.js
//   https://github.com/pinheadmz/bcoin/blob/HEAD/lib/bcoin-browser.js
//   https://raw.githubusercontent.com/pinheadmz/bcoin/HEAD/lib/bcoin-browser.js
//   https://cdn.jsdelivr.net/gh/pinheadmz/bcoin@HEAD/lib/bcoin-browser.js
//   https://cdn.statically.io/gh/pinheadmz/bcoin@HEAD/lib/bcoin-browser.js
// Docs:
//   https://statically.io/ - gh GitHub, gl GitLab, 
//   https://www.jsdelivr.com/github - link converter
// IPFS
//   https://ipfs.io/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN
//   https://cloudflare-ipfs.com/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN
//   https://ipfs.io/ipfs/QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX/wiki/Mars.html
//   https://ipfs.io/ipfs/bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Vincent_van_Gogh.html
//   https://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq.ipfs.dweb.link/wiki/
// Docs:
//   https://docs.ipfs.tech/how-to/address-ipfs-on-web/#path-gateway
//   https://gist.github.com/olizilla/81cee26ffa3ae103e4766d2ae0d2f04b
//
// npm/MOD/PATH
// npm/MOD@VER/PATH
// npm/@SCOPE/MOD/PATH
// npm/@SCOPE/MOD@VER/PATH
//   SOURCE https://registry.npmjs.com/MOD
//   https://unpkg.com/MOD@VER/PATH
//   https://cdn.jsdelivr.net/npm/MOD@VER/PATH
// git/github/USER/REPO/PATH
// git/github/USER/REPO@VER/PATH
//   SOURCE https://github.com/USER/REPO/blob/VER/PATH
//   https://raw.githubusercontent.com/USER/REPO/VER/PATH
//   https://statically.io/gh/USER/REPO@VER/PATH
//   https://cdn.jsdelivr.net/gh/USER/REPO@HEAD/PATH
// git/gitlab/USER/REPO@VER/PATH
//   https://statically.io/gl/USER/REPO@VER/PATH
// http/SITE/PATH
// http/SITE@PORT/PATH
//   http://SITE:PORT/PATH
// https/SITE/PATH
// https/SITE@PORT/PATH
//   http://SITE:PORT/PATH
// ipfs/CID/PATH
//   https://ipfs.io/ipfs/CID
//   https://cloudflare-ipfs.com/ipfs/CID
// ipns/NAME/PATH
// bitcoin/BLOCK
// lifcoin/BLOCK
// bittorent/IH/PATH
//  magnet:?xt=urn:btih:IH 

const path_parts = parts=>parts.length ? '/'+parts.join('/') : '';
const TE_lpm_uri_parse = uri=>{
  let l = {};
  let p = l.p = uri.split('/');
  let i = 0;
  let next = err=>{
    let v = p[i++];
    if (typeof v!='string')
      throw Error('lpm_uri_parse missing'+err+': '+uri);
    if (v=='')
      throw Error('lpm_uri_parse empty element: '+uri);
    return v;
  };
  let ver_split = name=>{
    let n = name.split('@');
    if (n.length==1)
      return {name: name, ver: '', _ver: null};
    if (n.length==2)
      return {name: n[0], ver: '@'+n[1], _ver: n[1]};
    throw Error('lpm_uri_parse invalid ver inname: '+name);
  };
  let v;
  l.reg = next('registry (npm, git, bitcoin, lifcoin, ipfs)');
  switch (l.reg){
  case 'npm':
    l.name = next('module name');
    if (l.name[0]=='@'){
      l.scoped = true;
      let sub = next('scoped module name');
      v = ver_split(sub);
      l.name = l.name+'/'+v.name;
    } else {
      v = ver_split(l.name);
      l.name = v.name;
    }
    l.ver = v.ver;
    l._ver = v._ver;
    l.modver = l.reg+'/'+l.name+l.ver;
    break;
  case 'git':
    l.site = next('site');
    l.user = next('user');
    l.repo = next('repo');
    l.name = l.user+'/'+l.repo;
    l._repo = ver_split(l.repo).name;
    v = ver_split(l.name);
    l.name = v.name;
    l.ver = v.ver;
    l._ver = v._ver;
    if (!l._ver)
      l.ver_type = l._ver;
    else if (/^[0-9a-f]+$/.test(l._ver)){
      l.ver_type = l._ver.length==40 ? 'sha1' : l._ver.length==64 ? 'sha256' :
        l._ver.length>=4 && !(l._ver.length % 2) && l._ver.length<=20 ? 'shortcut' :
        'name';
    } else
      l.ver_type = 'name';
    l.modver = l.site+'/'+l.name+l.ver;
    break;
  case 'http':
  case 'https':
    l.name = next('site name');
    v = ver_split(l.name);
    l.name = v.name;
    l.ver = v.ver;
    l._ver = v._ver;
    l.port = v._ver;
    break;
  case 'bittorent':
    l.infohash = next('InfoHash');
    break;
  case 'lifcoin':
    l.blocknum = next('Block Num');
    break;
  case 'bitcoin':
    l.blocknum = next('Block Num');
    break;
  case 'ethereum':
    throw Error('unsupported etherum '+uri);
    break;
  case 'ipfs':
    l.cid = next('cid');
    break;
  case 'ipns':
    l.name = next('name');
    break;
  default:
    throw Error('invalid registry: '+uri);
  }
  l._p = p.slice(i);
  l.path = path_parts(l._p);
  return l;
};
exports.TE_lpm_uri_parse = TE_lpm_uri_parse;
const lpm_uri_parse = TE_to_null(TE_lpm_uri_parse);
exports.lpm_uri_parse = lpm_uri_parse;

const lpm_modver = uri=>{
  if (typeof uri=='string')
    uri = TE_lpm_uri_parse(uri);
  return uri.reg+'/'+uri.name+uri.ver;
};
exports.lpm_modver = lpm_modver;

// parse-package-name: package.json:dependencies
const TE_npm_dep_to_lpm = (mod_self, dep)=>{
  let v;
  if (v=str.starts(dep, './'))
    return mod_self+'/'+v.rest;
  if (v=str.starts(dep, ['https:', 'http:', 'git:'])){
    let u = URL.parse(dep), site = u.host;
    if (u.host=='github.com'){
      site = 'github';
    } else if (site=='gitlab.com'){
      site = 'gitlab';
    } else
      throw Error('invalid http registry '+site);
    let p = u.pathname.slice(1).split('/');
    let user = p.shift();
    let repo = p.shift();
    if (!user || !repo)
      throw Error('invalid gith user/repo');
    if (v=str.ends(repo, '.git'))
      repo = v.rest;
    let _path = p.map(p=>'/'+p).join('');
    let ver = u.hash ? '@'+u.hash.slice(1) : '';
    return 'git/'+site+'/'+user+'/'+repo+ver+_path;
  }
  if (v=str.starts(dep, 'npm:'))
    return 'npm/'+v.rest;
  if (v=str.starts(dep, 'file:')){
    let file = v.rest;
    if (!(v=str.starts(file, './')))
      throw Error('only ./ files supported: '+dep);
    return mod_self+'/'+v.rest;
  }
  // add later bittorent: lifcoin: bitcoin: ethereum: ipfs: ipns:
  throw Error('invalid npm_dep prefix: '+dep);
};
const npm_dep_to_lpm = TE_to_null(TE_npm_dep_to_lpm);
const TE_npm_uri_parse = path=>{
  let npm = TE_lpm_uri_parse('npm/'+path);
  delete npm.reg;
  npm.modver = npm.modver.slice(4); // skip 'npm/'
  npm.p = npm.p.slice(1);
  return npm;
};
exports.TE_npm_uri_parse = TE_npm_uri_parse;
const npm_uri_parse = TE_to_null(TE_npm_uri_parse);
exports.npm_uri_parse = npm_uri_parse;

const npm_modver = uri=>{
  if (typeof uri=='string')
    uri = TE_npm_uri_parse(uri);
  return uri.name+uri.ver;
};
exports.npm_modver = npm_modver;

const url_uri_type = url_uri=>{
  if (!url_uri)
    throw Error('invalid url_uri type');
  if (URL.parse(url_uri))
    return 'url';
  if (url_uri[0]=='/')
    return 'uri';
  let dir = url_uri.split('/')[0];
  if (dir=='.' || dir=='..')
    return 'rel';
  return 'mod';
};
exports.url_uri_type = url_uri_type;

const __uri_parse = (uri, base)=>{
  if (base && base[0]!='/')
    throw Error('invalid base '+base);
  let u = TE_url_parse(uri, 'x://x'+(base||''));
  u.host = u.hostname = u.origin = u.href = u.protocol = '';
  return u;
};

const TE_url_uri_parse = (url_uri, base_uri)=>{
  let t = url_uri_type(url_uri);
  let tbase = base_uri ? url_uri_type(base_uri) : null;
  let u, is = {};
  if (t=='rel' && !tbase)
    throw Error('url_uri_parse('+url_uri+') rel without base');
  if (t=='rel')
    is.rel = 1;
  if (t=='url' || t=='rel' && tbase=='url'){
    let u = url_parse(url_uri, t=='rel' ? base_uri : undefined);
    u.is = is;
    is.url = 1;
    return u;
  }
  if (t=='uri' || t=='rel' && tbase=='uri'){
    u = __uri_parse(url_uri, t=='rel' ? base_uri : undefined);
    u.is = is;
    is.uri = 1;
    return u;
  }
  is.mod = 1;
  if (t=='mod'){
    u = __uri_parse('/'+url_uri);
    u.is = is;
    u.path = u.pathname = u.path.slice(1);
    u.dir = u.dir.slice(1);
    u.mod = TE_npm_uri_parse(url_uri);
    return u;
  }
  if (t=='rel' && tbase=='mod'){
    let base = TE_npm_uri_parse(base_uri);
    u = __uri_parse(url_uri, base.path);
    u = __uri_parse('/'+base.name+base.ver+u.path);
    u.is = is;
    u.path = u.pathname = u.path.slice(1);
    u.dir = u.dir.slice(1);
    u.mod = TE_npm_uri_parse(u.path);
    return u;
  }
  throw Error('url_uri_parse('+url_uri+','+base_uri+') failed');
};
const url_uri_parse = TE_to_null(TE_url_uri_parse);
function test_url_uri(){
  let t = (v, arg)=>assert_objv(v, TE_url_uri_parse(...arg));
  t({path: '/a/b', origin: 'http://dns', is: {url: 1}},
    ['http://dns/a/b', 'http://oth/c/d']);
  t({path: '/c/a/b', origin: 'http://oth', is: {url: 1, rel: 1}},
    ['./a/b', 'http://oth/c/d']);
  t({path: '/c/d', is: {uri: 1}}, ['/c/d', '/dir/a/b']);
  t({path: '/c//d', is: {uri: 1}}, ['/c//d', '/dir/a/b']);
  t({path: '/dir/a/c/d', is: {uri: 1, rel: 1}}, ['./c/d', '/dir/a/b']);
  t({path: '/dir/c/d', is: {uri: 1, rel: 1}}, ['../c/d', '/dir/a/b']);
  t({path: '/c/d', is: {uri: 1, rel: 1}}, ['../../../../c/d', '/dir/a/b']);
  t({path: 'mod/c/d', is: {mod: 1}}, ['mod/c/d', 'mod/a/b']);
  t({path: 'mod/a/c/d', is: {mod: 1, rel: 1}}, ['./c/d', 'mod/a/b']);
  t({path: 'mod/c/d', is: {mod: 1, rel: 1}}, ['../c/d', 'mod/a/b']);
  t({path: 'mod/c/d', is: {mod: 1, rel: 1}}, ['../../../c/d', 'mod/a/b']);
  t({path: '@mod/v/c/d', is: {mod: 1, rel: 1}},
    ['../../../c/d', '@mod/v/a/b']);
  t({path: 'mod@1.2.3/c/d', is: {mod: 1, rel: 1}}, ['./c/d', 'mod@1.2.3/a']);
  t = (v, arg)=>assert_objv(v, TE_npm_uri_parse(...arg));
  t({p: ["@noble", "hashes@1.2.0", "esm", "utils.js"],
    _p: ["esm", "utils.js"],
    name: "@noble/hashes", scoped: true,
    ver: "@1.2.0", _ver: "1.2.0",
    modver: "@noble/hashes@1.2.0", path: "/esm/utils.js"},
    ['@noble/hashes@1.2.0/esm/utils.js']);
  t = (v, arg)=>assert_objv(v, TE_lpm_uri_parse(...arg));
  t({p: ["npm", "@noble", "hashes@1.2.0", "esm", "utils.js"],
    _p: ["esm", "utils.js"],
    reg: "npm", name: "@noble/hashes", scoped: true,
    ver: "@1.2.0", _ver: "1.2.0",
    modver: "npm/@noble/hashes@1.2.0", path: "/esm/utils.js"},
    ['npm/@noble/hashes@1.2.0/esm/utils.js']);
  t = (v, arg)=>assert_eq(v, !!lpm_uri_parse(arg));
  t(true, 'npm/mod/dir/file.js');
  t(true, 'npm/mod/dir//file.js');
  t = (dep, v)=>assert_eq(v, npm_dep_to_lpm('npm/self@4.5.6', dep));
  t('npm:react', 'npm/react');
  t('npm:react/index.js', 'npm/react/index.js');
  t('npm:@mod/sub@1.2.3/index.js', 'npm/@mod/sub@1.2.3/index.js');
  t('git://github.com/mochajs/mocha', 'git/github/mochajs/mocha');
  t('git://github.com/mochajs/mocha.git#4727d357ea',
    'git/github/mochajs/mocha@4727d357ea');
  t('git://github.com/mochajs/mocha.git/index.js#4727d357ea',
    'git/github/mochajs/mocha@4727d357ea/index.js');
  t('git://github.com/npm/cli.git#v1.0.27', 'git/github/npm/cli@v1.0.27');
  t('https://github.com/npm/cli.git#v1.0.27', 'git/github/npm/cli@v1.0.27');
  t('https://github.com/npm/cli#v1.0.27', 'git/github/npm/cli@v1.0.27');
  t('https://gitlab.com/npm/cli#v1.0.27', 'git/gitlab/npm/cli@v1.0.27');
  t('file:./dir/index.js', 'npm/self@4.5.6/dir/index.js');
  t('./dir/index.js', 'npm/self@4.5.6/dir/index.js');
}
test_url_uri();

const uri_enc = path=>encodeURIComponent(path)
  .replaceAll('%20', ' ').replaceAll('%2F', '/').replaceAll('%2B', '.');
const uri_dec = uri=>decodeURIComponent(uri);

const esc_regex = s=>s.replace(/[[\]{}()*+?.\\^$|\/]/g, '\\$&');

const match_glob_to_regex_str = glob=>{
  return '^(?:'
  +glob.replace(/(\?|\*\*|\*)|([^?*]+)/g,
    m=>m=='?' ? '[^/]' : m=='**' ? '(.*)' : m=='*' ? '([^/]*)' : esc_regex(m))
  +')$';
};
const match_glob_to_regex = glob=>new RegExp(match_glob_to_regex_str(glob));
const match_glob = (glob, value)=>
  match_glob_to_regex(glob).test(value);
const qs_enc = (q, qmark)=>{
  let _q = ''+(new URLSearchParams(q));
  return _q ? (qmark ? '?' : '')+_q : '';
};
let qs_append = (url, q)=>{
  let _q = typeof q=='string' ? q : ''+(new URLSearchParams(q));
  if (!_q)
    return url;
  return url+(url.includes('?') ? '&' : '?')+_q;
};

exports.path_ext = path_ext;
exports._path_ext = _path_ext;
exports.path_file = path_file;
exports.path_dir = path_dir;
exports.path_is_dir = path_is_dir;
exports.path_join = path_join;
exports.path_prefix = path_prefix;
exports.path_next = path_next;
exports.url_parse = url_parse;
exports.TE_url_parse = TE_url_parse;
exports.url_uri_parse = url_uri_parse;
exports.TE_url_uri_parse = TE_url_uri_parse;
exports.uri_enc = uri_enc;
exports.uri_dec = uri_dec;
exports.qs_enc = qs_enc;
exports.qs_append = qs_append;
exports.match_glob_to_regex = match_glob_to_regex;
exports.match_glob = match_glob;

// useful debugging script: stop on first time
//{ if (file.includes('getProto') && match.includes('getPro') && !self._x_) {self._x_=1; debugger;} }
const _debugger = function(stop){
  if ((!arguments.length || stop) && !self._x_){
    self._x_=1;
    debugger; // eslint-disable-line no-debugger
  }
};
exports._debugger = _debugger;
// useful for locating who is changes window.location
const detect_unload = ()=>addEventListener('beforeunload',()=>{debugger}); // eslint-disable-line no-debugger
exports.detect_unload = detect_unload;

function Scroll(s){
  if (!(this instanceof Scroll))
    return new Scroll(...arguments);
  this.s = s;
  this.diff = [];
  this.len = this.s.length;
}
Scroll.prototype.get_diff_pos = function(start, end){
  if (start>end)
    throw Error('diff start>end');
  if (end>this.len)
    throw Error('diff out of s range');
  let i, d;
  // use binary-search in the future
  for (i=0; d=this.diff[i]; i++){
    if (start>=d.end)
      continue;
    if (end<=d.start)
      return i;
    throw Error('diff overlaping');
  }
  return i;
};
Scroll.prototype.splice = function(start, end, s){
  // find the frag pos of src in dst, and update
  let i = this.get_diff_pos(start, end);
  this.diff.splice(i, 0, {start, end, s});
};
Scroll.prototype.out = function(){
  let s = '', at = 0, d;
  for (let i=0; d=this.diff[i]; i++){
    s += this.s.slice(at, d.start)+d.s;
    at = d.end;
  }
  s += this.s.slice(at, this.len);
  return s;
};
exports.Scroll = Scroll;

function test_Scroll(){
  let t = v=>assert_eq(v, s.out());
  let s = Scroll('0123456789abcdef');
  s.splice(3, 5, 'ABCD');
  t('012ABCD56789abcdef');
  s.splice(6, 7, 'QW');
  t('012ABCD5QW789abcdef');
  s.splice(7, 8, '  ');
  t('012ABCD5QW  89abcdef');
  s.splice(6, 6, '-');
  s.splice(7, 7, '-');
  s.splice(8, 8, '-');
  t('012ABCD5-QW-  -89abcdef');
}
test_Scroll();

exports.html_elm = (name, attr)=>{
  let elm = document.createElement(name);
  for (let [k, v] of OF(attr))
    elm[k] = v;
  return elm;
};
exports.html_favicon_set = href=>{
  let link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  document.head.appendChild(link);
};
exports.html_stylesheet_add = href=>{
  // also possible with import
  //let style = (await import(href, {with: {type: 'css'}})).default;
  //document.adoptedStyleSheets = [style];
  let link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

export default exports;

