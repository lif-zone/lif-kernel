// LICENSE_CODE JPL util.js
let util_version = '2026.8.23';
export const dna = 'DNAINDIVIDUALTRANSPARENTEFFECTIVEIMMEDIATEAUTONOMOUSINCREMENTALRESPONSIBLEACTIONTRUTHFUL';
export const version = util_version;
export const is_node = globalThis.process?.versions?.node!==undefined;
let D = 0; // Debug
let in_test = 0;

// Promise with return() and throw()
export function ewait(ms, arg){
  let slow;
  if (ms)
    slow = eslow(ms, arg);
  let _return, _throw;
  let promise = new Promise((resolve, reject)=>{
    _return = ret=>{ slow?.end(); resolve(ret); return ret; };
    _throw = err=>{ slow?.end(); reject(err); return err; };
  });
  promise.return = _return;
  promise.throw = _throw;
  promise.catch(err=>{}); // catch un-waited wait() objects. avoid Uncaught in promise
  return promise;
}
export function esleep(ms){
  let p = ewait();
  setTimeout(()=>p.return(), ms);
  return p;
}

export function eslow(ms, arg){
  let enable = 1; // = 1 to enable, or = 0 just to trace active tasks, no print
  if (enable==undefined)
    return {end: ()=>{}};
  eslow.seq ||= 0;
  let seq = eslow.seq++;
  let done, timeout, at_end;
  if (typeof ms!='number'){
    arg = ms;
    ms = 1000;
  }
  if (!Array.isArray(arg))
    arg = [arg];
  let p = (async()=>{
    await esleep(ms);
    timeout = true;
    if (!done)
      enable && console.warn('slow('+seq+') '+ms, ...arg, p.err);
  })();
  eslow.set.add(p);
  p.now = Date.now();
  p.stack = 0 && Error('stack'),
  p.end = ()=>{
    if (at_end)
      return;
    at_end = Date.now();
    eslow.set.delete(p);
    if (timeout && !done)
      enable && console.warn('slow completed '+(Date.now()-p.now)+'>'+ms, ...arg);
    done = true;
  };
  p.print = ()=>console.log('slow('+seq+') '+(done?'completed ':'')+ms
    +' passed '+((at_end||Date.now())-p.now), ...arg);
  return p;
}

eslow.set = new Set();
eslow.print = ()=>{
  console.log('eslow print');
  for (let p of eslow.set)
    p.print();
};
if (globalThis.$lif)
  globalThis.$lif.eslow = eslow;

let once_obj = {};
let once_set = new Set();
export function Donce(once, fn){
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
}

// shortcuts
export function OE(o){ return o ? Object.entries(o) : []; }
export const OA = Object.assign;
export const OV = Object.values;
export function json(obj){ return JSON.stringify(obj); }
export function json_cp(obj){
  return JSON.parse(JSON.stringify(obj===undefined ? null : obj));
}
export const SEC = {SEC: 1, MIN: 60, HOUR: 60*60,
  DAY: 24*60*60, WEEK: 8*24*60*60, MONTH: 30*24*60*60, YEAR: 365*24*60*60,
};
export const MS = {SEC: 1000, MIN: 60*1000, HOUR: 60*60*1000,
  DAY: 24*60*60*1000, WEEK: 8*24*60*60*1000, MONTH: 30*24*60*60*1000,
  YEAR: 365*24*60*60*1000,
};
export function date_time(){
  return Math.floor(Date.now()/1000);
}

// throw Error -> undefined
export function Tf(fn, throw_val){
  return function(){
    try {
      return fn(...arguments);
    } catch(err){
      return typeof throw_val=='function' ? throw_val() : throw_val;
    }
  };
}
// try and catch to value
export function T(fn, throw_val){
  try {
    return fn();
  } catch(err){
    return typeof throw_val=='function' ? throw_val() : throw_val;
  }
}
export const _try = T;

// event (await) try and catch to value
export async function E_try(try_fn, throw_val){
  try {
    let res = await try_fn();
    return res;
  } catch(err){
    return typeof throw_val=='function' ? await throw_val(err) : throw_val; 
  }
}

// undefined -> throw Error
export function TUf(fn){
  return function(){
    let v = fn(...arguments);
    if (v===undefined)
      throw Error('failed '+fn.name);
    return v;
  };
}
export function TU(fn){
  let v = fn();
  if (v===undefined)
    throw Error('failed '+fn.name);
  return v;
}
export const _throw = TU;

