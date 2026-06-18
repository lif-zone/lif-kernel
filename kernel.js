// LIF Kernel: Service Worker BIOS (Basic Input Output System)
export const lif_version = '26.4.23';
let D = 0; // debug
let in_test = 0;
const $lif = globalThis.$lif = {};

const util = (await import('./util.js')).default;
const {ipc_postmessage, str, OE, OA, assert, ecache, json_cp,
  _path_ext, path_dir, path_file,
  path_starts, qs_enc, lpm_ver_from_base, lpm_same_base, lpm_to_sw_passthrough,
  T_url_parse, url_uri_type, T_npm_to_lpm, T_lpm_to_npm,
  lpm_parse, T_lpm_lmod, lpm_to_sw_uri, lpm_to_npm, npm_to_lpm,
  T_lpm_parse, T_lpm_str, lpm_ver_missing, npm_dep_parse,
  npm_browser_parse,
  uri_dec, match_glob_to_regex, semver_range_parse, semver_parse, semver_cmp,
  pkg_export_lookup, export_path_match, str_to_buf,
  eslow, Scroll, _debugger, assert_eq, assert_obj, assert_obj_f,
  ewait, Donce} = util;
const {qw} = str;
const clog = console.log.bind(console);
const cerr = console.error.bind(console);
const json = JSON.stringify;
const kernel_cdn = 'https://unpkg.com/';
const mime_db = (await import('./mime_db.js')).default;
const sha256 = (await import('./sha256.js')).default;
const Babel = (await import(kernel_cdn+'@babel/standalone@7.29.1/babel.js')).default;
const idb = (await import(kernel_cdn+'idb@8.0.3/build/index.cjs')).default;

let lif_kernel_base;

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

async function db_open(){
  if (!db){
    db = await idb.openDB('lif-kernel', 16, {
      upgrade(db, old_ver, new_ver){
        console.log('upgrade cache db '+old_ver+' -> '+new_ver);
        db_upgrade(db, 'js_to_meta', {keyPath: ['h_js']});
        db_upgrade(db, 'tsx_to_js',
          {keyPath: ['h_tsx'], del_create: old_ver<13});
        db_upgrade(db, 'lpm_file', {keyPath: ['lmod']});
        db_upgrade(db, 'lpm_ver', {keyPath: ['lmod']});
      }
    });
  }
  return db;
}

