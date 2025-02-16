let util_version = '0.2.70';
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
  let done, timeout, at_end, enable = 1;
  let p = (async()=>{
    await esleep(ms);
    timeout = true;
    if (!done)
      enable && console.error('slow '+ms+' stuck', ...arg, p.err);
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
  p.print = ()=>console.log('slow '+(done?'completed ':'')+ms
    +' passed '+((at_end||Date.now())-p.now), ...arg);
  return p;
};
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
      let res = await cmd_cb({chan: this, cmd: msg.cmd, arg: msg.arg});
      this.port.postMessage({cmd_res: msg.cmd, id_res: msg.id, res});
    } catch(err){
      console.error('cmd failed', msg);
      this.port.postMessage({cmd_res: msg.cmd, id_res: msg.id, err: ''+err});
      throw err;
    }
  }
  on_msg(event){
    let msg = event.data, id = msg.id_res;
    //console.log('got msg', msg);
    if (msg.cmd)
      return this.cmd_server_cb(msg);
    if (id){
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
const path_file = path=>path.match(/(^|\/)?([^/]*)$/)?.[2];
const path_dir = path=>path.slice(0, path.length-path_file(path).length);
const path_is_dir = path=>path.endsWith('/');
const path_prefix = (path, prefix)=>{
  let v;
  if (!(v=str.prefix(path, prefix)))
    return;
  if (!v.rest || v.rest[0]=='/')
    return v;
};
const url_parse = (url, base)=>{
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
const uri_parse = (uri, base)=>{
  base ||= '';
  if (base && base[0]!='/')
    throw Error('invalid base uri '+base);
  let u = url_parse(uri, 'http://x'+base);
  u.host = u.hostname = u.origin = u.href = u.protocol = '';
  return u;
};
const url_uri_parse = (url_uri, base)=>{
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
exports.path_ext = path_ext;
exports.path_file = path_file;
exports.path_dir = path_dir;
exports.path_is_dir = path_is_dir;
exports.path_prefix = path_prefix;
exports.url_parse = url_parse;
exports.uri_parse = uri_parse;
exports.url_uri_parse = url_uri_parse;

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
const detect_unload = ()=>addEventListener('beforeunload',()=>{debugger});
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