// catch critical error
export function CE(err){
  if (err instanceof TypeError || err instanceof RangeError){
    console.error(err);
    debugger; // eslint-disable-line no-debugger
  }
  return err;
}

// Catch Error Assert/Critical Error Assert: log error, assert critical
export function CEL(err){
  console.error(err);
  if (err instanceof TypeError || err instanceof RangeError)
    debugger; // eslint-disable-line no-debugger
  return err;
}

// str.js
export const str = {};
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
  return str.split_ws(!Array.isArray(s) ? s : str.es6_str(arguments));
};
export function arr_find(a, find){
  if (!Array.isArray(a))
    return find(a);
  let v;
  for (let i=0; i<a.length; i++){
    if (v = find(a[i]))
      return v;
  }
}
export function arr_find_deep(a, find){
  if (!Array.isArray(a))
    return find(a);
  let v;
  for (let i=0; i<a.length; i++){
    if (v = arr_find_deep(a[i], find))
      return v;
  }
}
str.starts = (s, ..._start)=>arr_find_deep(_start, start=>{
  let v;
  if (typeof start=='string'){
    if (s.startsWith(start))
      return {start, rest: s.slice(start.length)};
    return;
  }
  if (start instanceof RegExp){
    if ((v=s.match(start)) && v.index==0)
      return {start: v[0], rest: s.slice(v[0].length)};
    return;
  }
  throw Error('invalid str.starts type');
});
str.ends = (s, ..._end)=>arr_find_deep(_end, end=>{
  if (s.endsWith(end))
    return {end, rest: s.slice(0, s.length-end.length)};
});
str.is = (s, ..._is)=>arr_find_deep(_is, is=>s==is)||false;
str.splice = (s, at, len, add)=>s.slice(0, at)+add+s.slice(at+len);
str.diff_pos = (s1, s2)=>{
  if (s1==s2)
    return;
  let i;
  for (i=0; i<s1.length && s1[i]==s2[i]; i++);
  return i;
};

// assert.js
export function assert(ok, ...msg){
  if (ok)
    return;
  console.error('assert FAIL:', ...msg);
  debugger; // eslint-disable-line no-debugger
  throw Error('assert FAIL');
}
export function assert_eq(exp, res){
  assert(exp===res, 'exp', exp, 'got', res);
}
assert.eq = assert_eq;
export function assert_obj(exp, res){
  if (exp===res)
    return;
  if (typeof exp=='object'){
    assert(typeof res=='object', 'exp', exp, 'res', res);
    if (!exp || !res)
      return assert_eq(exp, res);
    for (let i in exp)
      assert_obj(exp[i], res[i]);
    for (let i in res)
      assert_obj(exp[i], res[i]);
    return;
  }
  assert(0, 'exp', exp, 'res', res);
}
assert.obj = assert_obj;
export function assert_obj_f(exp, res){
  if (exp===res)
    return;
  if (typeof exp=='object'){
    assert(typeof res=='object', 'exp', exp, 'res', res);
    for (let i in exp)
      assert_obj_f(exp[i], res[i]);
    return;
  }
  assert(0, 'exp', exp, 'res', res);
}
assert.obj_f = assert_obj_f;
export function assert_run(run){
  try {
    return run();
  } catch(e){
    assert(0, 'run failed: '+e);
  }
}
assert.run = assert_run;
export function assert_run_ab(a, b, test){
  let _a = T(a, {got_throw: 1});
  let _b = T(b, {got_throw: 1});
  assert(!!_a.got_throw==!!_b.got_throw,
    _a.got_throw ? 'a throws, and b does not' : 'b throws, and a does not');
  let ok = assert_run(()=>test(_a, _b));
  assert(ok, 'a and b dont match');
  return {a: _a, b: _b};
}
assert.run_ab = assert_run_ab;
export function assert_te(fn){
  try {
    fn();
  } catch(err){
    return;
  }
  assert(0, 'didnt throw');
}
assert.te = assert_te;

// micro Buffer implementation, for sha256.js/sha256lif.js
export const Buffer = is_node ? globalThis.Buffer :
class Buffer extends Uint8Array {
  copy(dst, dst_off, src_off, src_end){
    dst.set(this.subarray(src_off, src_end), dst_off);
  }
  static alloc(sz){ return new Buffer(sz); }
  static isBuffer(b){ return b instanceof Buffer || b instanceof Uint8Array; }
};