// 0 no-cache, 1 cache registry, 2 cache http/https, 3 cache local
let enable_cache = 1;
function fetch_opt(url){
  let no_cache = url.startsWith('/') ? !enable_cache : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}}: {};
}
function cache_lmod(lmod){
  if (!enable_cache)
    return;
  if (str.starts(lmod, 'npm/', 'git/'))
    return enable_cache>=1;
  if (str.starts(lmod, 'http/', 'https/'))
    return enable_cache>=2;
  if (str.starts(lmod, 'local/'))
    return enable_cache>=3;
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

// br: lif-os/pages/index.tsx
//     /.lif/npm/lif-os/pages/index.tsx
// sw: /lif-os/pages/index.tsx
//
// req:         react 
// rewrite:     /.lif/npm/react?self=/lif-os/components/file.js
// kernel 302:  /.lif/npm/react@0.18.1
// out:         https://unpkg.com/react
//
// br:  /.lif/npm.cjs/react
// sw:  https://unpkg.com/react

// NPM metadata
// https://registry.npmjs.com/lif-kernel
// https://registry.npmjs.com/lif-kernel/1.0.6
// https://registry.npmjs.com/lif-kernel/latest
// https://registry.npmmirror.com/lif-kernel
// https://registry.yarnpkg.com/lif-kernel
// NPM content:
// https://unpkg.com/lif-kernel@1.0.6/boot.js
// https://unpkg.com/lif-kernel@latest/boot.js
// https://cdn.jsdelivr.net/npm/lif-kernel@1.0.6/boot.js
// GITHUB metadata
// https://api.github.com/repos/lif-zone/lif-kernel/tags
// https://api.github.com/repos/lif-zone/lif-kernel/commits/0f78e4cef8ce6b7a0d24d8716cc599143af20312
// https://api.github.com/repos/lif-zone/lif-kernel/git/ref/heads/master
// GITHUB content
// https://raw.githubusercontent.com/lif-zone/lif-kernel/0f78e4cef8ce6b7a0d24d8716cc599143af20312/package.json
let gh_ver = u=>{
  let ver = typeof u=='string' ? u : u.ver;
  if (!ver)
    return '';
  let _ver = ver.replace(/^@/, '');
  let v;
  if (v=str.starts(_ver, 'semver:'))
    return '@'+v.rest;
  return ver;
};
let _gh_ver = u=>{
  let ver = gh_ver(u);
  let _ver = ver.replace(/^@/, '');
  if (!ver)
    return 'latest';
  return ver;
};
let lpm_cdn = {
  npm: {src: [{
    // package file listing+size+sha256
    // https://data.jsdelivr.com/v1/packages/npm/react@18.3.1
    name: 'jsdeliver.net',
    url: u=>`https://cdn.jsdelivr.net/npm/${u.name}${u.ver}${u.submod_path}`,
  }, {
    // package file listing+size+sha256
    //  https://unpkg.com/react@18.3.1/?meta
    name: 'unpkg.com',
    u: u=>`https://unpkg.com/${u.name}${u.ver}${u.submod_path}`,
  }], src_ver: [{
    name: 'npmjs.org',
    url: u=>`https://registry.npmjs.com/${u.name}`,
  }, {
    name: 'yarnpkg.com',
    url: u=>`https://registry.yarnpkg.com/${u.name}`,
  }, {
    name: 'npmmirror.com',
    url: u=>`https://registry.npmmirror.com/${u.name}`,
  }]},
  git: {
    'github.com': {src: [{
      name: 'jsdeliver.net',
      url: u=>`https://cdn.jsdelivr.net/gh/${u.name}${gh_ver(u)}${u.submod_path}`
    }, {
      name: 'statically.io',
      url: u=>`https://statically.io/gh/${u.name}${gh_ver(u)}${u.submod_path}`,
    }, {
      name: 'raw.githubusercontent.com',
      url: u=>`https://raw.githubusercontent.com/${u.name}/${_gh_ver(u)}${u.submod_path}`,
    }], src_ver: [{
      name: 'api.github.com',
      // all branches: [i].name, [i].commit.sha
      // https://api.github.com/repos/facebook/react/branches
      // all tags: [i].name [i].commit.sha
      // https://api.github.com/repos/facebook/react/tags
      // specific branch: name, commit.sha
      // https://api.github.com/repos/facebook/react/branches/main
      // specific tag: object.sha
      // https://api.github.com/repos/facebook/react/git/refs/tags/v19.0.0
      // list of all heads (including non-released): [i].object.sha
      // https://api.github.com/repos/facebook/react/git/refs/heads
      // specific head: object.sha
      // https://api.github.com/repos/facebook/react/git/refs/heads/main
      // without cors:
      // https://github.com/lif-zone/lif-kernel.git/info/refs?service=git-upload-pack
      // commit (with its contents, works partial sha): sha
      // returns only sha if fetch({headers: {Accept: 'application/vnd.github.sha'}})
      // https://api.github.com/repos/lif-zone/lif-kernel/commits/ec37e12
      // https://api.github.com/repos/lif-zone/lif-kernel/commits/ec37e12310d75175dea2366e750952080c236b6e
      // https://api.github.com/repos/lif-zone/lif-kernel/commits/HEAD
      // https://api.github.com/repos/lif-zone/lif-kernel/commits/main
      // lookup branch+date: [0].sha
      // https://api.github.com/repos/lif-zone/lif-kernel/commits?per_page=1&until=2025-12-19T19:49:17Z&sha=main
      // https://api.github.com/repos/lif-zone/lif-kernel/commits?per_page=1&until=2025-12-19T19:49:18Z&sha=main
      url: u=>`https://api.github.com/repos/${u.name}/branches/${u.ver||'main'}`,
      get_data: data=>data.commit.sha,
      _uri_branch: u=>`https://api.github.com/repos/${u.name}/git/ref/heads/${u.ver||'main'}`,
      _uri_tag: u=>`https://api.github.com/repos/${u.name}/git/ref/tags/${u.ver||'main'}`,
      _uri_branch_date: u=>`https://api.github.com/repos/${u.name}/commits?per_page=1&until={u.date}&sha=${u.ver||'main'}`,
      _get_data: data=>data.object.sha,
    }]},
    'gitlab.com': {src: [{
      name: 'statically.io',
      url: u=>`https://statically.io/gl/${u.name}${gh_ver(u)}${u.submod_path}`,
    }], src_ver: [{
      name: "gitlab.com",
      // commit (works partial sha): id
      // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc83328
      // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc8332848c7f32dbd0e7eb56a94dd07bcdeabdf4
      // specific tag/branch: id
      // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/master
      // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/v18.11.2-ee
      url: (o, r, b)=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(o+'/'+r)}/repository/commits/${b}`,
      get_data: data=>data.id,
    }]},
  },
  ipfs: {src: [{
    name: 'ipfs.io',
    url: u=>`https://ipfs.io/ipfs/${u.cid}${u.submod_path}`,
  }, {
    name: 'dweb.link',
    url: u=>`https://dweb.link/ipfs/${u.cid}${u.submod_path}`,
  }]},
  local: {src: [{
    name: 'local',
    url: u=>u.submod_path,
  }]},
  https: {src: [{
    name: 'https',
    url: u=>`https://${u.host}${u.submod_path}`,
  }]},
  http: {src: [{
    name: 'http',
    url: u=>`http://${u.host}${u.submod_path}`,
  }]},
};

let lpm_get_cdn = u=>{
  let cdn = lpm_cdn;
  if (typeof u=='string')
    u = T_lpm_parse(u);
  switch (u.reg){
  case 'npm': return cdn.npm;
  case 'git': return cdn.git[u.host];
  case 'ipfs': return cdn.ipfs;
  case 'local': return cdn.local;
  case 'https': return cdn.https;
  case 'http': return cdn.http;
  }
  throw Error('invalid reg '+u.reg);
};

// bitcoin ordinals: 
// /content/547a6709441bc5c9d206150ce5fb7605c28a90c46bd6e4330c4420cb41477aeai0
// /content/99dfe03e22d556dc6e12209403936f840ff0eb542d075cfb0efa7f794192862bi0
// ID = /[a-z0-9]{66}/
// /content/ID
// /.lif/bitcoin/ordinal/content/ID
// fetch from:
// https://ordiscan.com/content/547a6709441bc5c9d206150ce5fb7605c28a90c46bd6e4330c4420cb41477aeai0
// A nice HTML orginal 3D world, movable by mouse:
// https://ordiscan.com/inscription/69458794

let lpm_app;
let lpm_pkg_app;
let lpm_app_date = +new Date();
let app_init_wait = ewait();
let lpm_pkg_root;
let lpm_pkg_t = {};
let lpm_pkg_ver_t = {};
let lpm_file_t = {};
let reg_file_t = {};

let parser = Babel.packages.parser;
let traverse = Babel.packages.traverse.default;

// https://webpack.js.org/plugins/define-plugin/
function ast_is_static(path){
  let node = path.node;
  let t = Babel.packages.types;
  if (t.isLiteral(node))
    return true;
  // Identifier: only "process" is allowed (checked later in MemberExpression)
  if (t.isIdentifier(node))
    return node.name==='process' && !path.scope.getBinding('process');
  // Unary !expr
  if (t.isUnaryExpression(node, { operator: '!' }))
    return ast_is_static(path.get('argument'));
  // Binary/Logical: === !== == != && ||
  if (t.isBinaryExpression(node) || t.isLogicalExpression(node)){
    let allowed = t.isBinaryExpression(node)
      ? ['===', '!==', '==', '!=', '&&', '||']
      : ['&&', '||'];
    if (!allowed.includes(node.operator))
      return false;
    return ast_is_static(path.get('left')) &&
      ast_is_static(path.get('right'));
  }
  // MemberExpression: process.env.X or process.env['X']
  if (t.isMemberExpression(node)){
    let obj = path.get('object'), _obj, prop;
    if (obj.isMemberExpression() &&
      (prop = obj.get('property')) &&
      prop.isIdentifier({name: 'env'}) &&
      (_obj = obj.get('object')) &&
      _obj.isIdentifier({name: 'process'}) &&
      (prop = path.get('property')) &&
      (prop.isIdentifier() || prop.isStringLiteral())
    ){
      let binding = path.scope.getBinding('process');
      return binding===undefined; // ← no binding = global process
    }
  }
  return false;
}

function ast_get_if_cond(path){
  let has_if = 0, cond, child, p = path;
  for (child=p; p; child=p, p=p.parentPath){
    let n = p.node;
    if (p.type=='IfStatement'){
      let nc = child.node;
      has_if++;
      let _static;
      traverse(n.test, {enter(p){
        _static = ast_is_static(p);
        p.stop();
      }}, p.scope);
      cond = {else: n.consequent!=nc, static: _static,
        start: n.test.start, end: n.test.end};
    }
  }
  if (has_if>1)
    return 'var';
  if (has_if==1)
    return cond;
}
function ast_get_scope_type(path, opt={}){
  let p;
  for (p=path; p; p=p.parentPath){
    if (opt.try && p.type=='TryStatement')
      return {type: 'try'};
    let b = p.scope.block;
    if (b.type=='FunctionExpression' ||
      b.type=='ArrowFunctionExpression' ||
      b.type=='FunctionDeclaration' ||
      b.type=='ClassMethod')
    {
      return {type: b.async ? 'async' : 'sync'};
    }
    if (opt.try && b.type=='CatchClause')
      return {type: 'catch'};
    if (b.type=='Program'){
      if (opt.if)
        return {type: 'program', cond: ast_get_if_cond(path)};
      return {type: 'program'};
    }
  }
}

let array_unique = a=>[...new Set(a)];

let file_type = lmod=>{
  let ext = _path_ext(lmod);
  if (ctype_binary(lmod))
    return 'binary';
  if (ext=='json')
    return 'json';
  if (ext=='css')
    return 'css';
  return 'js';
};

function tr_tsx_to_js({tsx, type}){
  let js;
  let is_ts = type=='ts' || type=='tsx';
  let is_jsx = type=='jsx' || type=='tsx';
  // preserveFormat (and tokens createParenthesizedExpressions) do not yet
  // work with current babel: it alters spacing and indentation
  let opt = {presets: [], plugins: [],
    parserOpts: {tokens: true, createParenthesizedExpressions: true},
    generatorOpts: {importAttributesKeyword: 'with', retainLines: true,
      preserveFormat: true}};
  // XXX together with react, it strips unused module imports.
  // {modules: false} did not solve it.
  if (is_ts){
    opt.presets.push(['typescript', {modules: false}]);
    opt.filename = 'tr.'+type; // XXX was path_file(lmod)
  }
  if (is_jsx)
    opt.presets.push(['react', {modules: false, useSpread: true}]);
  try {
    ({code: js} = Babel.transform(tsx, opt));
  } catch(err){
    console.error('babel FAILED', err);
    return {err: 'tsx tr: '+err};
  }
  return js;
}

function tr_js_to_ast(js){
  let ast = {};
  let parse_ast = ()=>{
    let opt = ast.opt = {presets: [], plugins: []};
    opt.sourceType = 'module';
    try {
      ast.ast = parser.parse(js, opt);
    } catch(err){
      ast.err = 'ast: '+err;
      ast.type = 'err';
      ast._err = err;
    }
  };

  let scan_ast = ()=>{
    ast.exports = [];
    ast.requires = [];
    ast.imports = [];
    ast.imports_dyn = [];
    ast.exports_require = [];
    let has = ast.has = {};
    function _handle_import_source(path){
      let n = path.node;
      if (n.source.type=='StringLiteral'){
        let s = n.source;
        let v = s.value;
        let {type} = ast_get_scope_type(path, {try: 1});
        let imported = [];
        n.specifiers?.forEach(spec=>{
          if (spec.type=='ImportSpecifier')
            imported.push(spec.imported.name);
          if (spec.type=='ImportNamespaceSpecifier'){
            let bind = path.scope.getBinding(spec.local.name);
            bind.referencePaths.forEach(ref=>{
              let cont = ref.container;
              if (cont.type=='MemberExpression')
                imported.push(cont.property.name);
            });
          }
        });
        imported = array_unique(imported).sort();
        ast.imports.push({module: v, start: s.start, end: s.end, type,
          imported: imported.length ? imported : null});
      }
    }
    function handle_import_source(path){
      has.import = true;
      _handle_import_source(path);
    }
    function handle_export_source(path){
      has.export = true;
      if (path.node.source)
        _handle_import_source(path);
    }
    function keep_comment(path){
      let comment = path.node.leadingComments?.[0];
      if (comment && comment.type=='CommentBlock' &&
        comment.value.trim()=='keep')
      {
        return true;
      }
    }

    traverse(ast.ast, {
      AssignmentExpression: path=>{
        let n = path.node, l = n.left, r = n.right;
        // AMD detection code: 'module' / 'exports' used from global scope:
        // if (typeof exports === 'object' && typeof module === 'object')
        //   module.exports = WDOSBOX;
        // else if (typeof define === 'function' && define.amd)
        //   define([], function() { return WDOSBOX; });
        // else if (typeof exports === 'object')
        //   exports["WDOSBOX"] = WDOSBOX;
        if (n.operator=='=' &&
          l.type=='MemberExpression' &&
          l.object.name=='exports' && l.object.type=='Identifier' &&
          l.property.type=='Identifier')
        {
          ast.exports.push(l.property.name);
          has.exports = true;
        }
        if (n.operator=='=' &&
          l.type=='MemberExpression' &&
          l.object.name=='module' && l.object.type=='Identifier' &&
          l.property.name=='exports' && l.property.type=='Identifier')
        {
          has.module = true;
          if (r.type=='CallExpression' &&
            r.callee.type=='Identifier' && r.callee.name=='require' &&
            r.arguments.length==1 && r.arguments[0].type=='StringLiteral')
          {
            ast.exports_require.push(r.arguments[0].value);
          } else if (r.type=='ObjectExpression' && r.properties){
            for (let i=0; i<r.properties.length; i++)
              ast.exports.push(r.properties[i].key.name);
          }
        }
      },
      CallExpression: path=>{
        let n = path.node, v;
        if (n.callee.type=='Identifier' && n.callee.name=='require' &&
          n.arguments.length==1 && n.arguments[0].type=='StringLiteral' &&
          !path.scope.getBinding('require'))
        {
          v = n.arguments[0].value;
          let {type, cond} = ast_get_scope_type(path, {try: 1, if: 1});
          ast.requires.push({module: v, start: n.start, end: n.end, type,
            cond});
          has.require = true;
        }
        if (n.callee.type=='Import' && !keep_comment(path))
          ast.imports_dyn.push({start: n.callee.start, end: n.callee.end});
        // AMD detection code: 'define' used and called from global scope:
        // else if (typeof define === 'function' && define.amd)
        //   define([], function() { return WDOSBOX; });
        // current code detects: define() calls.
        // TODO: also detect typedef define
        if (n.callee.type=='Identifier' && n.callee.name=='define' &&
          !path.scope.getBinding('define'))
        {
          has.define = true;
        }
      },
      ImportDeclaration: path=>handle_import_source(path),
      ExportNamedDeclaration: path=>{
        handle_export_source(path);
        path.node.specifiers.forEach(spec=>{
          if (spec.type=='ExportSpecifier' && spec.exported.name=='default')
            has.export_default = true;
        });
      },
      ExportDefaultDeclaration: path=>{
        handle_export_source(path);
        has.export_default = true;
      },
      ExportAllDeclaration: path=>handle_export_source(path),
      AwaitExpression: path=>{
        let {type} = ast_get_scope_type(path);
        if (type=='program')
          has.await = true;
      },
    });
    ast.type = has.import||has.export||has.await ? 'mjs' :
      has.define ? 'amd' :
      has.require||has.module||has.exports ? 'cjs' : '';
    ast.exports = array_unique(ast.exports).sort();
  };
  parse_ast();
  if (ast.err)
    return ast;
  scan_ast();
  return ast;
}

function lpm_dep_lookup({lpm_pkg, imp}){
  let D = 0;
  let u;
  let ret_err = err=>{
    D && console.log('lpm_dep_lookup('+lpm_pkg.lmod+') imp '+imp+': '+err);
  };
  imp = pkg_browser_lookup({lpm_pkg, imp}) || imp;
  if (!(u = lpm_parse(imp)))
    return ret_err('invalid lpm uri import');
  // no need to lookup final versioned imports and local imports
  if (!lpm_ver_missing(u))
    return imp;
  // if same package, use self
  let _imp = lpm_ver_from_base(imp, lpm_pkg.lmod);
  if (_imp)
    return _imp;
  let l = pkg_dep_lookup({lpm_pkg, imp});
  // collect parents info
  let par = {}; // in npm: peer==parent.children, dep==child==import
  for (let p = lpm_pkg.parent; p; p = p.parent){
    let _l = pkg_dep_lookup({lpm_pkg: p, imp});
    par.reg ||= _l.reg;
    par.dev ||= _l.dev;
    par.over ||= _l.over;
  }
  // lookup overrides of current and parents
  if (l.over)
    return l.over;
  if (par.over)
    return par.over;
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
  return ret_err('imp missing');
}

function tr_import_lpm({imp, imported, npm_self, pkg}){
  let v = passthrough_lmod({pkg, lmod: imp});
  if (v)
    return v;
  v = '/.lif/'+imp;
  let q = {};
  if (imported)
    q.imported = imported.join(',');
  q.mod_self = npm_self;
  v += qs_enc(q);
  return v;
}

function tr_mjs_import(f){
  let s = Scroll(f.js), v, _v;
  for (let d of f.meta.imports||[]){
    let imp = d.module;
    if (url_uri_type(imp)=='rel'){
      s.splice(d.start, d.end, json(imp+'?mjs=1'));
      continue;
    }
    if (!(v=lpm_dep_lookup({lpm_pkg: f.lpm_pkg, imp: T_npm_to_lpm(imp)}))){
      console.warn('import('+f.lmod+') missing: '+imp);
      v = npm_to_lpm(imp);
    }
    _v = tr_import_lpm({imp: v, imported: d.imported, npm_self: f.npm_uri,
      pkg: f.lpm_pkg.pkg});
    s.splice(d.start, d.end, json(_v));
    continue;
  }
  for (let d of f.meta.imports_dyn||[])
    s.splice(d.start, d.end, 'import_lif');
  return s.out();
}

function file_tr_mjs_worker(f, opt){
  let uri_s = json(f.npm_uri);
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
    //import lif from '/.lif/npm/lif-kernel/boot.js';
    let lif = (await import('/.lif/npm/lif-kernel/boot.js')).default;
    let importScripts = (...mods)=>lif.boot._importScripts(${uri_s}, mods);
    let import_lif = function(){
      return globalThis.$lif.boot.import_esm(${uri_s}, arguments);
    };
    let mod = await import_lif(${uri_s});
    globalThis.removeEventListener('message', lif_worker.cb);
    lif_worker.queue.forEach(e=>globalThis.dispatchEvent(e));
  `;
  return js;
}

function file_tr_mjs(f, opt){
  let uri_s = json(f.npm_uri);
  let tr = tr_mjs_import(f);
  let slow = 0; // has problem with lif-kernel/util.js
  let log = 0, pre = '', post = '';
  let _import = f.meta.imports?.length;
  if (f.npm_uri.includes(' mod_name '))
    pre += `debugger; `;
  if (opt?.worker)
    return file_tr_mjs_worker(f, opt);
  if (f.meta.imports_dyn?.length)
    pre += `let import_lif = function(){ return globalThis.$lif.boot.import_esm(${uri_s}, arguments); }; `;
  if (log) 
    pre += `console.log(${uri_s}, 'start'); `;
  if (slow)
    pre += `let slow = globalThis.$lif.boot.util.eslow(5000, 'load module '+${uri_s}); `;
  if (log) 
    post += `console.log(${uri_s}, 'end'); `;
  if (slow)
    post += `slow.end(); `;
  let _tr = tr;
  if (tr.startsWith('#!')) // #!/usr/bin/node shebang
    _tr = '//'+tr;
  return pre+_tr+post;
}

function mjs_import_cjs(path, q){
  let imported = q.get('imported')?.split(',');
  let mod_self = q.get('mod_self');
  let uri_s = json(path);
  let js = '';
  if (q.get('worker')){
    js += `let $lif_message = {q: [], fn: e=>$lif_message.q.push(e)}; `;
    js += `globalThis.addEventListener('message', $lif_message.fn); `;
    js += `let lif = (await import('/.lif/npm/lif-kernel/boot.js')).default; `;
  }
  js += `let exports = (await globalThis.$lif.boot.require_cjs_async(${json(mod_self)}, ${json(path)}));\n`;
  if (q.get('worker')){
    js += `globalThis.removeEventListener('message', $lif_message.fn); `;
    js += `$lif_message.q.forEach(e=>globalThis.dispatchEvent(e)); `;
  }
  imported?.forEach(i=>js += `export const ${i} = exports.${i};\n`);
  js += `export const __esModule = false;\n`;
  js += `export default exports;\n`;
  return js;
}

function mjs_import_amd(path, q){
  let imported = q.get('imported')?.split(',');
  let mod_self = q.get('mod_self');
  let uri_s = json(path);
  let js = '';
  js += `let exports = await globalThis.$lif.boot.import_amd(${json(mod_self)}, [${uri_s}]);\n`;
  imported?.forEach(i=>js += `export const ${i} = exports.${i};\n`);
  js += `export const __esModule = false;\n`;
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

// - parent module resolution order: pkg_browser_lookup()
//   - "browser" section (string or ".")
//   - "dependencies" section (& friends)
// - child module resolution order: pkg_exports_lookup()
//   - "exports" section (string or ".")
//     may have "browser", "module" etc conditional sub sections
//   - "browser" section (string or ".")
//   - "main"
//   - index.js file
function pkg_browser_lookup({lpm_pkg, imp}){
  let pkg = lpm_pkg.pkg;
  let lmod = T_lpm_lmod(imp);
  let br = pkg.browser;
  let _imp = imp;
  if (!br)
    return;
  if (typeof br=='string')
    return; // not relevant for parent;
  let v;
  if (!(v = str.starts(lmod, 'npm/')))
    return;
  let npm = v.rest;
  if (v = br[npm]){
    let _v;
    if (_v = str.starts(v, './')){
      v = lpm_pkg.lmod+'/'+_v.rest;
      D && console.log('browser file redir '+_imp+' -> '+v);
      return v;
    }
    v = 'npm/'+v+imp.slice(lmod.length);
    D && console.log('browser mod redir '+_imp+' -> '+v);
    return v;
  }
}

// https://docs.npmjs.com/cli/v11/configuring-npm/package-json
function pkg_dep_lookup({lpm_pkg, imp}){
  let pkg = lpm_pkg.pkg;
  let lmod = T_lpm_lmod(imp);
  let npm = T_lpm_to_npm(lmod);
  function get_imp(deps, is_peer){
    let d, v;
    if (!(d = deps?.[npm]))
      return;
    if (v = npm_dep_parse({mod_self: lpm_pkg.lmod, imp, dep: d, pkg_name: pkg.name}))
      return v;
    if (is_peer)
      return d; // we dont currently use peer's version range
    !in_test && console.warn('invalid import('+pkg.name+') format '+imp, d);
    return '';
  }
  let found = {};
  found.over = get_imp(pkg.lif?.overrides);
  found.over ||= get_imp(pkg.overrides);
  found.reg = get_imp(pkg.lif?.dependencies);
  found.reg ||= get_imp(pkg.dependencies);
  found.peer = get_imp(pkg.lif?.peerDependencies, true);
  found.peer ||= get_imp(pkg.peerDependencies, true);
  found.dev = get_imp(pkg.lif?.devDependencies);
  found.dev ||= get_imp(pkg.devDependencies);
  return found;
}

function pkg_web_export_lookup(pkg, path){
  function lookup(exports){
    if (!exports)
      return;
    for (let [match, to] of OE(exports)){
      let v;
      if (v=export_path_match(path, match, to))
        return v;
    }
  }
  let v;
  if (v=lookup(pkg.lif?.web_exports))
    return v;
  if (v=lookup(pkg.web_exports))
    return v;
}

function pkg_alt_get(pkg, file){
  let ext = _path_ext(file);
  if (ext && ctype_get(ext))
    return;
  let alt = pkg.lif?.alt|| ['.js', '/index.js'];
  if (alt.find(e=>file.endsWith(e)))
    return;
  return alt;
}

async function reg_http_get({log, url}){
  let response, err, blob;
  let slow = eslow(5000, 'fetch '+url);
  try {
    D && console.log('fetch '+url+' for '+log.mod);
    response = await fetch(url, fetch_opt(url));
  } catch(_err){
    slow.end();
    err = Error('module('+log.mod+') failed fetch('+url+'): '+_err);
    console.log(err);
    return {err, status: 0, fail_cdn: true};
  }
  slow.end();
  // jsdelivr/gh jsdlivr/gl returns 403 for not-exist
  if (response.status==404 || response.status==403)
    return {status: response.status, not_exist: true};
  if (response.redirected){
    console.warn('reg_http_fetch('+url+') CDN bug: got 302 redirect');
    return {status: response.status, not_exist: true};
  }
  if (response.status!=200){
    err = Error('cdn failed fetch '+response.status+' '+url);
    console.log(err);
    return {status: response.status, err, fail_cdn: true};
  }
  try {
    blob = await response.blob();
  } catch(err){
    err = Error('fetch('+url+'): '+err);
    console.log(err);
    return {err, fail_cdn: true};
  }
  return {blob};
}
async function reg_git_get({log, lmod}){ assert(0); }
async function reg_bittorrent_get({log, lmod}){ assert(0); }
async function reg_get({log, lmod, opt}){
  return await ecache({table: reg_file_t, id: lmod, opt},
    async function run(reg)
{
  let wait, u, get_ver;
  reg.lmod = lmod;
  reg.log = log;
  u = reg.u = T_lpm_parse(reg.lmod);
  u.submod_path = u.submod.replace(/\/$/, '')+u.path;
  // select cdn
  // npm/react@18.3.0/file.js
  //   http://unpkg.com/react@18.3.0/file.js
  //   http://cdn.jsdlivr.net/npm/react@18.3.0/file.js
  let pkg, v;
  reg.cdn = lpm_get_cdn(u);
  let src = reg.cdn.src;
  if (u.path=='/--ver'){
    get_ver = true;
    src = reg.cdn.src_ver;
    u.submod = '';
    u.path = '';
    if (u.ver)
      throw Error('reg_get invalid --ver: '+lmod);
  } else {
    if (lpm_ver_missing(u))
      throw Error('reg_get missing ver: '+lmod);
  }
  let ret;
  for (let _src of src){
    if (_src.fail)
      continue;
    let url_fn = _src.url;
    if (!url_fn)
      continue;
    let url = url_fn(u);
    reg.url = url;
    reg.src_ver = _src;
    ret = await reg_http_get({log, url});
    if (ret.blob)
      break;
    if (ret.not_exist){
      reg.not_exist = true;
      return reg;
    }
    assert(ret.fail_cdn);
    _src.fail = {url, err: ret.err};
  }
  if (!(reg.blob = ret?.blob)){
    reg.err = ret ? ret.err : 'no non-failed cdn available';
    return reg;
  }
  reg.body = await reg.blob.text();
  D && console.log('fetch OK '+lmod);
  return reg;
}); }

let max_redirect = 8;
function assert_lmod(lmod){
  assert(T_lpm_parse(lmod).path=='', 'invalid pkg lmod: '+lmod); }

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

function npm_ver_lookup(pkg_ver, date){
  let time = pkg_ver.time;
  date = +new Date(date);
  let created = +new Date(time.created);
  let modified = +new Date(time.modified);
  let found;
  for (let [ver, tm] of OE(pkg_ver.time)){
    if (str.is(ver, 'created', 'modified'))
      continue;
    tm = +new Date(tm);
    let rel = semver_parse(ver).rel;
    let cur = {ver, tm, rel};
    if (!found || found.tm>date && tm<=date){
      found = cur;
      continue;
    }
    if (tm>date)
      continue;
    if (!found.rel && rel)
      continue;
    if (semver_cmp(found.ver, ver)>0)
      continue;
    found = cur;
  }
  if (found)
    return '@'+found.ver;
}

async function npm_ver_resolve({log, lmod}){
  let u = T_lpm_parse(lmod);
  assert(lpm_ver_missing(u));
  assert(u.reg=='npm');
  let pv = await npm_ver_get({log, lmod: u.lmod});
  if (pv.not_exist)
    return pv;
  u.ver = npm_ver_lookup(pv.pkg_ver, lpm_app_date);
  if (!u.ver)
    throw Error('failed lmod '+u.lmod+' getting pkg_ver list');
  return T_lpm_str(u);
}

async function git_ver_resolve({log, lmod, mod_self}){
  return await ecache({table: lpm_pkg_ver_t, id: lmod, opt: cache_opt},
    async function run(pv)
{
  let u = T_lpm_parse(lmod);
  let url, v;
  // XXX add support for getting branch+date lpm_app_date
  let _ver = u.ver.slice(1);
  let is_c = enable_cache>=1;
  if (!u.ver)
    url = `https://api.github.com/repos/${u.name}/commits/HEAD`;
  else if (u.ver_type=='shortcut'){
    url = `https://api.github.com/repos/${u.name}/commits/${_ver}`;
    if (is_c && (v=await cache_get('lpm_ver', [lmod]))){
      u.ver = v.ver;
      return T_lpm_str(u);
    }
  } else if (u.ver_type=='name')
    url = `https://api.github.com/repos/${u.name}/commits/${_ver}`;
  else
    assert(0, 'invalid ver_type');
  let reg = await reg_http_get({log, url});
  if (reg.not_exist)
    return reg;
  if (!reg.blob)
    return {err: 'failed git ver fetch '+url};
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
  if (is_c && u.ver_type=='shortcut')
    cache_set('lpm_ver', {lmod, ver: u.ver});
  return T_lpm_str(u);
}); }

