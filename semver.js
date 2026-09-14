// LICENSE_CODE JPL semver.js
let semver_version = '2026.9.15';
export const version = semver_version;
let D = 0; // Debug
const {T, Tf, str, assert, OE, assert_obj, assert_obj_f, assert_eq,
  url_parse, T_url_parse, URL_parse, url_proto_parse, _path_ext,
} = await import('./util.js');
const qw = str.qw;

let semver_full;
// for testing compared to npm semver:
// $ wget https://esm.sh/semver@7.8.5/es2022/semver.bundle.mjs -O semver_full.js
// $ vim semver_full.js
// delete import __Process line
// uncomment:
// semver_full = await import('./semver_full.js');

function is_num(v){
  let n = +v;
  return ''+n==v && Number.isInteger(n) && n>=0;
}
let semver_re_part = /([0-9.]+)([\-+][0-9.\-+A-Za-z]*)?/;
let semver_re_start = new RegExp('^v?('+semver_re_part.source+')');
let semver_re = new RegExp('^'+semver_re_part.source+'$');
export function semver_parse(semver){
  let m = semver_full.match(semver_re);
  if (!m)
    return;
  let p = {ver: m[1], rel: m[2]||''};
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
  let _a = semver_parse(a), _b = semver_parse(b);
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

export function semver_glob_cmp(ver, glob){
  if (semver_full.satisfies(ver, glob))
    return 0;
  if (semver_full.gtr(ver, glob))
    return 1;
  return -1;
}

function semver_op_includes(ver, range){
  return semver_full.satisfies(ver, range);
}

export function semver_range_includes(ver, range){
  return semver_full.satisfies(ver, range);
}

const semver_op_re_start = /^(\^|=|~|>=|>|<=|<|\|\||-)/;
export function T_semver_range_parse(semver_range){
  let or = [[]]; // top level OR set, lower level AND sets
  let s = semver_range, m;
  function is(re){
    m = s.match(re);
    if (!m)
      return;
    s = s.slice(m[0].length);
    return true;
  }
  while (s){
    let and = or[or.length-1];
    let op, ver;
    is(/^ +/);
    if (!s)
      break;
    if (is(semver_op_re_start))
      op = m[0];
    is(/^ +/);
    if (op=='||'){
      or.push([]);
      continue;
    }
    if (!is(semver_re_start))
      throw Error('invalid semver_range '+semver_range);
    ver = m[1];
    if (op=='-'){
      let a = and[and.length-1];
      if (a?.op!='')
        throw Error('invalid semver_range "-" '+semver_range);
      a.op = op;
      a.ver2 = ver;
      continue;
    }
    and.push({op: op||'', ver});
  }
  if (!or[or.length-1].length)
    throw Error('empty semver range');
  return or;
}
export const semver_range_parse = Tf(T_semver_range_parse);

let semver_range_re = /([0-9.xX*]+)([\-+][0-9.\-+A-Za-z]*)?/;
function semver_range_match_op(ver, r){
  let _ver = semver_parse(ver);
  let p = _ver.ver.split('.');
  switch (r.op||''){
  case '=':
  case '':
    return r.ver==ver;
  case '^':
    break;
  case '~':
    break;
  case '>':
    break;
  case '>=':
    break;
  case '<':
    break;
  case '<=':
    break;
  case '-':
    break;
  }
}

function semver_range_match(ver, range){
  for (let or of range){
    for (let and of or){
      semver_range_match_op(ver, and);
    }
  }
}

export function semver_range_max(ver){
  if (semver_parse(ver))
    return ver;
  let range = semver_range_parse(ver);
  if (!range){
    D && console.log('invalid semver_range: '+ver);
    return;
  }
  let max;
  for (let or of range){
    for (let and of or){
      let ver = and.op=='-' ? and.ver2 : and.ver;
      if (!semver_parse(ver))
        continue; // glob
      if (max && semver_cmp(ver, max)<=0)
        continue;
      max = ver;
    }
  }
  return max;
}

function test_semver(){
  let t;
  t = (semver, v)=>assert_obj(v, semver_parse(semver));
  t('1.2.3', {ver: '1.2.3', rel: ''});
  t('1.2.3-abc', {ver: '1.2.3', rel: '-abc'});
  t('1.2.3-abc2-341.3', {ver: '1.2.3', rel: '-abc2-341.3'});
  t('x1.2.3-abc2-341.3');
  t('1.2.3x-abc2-341.3');
  t('1.2.3-a_');
  t('01.2.3');
  t('1.2..3');
  t('1.2.x');
  t('1.2.*');
  t('1.2');
  t('1');
  t = (range, v, guess)=>{
    assert_obj_f(v, semver_range_parse(range));
    assert_obj(guess, semver_range_max(range));
  };
  t('1.2.3', [[{ver: '1.2.3'}]], '1.2.3');
  t('v1.2.3-ab', [[{ver: '1.2.3-ab'}]], '1.2.3-ab');
  t('=1.2.3', [[{ver: '1.2.3', op: '='}]], '1.2.3');
  t('~1.2.3', [[{ver: '1.2.3', op: '~'}]], '1.2.3');
  t('>=1.2.3', [[{ver: '1.2.3', op: '>='}]], '1.2.3');
  t('>1.2.3', [[{ver: '1.2.3', op: '>'}]], '1.2.3');
  t('<=1.2.3', [[{ver: '1.2.3', op: '<='}]], '1.2.3');
  t('<1.2.3', [[{ver: '1.2.3', op: '<'}]], '1.2.3');
  t('1.2.3 >=v1.3.4', [[{op: '', ver: '1.2.3'}, {op: '>=', ver: '1.3.4'}]],
    '1.3.4');
  t(' = 1.2.3 >= 1.3.4 ', [[{op: '=', ver: '1.2.3'}, {op: '>=', ver: '1.3.4'}]],
    '1.3.4');
  t('=1.2.3 +1.3.4');
  t('=1.2.3 x.2.3');
  t('^1.2.3 || ^4.5.6', [[{op: '^', ver: '1.2.3'}], [{op: '^', ver: '4.5.6'}]],
    '4.5.6');
  t('^1.2.3||^4.5.6', [[{op: '^', ver: '1.2.3'}], [{op: '^', ver: '4.5.6'}]],
    '4.5.6');
  t('1.2.3 - 1.3.4', [[{op: '-', ver: '1.2.3', ver2: '1.3.4'}]], '1.3.4');
  t('2.2.2 1.2.3 - 1.3.4||3.3.3', [
    [{op: '', ver: '2.2.2'}, {op: '-', ver: '1.2.3', ver2: '1.3.4'}],
    [{op: '', ver: '3.3.3'}],
  ], '3.3.3');
  // missing support for 1 1.2 1.x.x 1.X.X 1.*.*
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
  t = (glob, less, eq, more)=>{
    for (let v of qw(less))
      assert(semver_glob_cmp(v, glob))<0;
    for (let v of qw(eq))
      assert(semver_glob_cmp(v, glob)==0);
    for (let v of qw(more))
      assert(semver_glob_cmp(v, glob)>0);
  };
  t('1.2.3', '1.2.3-0 1.2.2', '1.2.3', '1.2.4-0 1.2.4');
  t('1.2.x', '1.1.9 1.2.0-0', '1.2.0 1.2.1', '1.2.1-0 1.3.0-0 1.3.0');
  t('1.2.X', '1.1.9 1.2.0-0', '1.2.0 1.2.1', '1.2.1-0 1.3.0-0 1.3.0');
  t('1.2.*', '1.1.9 1.2.0-0', '1.2.0 1.2.1', '1.2.1-0 1.3.0-0 1.3.0');
  t('1.2', '1.1.9 1.2.0-0', '1.2.0 1.2.1', '1.2.1-0 1.3.0-0 1.3.0');
  t('1.x', '1.0.0-0 0.9.9', '1.0.0 1.9.9', '2.0.0-0 2.0.0 2.9.9');
  t('1.X', '1.0.0-0 0.9.9', '1.0.0 1.9.9', '2.0.0-0 2.0.0 2.9.9');
  t('1.*.*', '1.0.0-0 0.9.9', '1.0.0 1.9.9', '2.0.0-0 2.0.0 2.9.9');
  t('1.*', '1.0.0-0 0.9.9', '1.0.0 1.9.9', '2.0.0-0 2.0.0 2.9.9');
  t('0', '0.0.0-0', '0.0.0 0.9.9', '1.0.0-0 1.0.0 1.9.9');
  t('0.*.*', '0.0.0-0', '0.0.0 0.9.9', '1.0.0-0 1.0.0 1.9.9');
  t('0.2', '0.2.0-0 0.1.9', '0.2.0 0.2.9', '0.3.0 0.3.9');
  t('0.2.3', '0.2.3-0 0.2.2', '0.2.3', '0.2.4-0 0.2.4');
  t = (op, no, yes)=>{
    for (let v of qw(no))
      assert(!semver_op_includes(v, op));
    for (let v of qw(yes))
      assert(semver_op_includes(v, op));
  };
  // >=1.2.x  =>  >=1.2.0
  t('>=1.2.x', '1.1.9 1.2.0-0 1.2.1-0 1.3.0-0', '1.2.0 1.2.1 1.3.0');
  // >1.2.x   =>  >=1.3.0 (next minor, the x is already “any patch”)
  t('>1.2.x', '1.1.9 1.2.0 1.2.9c1.3.0-0', '1.3.0 1.3.9 2.0.0');
  // <=1.2.x  =>  <1.3.0-0
  t('<=1.2.x', '1.3.0-0 1.3.0 1.2.0-0', '0.1.2 1.1.9 1.2.0 1.2.9',);
  // <1.x     =>  <1.0.0-0
  t('<1.x', '1.0.0 1.0.0-0', '0.1.2 0.9.9');
  t('<1.*', '1.0.0 1.0.0-0', '0.1.2 0.9.9');
  t('<1.X', '1.0.0 1.0.0-0', '0.1.2 0.9.9');
  t('<1', '1.0.0 1.0.0-0', '0.1.2 0.9.9');
  // ^1.x     =>  >=1.0.0 <2.0.0-0
  // ^1       =>  >=1.0.0 <2.0.0-0
  t('^1', '1.0.0-0 2.0.0-0 2.0.0 0.9.9', '1.0.0 1.9.9');
  // ^1.2.x   =>  >=1.2.0 <2.0.0-0 (caret allows minor bumps when major ≥ 1)
  t('^1.2.x', '1.2.0-0 2.0.0-0 2.0.0 0.9.9', '1.2.0 1.9.9');
  t('^1.2', '1.2.0-0 2.0.0-0 2.0.0 0.9.9', '1.2.0 1.9.9');
  t('^1.2.3', '1.2.2 1.2.3-0 2.0.0-0 2.0.0', '1.2.3 1.9.9');
  // ^0.x     =>  >=0.0.0 <1.0.0-0
  t('^0', '0.0.0-0 1.0.0-0 1.0.0', '0.0.1 0.9.9');
  // ^0.2.x   =>  >=0.2.0 <0.3.0-0 (0.x caret is narrow)
  t('^0.2', '0.2.0-0 0.3.0-0 0.3.0', '0.2.0 0.2.9');
  t('^0.2.3', '0.2.3-0 0.3.0-0 0.3.0', '0.2.3 0.2.9');
  // ~1.2.3   =>  >=1.2.0 <1.3.0-0
  t('~1.2.3', '1.2.2 1.2.3-0 1.3.0-0 1.3.0', '1.2.3 1.2.9');
  // ~1.2.x   =>  >=1.2.0 <1.3.0-0
  t('~1.2.x', '1.2.0-0 1.3.0-0 1.3.0', '1.2.0 1.2.9');
  // ~1.2     =>  >=1.2.0 <1.3.0-0
  t('~1.2', '1.2.0-0 1.3.0-0 1.3.0', '1.2.0 1.2.9');
  // ~1.x     =>  >=1.0.0 <2.0.0-0
  t('~1.x', '1.0.0-0 2.0.0-0 2.0.0', '1.0.0 1.9.9');
  // 1.2.x - 2.3.x  =>  hyphen + partials (left missing parts → 0; right partial → exclusive next bound)
  t('1.2.x - 2.3.x', '1.2.0-0 2.4-0 -2.4.0', '1.2.0 1.2.9 2.0.0 2.3.9');
  t = (op, no, yes)=>{
    for (let v of qw(no))
      assert(!semver_range_includes(v, op));
    for (let v of qw(yes))
      assert(semver_range_includes(v, op));
  };
  t('>=1.2.x <2.5.5', '1.1.9 2.5.5', '1.2.0 2.5.4');
  t('>=1.2.x <2.5.5 || 4.0.x', '1.1.9 2.5.5 3.9.9 4.1.0',
    '1.2.0 2.5.4 4.0.0 4.0.9');
}
test_semver();

