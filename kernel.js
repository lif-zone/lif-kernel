// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let lif_version = '1.0.6';
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
      console.error("lif kernel sw: "+err);
    }
    return;
  }
  let wait = ewait();
  let {request, request: {url}} = event;
  let u = URL.parse(url);
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
    await lif_kernel.wait_activate;
    await self.clients.claim(); // move all pages immediatly to new sw
    console.log('kernel activate', lif_version);
  })()));
  self.addEventListener("message", event=>{
    if (!lif_kernel.on_message)
      return console.error('sw message event before inited', event);
    lif_kernel.on_message(event);
  });
  self.addEventListener('fetch', on_fetch);
}
sw_init_pre();

(async()=>{try {
// service worker import() implementation
let fetch_opt = url=>(url[0]=='/' ? {headers: {'Cache-Control': 'no-cache'}} : {});
let import_modules = {};
let import_module = async(url)=>{
  let mod;
  if (mod = import_modules[url])
    return await mod.wait;
  mod = import_modules[url] = {url, wait: ewait()};
  try {
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('sw import_module('+url+') failed fetch');
    let body = await response.text();
    let tr = body.replace(/\nexport default ([^;]+);\n/,
      (match, _export)=>'\n;module.exports = '+_export+';\n');
    mod.script = `'use strict';
      let module = {exports: {}};
      let exports = module.exports;
      (()=>{
      ${tr}
      })();
      module.exports;
    `;
  } catch(err){
    console.error('import('+url+') failed', err);
    throw mod.wait.throw(err);
  }
  try {
    mod.exports = await eval?.(
      `//# sourceURL=${url}\n'use strict';${mod.script}`);
    return mod.wait.return(mod.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw mod.wait.throw(err);
  }
};

let Babel = await import_module('https://unpkg.com/@babel/standalone@7.26.4/babel.js');
let util = await import_module('/lif-kernel/util.js');
let mime_db = await import_module('/lif-kernel/mime_db.js');
let {postmessage_chan, str, OF, OA, assert,
  path_ext, _path_ext, path_file, path_dir, path_is_dir,
  path_prefix, qs_enc,
  TE_url_parse, TE_url_uri_parse, url_uri_type,
  lpm_uri_parse, lpm_modver,
  uri_enc, uri_dec, match_glob_to_regex,
  esleep, eslow, Scroll, _debugger, assert_eq, Donce} = util;
let {qw, diff_pos} = str;
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

let lpm_cdn = {
  npm: {src: [{
    name: 'jsdeliver.net',
    u: u=>`https://cdn.jsdelivr.net/npm/${u.name}${u.ver}${u.path}`,
  }, {
    name: 'unpkg.com',
    u: u=>`https://unpkg.com/${u.name}${u.ver}${u.path}`,
  }]},
  git: {
    github: {src: [{
      name: 'jsdeliver.net',
      u: u=>`https://cdn.jsdelivr.net/gh/${u.name}${u.ver}${u.path}`
    }, {
      name: 'statically.io',
      u: u=>`https://statically.io/gh/${u.name}${u.ver}${u.path}`,
    }]},
    gitlab: {src: [{
      name: 'statically.io',
      u: u=>`https://statically.io/gl/${u.name}${u.ver}${u.path}`,
    }]},
  },
  ipfs: {src: [{
    name: 'ipfs.io',
    u: u=>`https://ipfs.io/ipfs/${u.cid}${u.path}`,
  }, {
    name: 'cloudflare-ipfs.com',
    u: u=>`https://cloudflare-ipfs.com/ipfs/${u.cid}${u.path}`,
  }]},
};
let lpm_get_cdn = u=>{
  let l = lpm_cdn;
  switch (u.reg){
  case 'npm': return l.npm;
  case 'git': return l.git[u.site];
  case 'ipfs': return l.ipfs;
  }
};

let mod_root;
let lpm_root;
let lpm_map = {};
let lpm_lif_file = {};
let lpm_pkg = {};
let lpm_pkg_file = {};
let lpm_frep = {};
let lpm_fhttp = {};

let parser = Babel.packages.parser;
let traverse = Babel.packages.traverse.default;

let ast_get_scope_type = path=>{
  for (; path; path=path.parentPath){
    if (path.type=='TryStatement')
      return 'try';
    let b = path.scope.block;
    if (b.type=='FunctionExpression' ||
      b.type=='ArrowFunctionExpression' ||
      b.type=='FunctionDeclaration')
    {
      return b.async ? 'async' : 'sync';
    }
    if (b.type=='CatchClause')
      return 'catch';
    if (b.type=='Program')
      return 'program';
  }
};

let array_unique = a=>[...new Set(a)];

let file_ast = f=>{
  if (f.ast)
    return f.ast;
  let ast = f.ast = {};
  let tr_jsx_ts = ()=>{
    let ext = _path_ext(f.uri);
    ast.is_ts = ext=='ts' || ext=='tsx';
    ast.is_jsx = ext=='jsx' || ext=='tsx';
    f.js = f.body;
    if (ast.is_ts || ast.is_jsx){
      let opt = {presets: [], plugins: [], sourceMaps: true,
        generatorOpts: {importAttributesKeyword: 'with'}};
      if (ast.is_ts){
        opt.presets.push('typescript');
        opt.filename = path_file(f.uri);
      }
      if (ast.is_jsx)
        opt.presets.push('react');
      try {
        ({code: f.js} = Babel.transform(f.body, opt));
      } catch(err){
        console.error('babel('+f.uri+') FAILED', err);
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
      throw Error('fail ast parse('+f.uri+'):'+err);
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
        let type = ast_get_scope_type(path);
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
          let type = ast_get_scope_type(path);
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
    let define = function(id, deps, factory){
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

let lpm_dep_lookup = (pkg, mod_self, uri, opt)=>{
  let ret_err = err=>{
    console.error('lpm_dep_lookup('+mod_self+') dep '+uri+' : '+err);
  };
  let __uri = uri;
  let v, u = TE_url_uri_parse(uri, mod_self);
  if (!u.is.mod)
    return;
  if (u.is.rel)
    uri = u.path;
  else if (opt?.npm)
    uri = 'npm/'+uri;
  if (!(u = lpm_uri_parse(uri)))
    return ret_err('invalid lpm uri import');
  let modver = u.name+u.ver;
  let map = lpm_map[modver];
  if (map){
    v = map.lpm_base;
    if (v[0]!='/')
      return ret_err('invalid base');
    v = v.slice(1);
    return '/.lif/'+v+u.path;
  }
  if (u.ver)
    return '/.lif/'+uri;
  let _self = lpm_uri_parse(mod_self);
  if (_self && _self.name==u.name)
    return '/.lif/'+_self.modver+u.path;
  let dep = lpm_dep_ver_lookup(pkg, mod_self, uri);
  if (!dep || dep=='-')
    return ret_err('dep missing');
  if (dep.startsWith('-peer-')){
    let pkg_root = lpm_pkg[lpm_root].pkg;
    if (!(dep = lpm_dep_ver_lookup(pkg_root, lpm_root, uri)))
      return ret_err('dep missing mod_root');
  }
  return '/.lif/'+dep;
};

let modmap_lookup = (pkg, uri)=>{
  for (let [from, to] of OF(pkg.lif?.modmap)){
    let v;
    if (v=path_prefix(uri, from)){
      if (to.endsWith('/'))
        to += path_file(from);
      return mod_root+to+v.rest;
    }
  }
};

let lpm_modmap_lookup = (pkg, uri)=>{
  for (let [from, to] of OF(pkg.lif?.modmap)){
    let v;
    if (v=path_prefix(uri, from)){
      if (to.endsWith('/'))
        to += path_file(from);
      return lpm_root+to+v.rest;
    }
  }
};

let tr_mjs_import = f=>{
  let s = Scroll(f.js), v;
  for (let d of f.ast.imports){
    let uri = d.module;
    if (url_uri_type(uri)=='rel')
      s.splice(d.start, d.end, json(uri+'?mjs=1'));
    else if (v=lpm_dep_lookup(f.lpm.pkg, f.uri, d.module, {npm: 1})){
      if (d.imported)
        v += '?imported='+d.imported.join(',');
      s.splice(d.start, d.end, json(v));
    }
  }
  for (let d of f.ast.imports_dyn)
    s.splice(d.start, d.end, 'import_lif');
  return s.out();
};

const file_tr_mjs = (f, worker)=>{
  let uri_s = json(f.npm_uri);
  let tr = tr_mjs_import(f);
  let slow = 0, log = 0, pre = '', post = '';
  let _import = f.ast.imports.length;
  if (f.npm_uri.includes(' mod_name '))
    pre += `debugger; `;
  if (worker){
    pre += `import lif from '/.lif/npm/lif-kernel/boot.js'; `;
    pre += `let importScripts = (...mods)=>lif.boot._importScripts(${uri_s}, mods); `;
  }
  if (f.ast.imports_dyn.length)
    pre += `let import_lif = function(){ return globalThis.lif.boot._import(${uri_s}, arguments); }; `;
  if (log) 
    pre += `console.log(${uri_s}, 'start'); `;
  if (slow)
    pre += `let slow = globalThis.lif.boot.util.eslow(5000, ['load module', ${uri_s}]); `;
  if (log) 
    post += `console.log(${uri_s}, 'end'); `;
  if (slow)
    post += `slow.end(); `;
  if (pre && tr[0]=='#' && tr[1]=='!') // #!/usr/bin/node shebang
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

let lpm_dep_ver_lookup = (pkg, mod_self, mod_uri)=>{
  let mod = lpm_modver(mod_uri);
  let npm_mod = lpm_uri_to_npm(mod);
  let path = lpm_uri_parse(mod_uri).path;
  let get_dep = dep=>{
    let d, m, op, v, ver;
    if (!(d = dep?.[npm_mod]))
      return;
    if (v=str.prefix(d, './'))
      return 'npm/'+pkg.name+'/'+v.rest+path;
    if (v=str.prefix(d, 'npm:'))
      return 'npm/'+v.rest+path;
    d = d.replaceAll(' ', '');
    if (!(m = d.match(/^([^0-9.]*)([0-9.]+)$/))){ // XXX TODO: fix/remove
      console.log('invalid dep('+mod+') ver '+d);
      return '-';
    }
    [, op, ver] = m;
    if (op=='>=')
      return ver;
    if (!(op=='^' || op=='=' || op=='' || op=='~')){
      console.log('invalid dep('+mod+') op '+op);
      return '-';
    }
    return mod+'@'+ver+path;
  };
  let d
  if (d = get_dep(pkg.lif?.dependencies))
    return d;
  if (d = get_dep(pkg.dependencies))
    return d;
  if (d = get_dep(pkg.peerDependencies))
    return '-peer-'+d;
  if (d = get_dep(pkg.devDependencies))
    return d;
};

let file_match = (file, match, tr)=>{
  let v, f = file, m = match;
  while (v=str.prefix(f, './'))
    f = v.rest;
  while (v=str.prefix(m, './'))
    m = v.rest;
  if (path_prefix(f, m))
    return true;
};
let path_match = (path, match, tr)=>{
  let v, f = path, m = match;
  while (v=str.prefix(f, './'))
    f = v.rest;
  while (v=str.prefix(m, './'))
    m = v.rest;
  let re = match_glob_to_regex(m);
  if (!(v = f.match(re)))
    return;
  if (!tr)
    return true;
  return tr.replace('*', v[1]);
};

// parse package.exports
// https://webpack.js.org/guides/package-exports/
let pkg_export_lookup = (pkg, file)=>{
  let check_val = (res, dst)=>{
    let v;
    if (typeof dst!='string')
      return;
    if (!dst.includes('*')){
      res.push(v = {file: dst});
      return v;
    }
    let dfile = path_file(dst);
    let ddir = path_dir(dst);
    if (ddir.includes('*') || dfile!='*')
      throw Error('module('+pkg.name+' dst match * ('+dst+') unsupported');
    res.push(v = {file: dst.slice(0, -1)+dfile});
    return v;
  };
  let patmatch = match=>{
    if (!match.includes('*'))
      return file_match(file, match);
    let mfile = path_file(match);
    let mdir = path_dir(match);
    if (!file_match(file, mdir))
      return;
    if (mfile=='*')
      return true;
    throw Error('module('+pkg.name+' dst match * ('+match+') unsupported');
  };
  let parse_val = (res, v)=>{
    if (typeof v=='string')
      return check_val(res, v);
    if (typeof v!='object')
      return;
    if (Array.isArray(v)){
      for (let e of v){
        if (parse_val(e))
          return;
      }
      return;
    }
    return parse_val(res, v.browser) ||
      parse_val(res, v.module) ||
      parse_val(res, v.import) ||
      parse_val(res, v.default) ||
      parse_val(res, v.require);
  };
  let parse_section = val=>{
    let res = [], tr;
    for (let [match, v] of OF(val)){
      if (!(tr = path_match(file, match, typeof v=='string' ? v : null)))
        continue;
      parse_val(res, typeof tr=='string' ? tr : v);
    }
    let best = res[0];
    if (!best)
      return;
    res.forEach(r=>{
      if (r.file.length > best.file.length)
        best = r;
    });
    return best;
  }
  let parse_pkg = ()=>{
    let exports = pkg.exports, v;
    if (typeof exports=='string')
      exports = {'.': exports};
    if (v = parse_section(exports))
      return v;
    if (file=='.'){
      return check_val([], pkg.browser) ||
        check_val([], pkg.module) ||
        check_val([], pkg.main) ||
        check_val([], 'index.js');
    }
    if (v = parse_section(pkg.browser))
      return v;
  };
  // start package.json lookup
  let v;
  let {file: f} = parse_pkg()||{file};
  if (f.startsWith('./'))
    f = f.slice(2);
  let alt, _alt = pkg.lif?.alt||['.js'];
  if (!['.js', '.json', '.css', '.mjs', '.esm', '.jsx', '.ts', '.tsx']
    .find(e=>f.endsWith(e)) && !_alt.find(e=>f.endsWith(e)))
  {
    alt = _alt;
  }
  if (f!=file)
    D && console.log('export_lookup redirect '+file+' -> '+f);
  return {file: f, alt};
};

async function lpm_http_get({log, url}){
  let response, err, blob;
  let slow = eslow(5000, ['fetch', url]);
  try {
    response = await fetch(url, fetch_opt(url));
  } catch(_err){
    slow.end();
    err = Error('module('+log.mod+') failed fetch: '+_err);
    console.log(err);
    return {err, status: 0, fail_cdn: true};
  }
  slow.end();
  if (response.status==404)
    return {status: response.status, not_exist: true};
  if (response.status!=200){
    err = Error('cdn failed fetch '+response.status+' '+url);
    console.log(err);
    return {status, err, fail_cdn: true};
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
async function lpm_git_get({log, uri}){ assert(0); }
async function lpm_bittorrent_get({log, uri}){ assert(0); }
async function lpm_lif_get({log, uri, cdn}){
  let lpmf, D = 0, lpm, wait, u;
  if (lpmf = lpm_lif_file[uri])
    return await lpmf.wait;
  lpmf = lpm_lif_file[uri] = {uri, wait: wait = ewait(), log};
  u = lpmf.u = lpm_uri_parse(lpmf.uri);
  // select cdn
  // npm/react@18.3.0/file.js
  //   http://unpkg.com/react@18.3.0/file.js
  //   http://cdn.jsdlivr.net/npm/react@18.3.0/file.js
  let pkg, v;
  cdn ||= lpm_get_cdn(u);
  if (!(lpmf.cdn = cdn))
    throw wait.throw(Error('module('+log.mod+') no registry cdn: '+u.modver));
  let i, url, n = cdn.src.length, src, ret;
  for (src of cdn.src){
    if (src.fail)
      continue;
    url = src.u(u);
    ret = await lpm_http_get({log, url});
    if (ret.blob)
      break;
    if (ret.not_exist){
      lpmf.not_exist = true;
      lpmf.err = 'lpm does not exist '+uri;
      return wait.return(lpmf);
    }
    assert(ret.cnd_fail);
    src.fail = {url, err: ret.err};
  }
  if (!(lpmf.blob = ret.blob))
    lpmf.err = ret ? ret.err : 'no non-failed cdn available';
  return wait.return(lpmf);
}

async function lpm_pkg_load(log, modver){
  let lpm, lpm_s, wait;
  if (lpm = lpm_pkg[modver])
    return await lpm.wait;
  lpm = lpm_pkg[modver] = {modver, wait: wait = ewait(), log};
  let u = lpm.u = lpm_uri_parse(lpm.modver);
  lpm.file_lookup = uri=>{
    let {path} = lpm_uri_parse(uri);
    let ofile = path.replace(/^\//, '')||'.';
    let {file, alt} = pkg_export_lookup(lpm.pkg, ofile);
    let nfile = file||ofile;
    let redirect;
    if (nfile && nfile!=ofile)
      redirect = '/.lif/'+lpm.modver+'/'+nfile;
    return {redirect, nfile, alt};
  };
  try {
    // load package.json to locate module's index.js
    // select cdn
    let pkg, v;
    let map = lpm_map[lpm.modver];
    let cdn = lpm.cdn = map ? map.cdn : lpm_get_cdn(u);
    if (!lpm.cdn)
      throw Error('module('+log.mod+') no registry cdn: '+lpm.modver);
    let uri = lpm.modver+'/package.json';
    let get = await lpm_lif_get({log, uri, cdn});
    if (get.err)
      throw get.err;
    try {
      pkg = lpm.pkg = JSON.parse(await get.blob.text());
    } catch(err){
      throw Error('invalid package.json parse '+uri);
    }
    if (!pkg)
      throw Error('json('+uri+') failed');
    if (!(lpm.ver = pkg.version))
      throw Error('invalid package.json '+uri);
    if (!u.ver && !map){
      lpm.redirect = '/.lif/'+u.reg+'/'+u.name+'@'+lpm.ver+u.path;
      log('lpm.redirect', lpm.redirect);
    }
    return wait.return(lpm);
  } catch(err){
    throw wait.throw(err);
  }
}

function lpm_uri_to_npm(uri){
  let v;
  if (v=str.prefix(uri, 'npm/'))
    return v.rest;
  throw Error('lpm_to_npm not an npm: '+uri);
  return 'lif/'+uri;
}

async function lpm_file_load({log, uri, no_alt}){
  let file, D = 0, lpm, wait;
  if (file = lpm_pkg_file[uri])
    return await file.wait;
  file = lpm_pkg_file[uri] = {uri, wait: wait = ewait(), log};
  file.npm_uri = lpm_uri_to_npm(file.uri);
  lpm = file.lpm = await lpm_pkg_load(log, lpm_modver(uri));
  if (lpm.redirect){
    let u = lpm_uri_parse(uri);
    log(u, 'lpm.redir', lpm.redirect);
    return wait.return({redirect: lpm.redirect+u.path});
  }
  let {nfile, redirect, alt} = lpm.file_lookup(uri);
  file.nfile = nfile;
  file.uri = lpm.modver+'/'+nfile;
  file.redirect = redirect;
  file.alt = alt;
  if (file.redirect)
    return wait.return(file);
  // fetch the file
  let get = await lpm_lif_get({log, uri: file.uri, cdn: lpm.cdn});
  if (get.err){
    if (!get.not_exist)
      throw wait.throw(get.err);
    if (no_alt)
      throw wait.throw(Error('fetch failed '+file.url));
    if (alt){
      let afile, err;
      loop: for (let a of alt){
        try {
          afile = await lpm_file_load({log, uri: uri+a, no_alt: true});
          break loop;
        } catch(err){}
      }
      if (afile){
        file.redirect = '/.lif/'+afile.uri;
        D && console.log('fetch OK redirect '+file.url);
        return wait.return(file);
      }
    }
    let e = 'module('+log.mod+(alt ? ' alt '+alt.join(' ') : '')+
      ') failed fetch not exist '+file.url;
    console.error(e);
    throw wait.throw(Error(e));
  }
  assert(get.blob);
  file.blob = get.blob;
  file.body = await get.blob.text();
  D && console.log('fetch OK '+file.uri);
  return wait.return(file);
}

let _lpm_pkg_load = async function(log, modver){
  let lpm, slow;
  modver ||= lpm_root;
  try {
    slow = eslow(5000, ['_lpm_pkg_load', modver]);
    lpm = await lpm_pkg_load(()=>{}, modver);
    slow.end();
    if (lpm.redirect){
      slow = eslow(5000, ['_lpm_pkg_load', modver]);
      lpm = await lpm_pkg_load(log, lpm.redirect);
      slow.end();
    }
  } catch(err){
    slow.end();
    console.error('_lpm_pkg_load err:', err);
    return null;
  }
  return lpm;
};

let coi_enable = false;

// fetch event.request.destination strings:
// audio, audioworklet, document, embed, fencedframe, font, frame, iframe,
// image, json, manifest, object, paintworklet, report, script,
// sharedworker, style, track, video, worker, xslt
let ctype_get = ext=>{
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
};
let response_send = ({body, ext, uri})=>{
  if (uri)
    ext = _path_ext(TE_url_uri_parse(uri).path);
  let opt = {}, v, ctype = ctype_get(ext), h = {};
  if (!ctype){
    Donce('ext '+ext, ()=>console.log('no ctype for '+ext+': '+uri));
    ctype = ctype_get('text');
  }
  h['content-type'] = ctype.ctype;
  h['cache-control'] = 'no-cache';
  if (coi_enable){ // COI: Cross-Origin-Isolation
    h['cross-origin-embedder-policy'] = 'require-corp';
    h['cross-origin-opener-policy'] = 'same-origin';
  }
  opt.headers = new Headers(h);
  return new Response(body, opt);
};

let ctype_binary = path=>{
  let ext = _path_ext(path);
  let ctype = ctype_get(ext)?.ctype;
  if (!ctype)
    return false;
  if (ctype.startsWith('audio/') || ctype.startsWith('image/') ||
    ctype.startsWith('video/') || ctype.startsWith('font/'))
  {
    return true;
  }
  return false;
};

function respond_tr_send({f, q, qs, uri, path, ext}){
  if (f.redirect)
    return Response.redirect(f.redirect+qs);
  if (q.has('raw') || ctype_binary(path))
    return response_send({body: f.blob, uri});
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
  if (q.has('mjs'))
    return response_send({body: file_tr_mjs(f, q.get('worker')), ext: 'js'});
  if (type=='cjs' || type=='amd' || type=='')
    return response_send({body: mjs_import_cjs(path, q), ext: 'js'});
  if (type=='mjs'){
    return response_send({
      body: mjs_import_mjs(f.ast.has.export_default, path, q), ext: 'js'});
  }
  throw Error('invalid lpm file type '+type);
}

async function _kernel_fetch(event){
  let {request, request: {url}} = event;
  let u = TE_url_parse(url);
  let ref = request.headers.get('referer');
  let external = u.origin!=self.location.origin;
  let path = uri_dec(u.path);
  let qs = u.search;
  let q = u.searchParams;
  let mod_self = q.get('mod_self');
  if (mod_self)
    mod_self = 'npm/'+mod_self;
  let ext = _path_ext(path);
  // logging
  let log = function(){
    if (url.includes(' none '))
      return void console.log(url, ...arguments), 1;
  };
  log.mod = url+(ref && ref!=u.origin+'/' ? ' ref '+ref : '');
  let log_ref = log.bind(null);
  log_ref.mod = url;
  // external and non GET requests
  if (request.method!='GET' && request.method!='HEAD'){
    console.log('non GET fetch', url);
    return fetch(request);
  }
  if (external){
    console.log('external fetch', url);
    return fetch(request);
  }
  // LIF+local GET requests
  log('Req');
  let v;
  // LIF requests
  if (v = str.prefix(path, '/.lif/')){
    let uri = v.rest;
    let l = lpm_uri_parse(uri);
    if (!l)
      throw Error('invalid lpm '+uri);
    let map;
    if (!l.ver && !(map = lpm_map[l.reg+'/'+l.name])){
      if (!mod_self){
        console.log('no mod_self for '+url+' using '+lpm_root);
        mod_self = lpm_root;
      }
      let lpm = await _lpm_pkg_load(log_ref, lpm_modver(mod_self));
      D && console.log('lpm', uri, 'mod_self', mod_self);
      let _path = lpm_dep_lookup(lpm.pkg, mod_self, uri);
      if (_path){
        if (_path!=path)
          return Response.redirect(_path+qs);
      }
      // no version found
      // TODO: lookup npm by date<=root app date
    }
    let f = await lpm_file_load({log, uri});
    return respond_tr_send({f, q, qs, uri, path, ext});
  }
  // local requests
  let pkg_root = (await _lpm_pkg_load(log_ref, lpm_root)).pkg;
  if (v = lpm_modmap_lookup(pkg_root, path)){
    log('modmap '+path+' -> '+v);
    return Response.redirect('/.lif/'+v+'?raw=1');
  }
  console.log('req default', url);
  let response = await fetch(request);
  let headers = new Headers(response.headers);
  if (coi_enable){ // COI: Cross-Origin-Isolation
    headers.set('cross-origin-embedder-policy', 'require-corp');
    headers.set('cross-origin-opener-policy', 'same-origin');
  }
  return new Response(response.body,
    {headers, status: response.status, statusText: response.statusText});
}

async function kernel_fetch(event){
  let slow;
  try {
    slow = eslow(15000, ['_kernel_fetch', event.request.url]);
    let res = await _kernel_fetch(event);
    slow.end();
    return res;
  } catch(err){
    console.error('kernel_fetch err', err);
    slow.end();
    return new Response(''+err, {status: 500, statusText: ''+err});
  }
}

let do_module_dep = async function({modver, dep}){
  let log = function(){ console.log(modver, ...arguments); };
  log.mod = dep;
  let lpm = await _lpm_pkg_load(log, modver);
  if (!lpm)
    return;
  return lpm_dep_lookup(lpm.pkg, modver, dep);
};

let do_pkg_map = function({map}){
  lpm_map = {...map};
  let i = 0;
  for (let [name, mod] of OF(map)){
    if (!i++){ // first in list is root
      mod_root = name;
      lpm_root = 'npm/'+name;
    }
    let m = lpm_map['npm/'+name] = {net: mod};
    m.base = mod+name;
    m.lpm_base = mod+name;
    if (mod[0]=='/') // local cdn
      m.cdn = {src: [{name: 'local', u: u=>m.lpm_base+u.path}]};
  }
};
do_pkg_map({map: {'lif-kernel': '/'}});

let boot_chan;
function sw_init_post(){
  boot_chan = new util.postmessage_chan();
  boot_chan.add_server_cmd('version', arg=>({version: lif_version}));
  boot_chan.add_server_cmd('module_dep', ({arg})=>do_module_dep(arg));
  boot_chan.add_server_cmd('pkg_map', async({arg})=>do_pkg_map(arg));
  lif_kernel.on_message = event=>{
    if (boot_chan.listen(event))
      return;
  };
  lif_kernel.on_fetch = event=>kernel_fetch(event);
  lif_kernel.wait_activate.return();
}
sw_init_post();
console.log('lif kernel sw '+lif_kernel.version+' util '+util.version);
} catch(err){console.error('lif kernel failed sw init', err);}})();