async function lpm_ver_resolve({log, lmod, mod_self}){
  let u = lpm_parse(lmod);
  let v;
  if (u.reg=='npm'){
    if (!lpm_ver_missing(lmod))
      return;
    v = await npm_ver_resolve({log, lmod});
  } else if (u.reg=='git'){
    if (str.is(u.ver_type, 'sha1', 'sha256'))
      return;
    v = await git_ver_resolve({log, lmod});
  } else
    return;
  if (v.not_exist){
    console.error('pkg not found: '+lmod);
    return v;
  }
  console.warn('module('+mod_self+') redirect ver '+lmod+' -> '+v);
  D && console.warn('module('+mod_self+') redirect from '+log?.mod);
  return {redirect: v};
}

async function lpm_pkg_cache(lmod){
  let lpm_pkg = ecache.get_sync(lpm_pkg_t, lmod);
  assert(lpm_pkg, 'lpm lmod not in cache: '+lmod);
  return lpm_pkg;
}
async function lpm_pkg_cache_follow(lmod){
  let _lmod = lmod;
  let lpm_pkg = ecache.get_sync(lpm_pkg_t, _lmod);
  for (let i=0; lpm_pkg?.redirect && i<max_redirect; i++){
    _lmod = lpm_pkg.redirect;
    lpm_pkg = ecache.get_sync(lpm_pkg_t, _lmod);
  }
  if (!lpm_pkg)
    console.info('lmod('+lmod+') follow not found: '+_lmod);
  if (lpm_pkg?.redirect)
    return; //throw Error('lpm_pkg_cache_follow max redirect: '+lmod);
  return lpm_pkg;
}