function assert_log(cond, msg){
  if (cond)
    return;
  console.error(msg);
  let err = Error(msg);
  err.logged = true;
  throw err;
}

const utf8_enc = new TextEncoder('utf-8');
export function str_to_buf(buf){
  if (buf instanceof ArrayBuffer)
    return buf;
  if (ArrayBuffer.isView(buf))
    return buf.buffer;
  if (typeof buf=='string')
    return utf8_enc.encode(buf).buffer;
  throw Error('str_to_buf: invalid buf type');
}
const utf8_dec = new TextDecoder('utf-8');
export function buf_to_str(buf, type){
  if (!type)
    return buf;
  if (type=='string')
    return utf8_dec.decode(buf);
  throw Error('buf_to_str: invalid type');
}

export function path_ext(path){
  return path.match(/\.[^./]*$/)?.[0];
}
export function _path_ext(path){
  return path.match(/\.([^./]*)$/)?.[1];
}
export function path_file(path){
  return path.match(/(^.*\/)?([^/]*)$/)?.[2]||'';
}
export function path_dir(path){
  return path.match(/(^.*\/)?([^/]*)$/)?.[1]||'';
}
export function path_is_dir(path){
  return !!(path && str.ends('/'+path, '/', '/.', '/..'));
}
export function path_join(...path){
  let p = path[0];
  for (let i=1; i<path.length; i++){
    let add = path[i];
    p += (p.endsWith('/') ? '' : '/')+(add[0]=='/' ? add.slice(1) : add);
  }
  return p;
}
export function path_dots(path){
  let _path = path.split('/');
  let r = [];
  let is_root = _path[0]=='';
  let is_dir = str.is(_path.at(-1)||'', '', '.', '..');
  for (let i=0; i<_path.length; i++){
    let p = _path[i];
    if (p=='.' || p=='')
      continue;
    if (p=='..'){
      r.pop();
      continue;
    }
    r.push(p);
  }
  let to = r.join('/');
  if (is_root)
    to = '/'+to;
  if (is_dir && to && !to.endsWith('/'))
    to += '/';
  if (!to)
    return './';
  return to;
}
export function path_starts(path, ..._start){
  return arr_find(_start, start=>{
    let v;
    if (!(v=str.starts(path, start)))
      return;
    if (!v.rest || v.rest[0]=='/' || start.endsWith('/'))
      return v;
  });
}

export function uri_enc(path){
  return encodeURIComponent(path)
  .replaceAll('%20', ' ').replaceAll('%2F', '/');
}
export function uri_dec(uri){
  return decodeURIComponent(uri);
}

const esc_regex = s=>s.replace(/[[\]{}()*+?.\\^$|\/]/g, '\\$&');

export function match_glob_to_regex_str(glob){
  return '^(?:'
  +glob.replace(/(\?|\*\*|\*)|([^?*]+)/g,
    m=>m=='?' ? '[^/]' : m=='**' ? '(.*)' : m=='*' ? '([^/]*)' : esc_regex(m))
  +')$';
}
export function match_glob_to_regex(glob){
  return new RegExp(match_glob_to_regex_str(glob));
}
export function match_glob(glob, value){
  return match_glob_to_regex(glob).test(value);
}
export function qs_enc(q){
  let _q = (''+new URLSearchParams(q))
  .replaceAll('%2F', '/').replaceAll('%40', '@').replaceAll('%3A', ':')
  .replaceAll('%2C', ',');
  return _q ? '?'+_q : '';
}
export function qs_append(url, q){
  let _q = typeof q=='string' ? q : qs_enc(q);
  if (!_q)
    return url;
  if (_q[0]=='?')
    _q = _q.slice(1);
  return url+(!url.includes('?') ? '?' : !url.endsWith('?') ? '&' : '')+_q;
}
export function qs_trim(url){
  let u = url.split('?');
  return u[0];
}

export function url_http_to_ws(url){
  let v;
  if (v=str.starts(url, 'http:'))
    return 'ws:'+v.rest;
  if (v=str.starts(url, 'https:'))
    return 'wss:'+v.rest;
  assert(0, 'invalid protocol '+url);
}

// URL.parse() only available on Chrome>=126
export function URL_parse(...args){
  try { return new URL(...args); }
  catch(err){}
}
export function T_url_parse(url, base){
  const u = URL_parse(url, base);
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
}
export const url_parse = Tf(T_url_parse);

