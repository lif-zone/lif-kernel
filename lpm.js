// LICENSE_CODE JPL lpm.js
let lpm_version = '2026.8.30';
export const version = lpm_version;
let D = 0; // Debug
let in_test = 0;
const {T, Tf, str, assert, OE, assert_obj, assert_obj_f, assert_eq,
  url_parse, T_url_parse, URL_parse, url_proto_parse,
} = await import('./util.js');

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
// Tools: Purge: https://www.jsdelivr.com/tools/purge
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
// git/github.com/USER/REPO/PATH
// git/github.com/USER/REPO@VER/PATH
//   SOURCE https://github.com/USER/REPO/blob/VER/PATH
//   https://raw.githubusercontent.com/USER/REPO/VER/PATH
//   https://statically.io/gh/USER/REPO@VER/PATH
//   https://cdn.jsdelivr.net/gh/USER/REPO@HEAD/PATH
// git/gitlab.com/USER/REPO@VER/PATH
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
// bittorrent/IH/PATH
//  magnet:?xt=urn:btih:IH 
//
// try to support this one day:
// import {groupBy} from 'npm:lodash@4.17.21';

function path_parts(parts){
  return parts.length ? '/'+parts.join('/') : '';
}
export function T_lpm_parse(lpm){
  let l = {};
  let p = lpm.split('/');
  let i = 0;
  let is_npm;
  function next(err){
    let v = p[i++];
    if (typeof v!='string')
      throw Error('lpm_parse missing'+err+': '+lpm);
    if (v=='')
      throw Error('lpm_parse empty element: '+lpm);
    return v;
  }
  function next_submod(){
    let j = p.indexOf('', i);
    if (j==i){
      // in nodejs require('util/') forces it to use npm util, not builtin util
      // but probably should not be allowed for other uses
      if (!is_npm)
        throw Error('invalid empty submod: '+lpm);
      return '';
    }
    if (j<0)
      return '';
    let submod = '/'+p.slice(i, j).join('/')+'/';
    i = j+1;
    return submod;
  }
  function ver_split(name){
    let n = name.split('@');
    if (n.length==1)
      return {name: name, ver: ''};
    if (n.length==2)
      return {name: n[0], ver: '@'+n[1]};
    throw Error('lpm_parse invalid ver inname: '+name);
  }
  let v, lmod, repo;
  l.reg = next('registry (npm, git, bitcoin, lifcoin, ipfs)');
  switch (l.reg){
  case 'npm':
    is_npm = 1;
    l.name = next('module name');
    if (l.name[0]=='@'){
      l.scoped = true;
      let scoped = next('scoped module name');
      v = ver_split(scoped);
      l.name = l.name+'/'+v.name;
    } else {
      v = ver_split(l.name);
      l.name = v.name;
    }
    l.ver = v.ver;
    l.lmod = l.reg+'/'+l.name+l.ver;
    break;
  case 'git': {
    l.host = next('host');
    l.user = next('user');
    repo = next('repo');
    v = ver_split(repo);
    l.repo = v.name;
    l.name = l.user+'/'+l.repo;
    l.ver = v.ver;
    let ver = l.ver ? l.ver.slice(1) : '';
    if (!ver);
    else if (/^[0-9a-f]+$/.test(ver)){
      l.ver_type = ver.length==40 ? 'sha1' : ver.length==64 ? 'sha256' :
        ver.length>=7 && ver.length<=20 ? 'shortcut' :
        'name';
    } else
      l.ver_type = 'name';
    l.lmod = l.reg+'/'+l.host+'/'+l.name+l.ver;
    break; }
  case 'bittorrent':
    l.infohash = next('InfoHash');
    break;
  case 'lifcoin':
    l.blockid = next('BlockID');
    l.lmod = l.reg+'/'+l.blockid;
    break;
  case 'bitcoin':
    l.blockid = next('BlockID');
    l.lmod = l.reg+'/'+l.blockid;
    break;
  case 'ethereum':
    throw Error('unsupported ethereum '+lpm);
    break;
  case 'ipfs':
    l.cid = next('cid');
    l.lmod = l.reg+'/'+l.cid;
    break;
  case 'ipns':
    l.name = next('name');
    l.lmod = l.reg+'/'+l.name;
    break;
  case 'local':
    l.lmod = l.reg;
    break;
  case 'https': case 'http':
    l.host = next('host');
    l.lmod = l.reg+'/'+l.host;
    break;
  default:
    throw Error('invalid registry: '+lpm);
  }
  l.submod = next_submod();
  l.lmod += l.submod;
  let _p = p.slice(i);
  l.path = path_parts(_p);
  return l;
}
export const lpm_parse = Tf(T_lpm_parse);
export function T_lpm_str(l){
  switch (l.reg){
  case 'npm':
    return l.reg+'/'+l.name+l.ver+l.submod+l.path;
  case 'git':
    return l.reg+'/'+l.host+'/'+l.name+l.ver+l.submod+l.path;
  case 'bittorrent':
    return l.reg+'/'+l.infohash+l.submod+l.path;
  case 'lifcoin':
    return l.reg+'/'+l.blockid+l.submod+l.path;
  case 'bitcoin':
    return l.reg+'/'+l.blockid+l.submod+l.path;
    break;
  case 'ethereum':
    throw Error('unsupported ethereum');
  case 'ipfs':
    return l.reg+'/'+l.cid+l.submod+l.path;
  case 'ipns':
    return l.reg+'/'+l.name+l.submod+l.path;
  case 'local':
    return l.reg+l.submod+l.path;
  case 'https': case 'http':
    return l.reg+'/'+l.host+'/'+l.submod+l.path;
  default:
    throw Error('invalid registry: '+l.reg);
  }
}
export const lpm_str = Tf(T_lpm_str);
export function npm_str(u){
  return lpm_to_npm(lpm_str(u));
}

export function T_lpm_lmod(lpm){
  let u = lpm;
  if (typeof lpm=='string')
    u = T_lpm_parse(lpm);
  return u.lmod;
}
export const lpm_lmod = Tf(T_lpm_lmod);

function http_https_to_lpm(url){
  let v;
  if (!(v=str.starts(url, 'http://', 'https://')))
    throw Error('invalid http: https:');
  let u = url_parse(url);
  return T_lpm_str({reg: u.protocol.slice(0, -1), host: u.host,
    submod: u.path=='/' ? '' : u.path.slice(1)+'/', path: ''});
}
function git_to_lpm(url){
  let u = new URL(url), host = u.host;
  let v;
  if (!git_host_t[host]){
    git_host_t[host] = url;
    console.warn('unknown git host '+host+': '+url);
  }
  let p = u.pathname.slice(1).split('/');
  let user = p.shift();
  let repo = p.shift();
  if (!user || !repo)
    throw Error('invalid gith user/repo');
  if (v=str.ends(repo, '.git'))
    repo = v.rest;
  let _path = p.map(p=>'/'+p).join('');
  let ver = u.hash ? '@'+u.hash.slice(1) : '';
  return 'git/'+host+'/'+user+'/'+repo+ver+_path;
}