// http://localhost:3001/.lif/local/lif-os//public/Program%20Files/Xterm.js/xterm.css?raw=1
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
      throw Error('fetch failed '+lmod+' '+f.url);
  }
  console.error('module('+log.mod+(alt.length>1 ? ' alt '+alt.join(' ') : '')+
    ') failed fetch not exist '+lmod);
  return first; // not_exist
}

// http://localhost:3001/.lif/local/lif-os//public/Program%20Files/Xterm.js/xterm.css?raw=1
async function lpm_file_get_follow({log, lmod, lpm_pkg}){
  D && console.log('lpm_file_get_follow', lmod);
  let alt, pkg;
  let f = {lmod, lpm_pkg, log};
  pkg = f.pkg = lpm_pkg.pkg;
  f.npm_uri = lpm_to_npm(lmod);
  lpm_pkg.log ||= log;
  if (lpm_pkg.redirect)
    return OA(f, {redirect: lpm_pkg.redirect+T_lpm_parse(lmod).path});
  let path = T_lpm_parse(lmod).path;
  let _path = pkg_export_lookup(pkg, path);
  if (_path && _path!=path){
    let _uri = T_lpm_lmod(lmod)+_path;
    D && console.log('redirect export '+lmod+' -> '+_uri);
    return OA(f, {redirect: _uri});
  }
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
  return f;
}