export function url_proto_parse(url){
  let m = url.match(/^([^\/:]+):/);
  if (!m)
    return {rest: url};
  return {proto: m[0], proto_name: m[1], rest: url.slice(m[0].length)};
}

// useful debugging script: stop on first time
//{ if (file.includes('getProto') && match.includes('getPro') && !self._x_) {self._x_=1; debugger;} }
export function _debugger(stop){
  if ((!arguments.length || stop) && !self._x_){
    self._x_=1;
    debugger; // eslint-disable-line no-debugger
  }
}
// useful for locating who is changes window.location
export function detect_unload(){
  addEventListener('beforeunload', ()=>{debugger;}); // eslint-disable-line no-debugger
}

export function Scroll(s){
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

export async function ecache({table, id, opt}, fn){
  let t, ret, refresh_tm = opt?.refresh_tm;
  if (t = table[id]){
    if (!(refresh_tm && t.tm<refresh_tm))
      return await t.wait;
  }
  t = table[id] = {id, tm: Date.now(), wait: ewait()};
  try {
    ret = await fn(t);
    t.wait_complete = true;
  } catch(err){
    throw t.wait.throw(err);
  }
  return t.wait.return(ret);
}
ecache.get_sync = (table, id)=>table[id]?.wait_complete && table[id];

export function html_elm(name, attr){
  let elm = document.createElement(name);
  for (let [k, v] of OE(attr))
    elm[k] = v;
  return elm;
}
export function html_favicon_set(href){
  document.head.appendChild(html_elm('link', {rel: 'icon', href}));
}
export function html_stylesheet_add(href){
  // also possible with import
  //let style = (await import(href, {with: {type: 'css'}})).default;
  //document.adoptedStyleSheets = [style];
  document.head.appendChild(html_elm('link', {rel: 'stylesheet', href}));
}

function test_util(){
  in_test = 1;
  let t;
  t = (v, s, arr)=>assert_eq(v, str.is(s, ...arr));
  t(false, 'ab', ['']);
  t(true, 'ab', ['ab']);
  t(true, 'ab', ['', 'ab']);
  t(true, 'D', ['d', ['abc', '', 'D']]);
  t(false, 'D', ['d', ['abc', '', 'd']]);
  t = (s, pre, v)=>{
    assert_obj(v ? {start: v[0], rest: v[1]} : undefined, str.starts(s, pre));
    assert_obj(v ? {start: v[0], rest: v[1]} : undefined, str.starts(s, ...pre));
  };
  t('ab:cd', [''], ['', 'ab:cd']);
  t('ab:cd', ['ab:'], ['ab:', 'cd']);
  t('ab:cd', ['ac:']);
  t('ab:cd', ['ab', 'ab.', 'ac:'], ['ab', ':cd']);
  t('ab:cd', ['ab:', 'ab', 'ac:'], ['ab:', 'cd']);
  t('ab:cd', ['ab:', 'ac:'], ['ab:', 'cd']);
  t('ab:cd', ['cd']);
  t('ab:cd', [/b:/]);
  t('ab:cd', [/ab:/], ['ab:', 'cd']);
  t('ab:cd', [/^ab:/], ['ab:', 'cd']);
  t = (s, pre, v)=>{
    assert_obj(v ? {end: v[0], rest: v[1]} : undefined, str.ends(s, pre));
    assert_obj(v ? {end: v[0], rest: v[1]} : undefined, str.ends(s, ...pre));
  };
  t('ab:cd', [''], ['', 'ab:cd']);
  t('ab:cd', [':cd'], [':cd', 'ab']);
  t('ab:cd', ['ac:']);
  t('ab:cd', [':dc']);
  t('ab:cd', ['cd', 'cd.', 'ac:'], ['cd', 'ab:']);
  t('ab:cd', ['ab:', ':c', ':cd'], [':cd', 'ab']);
  t('ab:cd', ['ab:', ':', 'd'], ['d', 'ab:c']);
  t('ab:cd', ['ab']);
  t = (v, q)=>assert_eq(v, uri_enc(q));
  t('abc def %2B.%0A', 'abc def +.\n');
  t('a%40%3A/.', 'a@:/.');
  t = (v, q)=>assert_eq(v, qs_enc(q));
  t('?abc+def+%0A=', {'abc def \n': ''});
  t('?a=a@:/.%2B+', {a: 'a@:/.+ '});
  t = (v, s)=>assert_eq(v, qs_trim(s));
  t('http://site/dir', 'http://site/dir?q=21');
  t('http://site/dir', 'http://site/dir?q=21?sdsd');
  t('http://site/dir', 'http://site/dir');
  t = (v, url, q)=>assert_eq(v, qs_append(url, q));
  t('http://site/dir?a=1&b=2', 'http://site/dir?a=1', {b: 2});
  t('http://site/dir?a=1&b=2', 'http://site/dir', {a: 1, b: 2});
  t('http://site/dir?a=1&b=2', 'http://site/dir?', {a: 1, b: 2});
  t('http://site/dir?a=1', 'http://site/dir?a=1', {});
  t('http://site/dir', 'http://site/dir', {});
  t('http://site/dir?a@:/+=1+', 'http://site/dir', {'a@:/ ': '1 '});
  t('http://site/dir?a=1&a+=1+', 'http://site/dir?a=1', {'a ': '1 '});
  t('http://site/dir?a=1&b=2', 'http://site/dir?a=1', 'b=2');
  t('http://site/dir?a=1&b=2', 'http://site/dir?a=1', '?b=2');
  t('http://site/dir?b=2', 'http://site/dir', 'b=2');
  t('http://site/dir', 'http://site/dir', '');
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
  t(true, '.');
  t(true, '..');
  t(true, '/..');
  t(true, '/.');
  t(false, '/file..');
  t(false, '/file.');
  t(true, '/dir/..');
  t(true, '/dir/.');
  t = (v, ...path)=>assert_eq(v, path_join(...path));
  t('a/b/c', 'a/b', 'c');
  t('a/b/c', 'a/b', '/c');
  t('a/b/c', 'a/b/', '/c');
  t('a/b//c', 'a/b//', '/c');
  t = (v, path)=>assert_eq(v, path_dots(path));
  t('./', '.');
  t('abc', './abc');
  t('/abc', '/abc');
  t('/abc/', '/abc/');
  t('/abc/def/', '/./abc/././def/./');
  t('/abc/def/', '/./abc/xyz././../def/./');
  t('/abc/def/', '/abc///./def/.//');
  t('/abc/def/', '/abc/def/.');
  t = (v, path, ...start)=>assert_eq(v, path_starts(path, ...start)?.rest);
  t(undefined, 'aa/bb/cc', 'a');
  t(undefined, 'aa/bb/cc', 'aa/b');
  t('/bb/cc', 'aa/bb/cc', 'aa');
  t('bb/cc', 'aa/bb/cc', 'aa/');
  t('/cc', 'aa/bb/cc', 'aa/bb');
  t('cc', 'aa/bb/cc', 'aa/bb/');
  t('', 'aa/bb/cc', 'aa/bb/cc');
  t('/bb/cc', 'aa/bb/cc', 'AA', 'aa');
  t('', 'http://site/dir', 'http://site/dir');
  t(undefined, 'http://site/dir.', 'http://site/dir');
  t(undefined, 'http://site/dir', 'http://site/dir.');
  t(undefined, 'http://site/dir', 'http://site/dir/');
  t('/', 'http://site/dir/', 'http://site/dir');
  t('/file', 'http://site/dir/file', 'http://site/dir');
  t('/', '../', '.', '..');
  t = (url, v)=>assert_obj(v, url_http_to_ws(url));
  t('http://site.com', 'ws://site.com');
  t('http://site.com:800/a/b', 'ws://site.com:800/a/b');
  t('https://site.com:800/a/b', 'wss://site.com:800/a/b');
  t = (url, v)=>assert_obj(v, url_proto_parse(url));
  t('/file', {rest: '/file'});
  t('git:/file', {proto: 'git:', proto_name: 'git', rest: '/file'});
  t('git:file', {proto: 'git:', proto_name: 'git', rest: 'file'});
  t('git/dir:file', {rest: 'git/dir:file'});
  let scr = Scroll('0123456789abcdef');
  t = v=>assert_eq(v, scr.out());
  scr.splice(3, 5, 'ABCD');
  t('012ABCD56789abcdef');
  scr.splice(6, 7, 'QW');
  t('012ABCD5QW789abcdef');
  scr.splice(7, 8, '  ');
  t('012ABCD5QW  89abcdef');
  scr.splice(6, 6, '-');
  scr.splice(7, 7, '-');
  scr.splice(8, 8, '-');
  t('012ABCD5-QW-  -89abcdef');
  in_test = 0;
}
test_util();

