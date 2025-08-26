// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let lif_version = '1.2.0';
let D = 0; // debug

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

let lif_kernel = {
  whoami: 'IBEYOURGODDONTCREATEOTHERGODSOVERMEDONTUSEBEYOURGODSNAMEINVAINREMEMBERTODEDICATETHESATURDAYOBEYYOURFATHERANDMOTHERDONTMURDERDONTCHEATDONTSTEALDONTTORTUREFAKELIEDONTGREEDFELLOWSHOME',
  on_message: null,
  on_fetch: null,
  wait_activate: ewait(),
  version: lif_version,
};

async function _on_fetch(event){
  if (lif_kernel.on_fetch){
    try {
      return lif_kernel.on_fetch(event);
    } catch(err){
      console.error('lif kernel sw: '+err);
    }
    return;
  }
  let wait = ewait();
  let {request, request: {url}} = event;
  let u = new URL(url);
  let external = u.origin!=self.location.origin;
  let path = u.pathname;
  if (external || path=='/' || request.method!='GET'){
    console.log('passed req', url);
    return await fetch(request);
  }
  console.warn('sw pending fetch('+event.request.url+') event before inited');
  await lif_kernel.wait_activate;
  console.info('sw complete fetch('+event.request.url+')');
  return await lif_kernel.on_fetch(event);
}
function on_fetch(event){
  event.respondWith(_on_fetch(event));
}
// service worker must register handlers on first run (not async)
function sw_init_pre(){
  self.addEventListener('install', event=>event.waitUntil((async()=>{
    await self.skipWaiting(); // force sw reload - dont wait for pages to close
    console.log('kernel install', lif_version);
  })()));
  // this is needed to activate the worker immediately without reload
  // @see https://developers.google.com/web/fundamentals/primers/service-workers/lifecycle#clientsclaim
  self.addEventListener('activate', event=>event.waitUntil((async()=>{
    console.log('kernel activate');
    await lif_kernel.wait_activate;
    console.log('kernel claim');
    await self.clients.claim(); // move all pages immediatly to new sw
    console.log('kernel activated', lif_version);
  })()));
  self.addEventListener('message', event=>event.waitUntil((async()=>{
    if (!lif_kernel.on_message){
      console.warn('sw message event before inited', event);
      await lif_kernel.wait_activate;
      console.log('sw message event finished wait');
    }
    lif_kernel.on_message(event);
  })()));
  self.addEventListener('fetch', on_fetch);
}
sw_init_pre();
console.log('pre_init');