async function lpm_pkg_get({log, lmod, mod_self, _mod_self}){
  let is_c = cache_lmod(lmod);
  let opt = is_c || lmod=='local/.lif.boot/' ? {} : cache_opt;
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
  lpm_pkg.parent = lpm_self;
  lpm_self.child.push(lpm_pkg);
  lpm_pkg.child = [];
  lpm_pkg.log = log;
  lpm_pkg.parent_mod = mod_self;
  // resolve ver
  let v = await lpm_ver_resolve({log, lmod, mod_self: _mod_self||mod_self});
  if (v)
    return OA(lpm_pkg, v);
  // fetch pkg
  let pkg_json = lmod+'/package.json';
  let f = await lpm_file_get({log, lmod: pkg_json});
  if (f.not_exist){
    lpm_pkg.not_exist = f.not_exist;
    console.error('lpm_pkg_get('+pkg_json+') not found');
    return lpm_pkg;
  }
  lpm_pkg.blob = f.blob;
  lpm_pkg.body = f.body;
  try {
    lpm_pkg.pkg = JSON.parse(lpm_pkg.body);
  } catch(err){
    throw Error('lmod('+pkg_json+') invalid JSON: '+err);
    lpm_pkg.pkg = {};
    console.log('failed parse package.json', pkg_json);
  }
  return lpm_pkg;
}); }

// XXX this is only used to lookup parent mod_self
async function lpm_pkg_get_follow({log, lmod}){
  D && console.log('lpm_pkg_get_folow', lmod);
  let v;
  // XXX should call pkg_browser_lookup()? not sure!
  let lookup = pkg_dep_lookup({lpm_pkg: lpm_pkg_root, imp: lmod});
  let _lmod = lookup.over || lookup.reg;
  if (_lmod && _lmod!=lmod){
    D && console.log('redirect ver or other lpm '+lmod+' -> '+_lmod);
    lmod = _lmod;
  }
  let lpm_pkg = await lpm_pkg_get({log, lmod});
  if (lpm_pkg.not_exist)
    return lpm_pkg;
  if (_lmod = lpm_pkg.redirect){
    console.log('redirect ver: '+lmod+' -> '+_lmod);
    lpm_pkg = lpm_pkg_get({log, lmod: _lmod});
    if (lpm_pkg.redirect)
      throw Error('too many redirects: '+lmod+' -> '+lpm_pkg.redirect);
  }
  return lpm_pkg;
}

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
      return {lpm_pkg: {redirect: imp}};
    // different modules: load pkg, and lookup imports.
    lpm_self = await lpm_pkg_get_follow({log, lmod: lmod_self});
    if (lpm_self.not_exist)
      return {lpm_pkg: {not_exist: true}};
    // same package?
    if (lmod_self==imp)
      return {lpm_pkg: lpm_self};
  } else
    lpm_self = lpm_pkg_root;
  // lookup for imports in parent
  let _imp = lpm_dep_lookup({lpm_pkg: lpm_self, imp});
  let lmod = _imp || imp;
  // load the module, even if redirect later, so its loaded with mod_self
  let lpm_pkg = await lpm_pkg_get({log, lmod: T_lpm_lmod(lmod),
    mod_self: lpm_self.lmod, _mod_self: mod_self});
  // local dev: allow to force modules to load from local
  if (local_dev_enable)
    _imp = lpm_local_dev_redirect(_imp);
  // located import, and it got changed
  if (_imp && _imp!=imp)
    return {lpm_pkg: {redirect: _imp}};
  let subdir = T_lpm_parse(imp).path;
  return {lpm_pkg, subdir};
}

