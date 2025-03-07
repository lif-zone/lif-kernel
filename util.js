let util_version = '0.2.112';
let exports = {};
exports.version = util_version;
let D = 0; // Debug

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
  let done, timeout, at_end, enable = 0;
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
    at_end ||= Date.now();
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
const TE_to_null = fn=>(function(){ // convert throw Error to null
  try {
    return fn(...arguments);
  } catch(err){
    return null;
  }
});

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
str.prefix = (s, prefix)=>{
  if (s.startsWith(prefix))
    return {prefix: prefix, rest: s.substr(prefix.length)};
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
let assert_eq = (exp, res)=>{
  if (exp==res)
    return;
  console.error('test FAIL: exp', exp, 'res', res);
  throw Error('test FAIL');
}
exports.assert_eq = assert_eq;

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
    this.port.onmessage = event=>this.on_msg(event);
  }
  listen(event){
    if (event.data?.connect){
      this.port = event.ports[0];
      this.port.onmessage = event=>this.on_msg(event);
      return true;
    }
  }
}
exports.postmessage_chan = postmessage_chan;

const path_ext = path=>path.match(/\.[^./]*$/)?.[0];
const _path_ext = path=>path.match(/\.([^./]*)$/)?.[1];
const path_file = path=>path.match(/(^|\/)?([^/]*)$/)?.[2];
const path_dir = path=>path.slice(0, path.length-path_file(path).length);
const path_is_dir = path=>path.endsWith('/');
const path_prefix = (path, prefix)=>{
  let v;
  if (!(v=str.prefix(path, prefix)))
    return;
  if (!v.rest || v.rest[0]=='/' || prefix.endsWith('/'))
    return v;
};
const path_next = path=>{
  let p = path.split('/');
  if (p.length==1)
    return {dir: p[0], rest: null, last: true};
  return {dir: p[0], rest: path.slice(p[0].length+1), last: false};
};

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
const url_parse = TE_url_parse; // XXX remove
const __url_parse = TE_to_null(TE_url_parse);

const TE_url_uri_parse = (url_uri, base)=>{
  base ||= '';
  if (base && base[0]!='/')
    throw Error('invalid base uri '+base);
  let u = url_parse(url_uri, 'http://x'+base);
  if (u.host=='x'){
    u.host = u.hostname = u.origin = u.href = u.protocol = '';
    u.is_uri = true;
    let dir = url_uri.split('/')[0];
    u.is_based = dir=='.' || dir=='..' ? 'uri_rel': dir=='' ? 'uri' : null;
  } else
    u.is_based = 'url';
  return u;
};
const TE_url_uri_parse2 = (url_uri, base_uri)=>{
  if (base_uri[0]!='/')
    throw Error('invalid base uri '+base_uri);
  let u = __url_parse(url_uri);
  if (u){
    u.is_based = 'url';
    u.is = 'url';
    return u;
  }
  u = TE_url_parse(url_uri, 'XxX://XxX'+base_uri);
  if (u.host!='XxX' || u.protocol!='XxX')
    throw Error('invalid url/uri '+url_uri);
  u.host = u.hostname = u.origin = u.href = u.protocol = '';
  u.is_uri = true;
  u.is = 'uri';
  let dir = url_uri.split('/')[0];
  u.is_based = dir=='.' || dir=='..' ? 'uri_rel': dir=='' ? 'uri' : null;
  return u;
};
const url_uri_parse = TE_to_null(TE_url_uri_parse);
const url_uri_parse2 = TE_url_uri_parse2; // XXX remove

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
const uri_q_enc = (q, qmark)=>{
  let s = '';
  for (let [k, v] of OF(q))
    s += (s?'&':'')+uri_enc(k)+'='+uri_enc(v);
  if (s && qmark)
    s = '?'+s;
  return s;
};

exports.path_ext = path_ext;
exports._path_ext = _path_ext;
exports.path_file = path_file;
exports.path_dir = path_dir;
exports.path_is_dir = path_is_dir;
exports.path_prefix = path_prefix;
exports.path_next = path_next;
exports.url_parse = url_parse;
exports.TE_url_parse = TE_url_parse;
exports.url_uri_parse = url_uri_parse;
exports.TE_url_uri_parse = TE_url_uri_parse;
exports.uri_enc = uri_enc;
exports.uri_dec = uri_dec;
exports.uri_q_enc = uri_q_enc;
exports.match_glob_to_regex = match_glob_to_regex;
exports.match_glob = match_glob;

// parse-package-name
const npm_uri_parse = path=>{
  const scoped = /^(@[^\/]+\/[^@\/]+)(?:(@[^\/]+))?(\/.*)?$/
  const non_scoped = /^([^@\/]+)(?:(@[^\/]+))?(\/.*)?$/
  const m = scoped.exec(path) || non_scoped.exec(path)
  return !m ? null : {name: m[1]||'', version: m[2]||'', path: m[3]||''};
};
exports.npm_uri_parse = npm_uri_parse;
const npm_modver = uri=>{
  if (typeof uri=='string')
    uri = npm_uri_parse(uri);
  return uri.name+uri.version;
};
exports.npm_modver = npm_modver;

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

export default exports;