(async()=>{try {
// service worker import() implementation
let fetch_opt = url=>(url[0]=='/' ? {headers: {'Cache-Control': 'no-cache'}} : {});
let import_modules = {};
let import_module = async(url)=>{
  let imod;
  if (imod = import_modules[url])
    return await imod.wait;
  imod = import_modules[url] = {url, wait: ewait()};
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    let body = await response.text();
    let tr = body.replace(/\nexport default ([^;]+);\n/,
      (match, _export)=>'\n;module.exports = '+_export+';\n');
    imod.script = `'use strict';
      let module = {exports: {}};
      let exports = module.exports;
      (()=>{
      ${tr}
      })();
      module.exports;
    `;
  } catch(err){
    console.error('import('+url+') failed', err);
    throw imod.wait.throw(err);
  }
  try {
    imod.exports = await eval?.(
      `//# sourceURL=${url}\n'use strict';${imod.script}`);
    return imod.wait.return(imod.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw imod.wait.throw(err);
  }
};

let sw_q = new URLSearchParams(location.search);
let lif_kernel_base = sw_q.get('lif_kernel_base');
let lif_kernel_base_u = new URL(lif_kernel_base);
console.log('kernel import');
let kernel_cdn = 'https://unpkg.com/';
let Babel = await import_module(kernel_cdn+'@babel/standalone@7.26.4/babel.js');
let util = await import_module(lif_kernel_base+'util.js');
let mime_db = await import_module(lif_kernel_base+'mime_db.js');
console.log('kernel import end');
let {postmessage_chan, str, OF, OA, assert, ecache,
  _path_ext, path_dir, path_file,
  path_prefix, qs_enc, lpm_ver_from_base, lpm_same_base,
  T_url_parse, T_npm_url_base, url_uri_type, T_npm_to_lpm, T_lpm_to_npm,
  lpm_parse, T_lpm_lmod, lpm_to_sw_uri, lpm_to_npm, npm_to_lpm,
  T_lpm_parse, T_lpm_str, lpm_ver_missing, npm_dep_parse,
  uri_dec, match_glob_to_regex, semver_range_parse,
  pkg_export_lookup, export_path_match,
  esleep, eslow, Scroll, _debugger, assert_eq, assert_obj, Donce} = util;
let {qw} = str;
let json = JSON.stringify;
let clog = console.log.bind(console);
let cerr = console.error.bind(console);

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

// https://registry.npmjs.com/lif-kernel
// https://unpkg.com/lif-kernel@1.0.6/boot.js
// https://cdn.jsdelivr.net/npm/lif-kernel@1.0.6/boot.js

let submod_path = u=>u.submod.replace(/\/$/, '')+u.path;
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
let lpm_cdn = {
  npm: {src: [{
    name: 'jsdeliver.net',
    url: u=>`https://cdn.jsdelivr.net/npm/${u.name}${u.ver}${submod_path(u)}`,
  }, {
    name: 'unpkg.com',
    u: u=>`https://unpkg.com/${u.name}${u.ver}${submod_path(u)}`,
  }], src_ver: [{
    name: 'npmjs.org',
    url: u=>`https://registry.npmjs.com/${u.name}${u.ver}`,
  }, {
    name: 'yarnpkg.com',
    url: u=>`https://registry.yarnpkg.com/${u.name}${u.ver}`,
  }]},
  git: {
    github: {src: [{
      name: 'jsdeliver.net',
      url: u=>`https://cdn.jsdelivr.net/gh/${u.name}${gh_ver(u)}${submod_path(u)}`
    }, {
      name: 'statically.io',
      url: u=>`https://statically.io/gh/${u.name}${gh_ver(u)}${submod_path(u)}`,
    }]},
    gitlab: {src: [{
      name: 'statically.io',
      url: u=>`https://statically.io/gl/${u.name}${gh_ver(u)}${submod_path(u)}`,
    }]},
  },
  ipfs: {src: [{
    name: 'ipfs.io',
    url: u=>`https://ipfs.io/ipfs/${u.cid}${submod_path(u)}`,
  }, {
    name: 'cloudflare-ipfs.com',
    url: u=>`https://cloudflare-ipfs.com/ipfs/${u.cid}${submod_path(u)}`,
  }]},
  local: {src: [{
    name: 'local',
    url: u=>submod_path(u),
  }]},
};
let lpm_get_cdn = u=>{
  let cdn = lpm_cdn;
  if (typeof u=='string')
    u = T_lpm_parse(u);
  switch (u.reg){
  case 'npm': return cdn.npm;
  case 'git': return cdn.git[u.site];
  case 'ipfs': return cdn.ipfs;
  case 'local': return cdn.local;
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

let ast_get_scope_type = (path, opt)=>{
  let _try = opt?.try;
  for (; path; path=path.parentPath){
    if (_try && path.type=='TryStatement')
      return 'try';
    let b = path.scope.block;
    if (b.type=='FunctionExpression' ||
      b.type=='ArrowFunctionExpression' ||
      b.type=='FunctionDeclaration' ||
      b.type=='ClassMethod')
    {
      return b.async ? 'async' : 'sync';
    }
    if (_try && b.type=='CatchClause')
      return 'catch';
    if (b.type=='Program')
      return 'program';
  }
};

let array_unique = a=>[...new Set(a)];

let file_ast = f=>{
  if (f.ast)
    return f.ast;
  let ast = f.ast = {}, lmod = f.lmod;
  let tr_jsx_ts = ()=>{
    let ext = _path_ext(lmod);
    ast.is_ts = ext=='ts' || ext=='tsx';
    ast.is_jsx = ext=='jsx' || ext=='tsx';
    f.js = f.body;
    if (ast.is_ts || ast.is_jsx){
      let opt = {presets: [], plugins: [],
        generatorOpts: {importAttributesKeyword: 'with'}};
      // XXX together with react, it strips unused module imports.
      // {modules: false} did not solve it.
      if (ast.is_ts){
        opt.presets.push(['typescript', {modules: false}]);
        opt.filename = path_file(lmod);
      }
      if (ast.is_jsx)
        opt.presets.push(['react', {modules: false, useSpread: true}]);
      try {
        ({code: f.js} = Babel.transform(f.body, opt));
      } catch(err){
        console.error('babel('+lmod+') FAILED', err);
        throw err;
      }
    }
  };

  let parse_ast = ()=>{
    let opt = ast.opt = {presets: [], plugins: []};
    if (0 && ast.is_ts)
      opt.plugins.push('typescript');
    if (0 && ast.is_jsx)
      opt.plugins.push('jsx');
    opt.sourceType = 'module';
    try {
      ast.ast = parser.parse(f.js, opt);
    } catch(err){
      throw Error('fail ast parse('+lmod+'):'+err);
    }
  };

  let scan_ast = ()=>{
    ast.exports = [];
    ast.requires = [];
    ast.imports = [];
    ast.imports_dyn = [];
    ast.exports_require = [];
    let has = ast.has = {};
    let _handle_import_source = path=>{
      let n = path.node;
      if (n.source.type=='StringLiteral'){
        let s = n.source;
        let v = s.value;
        let type = ast_get_scope_type(path, {try: 1});
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
    };
    let handle_import_source = path=>{
      has.import = true;
      _handle_import_source(path);
    };
    let handle_export_source = path=>{
      has.export = true;
      if (path.node.source)
        _handle_import_source(path);
    };
    traverse(ast.ast, {
      AssignmentExpression: path=>{
        let n = path.node, l = n.left, r = n.right;
        // AMD detection code: 'module' / 'exports' used from global scope:
        // if (typeof exports === 'object' && typeof module === 'object')
        //   module.exports = WDOSBOX;
        // else if (typeof define === 'function' && define['amd'])
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
          n.arguments.length==1 && n.arguments[0].type=='StringLiteral')
        {
          v = n.arguments[0].value;
          let type = ast_get_scope_type(path, {try: 1});
          ast.requires.push({module: v, start: n.start, end: n.end, type});
          has.require = true;
        }
        if (n.callee.type=='Import')
          ast.imports_dyn.push({start: n.callee.start, end: n.callee.end});
        // AMD detection code: 'define' used and called from global scope:
        // else if (typeof define === 'function' && define['amd'])
        //   define([], function() { return WDOSBOX; });
        if (n.callee.type=='Identifier' && n.callee.name=='define')
          has.define = true;
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
        let type = ast_get_scope_type(path);
        if (type=='program')
          has.await = true;
      },
    });
    ast.type = has.import||has.export||has.await ? 'mjs' :
      has.require||has.module||has.exports ? 'cjs' : 
      has.define ? 'amd' : '';
    ast.exports = array_unique(ast.exports).sort();
  };
  tr_jsx_ts();
  parse_ast();
  scan_ast();
  return ast;
};

let tr_cjs_require = f=>{
  let s = Scroll(f.js);
  for (let d of f.ast.requires){
    if (!(d.type=='sync' || d.type=='try'))
      s.splice(d.start, d.end, '(await require_async('+json(d.module)+'))');
  }
  return s.out();
};

const file_tr_cjs = (f, opt)=>{
  let uri_s = json(f.npm_uri);
  let tr = tr_cjs_require(f);
  let pre = '';
  for (let r of f.ast.requires){
    if (r.type=='sync')
      pre += 'await require_async('+json(r.module)+');\n';
  }
  let js = `
    let lif_boot = globalThis.lif?.boot;
    let module = {exports: {}};
    let exports = module.exports;
    let require = module=>lif_boot.require_cjs(${uri_s}, module);
    let require_async = async(module)=>await lif_boot.require_single(${uri_s}, module);
    let define = function(id, imps, factory){
      return lif_boot.define_amd(${uri_s}, arguments, module); };
    define.amd = {};
    ${pre}
    await (async()=>{
    ${tr}
    })();
  `;
  if (opt?.es5)
    js += `module.exports`;
  else
    js += `export default module.exports;`;
  return js;
}

let lpm_imp_lookup = ({lpm_pkg, imp})=>{
  let D = 0;
  let pkg = lpm_pkg.pkg, mod_self = lpm_pkg.lmod, u;
  let ret_err = err=>{
    D && console.log('lpm_imp_lookup('+mod_self+') imp '+imp+': '+err);
  };
  if (!(u = lpm_parse(imp)))
    return ret_err('invalid lpm uri import');
  if (u.ver || u.reg=='local')
    return imp;
  let l = lpm_imp_ver_lookup({lpm_pkg, imp});
  if (l.reg)
    return l.reg;
  if (l.glob)
    return l.glob;
  // in npm language: peer==parent, dep==child==import
  let pp = {}; // peer==parent
  for (let p = lpm_pkg.parent; p; p = p.parent){
    let _l = lpm_imp_ver_lookup({lpm_pkg: p, imp});
    pp.reg ||= _l.reg;
    pp.dev ||= _l.dev;
    pp.glob ||= _l.glob;
  }
  if (l.peer!=undefined){
    if (pp.reg)
      return pp.reg;
    if (pp.glob)
      return pp.glob;
  }
  if (l.dev)
    return l.dev;
  if (pp.dev)
    return pp.dev;
  if (pp.glob)
    return pp.glob;
  return ret_err('imp missing');
};

let tr_mjs_import = f=>{
  let s = Scroll(f.js), v;
  for (let d of f.ast.imports){
    let imp = d.module;
    if (url_uri_type(imp)=='rel')
      s.splice(d.start, d.end, json(imp+'?mjs=1'));
    else if (v=lpm_imp_lookup({lpm_pkg: f.lpm_pkg, imp: T_npm_to_lpm(imp)})){
      v = '/.lif/'+v;
      if (d.imported)
        v += '?imported='+d.imported.join(',');
      s.splice(d.start, d.end, json(v));
    } else
      console.warn('import('+f.lmod+') missing: '+imp);
  }
  for (let d of f.ast.imports_dyn)
    s.splice(d.start, d.end, 'import_lif');
  return s.out();
};

const file_tr_mjs = (f, opt)=>{
  let uri_s = json(f.npm_uri);
  let tr = tr_mjs_import(f);
  let slow = 0, log = 0, pre = '', post = '';
  let _import = f.ast.imports.length;
  if (f.npm_uri.includes(' mod_name '))
    pre += `debugger; `;
  if (opt?.worker){
    pre += `import lif from '/.lif/npm/lif-kernel/boot.js'; `;
    pre += `let importScripts = (...mods)=>lif.boot._importScripts(${uri_s}, mods); `;
  }
  if (f.ast.imports_dyn.length)
    pre += `let import_lif = function(){ return globalThis.lif.boot._import(${uri_s}, arguments); }; `;
  if (log) 
    pre += `console.log(${uri_s}, 'start'); `;
  if (slow)
    pre += `let slow = globalThis.lif.boot.util.eslow(5000, 'load module '+${uri_s}); `;
  if (log) 
    post += `console.log(${uri_s}, 'end'); `;
  if (slow)
    post += `slow.end(); `;
  if (pre && tr.startsWith('#!')) // #!/usr/bin/node shebang
    pre += '//';
  return pre+tr+post;
};

const mjs_import_cjs = (path, q)=>{
  let imported  = q.get('imported')?.split(',');
  let _q = new URLSearchParams(q);
  _q.delete('imported');
  _q.set('cjs', 1);
  _q.sort();
  let _path = json(path+qs_enc(_q, '?'));
  let js = `let exports = (await import(${_path})).default;\n`;
  imported?.forEach(i=>js += `export const ${i} = exports.${i};\n`);
  js += `export default exports;\n`;
  return js;
};

const mjs_import_mjs = (export_default, path, q)=>{
  let _q = new URLSearchParams(q);
  _q.delete('imported');
  _q.delete('mod_self');
  _q.set('mjs', 1);
  _q.sort();
  let _path = json(path+'?'+_q);
  let js = `export * from ${_path};\n`;
  if (export_default)
    js += `export {default} from ${_path};\n`;
  return js;
};

let lpm_imp_ver_lookup = ({lpm_pkg, imp})=>{
  let pkg = lpm_pkg.pkg;
  let lmod = T_lpm_lmod(imp);
  let npm = T_lpm_to_npm(lmod);
  function get_imp(deps, is_peer){
    let d, v;
    if (!(d = deps?.[npm]))
      return;
    if (v = npm_dep_parse({mod_self: lpm_pkg.lmod, imp, dep: d}))
      return v;
    if (!is_peer)
      console.warn('invalid import('+pkg.name+') format '+imp, d);
    return '';
  }
  let found = {};
  found.glob = get_imp(pkg.lif?.globDependencies);
  found.glob ||= get_imp(pkg.globDependencies);
  found.reg = get_imp(pkg.lif?.dependencies);
  found.reg ||= get_imp(pkg.dependencies);
  found.peer = get_imp(pkg.peerDependencies, true);
  found.dev = get_imp(pkg.devDependencies);
  return found;
};

function pkg_web_export_lookup(pkg, path){
  function lookup(exports){
    if (!exports)
      return;
    for (let [match, to] of OF(exports)){
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
    return {err, fail_cdn: true}
  }
  return {blob};
}
async function reg_git_get({log, lmod}){ assert(0); }
async function reg_bittorrent_get({log, lmod}){ assert(0); }
async function reg_get({log, lmod}){
return await ecache(reg_file_t, lmod, async function run(reg){
  let wait, u, get_ver;
  reg.lmod = lmod;
  reg.log = log;
  u = reg.u = T_lpm_parse(reg.lmod);
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
    let url = _src.url(u);
    ret = await reg_http_get({log, url});
    if (ret.blob)
      break;
    if (ret.not_exist){
      reg.not_exist = true;
      reg.err = 'lpm does not exist '+lmod;
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

async function reg_get_alt({log, lmod, alt}){
  // fetch the file
  let first;
  alt = ['', ...(alt||[])];
  for (let a of alt){
    let f = await reg_get({log, lmod: lmod+a});
    first ||= f;
    f = {...f};
    f.alt = a;
    if (f.not_exist)
      continue;
    if (!f.err)
      return f;
    if (f.err)
      throw Error('fetch failed '+lmod);
  }
  D && console.log('module('+log.mod+(alt.length>1 ? ' alt '+alt.join(' ') : '')+
    ') failed fetch not exist '+lmod);
  return first; // not_exist
}

let max_redirect = 8;
function assert_lmod(lmod){
  assert(T_lpm_parse(lmod).path=='', 'invalid pkg lmod: '+lmod); }

async function lpm_pkg_ver_get({log, lmod}){
return await ecache(lpm_pkg_ver_t, lmod, async function run(pv){
  D && console.log('lpm_pkg_ver_get '+lmod);
  pv.lmod = lmod;
  pv.log = log;
  let ver_file = pv.lmod+'/--ver';
  let get = await reg_get({log, lmod: ver_file});
  if (get.err)
    throw get.err;
  try {
    pv.pkg_ver = JSON.parse(get.body);
    return pv;
  } catch(err){
    throw Error('invalid package.json parse '+ver_file);
  }
}); }

function lpm_pkg_ver_lookup(pkg_ver, date){
  let time = pkg_ver.time;
  date = +new Date(date);
  let created = +new Date(time.created);
  let modified = +new Date(time.modified);
  let max, found;
  for (let [ver, tm] of OF(pkg_ver.time)){
    if (str.is(ver, 'created', 'modified'))
      continue;
    tm = +new Date(tm);
    if (!max || tm>=max?.tm)
      max = {ver, tm};
    if ((!found || tm>=found?.tm) && tm<=date)
      found = {ver, tm};
  }
  if (found)
    return '@'+found.ver;
  if (max)
    return '@'+max.ver;
}

async function _lpm_pkg_ver_get({log, lmod}){
  let u = T_lpm_parse(lmod);
  if (!lpm_ver_missing(u))
    return;
  let pv = await lpm_pkg_ver_get({log, lmod: u.lmod});
  if (!pv)
    throw Error('no pkg_ver found: '+u.lmod); 
  u.ver = lpm_pkg_ver_lookup(pv.pkg_ver, lpm_app_date);
  if (!u.ver)
    throw Error('failed lmod '+u.lmod+' getting pkg_ver list');
  return T_lpm_str(u);
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

async function lpm_pkg_get({log, lmod, mod_self}){
return await ecache(lpm_pkg_t, lmod, async function run(lpm_pkg){
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
  let u = T_lpm_parse(lmod);
  // resolve ver
  if (u.reg=='npm' && !u.ver){
    let v = await _lpm_pkg_ver_get({log, lmod});
    if (!v)
      throw Error('no pkg versions found for '+lmod);
    D && console.log('redirect ver '+lmod+' -> '+v);
    return OA(lpm_pkg, {redirect: v});
  }
  // fetch pkg
  let pkg_json = lmod+'/package.json';
  let reg = await reg_get({log, lmod: pkg_json});
  if (reg.not_exist){
    lpm_pkg.not_exist = reg.not_exist;
    return lpm_pkg;
  }
  lpm_pkg.blob = reg.blob;
  lpm_pkg.body = reg.body;
  try {
    lpm_pkg.pkg = JSON.parse(lpm_pkg.body);
  } catch(err){
    throw Error('lmod('+pkg_json+') invalid JSON: '+err);
  }
  return lpm_pkg;
}); }

async function lpm_file_get({log, lmod, lpm_pkg}){
return await ecache(lpm_file_t, lmod, async function run(lpm_file){
  D && console.log('lpm_file_get', lmod);
  let alt, pkg;
  lpm_file.lmod = lmod;
  lpm_file.lpm_pkg = lpm_pkg;
  pkg = lpm_file.pkg = lpm_pkg.pkg;
  lpm_file.npm_uri = lpm_to_npm(lmod);
  if (lpm_pkg.redirect)
    return OA(lpm_file, {redirect: lpm_pkg.redirect+T_lpm_parse(lmod).path});
  let path = T_lpm_parse(lmod).path;
  let _path = pkg_export_lookup(pkg, path);
  if (_path && _path!=path){
    let _uri = T_lpm_lmod(lmod)+_path;
    D && console.log('redirect export '+lmod+' -> '+_uri);
    return OA(lpm_file, {redirect: _uri});
  }
  alt = pkg_alt_get(pkg, lmod);
  let reg = await reg_get_alt({log, lmod, alt});
  if (reg.not_exist)
    return reg;
  if (reg.alt){
    D && console.log('redirect alt '+lmod+' -> '+reg.alt);
    return OA(lpm_file, {redirect: lmod+reg.alt});
  }
  // create result lpm file, and cache it
  lpm_file.blob = reg.blob;
  lpm_file.body = reg.body;
  return lpm_file;
}); }

async function lpm_pkg_get_follow({log, lmod}){
  D && console.log('lpm_pkg_get_folow', lmod);
  let v;
  let _lmod = lpm_imp_ver_lookup({lpm_pkg: lpm_pkg_root, imp: lmod}).reg;
  if (_lmod && _lmod!=lmod){
    D && console.log('redirect ver or other lpm '+lmod+' -> '+_lmod);
    lmod = _lmod;
  }
  let lpm_pkg = lpm_pkg_get({log, lmod});
  if (_lmod = lpm_pkg.redirect){
    console.log('redirect ver: '+lmod+' -> '+_lmod);
    lpm_pkg = lpm_pkg_get({log, lmod: _lmod});
    if (lpm_pkg.redirect)
      throw Error('too many redirects: '+lmod+' -> '+lpm_pkg.redirect);
  }
  return lpm_pkg;
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
  if (!mod_self)
    return {lpm_pkg: await lpm_pkg_get_follow({log, lmod: imp})};
  let lmod_self = T_lpm_lmod(mod_self);
  // same name & ver
  //if (imp==lmod_self)
  //  break lmod_self;
  // same name, empty ver; use base to complete ver
  let _imp = lpm_ver_from_base(imp, lmod_self);
  if (_imp && _imp!=imp)
    return {redirect: imp};
  let found = lpm_same_base(imp, lmod_self); // XXX what is this for?
  // different modules: load parent, and lookup imports.
  // when loading package, use boot packege for redirects
  let lpm_self = await lpm_pkg_get_follow({log, lmod: lmod_self});
  // same package?
  if (lmod_self==imp)
    return {lpm_pkg: lpm_self};
  // lookup imports from parent
  _imp = lpm_imp_lookup({lpm_pkg: lpm_self, imp});
  found ||= !!_imp;
  let lmod = _imp || imp;
  let u = T_lpm_parse(lmod);
  if (u.reg=='npm' && !u.ver && !found)
    throw Error('mod('+mod_self+') missing dependency: '+imp);
  let lpm_pkg = await lpm_pkg_get({log, lmod: T_lpm_lmod(lmod),
    mod_self: lpm_self.lmod});
  return {lpm_pkg, subdir: u.path};
}

async function lpm_file_resolve({log, imp, mod_self}){
  D && console.log('lpm_file_resolve', imp, mod_self);
  if (!mod_self)
    mod_self = lpm_app;
  let {lpm_pkg, subdir} = await lpm_pkg_resolve({log, imp: T_lpm_lmod(imp),
    mod_self});
  if (lpm_pkg.not_exist)
    return {not_exist: true};
  if (lpm_pkg.redirect){
    let u = T_lpm_parse(imp);
    return {redirect: lpm_pkg.redirect+u.path};
  }
  let u = T_lpm_parse(imp);
  let lmod = lpm_pkg.lmod+(subdir||'')+u.path;
  let lpm_file = await lpm_file_get({log, lmod, lpm_pkg});
  return lpm_file;
}

let coi_enable = false;
let coi_set_headers = headers=>{
  if (!coi_enable)
    return;
  // COI: Cross-Origin-Isolation
  headers.set('cross-origin-embedder-policy', 'require-corp');
  headers.set('cross-origin-opener-policy', 'same-origin');
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
    wasm: {ctype: 'appliaction/wasm'},
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
let response_send = ({body, ext, uri})=>{
  let v;
  if (uri)
    ext = _path_ext(uri);
  let opt = {}, ctype = ctype_get(ext), h = {};
  if (!ctype){
    D && Donce('ext '+ext, ()=>console.log('no ctype for '+ext+': '+uri));
    ctype = ctype_get('text');
  }
  h['content-type'] = ctype.ctype;
  h['cache-control'] = 'no-cache';
  coi_set_headers(h);
  opt.headers = new Headers(h);
  return new Response(body, opt);
};

let ctype_binary = path=>{
  let ext = _path_ext(path);
  let ctype = ctype_get(ext)?.ctype;
  if (!ctype)
    return false;
  if (str.starts(ctype, 'audio/', 'image/', 'video/', 'font/'))
    return true;
  return false;
};

function respond_tr_send({f, qs, lmod}){
  let ext = _path_ext(lmod);
  let q = new URLSearchParams(qs);
  if (f.redirect){
    D && console.log('redirect f '+lmod+' -> '+f.redirect);
    return Response.redirect('/.lif/'+f.redirect+qs);
  }
  if (q.has('raw') || ctype_binary(lmod))
    return response_send({body: f.blob, uri: lmod});
  if (ext=='json')
    return response_send({body: f.blob, ext: 'json'});
  if (ext=='css')
    return response_send({body: f.blob, ext: 'css'});
  let ast = file_ast(f);
  let type = ast.type;
  if (q.has('cjs'))
    return response_send({body: file_tr_cjs(f), ext: 'js'});
  if (q.has('cjs_es5'))
    return response_send({body: file_tr_cjs(f, {'es5': 1}), ext: 'js'});
  if (q.has('mjs') && (type=='mjs' || !type)){
    return response_send({body: file_tr_mjs(f, {worker: q.get('worker')}),
      ext: 'js'});
  }
  if (type=='cjs' || type=='amd' || type=='')
    return response_send({body: mjs_import_cjs('/.lif/'+lmod, q), ext: 'js'});
  if (type=='mjs'){
    return response_send({
      body: mjs_import_mjs(f.ast.has.export_default, '/.lif/'+lmod, q),
      ext: 'js'});
  }
  throw Error('invalid lpm file type '+type);
}

async function kernel_fetch_lpm({log, imp, mod_self, qs}){
  let f = await lpm_file_resolve({log, imp, mod_self});
  if (f.not_exist)
    return new Response('not found', {status: 404, statusText: 'not found'});
  if (f.redirect){
    D && console.log('redirect lpm-f '+imp+' -> '+f.redirect);
    return Response.redirect('/.lif/'+f.redirect+qs);
  }
  return respond_tr_send({f, qs, lmod: imp});
}

async function fetch_pass(request, type){
  let url = request.url;
  try {
    D && console.log('fetch '+type+': '+url);
    return await fetch(request);
  } catch(err){
    console.log('failed ext fetch_pass '+type+': '+url);
  }
}
async function _kernel_fetch(event){
  let {request, request: {url}} = event;
  let u = T_url_parse(url);
  let ref = request.headers.get('referer');
  let external = u.origin!=self.location.origin;
  let path = uri_dec(u.path);
  let qs = u.search;
  let q = u.searchParams;
  let mod_self = q.get('mod_self');
  if (mod_self)
    mod_self = npm_to_lpm(mod_self);
  let ext = _path_ext(path);
  let log = {
    mod: url+(ref && ref!=u.origin+'/' ? ' ref '+ref : ''),
    ref: url,
  };
  D && console.log('sw '+log.mod);
  // external and non GET requests
  if (request.method!='GET' && request.method!='HEAD')
    return fetch_pass(request, 'non-GET');
  if (external)
    return fetch_pass(request, 'external');
  // lif-kernel passthrough for local dev
  let v;
  if (path=='/' || (lif_kernel_base_u.origin==u.origin &&
    (v=str.starts(path, lif_kernel_base_u.pathname)) &&
    str.is(v.rest, 'kernel.js', 'boot.js', 'mime_db.js', 'util.js')))
  {
    return fetch(request);
  }
  // LIF+local GET requests
  // LIF requests
  if (lpm_pkg_app && (v = str.starts(path, '/.lif/'))){
    let lmod = v.rest;
    let slow = eslow('app_init');
    await app_init_wait;
    slow.end();
    return await kernel_fetch_lpm({log, mod_self, imp: lmod, qs});
  }
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
  let headers = new Headers(response.headers);
  coi_set_headers(headers);
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
  t = (pkg_ver, date, v)=>assert_eq(v, lpm_pkg_ver_lookup(pkg_ver, date));
  let pkg_ver = {time: {
    created: '2024-02-13T16:33:48.639Z',
    modified: '2024-05-27T21:37:19.361Z',
    '3.1.1': '2024-02-13T16:33:48.811Z',
    '3.1.2': '2024-02-13T16:38:16.974Z',
    '3.1.4': '2024-02-13T17:36:12.881Z',
    '3.2.0': '2024-03-17T22:32:47.128Z',
  }};
  t(pkg_ver, '2024-02-13T16:38:16.973Z', '@3.1.1');
  t(pkg_ver, '2024-02-13T16:38:16.974Z', '@3.1.2');
  t(pkg_ver, '2024-02-13T16:38:16.975Z', '@3.1.2');
  t(pkg_ver, '2024-03-17T22:32:47.128Z', '@3.2.0');
  t(pkg_ver, '2024-03-17T22:32:47.129Z', '@3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.639Z', '@3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.638Z', '@3.2.0');
  let lpm_pkg = {lmod: 'npm/lif_os', pkg: {
    lif: {
      dependencies: {over: '2.0.0'},
      globDependencies: {overg: '2.0.0'},
    },
    dependencies: {pages: './pages', loc: '/loc', react: '^18.3.1',
      dom: '>=18.3.1', os: '.git/github/repo/mod', over: '1.0.0'},
    peerDependencies: {react_p: '^18.3.1', dom_p: '>=18.3.1'},
    globDependencies: {glb: '1.2.0', overg: '1.0.0'},
  }};
  t = (imp, v)=>{
    let res = lpm_imp_ver_lookup({lpm_pkg, imp});
    assert.eq(v.reg, res.reg);
    assert.eq(v.peer, res.peer);
    assert.eq(v.dev, res.dev);
    assert.eq(v.glob, res.glob);
  };
  t('npm/pages/_app.tsx', {reg: 'npm/lif_os/pages/_app.tsx'});
  t('npm/loc/file.js', {reg: 'local/loc//file.js'});
  t('npm/react', {reg: 'npm/react@18.3.1'});
  t('npm/react/index.js', {reg: 'npm/react@18.3.1/index.js'});
  t('npm/dom', {reg: ''});
  t('npm/react_p', {peer: 'npm/react_p@18.3.1'});
  t('npm/dom_p', {peer: ''});
  t('npm/os/dir/index.js', {reg: 'git/github/repo/mod/dir/index.js'});
  t('npm/glb', {glob: 'npm/glb@1.2.0'});
  t('npm/over', {reg: 'npm/over@2.0.0'});
  t('npm/overg', {glob: 'npm/overg@2.0.0'});
  lpm_pkg = {lmod: 'npm/mod', pkg: {lif: {dependencies: {
    mod: '/MOD',
    react: '18.3.1',
    reactok: 'npm:react@18.3.1',
    reactbad: 'react@18.3.1', // currently not supported in NPM
    dir: './DIR',
    GIT: 'git:.git/user@repo',
  }}}};
  // XXX not tests for peer/dev/glob lookups
  t = (imp, v)=>assert_eq(v, lpm_imp_lookup({lpm_pkg, imp}));
  t('npm/mod/dir/main.tsx', 'local/MOD//dir/main.tsx');
  t('npm/react', 'npm/react@18.3.1');
  t('npm/react/file.js', 'npm/react@18.3.1/file.js');
  t('npm/reactok', 'npm/react@18.3.1');
  t('npm/reactbad');
  t('local/file', 'local/file');
  t('npm/dir', 'npm/mod/DIR');
  //t(lpm_pkg, 'GIT/github/user/repo', 'local/file');
  t = (file, alt, v)=>assert_obj(v, pkg_alt_get({lif: {alt}}, file));
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
}
test_kernel();

// builtin nodejs APIs in browser: browserify:
// versions of npm shims
// https://github.com/browserify/browserify/blob/master/package.json
// mappong nodejs npm->browser npm shim
// https://github.com/browserify/browserify/blob/master/lib/builtins.js
let do_app_pkg = async function(boot_pkg){
  // XXX TODO: store boot_pkg in localStorage
  let lif = boot_pkg.lif;
  let log = {lmod: 'local/--boot'};
  // remove previous app setup
  lpm_app = undefined;
  lpm_pkg_app = undefined;
  lpm_app_date = +new Date();
  lpm_pkg_root = undefined;
  lpm_pkg_t = {};
  lpm_pkg_ver_t = {};
  lpm_file_t = {};
  // init new app
  lpm_pkg_root = await ecache(lpm_pkg_t, 'local/--boot/', async function run(lpm_pkg){
    lpm_pkg.lmod = 'local/--boot/';
    lpm_pkg.pkg = boot_pkg;
    lpm_pkg.child = [];
    return lpm_pkg;
  });
  let _lpm_app = T_lpm_lmod(T_npm_to_lpm(lif.webapp));
  let slow = eslow('app_pg lpm_get');
  let _lpm_pkg_app;
  try {
    ({lpm_pkg: _lpm_pkg_app} = await lpm_pkg_resolve({log,
      imp: T_lpm_lmod(_lpm_app), mod_self: 'local/--boot/'}));
  } catch(err){
    console.error(err);
    throw app_init_wait.throw(err);
  } finally {
    slow.end();
  }
  lpm_app = _lpm_app;
  lpm_pkg_app = _lpm_pkg_app;
  app_init_wait.return();
};

let boot_chan;
function sw_init_post(){
  boot_chan = new util.postmessage_chan();
  boot_chan.add_server_cmd('version', arg=>({version: lif_version}));
  boot_chan.add_server_cmd('app_pkg', async({arg})=>await do_app_pkg(arg));
  lif_kernel.on_message = event=>{
    if (boot_chan.listen(event))
      return;
  };
  lif_kernel.on_fetch = event=>kernel_fetch(event);
  let slow = eslow(1000, 'wait_activate');
  lif_kernel.wait_activate.return();
  slow.end();
}
sw_init_post();
console.log('lif kernel inited: '+lif_kernel_base
  +' sw '+lif_kernel.version+' util '+util.version);
} catch(err){console.error('lif kernel failed sw init', err);}})();