async function lpm_file_resolve({log, imp, mod_self}){
  D && console.log('lpm_file_resolve', imp, mod_self);
  let path = T_lpm_parse(imp).path;
  let {lpm_pkg, subdir} = await lpm_pkg_resolve(
    {log, imp: T_lpm_lmod(imp), mod_self});
  if (lpm_pkg.not_exist)
    return {not_exist: true};
  if (lpm_pkg.redirect)
    return {redirect: lpm_pkg.redirect+path};
  let u = T_lpm_parse(imp);
  let lmod = lpm_pkg.lmod+(subdir||'')+u.path;
  let lpm_file = await lpm_file_get_follow({log, lmod, lpm_pkg});
  return lpm_file;
}

let coi_enable = true;
let coi_set_headers = h=>{
  if (!coi_enable)
    return;
  // COI: Cross-Origin-Isolation
  h['cross-origin-embedder-policy'] = 'require-corp';
  h['cross-origin-opener-policy'] = 'same-origin';
};

// fetch event.request.destination strings:
// audio, audioworklet, document, embed, fencedframe, font, frame, iframe,
// image, json, manifest, object, paintworklet, report, script,
// sharedworker, style, track, video, worker, xslt
function ctype_get(ext){
  let ctype_map = { // content-type
    js: {ctype: 'application/javascript'},
    mjs: {ctype: 'application/javascript', js_module: 'mjs'},
    ts: {tr: 'ts', ctype: 'application/javascript'},
    tsx: {tr: ['ts', 'jsx'], ctype: 'application/javascript'},
    jsx: {tr: 'jsx', ctype: 'application/javascript'},
    json: {ctype: 'application/json'},
    css: {ctype: 'text/css'},
    wasm: {ctype: 'application/wasm'},
    text: {ctype: 'plain/text'},
    bin: {ctype: 'application/octet-stream'},
    ico: {ctype: 'image/x-icon'},
  };
  let t = ctype_map[ext];
  if (!t){
    if (!(t = mime_db.ext2mime[ext]))
      return;
    return {ctype: t};
  }
  t = {...t};
  t.ext = ext;
  return t;
}

let response_send = ({body, ext, cache})=>{
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
};

let cache_store = {
  // performance - loading lif-os from git, in linux:
  // cache-store 1st   2nd    3rd
  // enable      14.2s 8s     5.7s
  // disable     24s   10.5s  8s
  enable: 1,
  inited: 0,
  cache: null,
};