// parse-package-name: package.json:dependencies
export function T_npm_import_parse({lmod_self, imp, dep, pkg_name}){
  let lmod = T_lpm_lmod(imp);
  let path = T_lpm_parse(imp).path;
  let d = dep, v;
  if (d[0]=='/')
    return T_lpm_str({reg: 'local', submod: d=='/' ? '' : d+'/', path});
  if (v=str.starts(d, './'))
    return lmod_self+(v.rest?'/'+v.rest:'')+path;
  if (v=str.starts(d, 'https://github.com/', 'github:'))
    d = 'git://github.com/'+v.rest;
  if (v=str.starts(d, 'https://gitlab.com/', 'gitlab:'))
    d = 'git://gitlab.com/'+v.rest;
  if (v=str.starts(d, 'https://bitbucket.org/', 'bitbucket:'))
    d = 'git://bitbucket.org/'+v.rest;
  if (v=d.match(/^[a-z0-9-]+\/[a-z0-9._-]+#[^#\/]*$/i))
    d = 'git://github.com/'+d;
  if (v=str.starts(d, 'git:', 'git+https:'))
    return git_to_lpm(d)+path;
  if (v=str.starts(d, 'http://', 'https://'))
    return http_https_to_lpm(d)+path;
  if (v=str.starts(d, 'npm:', '.npm/')){
    let _lmod = 'npm/'+v.rest+path;
    let u = lpm_parse(_lmod);
    if (u.name==pkg_name)
      return lmod_self+u.path;
    return _lmod;
  }
  if (v=str.starts(d, 'node:'))
    return 'npm/node:'+v.rest+path;
  if (v=str.starts(d, 'lif:', '.lif/'))
    return v.rest+path;
  if (v=str.starts(dep, 'file:')){
    let file = v.rest;
    if (!(v=str.starts(file, './')))
      throw Error('only ./ files supported: '+dep);
    return lmod_self+'/'+v.rest;
  }
  let ver = semver_ver_guess(d);
  return ver ? lmod+'@'+ver+path : undefined;
}
export const npm_import_parse = Tf(T_npm_import_parse, '');

export const git_reg_t = {
  'github': 'github.com',
  'gitlab': 'gitlab.com',
  'bitbucket': 'bitbucket.org',
};
const git_host_t = Object.fromEntries(OE(git_reg_t).map(([k, v])=>[v, k]));

export function _npm_parse(npm){
  let v, m;
  if (!npm)
    return {rest: npm, err: 'invalid empty npm'};
  if (npm[0]=='/')
    return {reg: 'local', rest: npm.slice(1)};
  let {proto, proto_name, rest} = url_proto_parse(npm);
  if (v=str.starts(npm, '.lif/')){
    proto = 'lif:';
    rest = v.rest;
  }
  if (proto=='lif:'){
    if (!(m = rest.match(/^([^\/]+)\//)))
      return {rest: npm, err: 'invalid lif: '+npm};
    return {reg: m[1], rest: rest.slice(m[0].length)};
  }
  if (proto=='local:'){
    if (rest[0]!='/')
      return {rest: npm, err: 'invalid local path: '+npm};
    return {reg: 'local', rest: rest.slice(1)};
  }
  if (v=git_reg_t[proto_name]){
    proto = 'git:';
    rest = '//'+v+'/'+rest;
  }
  if (v=npm.match(/^[a-z0-9-]+\/[a-z0-9._-]+#[^#\/]*$/i)){
    proto = 'git:';
    rest = '//github.com/'+npm;
  }
  if (str.is(proto, 'git:', 'git+https:')){
    v = git_to_lpm(proto+rest);
    return {reg: 'git', rest: v.slice(4)};
  }
  if (proto=='npm:')
    return {reg: 'npm', rest};
  if (proto=='node:')
    return {reg: 'npm', rest: 'node:'+rest};
  if (proto=='http:' || proto=='https:'){
    // missing support for https://github.com gitlab.com bitbucket.org
    if (!(v=str.starts(rest, '//')))
      return {rest: npm, err: 'invalid http/https host '+npm};
    return {reg: proto_name, rest: v.rest};
  }
  if (proto)
    return {rest: npm, err: 'invalid proto '+proto};
  return {reg: 'npm', rest: npm};
}
export function npm_norm(npm){
  let p = _npm_parse(npm);
  if (p.reg=='npm')
    return p.rest;
  if (p.reg)
    return '.lif/'+p.reg+'/'+p.rest;
  return npm;
}
export function T_npm_to_lpm(npm){
  let p = _npm_parse(npm);
  if (p.err)
    throw Error(p.err);
  return p.reg+'/'+p.rest;
}
export const npm_to_lpm = Tf(T_npm_to_lpm);

export function T_npm_parse(npm){
  return T_lpm_parse(T_npm_to_lpm(npm));
}

export function T_lpm_to_npm(lpm){
  let u = typeof lpm=='string' ? T_lpm_parse(lpm) : lpm;
  if (u.reg=='npm')
    return u.lmod.slice(4)+u.path;
  return '.lif/'+u.lmod+u.path;
}
export const lpm_to_npm = Tf(T_lpm_to_npm);

export function T_webapp_to_lpm(webapp){
  let v;
  if (webapp[0]=='/')
    return 'local'+webapp;
  if (v=str.starts(webapp, 'lif:', 'lif/'))
    return v.rest;
  if (v=str.starts(webapp, 'http:', 'https:')){
    if (v.rest.slice(0, 2)!='//')
      throw Error('invalid webapp '+webapp);
    return v.start.slice(0, -1)+'/'+v.rest.slice(2);
  }
  if (v=str.starts(webapp, 'git:'))
    return 'git/'+v.rest;
  if (lpm_parse(webapp))
    return webapp;
  throw Error('invalid webapp: '+webapp);
}
export const webapp_to_lpm = Tf(T_webapp_to_lpm);

export function lpm_to_sw_passthrough(lpm){
  let l = lpm_parse(lpm);
  switch (l.reg){
  case 'local':
    return l.submod.slice(0, -1)+l.path;
  case 'https': case 'http':
    return l.reg+'://'+l.host+l.submod.slice(0, -1)+l.path;
  }
  return '/.lif/'+lpm;
}

export function url_uri_type(url_uri){
  if (!url_uri)
    throw Error('empty url_uri');
  let u = URL_parse(url_uri);
  if (u){
    if (u.protocol=='node:')
      return 'mod';
    return 'url';
  }
  if (url_uri[0]=='/')
    return 'uri';
  let dir = url_uri.split('/')[0];
  if (dir=='.' || dir=='..')
    return 'rel';
  return 'mod';
}

function __uri_parse(uri, base){
  if (base && base[0]!='/')
    throw Error('invalid base '+base);
  let u = T_url_parse(uri, 'xxx://x'+(base||''));
  u.host = u.hostname = u.origin = u.href = u.protocol = '';
  return u;
}

export function lpm_ver_missing(u){
  u = _lpm_parse(u);
  return str.is(u.reg, 'npm', 'git') && !u.ver;
}
export function lpm_is_perm(u){
  // XXX needs a lot of refinements. only npm releases (not ^4.1.2,
  // just =4.1.2, are perm. latest is also not perm. semver:~4.1.2 github is
  // also not perm. also commit'ish (not full commit id) is no perm
  let l = _lpm_parse(u);
  switch (l.reg){
  case 'npm':
    // XXX need to validate ver string is final, not expr, not 'latest'
    return !!l.ver;
  case 'git':
    // XXX need to validate ver string is final '4.2.1' not '^4.2.1',
    // not expr semver:.., not 'latest'
    return !!l.ver;
  case 'bittorrent':
    return true;
  case 'lifcoin':
    return true;
  case 'bitcoin':
    return true;
  case 'ethereum':
    throw Error('unsupported ethereum');
  case 'ipfs':
    return true;
  case 'ipns':
    return true;
  case 'local':
    return false;
  case 'https': case 'http':
    return false;
  default:
    throw Error('invalid registry: '+l.reg);
  }
}
export function _lpm_parse(lpm){
  return typeof lpm=='string' ? lpm_parse(lpm) : lpm;
}
export function lpm_same_base(lmod_a, lmod_b){
  let a = _lpm_parse(lmod_a), b = _lpm_parse(lmod_b);
  return a.reg==b.reg && a.name==b.name;
}
export function lpm_ver_from_base(lpm, base){
  if (!base)
    return;
  lpm = _lpm_parse(lpm);
  base = _lpm_parse(base);
  if (!(lpm_same_base(lpm, base) && lpm_ver_missing(lpm) && base.ver))
    return;
  return lpm_str({...lpm, ver: base.ver});
}
export function npm_ver_from_base(npm, base){
  if (!base)
    return;
  let v = lpm_ver_from_base(npm_to_lpm(npm), npm_to_lpm(base));
  if (!v)
    return;
  return lpm_to_npm(v);
}

export function T_npm_url_base(url_uri, base_uri){
  let t = url_uri_type(url_uri);
  let tbase = base_uri ? url_uri_type(base_uri) : null;
  let u, is = {};
  if (t=='rel' && !tbase)
    throw Error('npm_url_base('+url_uri+') rel without base');
  if (t=='rel')
    is.rel = 1;
  if (t=='url' || t=='rel' && tbase=='url'){
    let u = url_parse(url_uri, t=='rel' ? base_uri : undefined);
    u.is = is;
    if (u.protocol=='blob:')
      u.is.blob = 1;
    else if (u.protocol=='data:')
      u.is.data = 1;
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
  let base = tbase=='mod' ? T_npm_parse(base_uri) : undefined;
  if (t=='mod'){
    let lpm = T_npm_parse(url_uri);
    let uri = url_uri;
    if (lpm_ver_from_base(lpm, base)){
      is.rel_ver = 1;
      lpm.ver = base.ver;
      uri = npm_str(lpm);
    }
    u = __uri_parse('/'+uri);
    u.is = is;
    u.path = u.pathname = u.path.slice(1);
    u.dir = u.dir.slice(1);
    u.lmod = T_npm_parse(u.path);
    return u;
  }
  if (t=='rel' && tbase=='mod'){
    base.path = __uri_parse(url_uri, base.path).path;
    u = __uri_parse('/'+npm_str(base));
    u.is = is;
    u.path = u.pathname = u.path.slice(1);
    u.dir = u.dir.slice(1);
    u.lmod = T_npm_parse(u.path);
    return u;
  }
  throw Error('npm_url_base('+url_uri+','+base_uri+') failed');
}
export const npm_url_base = Tf(T_npm_url_base);

function is_num(v){
  let n = +v;
  return ''+n==v && Number.isInteger(n) && n>=0;
}
let semver_re_part = /v?([0-9.]+)([\-+][0-9.\-+A-Za-z]*)?/;
let semver_re_start = new RegExp('^'+semver_re_part.source);
let semver_re = new RegExp('^'+semver_re_part.source+'$');
export function semver_parse(semver, strict){
  let m = semver.match(semver_re);
  if (!m)
    return;
  let p = {ver: m[1], rel: m[2]||''};
  if (!strict)
    return p;
  let v = p.ver.split('.');
  if (v.length!=3)
    return;
  for (let i=0; i<3; i++){
    if (!is_num(v[i]))
      return;
  }
  return p;
}

function semver_cmp_part(a, b){
  if (a==b)
    return 0;
  if (a==undefined || b==undefined)
    return +(a!=undefined) - +(b!=undefined);
  let an = is_num(a), bn = is_num(b);
  if (an != bn)
    return +is_num(a) - +is_num(b);
  if (an)
    return +a > +b ? 1 : -1;
  return a>b ? 1: -1;
}
export function semver_cmp(a, b){
  let _a = semver_parse(a, 1), _b = semver_parse(b, 1);
  if (a==b)
    return 0;
  if (!_a || !_b)
    return !!_a - !!_b; // parsing error
  if (!_a.rel != !_b.rel)
    return +!_a.rel - +!_b.rel;
  let va = _a.ver.split('.'), vb = _b.ver.split('.');
  for (let i=0; i<Math.max(va.length, vb.length); i++){
    if (+va[i] != +vb[i])
      return semver_cmp_part(va[i], vb[i]);
  }
  let ra = _a.rel.slice(1).split('.'), rb = _b.rel.slice(1).split('.');
  for (let i=0; i<Math.max(ra.length, rb.length); i++){
    if (ra[i] != rb[i])
      return semver_cmp_part(ra[i], rb[i]);
  }
  assert();
}

const semver_op_re_start = /^(\^|=|~|>=|<=|\|\|)/;
export function T_semver_range_parse(semver_range){
  let s = semver_range, m, range = [];
  function is(re){
    m = s.match(re);
    if (!m)
      return;
    s = s.slice(m[0].length);
    return true;
  }
  is(/^ +/);
  while (s){
    let op, ver;
    if (is(semver_op_re_start))
      op = m[0];
    is(/^ +/);
    if (op=='||'){
      range.push({op: '||', ver: ''});
      continue;
    }
    if (!is(semver_re_start))
      throw Error('invalid semver_range '+semver_range);
    ver = m[0].replace(/^v/, '');
    range.push({op: op||'', ver});
    is(/^ +/);
  }
  if (!range.length)
    throw Error('empty semver range');
  return range;
}
export const semver_range_parse = Tf(T_semver_range_parse);

export function semver_ver_guess(semver_range){
  let range = semver_range_parse(semver_range);
  if (!range){
    D && console.log('invalid semver_range: '+semver_range);
    return;
  }
  let {op, ver} = range[0];
  if (range.length>1)
    D && console.log('ignoring multi-op imp: '+semver_range);
  if (op=='>=')
    return;
  if (op=='^' || op=='=' || op=='' || op=='~')
    return ver;
  D && console.log('invalid op: '+op);
}

// https://webpack.js.org/guides/package-exports/
// check works with https://app.unpkg.com/rxjs@7.8.2/files/package.json
// "exports": {
//    ".": {
//      "types": "./dist/types/index.d.ts",
//    },
//    "./ajax": {
//      "types": "./dist/types/ajax/index.d.ts",
//    },
//    "./internal/*": {
//      "types": "./dist/types/internal/*.d.ts",
//    },
// }
// only single * allowed in exports
// exports_glob does reverse lookup: checks if path matches dst, and if so,
// it looks up the relative src file for it.
export function export_path_match(path, match, tr){
  if (path==match)
    return tr||true;
  let m = match.split('*');
  if (m.length==1)
    return;
  if (m.length>2)
    return void !in_test && console.warn('exports invalid match '+match);
  if (path.length<m[0].length+m[1].length)
    return;
  if (!path.startsWith(m[0]) || !path.endsWith(m[1]))
    return;
  if (!tr)
    return true;
  // validate the '*' does not include '/'
  let replace = path.slice(m[0].length, -m[1].length||undefined);
  let t = tr.split('*');
  // match replacement can be a directory only in special case where '*'
  // is at the end of both match and tr
  if (replace.includes('/') && (m[1] || t[1]))
    return;
  if (t.length!=2)
    return void !in_test && console.warn('exports invalid target '+tr);
  return t[0]+replace+t[1];
}

let proto_re = /^[a-z][a-z0-9_+-]+:/;
function export_file_fixup(file){
  if (!file)
    return;
  if (file.startsWith('./'))
    return file.length>2 ? file : undefined;
  if (proto_re.test(file))
    return file;
  if (file[0]=='/' || file[0]=='.')
    return void !in_test && console.warn('invalid export '+file);
  return './'+file;
}
export function pkg_exports_lookup(pkg, file){
  function check_val(dst){
    if (typeof dst!='string')
      return;
    let v;
    if (v=export_file_fixup(dst))
      return v;
  }
  function parse_target(tr){
    if (typeof tr=='string')
      return check_val(tr);
    if (!tr || typeof tr!='object')
      return;
    if (Array.isArray(tr)){
      for (let e of tr){
        let v;
        if (v=parse_target(e))
          return v;
      }
      return;
    }
    return parse_target(tr.browser) ||
      parse_target(tr.module) ||
      parse_target(tr.import) ||
      parse_target(tr.default) ||
      parse_target(tr.require);
  }
  function parse_section(sec){
    if (!sec)
      return;
    let tr = sec[file];
    if (tr)
      return parse_target(tr);
    let best = '';
    for (let [match, _tr] of OE(sec)){
      if (match.length<=best.length || !match.includes('*'))
        continue;
      if (!export_path_match(file, match))
        continue;
      best = match;
      tr = _tr;
    }
    let _tr = parse_target(tr);
    if (!_tr)
      return;
    return export_path_match(file, best, _tr);
  }
  function parse_pkg(){
    let sec, v;
    if (sec=pkg.lif?.exports){
      if (typeof sec=='string')
        sec = {'.': sec};
      if (v=parse_section(sec))
        return v;
    }
    if (sec=pkg.exports){
      if (typeof sec=='string')
        sec = {'.': sec};
      return parse_section(sec);
    }
    if (file=='.'){
      v = check_val(pkg.browser) ||
        check_val(pkg.module) ||
        check_val(pkg.main) ||
        check_val('./index.js');
    } else
      v = parse_section(pkg.browser);
    if (!v)
      return;
    return v;
  }
  // start package.json lookup
  if (file=='./package.json')
    return file;
  if (file=='./')
    file = '.';
  let v;
  let f = parse_pkg();
  if (!f)
    return;
  if (f!=file) // redirect
    D && console.log('export_lookup redirect '+file+' -> '+f);
  return f;
}

export function pkg_web_exports_lookup(pkg, file){
  function lookup(exports){
    if (!exports)
      return;
    let tr = exports[file];
    if (tr)
      return tr;
    let best = '';
    for (let [match, _tr] of OE(exports)){
      let v;
      if (match.length<=best.length || !match.includes('*'))
        continue;
      if (!(v=export_path_match(file, match, _tr)))
        continue;
      best = match;
      tr = v;
    }
    return tr;
  }
  let v;
  if (v=lookup(pkg.lif?.web_exports))
    return v;
  if (v=lookup(pkg.web_exports))
    return v;
}

// XXX merge glob_match with pkg_exports_lookup() file matching
function glob_match(pattern, path){
  let re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.+/)?')
    .replace(/\*/g, '[^/]*');
  return new RegExp('^'+re+'$').test(path);
}

// XXX add unit-tests
export function pkg_transform_lookup(pkg, path){
  let transform = pkg.lif?.transform;
  if (!transform)
    return;
  let rel = '.'+path;
  for (let [pattern, tr] of OE(transform)){
    if (glob_match(pattern, rel))
      return tr;
  }
}

export function pkg_transform_type(pkg, path){
  let tr = pkg_transform_lookup(pkg, path);
  if (!tr?.type)
    return;
  return tr.type.replace(/^\./, '');
}

// https://docs.npmjs.com/cli/v11/configuring-npm/package-json
export function pkg_import_lookup({lmod_self, pkg, imp}){
  let lmod_imp = T_lpm_lmod(imp);
  let npm_imp = T_lpm_to_npm(lmod_imp);
  function get_imp(deps, is_peer){
    let d, v;
    if (!(d = deps?.[npm_imp]))
      return;
    if (v = npm_import_parse({lmod_self, imp, dep: d, pkg_name: pkg.name}))
      return v;
    if (is_peer)
      return d; // we dont currently use peer's version range
    !in_test && console.warn('invalid import('+pkg.name+') format '+imp, d);
    return '';
  }
  let found = {};
  found.over = get_imp(pkg.lif?.overrides);
  found.over ||= get_imp(pkg.overrides);
  found.optional = get_imp(pkg.lif?.optionalDependencies);
  found.optional ||= get_imp(pkg.optionalDependencies);
  found.reg = get_imp(pkg.lif?.dependencies);
  found.reg ||= get_imp(pkg.dependencies);
  found.dev = get_imp(pkg.lif?.devDependencies);
  found.dev ||= get_imp(pkg.devDependencies);
  found.peer = get_imp(pkg.lif?.peerDependencies, true);
  found.peer ||= get_imp(pkg.peerDependencies, true);
  return found;
}

function test_util(){
  in_test = 1;
  let t = (url_uri, v)=>assert_obj(v, url_uri_type(url_uri));
  t('http://site.com/', 'url');
  t('http://site.com/a/b', 'url');
  t('https://site.com/a/b', 'url');
  t('blob:abcd', 'url');
  t('/dir', 'uri');
  t('/dir/a/b', 'uri');
  t('.', 'rel');
  t('./dir/a/b', 'rel');
  t('..', 'rel');
  t('../dir/a/b', 'rel');
  t('module', 'mod');
  t('module/a/b', 'mod');
  t('node:module', 'mod');
  t('node:module/a/b', 'mod');
  t = (npm, v)=>assert_obj(v, npm_norm(npm));
  t('mod', 'mod');
  t('.lif/npm/mod', 'mod');
  t('/', '.lif/local/');
  t('/dir/file', '.lif/local/dir/file');
  t('/mod//file', '.lif/local/mod//file');
  t('local:/mod//file', '.lif/local/mod//file');
  t('.lif/local/mod//file', '.lif/local/mod//file');
  t('git://github.com/user/repo', '.lif/git/github.com/user/repo');
  t('git+https://github.com/user/repo', '.lif/git/github.com/user/repo');
  t('git://github.com/user/repo/submod//file#ver',
    '.lif/git/github.com/user/repo@ver/submod//file');
  t('.lif/git/github.com/user/repo@ver/submod//file',
    '.lif/git/github.com/user/repo@ver/submod//file');
  t('github:user/repo/submod//file#ver',
    '.lif/git/github.com/user/repo@ver/submod//file');
  t('user/repo#ver', '.lif/git/github.com/user/repo@ver');
  t('user/repo', 'user/repo'); // notice: in NPM this is github:user/repo
  t('user/repo#', '.lif/git/github.com/user/repo');
  t('https://site.com/dir/file', '.lif/https/site.com/dir/file');
  // XXX: missing detection of git hosts
  t('https://github.com/user/repo', '.lif/https/github.com/user/repo');
  t = (npm, v)=>assert_obj_f(v, T_npm_parse(npm));
  t('@noble/hashes@1.2.0/esm/utils.js',
    {name: '@noble/hashes', scoped: true,
    ver: '@1.2.0',
    lmod: 'npm/@noble/hashes@1.2.0', path: '/esm/utils.js'});
  t('@noble/hashes@1.2.0/esm/utils.js',
    {name: '@noble/hashes', scoped: true,
    ver: '@1.2.0',
    lmod: 'npm/@noble/hashes@1.2.0', path: '/esm/utils.js'});
  t = (lpm, v)=>{
    let t;
    assert_obj_f(v, t=lpm_parse(lpm));
    if (v)
      assert_eq(lpm, T_lpm_str(t));
  };
  t('local/package.json', {reg: 'local', submod: '',
    lmod: 'local', path: '/package.json'});
  t('local/mod/sub//package.json', {reg: 'local', submod: '/mod/sub/',
    lmod: 'local/mod/sub/', path: '/package.json'});
  t('local/mod/sub//dir/file', {reg: 'local', submod: '/mod/sub/',
    lmod: 'local/mod/sub/', path: '/dir/file'});
  t('local/mod/dir/', {reg: 'local', submod: '/mod/dir/',
    lmod: 'local/mod/dir/', path: ''});
  t('local/mod/sub//', {reg: 'local', submod: '/mod/sub/',
    lmod: 'local/mod/sub/', path: '/'});
  t('npm/mod/dir/file', {reg: 'npm', submod: '',
    lmod: 'npm/mod', path: '/dir/file'});
  t('npm/mod/dir/file', {reg: 'npm', submod: '',
    lmod: 'npm/mod', path: '/dir/file'});
  t('npm/mod/dir/', {reg: 'npm', submod: '/dir/',
    lmod: 'npm/mod/dir/', path: ''});
  t('npm/mod/sub//', {reg: 'npm', submod: '/sub/',
    lmod: 'npm/mod/sub/', path: '/'});
  t('npm/mod/', {reg: 'npm', submod: '', lmod: 'npm/mod', path: '/'});
  t = (v, lpm)=>assert_eq(v, !!lpm_parse(lpm));
  t(true, 'npm/mod/dir/file.js');
  t(true, 'npm/mod/dir//file.js');
  t = (dep, v, opt={})=>assert_eq(v,
    npm_import_parse({lmod_self: 'npm/self@4.5.6', imp: 'npm/xxx', dep, ...opt}));
  t('npm:react', 'npm/react');
  t('npm:react/index.js', 'npm/react/index.js');
  t('npm:@mod/sub@1.2.3/index.js', 'npm/@mod/sub@1.2.3/index.js');
  t('git://github.com/mochajs/mocha', 'git/github.com/mochajs/mocha');
  t('git+https://github.com/mochajs/mocha', 'git/github.com/mochajs/mocha');
  t('github:mochajs/mocha', 'git/github.com/mochajs/mocha');
  t('git://github.com/mochajs/mocha.git#4727d357ea',
    'git/github.com/mochajs/mocha@4727d357ea');
  // XXX temporarily ignore ^. real fix should be in version lookup code.
  // lookup newest release on branch
  0 && t('git://github.com/mochajs/mocha.git#^4727d357ea',
    'git/github.com/mochajs/mocha@4727d357ea');
  0 && t('git://github.com/mochajs/mocha.git#=4727d357ea',
    'git/github.com/mochajs/mocha@4727d357ea');
  t('git://github.com/mochajs/mocha.git/index.js#4727d357ea',
    'git/github.com/mochajs/mocha@4727d357ea/index.js');
  t('git://github.com/mochajs/mocha/dir/file.js',
    'git/github.com/mochajs/mocha/dir/file.js');
  t('git://github.com/npm/cli.git#v1.0.27', 'git/github.com/npm/cli@v1.0.27');
  t('git://github.com/npm/cli.git#semver:~1.0.27',
    'git/github.com/npm/cli@semver:~1.0.27');
  t('https://github.com/npm/cli.git#v1.0.27',
    'git/github.com/npm/cli@v1.0.27');
  t('https://github.com/npm/cli#v1.0.27', 'git/github.com/npm/cli@v1.0.27');
  t('https://gitlab.com/npm/cli#v1.0.27', 'git/gitlab.com/npm/cli@v1.0.27');
  t('https://any.com/dir', 'https/any.com/dir/');
  t('http://any.com/dir', 'http/any.com/dir/');
  t('https://any.com:9000/dir', 'https/any.com:9000/dir/');
  t('http://any.com:9000/dir', 'http/any.com:9000/dir/');
  t('file:./dir/index.js', 'npm/self@4.5.6/dir/index.js');
  t('./dir/index.js', 'npm/self@4.5.6/dir/index.js');
  t('npm:self/dir/index.js', 'npm/self/dir/index.js');
  t('npm:self/dir/index.js', 'npm/self@4.5.6/dir/index.js',
    {pkg_name: 'self'});
  t('node:path', 'npm/node:path');
  t('node:path/a/b', 'npm/node:path/a/b');
  t('http://localhost:3000/lif-kernel', // XXX
    'http/localhost:3000/lif-kernel//util.js',
    {imp: 'npm/lif-kernel/util.js'});
  t('git://github.com/mochajs/mocha',
    'git/github.com/mochajs/mocha/mod.js',
    {imp: 'npm/mochajs/mod.js'});
  t('lif:npm/react', 'npm/react');
  t('.lif/npm/react', 'npm/react');
  t('lif:git/github.com/npm/cli@v1.0.27','git/github.com/npm/cli@v1.0.27');
  t('user/repo#ver', 'git/github.com/user/repo@ver');
  t('user/repo'); // notice: in NPM this is github:user/repo
  t('user/repo#', 'git/github.com/user/repo');
  t = (imp, dep, v)=>
    assert_eq(v, npm_import_parse({lmod_self: 'npm/mod', imp, dep}));
  t('npm/react', '^18.3.1', 'npm/react@18.3.1');
  t('npm/react/file', '^18.3.1', 'npm/react@18.3.1/file');
  t('npm/xxx', '/', 'local');
  t('npm/xxx/file', '/', 'local/file');
  t('npm/xxx/file', '/DIR', 'local/DIR//file');
  t('npm/react', '=18.3.1', 'npm/react@18.3.1');
  t('npm/react', '18.3.1', 'npm/react@18.3.1');
  t('npm/react', '>=18.3.1');
  t('npm/pages/_app.tsx', './pages', 'npm/mod/pages/_app.tsx');
  t('npm/loc/file.js', '/loc', 'local/loc//file.js');
  t('npm/react', '^18.3.1', 'npm/react@18.3.1');
  t('npm/react/index.js', '^18.3.1', 'npm/react@18.3.1/index.js');
  t('npm/rmod', 'npm:react@18.3.1', 'npm/react@18.3.1');
  t('npm/os/dir/index.js', '.lif/git/github.com/repo/mod',
    'git/github.com/repo/mod/dir/index.js');
  t('npm/mod2/dir/main.tsx', '.lif/local/MOD/',
    'local/MOD//dir/main.tsx');
  t('npm/http1/dir/main.tsx', 'http://localhost:3000/MOD',
    'http/localhost:3000/MOD//dir/main.tsx');
  t('npm/http2/dir/main.tsx', 'http://localhost:3000/MOD',
    'http/localhost:3000/MOD//dir/main.tsx');
  t('npm/https1/dir/main.tsx', 'https://localhost:3000/MOD',
    'https/localhost:3000/MOD//dir/main.tsx');
  t('npm/http2/dir/main.tsx', '.lif/http/localhost:3000/MOD/',
    'http/localhost:3000/MOD//dir/main.tsx');
  //t('npm/os/dir/index.js', 'git:user/github.com/repo/mod',
  //  'git/github.com/repo/mod/dir/index.js');
  t = (npm, v)=>assert_eq(v, npm_to_lpm(npm));
  t('mod', 'npm/mod');
  t('mod/dir/file', 'npm/mod/dir/file');
  t('@mod/sub', 'npm/@mod/sub');
  t('@mod/sub/', 'npm/@mod/sub/');
  t('@mod/sub/file', 'npm/@mod/sub/file');
  t('.lif/npm/mod', 'npm/mod');
  t('npm:mod', 'npm/mod');
  t('npm:mod/a/b', 'npm/mod/a/b');
  t('node:mod', 'npm/node:mod');
  t('node:mod/a/b', 'npm/node:mod/a/b');
  t('.lif/npm/mod/dir/file', 'npm/mod/dir/file');
  t('.lif/git/github.com/a_user/a_repo', 'git/github.com/a_user/a_repo');
  t('git://github.com/a_user/a_repo', 'git/github.com/a_user/a_repo');
  t('github:a_user/a_repo', 'git/github.com/a_user/a_repo');
  t('.lif/git/github.com/a_user/a_repo/dir/file',
    'git/github.com/a_user/a_repo/dir/file');
  t('.lif/local/file.js', 'local/file.js');
  t('local:/file.js', 'local/file.js');
  t('/file.js', 'local/file.js');
  t('/mod//file.js', 'local/mod//file.js');
  t('.lif/local/file.js', 'local/file.js');
  t('.lif/local/mod//file.js', 'local/mod//file.js');
  t('http://site/dir', 'http/site/dir');
  t('https://site/dir', 'https/site/dir');
  t = (lpm, v)=>assert_eq(v, lpm_to_npm(lpm));
  t('npm/mod', 'mod');
  t('npm/mod/file.js', 'mod/file.js');
  t('npm/mod/sub//file.js', 'mod/sub//file.js');
  t(lpm_parse('npm/mod/sub//file.js'), 'mod/sub//file.js');
  t('git/github.com/user/repo', '.lif/git/github.com/user/repo');
  t('git/gitlab.com/user/repo/file.js',
    '.lif/git/gitlab.com/user/repo/file.js');
  t('local', '.lif/local');
  t('local/file.js', '.lif/local/file.js');
  t('local/dir/file.js', '.lif/local/dir/file.js');
  t('local/sub//dir/file.js', '.lif/local/sub//dir/file.js');
  t = (lpm, lmod, path)=>{
    let u = T_lpm_parse(lpm);
    assert_eq(path, u.path);
    assert_eq(lmod, u.lmod);
    assert_eq(lmod, T_lpm_lmod(lpm));
    assert_eq(lpm, T_lpm_str(u));
  };
  t('local', 'local', '');
  t('local/main.tsx', 'local', '/main.tsx');
  t('local/mod//dir/main.tsx', 'local/mod/', '/dir/main.tsx');
  t('local/mod//', 'local/mod/', '/');
  t('local/mod/', 'local/mod/', '');
  t('npm/mod', 'npm/mod', '');
  t('npm/mod/dir/main.tsx', 'npm/mod', '/dir/main.tsx');
  t('git/github.com/user/repo', 'git/github.com/user/repo', '');
  t('git/github.com/user/repo/dir/file.js',
    'git/github.com/user/repo', '/dir/file.js');
  t('git/github.com/user/repo/mod//dir/file.js',
    'git/github.com/user/repo/mod/', '/dir/file.js');
  t('git/github.com/user/repo@ver/mod//dir/file.js',
    'git/github.com/user/repo@ver/mod/', '/dir/file.js');
  t = (v, arg)=>assert_obj_f(v, T_npm_url_base(...arg));
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
  t({path: 'mod@1.2.3/c/c/d', is: {mod: 1, rel: 1}},
    ['./c/d', 'mod@1.2.3/c/a']);
  t({path: 'mod@1.2.3/c/d', is: {mod: 1, rel_ver: 1}},
    ['mod/c/d', 'mod@1.2.3/c/a']);
  t({path: 'mod@4.5.6/c/d', is: {mod: 1}}, ['mod@4.5.6/c/d', 'mod@1.2.3/c/a']);
  t({path: 'mod/c/d', is: {mod: 1}}, ['mod/c/d', 'other@1.2.3/c/a']);
  t({path: '.lif/git/github.com/user/repo@v1.2.3/c/d', is: {mod: 1, rel_ver: 1}},
    ['.lif/git/github.com/user/repo/c/d', '.lif/git/github.com/user/repo@v1.2.3/c/a']);
  t({path: '.lif/git/github.com/user/repo/c/d', is: {mod: 1}},
    ['.lif/git/github.com/user/repo/c/d',
    '.lif/git/github.com/other/repo@v1.2.3/c/a']);
  t({path: 'mod/sub//a/c/d', is: {mod: 1, rel: 1}}, ['./c/d', 'mod/sub//a/b']);
  t({path: '@mod/sub/a/c/d', is: {mod: 1, rel: 1}}, ['./c/d', '@mod/sub/a/b']);
  t({path: '.lif/git/github.com/user/repo@1.2.3/a/c/d', is: {mod: 1, rel: 1}},
    ['./c/d', '.lif/git/github.com/user/repo@1.2.3/a/b']);
  t = (webapp, v)=>assert_eq(v, webapp_to_lpm(webapp));
  t('lif:local/file.js', 'local/file.js');
  t('local/file.js', 'local/file.js');
  t('/file.js', 'local/file.js');
  t('lif:npm/react', 'npm/react');
  t('npm/react', 'npm/react');
  t('https://any.com:9000/dir', 'https/any.com:9000/dir');
  t('https/any.com:9000/dir/', 'https/any.com:9000/dir/');
  t('lif/git/github.com/npm/cli@v1.0.27','git/github.com/npm/cli@v1.0.27');
  t('git:github.com/npm/cli@v1.0.27','git/github.com/npm/cli@v1.0.27');
  t = (lpm, v)=>assert_eq(v, lpm_to_sw_passthrough(lpm));
  t('local/dir/file.js', '/dir/file.js');
  t('local/dir//file.js', '/dir/file.js');
  t('http/localhost:3000/dir//file.js', 'http://localhost:3000/dir/file.js');
  t('npm/mod/file.js', '/.lif/npm/mod/file.js');
  t = (lpm, v)=>assert_eq(v, lpm_is_perm(lpm));
  t('npm/mod@1.2.3/file', true);
  t('npm/mod/dir', false);
  t('npm/other@1.2.3/file', true);
  t('npm/node:path', false);
  t('npm/node:path@26.1.0', true);
  t('local/dir/file', false);
  t('local/dir@1.2.3/file', false); // probaby useless and invalid
  t('git/github.com/user/repo/dir', false);
  t('git/github.com/user/repo@1.2.3/file', true);
  t = (lpm, base, v)=>assert_eq(v, lpm_ver_from_base(lpm, base));
  t('npm/mod/dir', 'npm/mod@1.2.3/file', 'npm/mod@1.2.3/dir');
  t('npm/mod/dir', 'npm/mod/file');
  t('npm/mod/dir', 'npm/mod/dir');
  t('npm/mod/dir', 'npm/other@1.2.3/file');
  t('local/dir/file', 'local/dir@1.2.3/file');
  t('git/github.com/user/repo/dir', 'git/github.com/user/repo@1.2.3/file',
    'git/github.com/user/repo@1.2.3/dir');
  t = (semver, v, strict)=>assert_obj(v, semver_parse(semver, strict));
  t('1.2.3', {ver: '1.2.3', rel: ''});
  t('1.2.3-abc', {ver: '1.2.3', rel: '-abc'});
  t('1.2.3-abc2-341.3', {ver: '1.2.3', rel: '-abc2-341.3'});
  t('x1.2.3-abc2-341.3');
  t('1.2.3x-abc2-341.3');
  t('1.2.3-a_');
  t('01.2.3', {ver: '01.2.3', rel: ''});
  t('01.2.3', undefined, true);
  t('1.2..3', {ver: '1.2..3', rel: ''});
  t('1.2..3', undefined, true);
  t = (range, v, guess)=>{
    assert_obj_f(v, semver_range_parse(range));
    assert_obj(guess, semver_ver_guess(range));
  };
  t('1.2.3', [{ver: '1.2.3'}], '1.2.3');
  t('v1.2.3-ab', [{ver: '1.2.3-ab'}], '1.2.3-ab');
  t('=1.2.3', [{ver: '1.2.3', op: '='}], '1.2.3');
  t('~1.2.3', [{ver: '1.2.3', op: '~'}], '1.2.3');
  t('1.2.3 >=v1.3.4', [{op: '', ver: '1.2.3'}, {op: '>=', ver: '1.3.4'}],
    '1.2.3');
  t(' = 1.2.3 >= 1.3.4 ', [{op: '=', ver: '1.2.3'}, {op: '>=', ver: '1.3.4'}],
    '1.2.3');
  t('=1.2.3 +1.3.4');
  t('=1.2.3 x.2.3');
  t('^1.2.3 || ^4.5.6', [{op: '^', ver: '1.2.3'}, {op: '||', ver: ''},
    {op: '^', ver: '4.5.6'}], '1.2.3');
  t('  ');
  t = (a, b, v)=>assert_obj(v, semver_cmp_part(a, b));
  t('0', '1', -1);
  t('10', '0', 1);
  t('0', '01', 1);
  t('00', '01', -1);
  t('aa', 'ab', -1);
  t('aa', '1', -1);
  t('1', 'aa', 1);
  t('9', '80', -1);
  t('100', '80', 1);
  t = (a, b, v)=>assert_obj(v, semver_cmp(a, b));
  t('1.0.0-alpha', '1.0.0-alpha.1', -1);
  t('1.0.0-alpha.1', '1.0.0-alpha.2', -1);
  t('1.0.0-beta', '1.0.0-alpha.999', 1);
  t('1.0.0-rc.1', '1.0.0-rc.10', -1);
  t('1.0.0-x.7', '1.0.0-x.11', -1);
  t('1.0.0-9', '1.0.0-10', -1);
  t('1.2.3', '1.11.1', -1);
  t('1.2.3', '1.0,8', 1);
  t('1.2.3', '2.0.0', -1);
  t('1.2.3', '1.2.3-abc', 1);
  t('1.2.3', '1.2.4-abc', 1);
  t('1.2.3', '1.3.04', 1);
  t('1.2.3', '1.3.x', 1);
  t = (path, match, tr, v)=>assert_obj(v, export_path_match(path, match, tr));
  t('./file', './file', './file', './file');
  t('.', '.', '.', '.');
  t('.', './abc', './def', undefined);
  t('file', 'f', 'd', undefined);
  t('.', '.', './index.js', './index.js');
  t('./file', './file', './file.js', './file.js');
  t('.', './f', './d', undefined);
  t('./abc/file.js', './abc/*', './def/*', './def/file.js');
  t('./abc/dir/file.js', './abc/*', './def/*', './def/dir/file.js');
  t('./abc/file.js', './abc/*.js', './def/*', './def/file');
  t('./abc/dir/file.js', './abc/*.js', './def/*', undefined);
  t('./abc/file.js', './abc/*', './def/*.js', './def/file.js.js');
  t('./abc/dir/file.js', './abc/*', './def/*.js', undefined);
  t('./abc/file.js', './*/file.js', './def/*.js', './def/abc.js');
  t('./abc/xxx/file.js', './*/file.js', './def/*.js', undefined);
  t('./abc/file.js', './*/file.js', './def/*', './def/abc');
  t('./abc/xxx/file.js', './*/file.js', './def/*', undefined);
  t = (path, match, v)=>assert_eq(v, export_path_match(path, match));
  t('./esm/file.js', './esm/*', true);
  t('./esm/file.js', './esm/*.js', true);
  t('./esm/file.js', './esm/*.css');
  t('./esm/file.js', './esm');
  t('./esm/file.js', './file.js');
  t('./esm/file.js', './*/file.js', true);
  t('./file.js', './file.jss');
  t = (file, fix)=>assert_eq(fix, export_file_fixup(file));
  t(undefined, undefined);
  t('.', undefined);
  t('./', undefined);
  t('/abc', undefined);
  t('./abc', './abc');
  t('abc', './abc');
  t('npm:abc', 'npm:abc');
  t('npm:mod/abc', 'npm:mod/abc');
  t('github:user/repo/abc', 'github:user/repo/abc');
  t = (pkg, file, v)=>assert_obj(v, pkg_exports_lookup(pkg, file));
  t({}, '.', './index.js');
  t({exports: {'.': './exp'}}, '.', './exp');
  t({exports: {'.': './exp'}}, './', './exp');
  t({exports: {'.': './exp'}}, './exp');
  t({exports: {'.': './exp'}}, './package.json', './package.json');
  t({exports: {'./package.json': './x'}}, './package.json', './package.json');
  t({exports: {'.': './exp'}, lif: {exports: {'.': './abc'}}}, '.', './abc');
  t({main: './Main', exports: {'.': './exp'}}, '.', './exp');
  t({main: './Main', exports: {'./x': './exp'}}, '.');
  t({main: './Main', lif: {exports: {'.': './exp'}}}, '.', './exp');
  t({main: './Main', lif: {exports: {'./x': './exp'}}}, '.', './Main');
  t({main: './Main'}, '.', './Main');
  t({main: './Main'}, './Main');
  t({main: 'Main'}, './Main');
  t({main: './Main', module: './Mod'}, './Mod');
  t({main: './Main', module: 'Mod'}, './Mod');
  t({main: './Main', exports: './Exp'}, './Exp');
  t({exports: {'.': {server: './ser', default: './def'}}}, '.', './def');
  t({exports: {'.': {default: './def', import: './imp', module: './mod'}}},
    '.', './mod');
  t({exports: {'.': {default: './def'}}, default: './Def'}, '.', './def');
  t({exports: {'.': {default: './def'}}, import: './Imp'}, '.', './def');
  t({exports: {'.': {import: './imp'}}, module: './Mod'}, '.', './imp');
  t({exports: {'.': {require: './req'}}}, '.', './req');
  t({exports: {'.': './exp'}}, './a');
  t({exports: {'./a': './b'}}, './a', './b');
  t({exports: {'./a': {default: './Def', import: './Imp'}}}, './a', './Imp');
  t({exports: {'./a': './b'}}, './a', './b');
  t({exports: {'./a/*': './b/*'}}, './a/A', './b/A');
  t({exports: {'./a/*.js': './b/*.esm'}}, './a/A'); // * allowed only at end
  t({exports: {'./a/*': './b/*.esm'}}, './a/A', './b/A.esm');
  t({exports: {'./a/*': './b/*.esm'}}, './a/A', './b/A.esm');
  t({exports: {'./a/*': './b/*.esm'}}, './a/A', './b/A.esm');
  t({browser: './br'}, '.', './br');
  t({browser: 'br'}, '.', './br');
  t({browser: './br', exports: './ex'}, '.', './ex');
  t({browser: {'./a' : './br'}}, './a', './br');
  t({browser: {'./a' : {default: './Def',  import: './Imp'}}}, './a', './Imp');
  t({exports: {'./a': ['./b']}}, './a', './b');
  t({exports: {'./a': ['./b']}}, './a', './b');
  t({exports: {'./a': [{default: './c'}, './b']}}, './a', './c');
  t({exports: {'./a': [{default: null}, null, './b']}}, './a', './b');
  t({exports: {'./a*': './1*', './ab*': './2*'}}, './abc', './2c');
  t({exports: {'./ab*': './1*', './a*': './2*'}}, './abc', './1c');
  t({exports: {'./*': './B*', './abc': './A'}}, './abc', './A');
  t({exports: {'./dir/*': 'npm:mod/*'}}, './dir/a/b', 'npm:mod/a/b');
  t = (pkg, file, v)=>assert_obj(v, pkg_web_exports_lookup(pkg, file));
  t({web_exports: {'./abc': './def'}}, './abc', './def');
  t({web_exports: {'./abc': './def'}}, './abc/x');
  t({web_exports: {'./abc/*': './def/*'}}, './abc');
  t({web_exports: {'./abc/*': './def/*'}}, './abc/x', './def/x');
  t({web_exports: {'./abc/*': './def/*'}}, './abc/x/y', './def/x/y');
  t({web_exports: {'./abc/*/test': './def/*'}}, './abc/x/test', './def/x');
  t({web_exports: {'./abc/*/test': './def/*'}}, './abc/x/y/test');
  t({web_exports: {'./abc/*.js': './def/*.css'}}, './abc/x.js', './def/x.css');
  t({web_exports: {'./abc/*.js': './def/*.css'}}, './abc/x/y.js');
  t({web_exports: {'./dir/*': 'npm:mod/*'}}, './dir/a/b', 'npm:mod/a/b');
  t = (pkg, uri, v)=>assert_obj(v, pkg_web_exports_lookup(pkg, uri));
  let pkg = {web_exports: {
    './dir': './dir',
    './d1/d2/*': './other/*',
    './d1/file': './d1/d2/d3',
    './d1/dd': './',
    './*': './public/*',
    './abc/*.js': './def/*.esm',
  }};
  t(pkg, './file', './public/file');
  t(pkg, './dir/file', './public/dir/file');
  t(pkg, './dir', './dir');
  t(pkg, './dir/*', './public/dir/*');
  t(pkg, './d1/d2/file', './other/file');
  t(pkg, './d1/dd/file', './public/d1/dd/file');
  t(pkg, './d1/dd', './');
  t(pkg, './abc/x.js', './def/x.esm');
  delete pkg.web_exports['./*'];
  t(pkg, './file', undefined);
  t(pkg, './dir/file', undefined);
  t(pkg, './dir', './dir');
  t(pkg, './dir/', undefined);
  t(pkg, './d1/d2/file', './other/file');
  t(pkg, './d1/dd/file', undefined);
  t(pkg, './d1/dd', './');
  let lpm_pkg = {lmod: 'npm/lif_os', pkg: {
    lif: {
      dependencies: {over: '2.0.0', optional: '^1.0.1'},
      optionalDependencies: {optional: '1.0.0'},
      overrides: {overg: '2.0.0'},
    },
    dependencies: {pages: './pages', loc: '/loc', react: '^18.3.1',
      dom: '>=18.3.1', os: '.lif/git/github.com/repo/mod', over: '1.0.0'},
    peerDependencies: {react_p: '^18.3.1', dom_p: '>=18.3.1'},
    overrides: {glb: '1.2.0', overg: '1.0.0'},
  }};
  t = (imp, v)=>{
    in_test = 1;
    let res = pkg_import_lookup({lmod_self: lpm_pkg.lmod, pkg: lpm_pkg.pkg,
      imp});
    in_test = 0;
    assert.eq(v.over, res.over);
    assert.eq(v.optional, res.optional);
    assert.eq(v.reg, res.reg);
    assert.eq(v.dev, res.dev);
    assert.eq(v.peer, res.peer);
  };
  t('npm/pages/_app.tsx', {reg: 'npm/lif_os/pages/_app.tsx'});
  t('npm/loc/file.js', {reg: 'local/loc//file.js'});
  t('npm/react', {reg: 'npm/react@18.3.1'});
  t('npm/react/index.js', {reg: 'npm/react@18.3.1/index.js'});
  t('npm/dom', {reg: ''});
  t('npm/react_p', {peer: 'npm/react_p@18.3.1'});
  t('npm/dom_p', {peer: '>=18.3.1'});
  t('npm/os/dir/index.js', {reg: 'git/github.com/repo/mod/dir/index.js'});
  t('npm/glb', {over: 'npm/glb@1.2.0'});
  t('npm/over', {reg: 'npm/over@2.0.0'});
  t('npm/overg', {over: 'npm/overg@2.0.0'});
  t('npm/optional', {optional: 'npm/optional@1.0.0',
    reg: 'npm/optional@1.0.1'});
  in_test = 0;
}
test_util();