async function cache_store_init(){
  let cs = cache_store;
  if (!cs.enable || cs.inited)
    return;
  cs.cache = await caches.open('lif-cache-v1');
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

let ctype_binary = path=>{
  let ext = _path_ext(path);
  let ctype = ctype_get(ext)?.ctype;
  if (!ctype)
    return false;
  if (str.starts(ctype, 'audio/', 'image/', 'video/', 'font/'))
    return true;
  return false;
};

function lpm_redirect({f, qs, lmod}){
  let q = new URLSearchParams(qs);
  let l = lpm_parse(f.redirect);
  if (l && !lpm_ver_missing(l))
    q.delete('mod_self');
  let redirect = '/.lif/'+f.redirect+qs_enc(q);
  D && console.log('lpm_redirect '+lmod+' -> '+f.redirect, qs+' -> '+q);
  return {redirect};
}

function passthrough_lmod({pkg, lmod}){
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
  if (str.is(type, 'jsx', 'ts', 'tsx')){
    ({js: f.js, h_js: f.h_js} = await tr_tsx_to_js_cache({
      tsx: f.body, h_tsx: f.h_body, type}));
  } else {
    f.js = f.body;
    f.h_js = f.h_body;
  }
  return f.js;
}

function tr_js_to_meta(js){
  let ast = tr_js_to_ast(js);
  if (ast.err)
    return {err: ast.err};
  let meta = {};
  meta.type = ast.type;
  if (ast.requires.length)
    meta.requires = ast.requires;
  if (ast.imports.length)
    meta.imports = ast.imports;
  if (ast.imports_dyn.length)
    meta.imports_dyn = ast.imports_dyn;
  if (ast.has.export_default)
    meta.export_default = ast.has.export_default;
  return meta;
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
  if (f.redirect)
    return lpm_redirect({f, qs, lmod});
  if (q.has('raw') || ctype_binary(lmod))
    return {body: f.blob, ext};
  if (str.is(ext, 'json', 'css', 'wasm'))
    return {body: f.blob, ext};
  ext = 'js';
  let js = await file_tsx_to_js(f);
  let meta = await file_js_to_meta(f);
  if (meta.err)
    return {body: f.blob, ext, err: 'meta err: '+meta.err};
  let type = meta.type;
  let v;
  if ((q.get('mjs')==2 || q.get('mjs')==1 || type=='mjs') &&
    (v=passthrough_lmod({pkg: f.lpm_pkg.pkg, lmod})))
  {
    return {body: mjs_import_mjs(meta.export_default, v), ext};
  }
  if (q.get('mjs')==2){
    return {body: mjs_import_mjs(meta.export_default,
      '/.lif/'+lmod+'?mjs=1'), ext};
  }
  if (q.get('mjs')==1 && (type=='mjs' || !type))
    return {body: file_tr_mjs(f, {worker: q.get('worker')}), ext};
  if (type=='cjs' || type=='')
    return {body: mjs_import_cjs('/.lif/'+lmod, q), ext};
  if (type=='amd' || type=='')
    return {body: mjs_import_amd('/.lif/'+lmod, q), ext};
  if (type=='mjs')
    return {redirect: '/.lif/'+lmod+'?mjs=2'};
  return {err: 'invalid lpm file type '+type};
}

async function lpm_file_resolve_follow({log, imp, mod_self}){
  D && console.log('lpm_file_resolve_follow '+imp);
  let res = {}, follow = 1;
  for (let i=0; i<max_redirect; i++){
    let f = await lpm_file_resolve({log, imp, mod_self});
    if (f.not_exist){
      res.not_exist = f.not_exist;
      return res;
    }
    if (f.redirect){
      let redirect = lpm_to_npm(f.redirect);
      if (!follow){
        res.redirect = lpm_to_npm(redirect);
        return res;
      }
      res.redirects ||= [];
      res.redirects.push(redirect);
      mod_self = null;
      imp = f.redirect;
      continue;
    }
    if (res.redirects){
      res.redirect = res.redirects.at(-1);
      return res;
    }
    return f;
  }
}

async function fetch_lpm_meta({log, imp, mod_self}){
  let f = await lpm_file_resolve_follow({log, imp, mod_self});
  if (!f || f.redirect)
    return f;
  let type = file_type(f.lmod);
  if (type!='js')
    return {type};
  await file_tsx_to_js(f);
  return await file_js_to_meta(f);
}

function response_redirect({redirect, cache}){
  return Response.redirect(redirect);
}

async function send_res({err, not_exist, redirect, body, ext, path}){
  if (err && body==undefined){
    console.error('parse '+path+': '+err);
    return new Response(''+err, {status: 500, statusText: ''+err});
  }
  if (not_exist){
    console.error('not found: '+path);
    return new Response('not found', {status: 404, statusText: 'not found'});
  }
  let v;
  let cache = (v=str.starts(path, '/.lif/')) && cache_lmod(v.rest);
  if (redirect)
    return response_redirect({redirect, cache});
  if (body)
    return response_send({body, ext, cache});
  throw Error('invalid fetch_lpm response');
}

async function fetch_lpm_file({log, imp, mod_self, qs}){
  let f = await lpm_file_resolve({log, imp, mod_self});
  return await responce_tr_send({f, qs, lmod: imp});
}

async function fetch_pass(request, type){
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

async function _kernel_fetch(event){
  let {request, request: {url}} = event;
  let u = T_url_parse(url);
  let ref = request.headers.get('referer');
  let external = u.origin!=location.origin;
  let path = uri_dec(u.path);
  let qs = u.search;
  let q = u.searchParams;
  let mod_self = q.get('mod_self');
  if (mod_self)
    mod_self = npm_to_lpm(mod_self);
  let ext = _path_ext(path);
  let log = {
    mod: url+(ref && ref!=u.origin+'/' ? ' ref '+ref : ''),
    imp: url,
  };
  D && console.log('sw '+log.mod);
  // external and non GET requests
  if (external)
    return fetch_pass(request, 'external');
  log.imp = path;
  if (request.method!='GET' && request.method!='HEAD')
    return fetch_pass(request, 'non-get');
  // chrome linux: F5 gives cache==no-cache for root document only.
  //   URL Enter: cache==default
  // chrome win: F5 and Enter give cache==reload, for all resources in page,
  //   not just root document.
  // so use mode==navigate and destination==document/iframe to limit refresh to
  // root document only.
  if (str.is(request.cache, 'no-cache', 'reload') &&
    (request.mode=='navigate' || 
    str.is(request.destination, 'document', 'iframe')))
  { 
    console.log('cache_refresh', request.cache, request.mode, 
      request.destination, url);
    cache_refresh();
  }
  // LIF+local GET requests
  // LIF requests
  let v;
  if (lpm_pkg_app && (v = str.starts(path, '/.lif/'))){
    let lmod = v.rest;
    log.imp = lmod;
    let slow = eslow('app_init');
    await app_init_wait; // XXX - try to remove. favicon can be handled later!
    slow.end();
    if (q.get('meta')){
      let meta = await fetch_lpm_meta({log, mod_self, imp: lmod});
      if (meta.err)
        console.error('parse '+url+': '+res.err);
      return send_res({body: json(meta), ext: 'json', path});
    }
    let response = await cache_store_get(request);
    if (response)
      return response;
    let res = await fetch_lpm_file({log, mod_self, imp: lmod, qs});
    response = await send_res({...res, path});
    await cache_store_set(request, response);
    return response;
  }
  if (path=='/cc'){ // clear cache command
    function cc(table){
      for (let [k, v] of OE(table)){
        if (str.starts(k, 'local/'))
          delete table[k];
      }
    }
    cc(lpm_pkg_t);
    cc(lpm_pkg_ver_t);
    cc(lpm_file_t);
    cc(reg_file_t);
    return send_res({body: json({ok: true, msg: 'cache cleared'}),
      ext: 'json', path});
  }
  // lif-kernel passthrough for local dev
  if (path=='/' || path_starts(url, lif_kernel_base))
    return await fetch(request);
  // local requests
  let _path;
  if (!lpm_pkg_app || !lpm_pkg_app.pkg)
    console.info('req before lpm_pkg_app init '+path);
  else if (_path = pkg_web_export_lookup(lpm_pkg_app.pkg, path)){
    if (!_path.startsWith('./'))
      throw Error('invalid web_exports '+path+' -> '+_path);
    _path = '/.lif/'+lpm_app+_path.slice(1)+'?raw=1';
    D && console.log('redirect '+path+' -> '+_path);
    return Response.redirect(_path);
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
  t = (date, v)=>assert_eq(v, npm_ver_lookup(pkg_ver, date));
  let pkg_ver = {time: {
    created: '2024-02-13T16:33:48.639Z',
    modified: '2024-05-27T21:37:19.361Z',
    '3.1.1': '2024-02-13T16:33:48.811Z',
    '3.1.2': '2024-02-13T16:38:16.974Z',
    '3.1.4': '2024-02-13T17:36:12.881Z',
    '3.2.0': '2024-03-17T22:32:47.128Z',
    '3.2.0-experimental': '2024-03-17T22:32:47.126Z',
    '3.2.0-experimental-2': '2024-03-17T22:32:47.129Z',
    '3.2.1-experimental': '2024-03-17T22:32:47.129Z',
    '3.2.2-experimental-2': '2024-03-17T22:32:47.129Z',
  }};
  t('2024-02-13T16:38:16.973Z', '@3.1.1');
  t('2024-02-13T16:38:16.974Z', '@3.1.2');
  t('2024-02-13T16:38:16.975Z', '@3.1.2');
  t('2024-03-17T22:32:47.128Z', '@3.2.0');
  t('2024-03-17T22:32:47.130Z', '@3.2.0');
  t('2024-03-13T16:33:48.639Z', '@3.1.4');
  t('2024-03-13T16:33:48.638Z', '@3.1.4');
  t('2024-01-01T00:00:00.000Z', '@3.1.1');
  t('2024-04-01700:00:00.000Z', '@3.2.0');
  pkg_ver = {time: {
    created: '2024-02-13T16:33:48.639Z',
    modified: '2024-05-27T21:37:19.361Z',
    '3.2.0-experimental': '2024-03-17T22:32:47.126Z',
    '3.2.0-experimental-2': '2024-03-17T22:32:47.129Z',
    '3.2.1-experimental': '2024-03-17T22:32:47.129Z',
    '3.2.2-experimental-2': '2024-03-17T22:32:47.129Z',
  }};
  t('2024-01-01T00:00:00.000Z', '@3.2.0-experimental');
  t('2024-03-13T16:33:48.639Z', '@3.2.0-experimental');
  t('2024-03-13T16:33:48.638Z', '@3.2.0-experimental');
  t('2024-04-01700:00:00.000Z', '@3.2.2-experimental-2');
  let lpm_pkg = {lmod: 'npm/lif_os', pkg: {
    lif: {
      dependencies: {over: '2.0.0'},
      overrides: {overg: '2.0.0'},
    },
    dependencies: {pages: './pages', loc: '/loc', react: '^18.3.1',
      dom: '>=18.3.1', os: '.lif/git/github.com/repo/mod', over: '1.0.0'},
    peerDependencies: {react_p: '^18.3.1', dom_p: '>=18.3.1'},
    overrides: {glb: '1.2.0', overg: '1.0.0'},
  }};
  t = (imp, v)=>{
    in_test = 1;
    let res = pkg_dep_lookup({lpm_pkg, imp});
    in_test = 0;
    assert.eq(v.reg, res.reg);
    assert.eq(v.peer, res.peer);
    assert.eq(v.dev, res.dev);
    assert.eq(v.over, res.over);
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
  lpm_pkg = {lmod: 'npm/self@1.2.3', pkg: {lif: {dependencies: {
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
  }, peerDependencies: {
    peer: '>=1.0.0',
    gpeer: '99.9.9',
    gpeerdev: '96.9.9',
    gpeer2: '14.0.1',
  }, devDependencies: {
    dev: '2.0.0',
    peer: '2.0.0',
    gpeerdev: '97.9.9',
    gmod: '99.9.9',
  }, overrides: {
    gmod: '21.0.0',
    glob2: '15.0.0',
  }}}, parent: {lmod: 'npm/par', pkg: {dependencies: {
    peer: '1.1.1',
    gparent: '99.9.9',
    gparent2: '99.9.9',
    gpeer: '13.0.1',
    gpeerdev: '13.0.1',
  }, overrides: {
    over: '18.0.0',
    glob2: '99.9.9',
    gparent: '22.0.0',
  }}}};
  t = (imp, v)=>{
    in_test = 1;
    assert_eq(v, lpm_dep_lookup({lpm_pkg, imp}));
    in_test = 0;
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
  t('npm/gparent2');
  t('npm/gpeer', 'npm/gpeer@13.0.1');
  t('npm/gpeer2', 'npm/gpeer2@14.0.1');
  t('npm/gpeerdev', 'npm/gpeerdev@13.0.1');
  t('npm/GIT/dir/file', 'git/github.com/user/repo@v1/dir/file');
  t('git/github.com/user/repo@vX', 'git/github.com/user/repo@vX');
  t = (pkg, imp, v)=>assert_eq(v, lpm_dep_lookup({lpm_pkg: {pkg}, imp}));
  t({dependencies: {'lif-kernel': '/lif-kernel'}}, 'npm/lif-kernel/util.js',
    'local/lif-kernel//util.js');
  t = (file, alt, v)=>assert_obj_f(v, pkg_alt_get({lif: {alt}}, file));
  t('a/file.js', undefined, undefined);
  t('a/file', undefined, ['.js']);
  t('a/file.ts', undefined, undefined);
  t('a/file', ['.js'], ['.js']);
  t('a/file', ['.xjs', '.js'], ['.xjs', '.js']);
  t('a/file.xjs', ['.xjs', '.js'], undefined);
  t('a/file.ico', ['.xjs'], undefined);
  t('a/file.abcxyz', ['.xjs'], ['.xjs']);
  // check 'package.json' is not modified, even if pkg is null
  t = (pkg, uri, v)=>assert_obj(v, pkg_web_export_lookup(pkg, uri));
  pkg = {web_exports: {
    '/dir': '/dir',
    '/d1/d2/': './other/',
    '/d1/file': '/d1/d2/d3',
    '/d1/dd': '/',
    '/': '/public/',
  }};
  t(pkg, '/file', '/public/file');
  t(pkg, '/dir/file', '/public/dir/file');
  t(pkg, '/dir', '/dir');
  t(pkg, '/dir/', '/public/dir/');
  t(pkg, '/d1/d2/file', './other/file');
  t(pkg, '/d1/dd/file', '/public/d1/dd/file');
  t(pkg, '/d1/dd', '/');
  delete pkg.web_exports['/'];
  t(pkg, '/file', undefined);
  t(pkg, '/dir/file', undefined);
  t(pkg, '/dir', '/dir');
  t(pkg, '/dir/', undefined);
  t(pkg, '/d1/d2/file', './other/file');
  t(pkg, '/d1/dd/file', undefined);
  t(pkg, '/d1/dd', '/');
  t = (js, v)=>{
    let node = parser.parse(js, {sourceType: 'script'});
    let ret;
    traverse(node, {enter(path){
      let p = path.get('body.0.expression');
      ret = ast_is_static(p);
      path.stop();
    }});
    assert_obj(v, ret);
  };
  t(`process.env.NODE_ENV === 'production'`, true);
  t(`process.env.NODE_ENV !== 'development'`, true);
  t(`!!process.env.FEATURE_FLAG`, true);
  t(`process.env.API_URL && process.env.NODE_ENV === 'production'`, true);
  t(`!process.env.DISABLE_LOGGING`, true);
  t(`process.env.NODE_ENV == 'test' || process.env.CI`, true);
  t(`process.env.NODE_ENV === getMode()`, false);
  t(`process.config.NODE_ENV`, false);
  t(`window.process?.env?.NODE_ENV`, false);
  t(`process.env.NODE_ENV?.length > 0`, false);
  t(`process.env['NODE_ENV']`, true);
  t(`typeof process !== 'undefined'`, false);
  t(`process.env.NODE_ENV==='production'; var xxx;`, true);
  t(`process.env.NODE_ENV==='production'; var process;`, false);
  t = (js, v)=>assert_obj(v, tr_js_to_meta(js));
  t(`import "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 7, end: 12}]
    });
  t(`import {a, b} from "lif";`,
    {type: 'mjs', imports: [
      {imported: ['a', 'b'], module: 'lif', start: 19, end: 24,
        type: "program"}]
    });
  t(`module.exports = {api: ()=>{}};`, {type: 'cjs'});
  t(`export default 180;`, {type: 'mjs', export_default: true});
  t(`let a = await import("a");`,
    {type: 'mjs', imports_dyn: [{start: 14, end: 20}]});
  t(`let a;
    if (process.env.node_backend=="js")
      a = require("a-js");
    else
      a = require("a");`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 57, end: 72,
        cond: {else: false, static: true, start: 15, end: 45}},
      {module: 'a', type: 'program', start: 93, end: 105,
        cond: {else: true, static: true, start: 15, end: 45}},
    ]});
  t(`let process;
    if (process.env.node_backend=="js")
      a = require("a-js");
    else
      a = require("a");`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 63, end: 78,
        cond: {else: false, static: false, start: 21, end: 51}},
      {module: 'a', type: 'program', start: 99, end: 111,
        cond: {else: true, static: false, start: 21, end: 51}},
    ]});
  t(`let process;
    if (process.env.node_backend=="js"){
      a = require("a-js");
    } else {
      a = require("a");
    }`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 64, end: 79,
        cond: {else: false, static: false, start: 21, end: 51}},
      {module: 'a', type: 'program', start: 104, end: 116,
        cond: {else: true, static: false, start: 21, end: 51}},
    ]});
  t(`function load(){ let a = require("a-js"); }`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'sync', start: 25, end: 40}
    ]});
}
test_kernel();

async function lpm_pkg_resolve_follow(opt){
  try {
    let imp, res;
    for (imp = opt.imp; imp;){
      let res = await lpm_pkg_resolve({...opt, imp});
      let {lpm_pkg} = res;
      if (lpm_pkg.not_exist)
        return res;
      if (!(imp = lpm_pkg.redirect))
        return res;
    }
    return res;
  } catch(err){
    console.error(err);
    throw err;
  }
}

async function webapp_load({log, lmod_self, webapp}){
  let lmod_webapp = T_npm_to_lpm(webapp);
  let _lpm_app = T_lpm_lmod(lmod_webapp);
  let _lpm_pkg_app;
  let slow = eslow('app_pg lpm_get');
  try {
    ({lpm_pkg: _lpm_pkg_app} = await lpm_pkg_resolve_follow({log,
      imp: _lpm_app, mod_self: lmod_self}));
  } catch(err){
    console.error('webapp_load  '+webapp, err);
    return {err};
  } finally {
    slow.end();
  }
  if (_lpm_pkg_app.not_exist){
    console.error('webapp_load not found: '+webapp);
    return {err: 'app not found: '+_lpm_app+' ('+lmod_self+')'};
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

// builtin nodejs APIs in browser: browserify:
// versions of npm shims
// https://github.com/browserify/browserify/blob/master/package.json
// mappong nodejs npm->browser npm shim
// https://github.com/browserify/browserify/blob/master/lib/builtins.js
let refrash_clear_cache = false;
let do_app_pkg = async function(boot_pkg){
  boot_pkg = json_cp(boot_pkg);
  let lif = boot_pkg.lif ||= {};
  let lmod_root = 'local/.lif.boot/';
  let log = {lmod: lmod_root};
  // remove previous app setup
  lpm_app = undefined;
  lpm_pkg_app = undefined;
  lpm_app_date = Date.now();
  lpm_pkg_root = undefined;
  if (refrash_clear_cache){
    lpm_pkg_t = {};
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
  let res = await webapp_load({log, lmod_self: lmod_root, webapp});
  app_init_wait.return();
  return res;
};

let boot_chan;
export function boot(sw_boot){
  ({lif_kernel_base, local_dev_enable} = sw_boot);
  boot_chan = new ipc_postmessage();
  boot_chan.method('version', ()=>({version: lif_version}));
  boot_chan.method('app_pkg', async(arg)=>await do_app_pkg(arg));
  sw_boot.on_message = event=>{
    if (boot_chan.accept(event))
      return;
  };
  sw_boot.on_fetch = event=>kernel_fetch(event);
  let slow = eslow(1000, 'wait_activate');
  sw_boot.wait_activate.return();
  slow.end();
  console.log('lif kernel inited: '+lif_kernel_base
    +' sw '+sw_boot.version+' util '+util.version);
}

