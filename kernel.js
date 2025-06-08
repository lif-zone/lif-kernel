// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let lif_version = '1.1.10';
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
      console.error('lif kernel sw: '+err);
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
  self.addEventListener('message', event=>{
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

let path_dir = path=>path.match(/(^.*\/)?([^/]*)$/)?.[1]||'';
let sw_q = new URLSearchParams(location.search);
let lif_kernel_base = sw_q.get('lif_kernel_base');
let lif_kernel_base_u = URL.parse(lif_kernel_base);
let kernel_cdn = 'https://unpkg.com/';
let Babel = await import_module(kernel_cdn+'@babel/standalone@7.26.4/babel.js');
let util = await import_module(lif_kernel_base+'util.js');
let mime_db = await import_module(lif_kernel_base+'mime_db.js');
let {postmessage_chan, str, OF, OA, assert, ecache,
  path_ext, _path_ext, path_file, path_is_dir, path_join,
  path_prefix, qs_enc,
  TE_url_parse, TE_url_uri_parse, url_uri_type, TE_npm_to_lpm, TE_lpm_to_npm,
  lpm_uri_parse, lpm_mod, lpm_to_sw_uri, lpm_to_npm, npm_to_lpm,
  TE_lpm_uri_parse, TE_lpm_uri_str,
  uri_enc, uri_dec, match_glob_to_regex,
  esleep, eslow, Scroll, _debugger, assert_eq, assert_objv, Donce} = util;
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

let submod_path = u=>u.submod.replace(/\/$/, '')+u.path;
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
      url: u=>`https://cdn.jsdelivr.net/gh/${u.name}${u.ver}${submod_path(u)}`
    }, {
      name: 'statically.io',
      url: u=>`https://statically.io/gh/${u.name}${u.ver}${submod_path(u)}`,
    }]},
    gitlab: {src: [{
      name: 'statically.io',
      url: u=>`https://statically.io/gl/${u.name}${u.ver}${submod_path(u)}`,
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
    u = TE_lpm_uri_parse(u);
  switch (u.reg){
  case 'npm': return cdn.npm;
  case 'git': return cdn.git[u.site];
  case 'ipfs': return cdn.ipfs;
  case 'local': return cdn.local;
  }
  throw Error('invalid reg '+u.reg);
};

let lpm_app;
let lpm_app_pkg = {};
let lpm_app_date = +new Date();
let lpm_boot;
let lpm_boot_pkg = {};
let reg_file_t = {};
let lpm_pkg_t = {};
let lpm_pkg_ver_t = {};
let lpm_t = {};

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

let lpm_dep_lookup = (lpm, uri, opt)=>{
  let pkg = lpm.pkg, mod_self = lpm.mod;
  let ret_err = err=>{
    D && console.log('lpm_dep_lookup('+mod_self+') dep '+uri+': '+err);
  };
  let __uri = uri;
  let v, u = TE_url_uri_parse(uri, mod_self);
  if (!u.is.mod)
    return;
  if (u.is.rel)
    uri = u.path;
  else if (opt?.npm)
    uri = npm_to_lpm(uri);
  if (!(u = lpm_uri_parse(uri)))
    return ret_err('invalid lpm uri import');
  if (u.ver)
    return uri;
  let dep = lpm_dep_ver_lookup({mod: mod_self, pkg}, uri);
  if (!dep && mod_self){
    let _self = lpm_uri_parse(mod_self);
    if (_self && _self.name==u.name) // XXX make generic lpm
      return _self.mod+u.path;
  }
  if (!dep || dep=='-')
    return ret_err('dep missing');
  if (dep.startsWith('local/'))
    return dep;
  if (dep.startsWith('-peer-')){
    if (!(dep = lpm_dep_ver_lookup({mod: mod_self, pkg: lpm_app_pkg}, uri)))
      return ret_err('dep missing lpm_app');
  }
  return dep;
};

let tr_mjs_import = f=>{
  let s = Scroll(f.js), v;
  for (let d of f.ast.imports){
    let uri = d.module;
    if (url_uri_type(uri)=='rel')
      s.splice(d.start, d.end, json(uri+'?mjs=1'));
    else if (v=lpm_dep_lookup({pkg: f.pkg, mod: lpm_mod(f.uri)}, d.module, {npm: 1})){
      let _v = v;
      v = lpm_to_sw_uri(v);
      if (d.imported)
        v += '?imported='+d.imported.join(',');
      s.splice(d.start, d.end, json(v));
    }
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

let lpm_dep_ver_lookup = (lpm, mod_uri)=>{
  let pkg = lpm.pkg;
  let X = (reason, val)=>{
    return val;
    if (['npm1', 'modver'].includes(reason))
      return val;
    if (pkg.name=='lif-os')
      console.log(reason, pkg.name, mod_uri, val);
    return val;
  };
  let mod = lpm_mod(mod_uri);
  let npm_mod = TE_lpm_to_npm(mod);
  let path = TE_lpm_uri_parse(mod_uri).path;
  let get_dep = dep=>{
    let d, m, op, v, ver;
    if (!(d = dep?.[npm_mod]))
      return;
    if (d[0]=='/')
      return X('root', TE_lpm_uri_str({reg: 'local', submod: d=='/' ? '' : d+'/', path}));
    if (v=str.starts(d, './')){
      let a = lpm.mod+(v.rest?'/'+v.rest:'')+path;
      let b = 'npm/'+pkg.name+'/'+v.rest+path;
      if (a!=b) 
        0 && console.log(b, '->', a);
      return 'npm/'+pkg.name+'/'+v.rest+path;
      return X('npm1', lpm.mod+(v.rest?'/'+v.rest:'')+path); // XXX: make generic lpm
    }
    if (v=str.starts(d, 'npm:'))
      return X('npm2', 'npm/'+v.rest+path);
    d = d.replaceAll(' ', '');
    if (!(m = d.match(/^([^0-9.]*)([0-9.]+)$/))){ // XXX TODO: fix/remove
      console.log('invalid dep('+mod+') ver '+d);
      return X('none2', '-');
    }
    [, op, ver] = m;
    if (op=='>=')
      return X('ver', ver);
    if (!(op=='^' || op=='=' || op=='' || op=='~')){
      console.log('invalid dep('+mod+') op '+op);
      return X('none', '-');
    }
    return X('modver', mod+'@'+ver+path);
  };
  let d
  if (d = get_dep(pkg.lif?.dependencies))
    return d;
  if (d = get_dep(pkg.dependencies))
    return d;
  if (d = get_dep(pkg.peerDependencies))
    return X('peer', '-peer-'+d);
  if (d = get_dep(pkg.devDependencies))
    return d;
};

let file_match = (file, match)=>{
  let v, f = file, m = match;
  while (v=str.starts(f, './'))
    f = v.rest;
  while (v=str.starts(m, './'))
    m = v.rest;
  if (path_prefix(f, m))
    return true;
  return false;
};
let path_match = (path, match, tr)=>{
  let v, f = path, m = match;
  while (v=str.starts(f, './'))
    f = v.rest;
  while (v=str.starts(m, './'))
    m = v.rest;
  let re = match_glob_to_regex(m);
  if (!(v = f.match(re)))
    return;
  if (!tr)
    return true;
  return tr.replace('*', v[1]);
};

let path_match2 = (path, match, to)=>{
  let ret_val = typeof to=='string' ? null : to || true;
  if (!to)
    to = match;
  let v, f = path, m = match;
  while (v=str.starts(path, './'))
    path = v.rest;
  while (v=str.starts(match, './'))
    match = v.rest;
  if (match.endsWith('/')){
    if (!(v = str.starts(path, match)))
      return;
    return ret_val || to+v.rest;
  }
  if (match.endsWith('*')){
    let re = match_glob_to_regex(match);
    if (!(v = path.match(re)))
      return;
    return ret_val || to.replace('*', v[1]);
  }
  if (path==match)
    return ret_val || to;
};

function pkg_web_export_lookup(pkg, uri){
  function lookup(exports){
    if (!exports)
      return;
    for (let [match, to] of OF(exports)){
      let v;
      if (v=path_match2(uri, match, to))
        return v;
    }
  }
  let v;
  if (v=lookup(pkg.lif?.web_exports))
    return v;
  if (v=lookup(pkg.web_exports))
    return v;
}

function test_lpm(){
  let t, pkg;
  t = (file, match, v)=>assert_eq(v, file_match(file, match));
  t('.', '.', true);
  t('esm/file.js', './esm/*', false);
  t('file', './file', true);
  t('dir/index.js', './dir/*', false);
  t('file.js', './*', false);
  t('.', '.', true);
  t('esm/file.js', './esm/*', false);
  t('esm/file.js', './esm/', true);
  t('esm/file.js', './esm', true);
  t('esm/file.js', './file.js', false);
  t('file.js', './file.jss', false);
  t = (path, match, tr, v)=>assert_eq(v, path_match(path, match, tr));
  t('.', '.', null, true);
  t('esm/file.js', './esm/*', './esm/*', './esm/file.js');
  t('file', './file', './file.js', './file.js');
  t('dir/index.js', './dir/*', './dir/*', './dir/index.js');
  t('file.js', './*', './*', './file.js');
  t('.', '.', './index.js', './index.js');
  t('esm/file.js', './esm/*', './esm/X*', './esm/Xfile.js');
  t = (path, match, tr, v)=>assert_objv(v, path_match2(path, match, tr));
  t('file', 'file', null, true);
  t('file', 'file', {x: 1}, {x: 1});
  t('file', 'f', undefined);
  t('.', '.', 'index.js', 'index.js');
  t('esm/file.js', './esm/*', './esm/*', './esm/file.js');
  t('file', './file', './file.js', './file.js');
  t('dir/index.js', './dir/*', './dir/*', './dir/index.js');
  t('file.js', './*', './*', './file.js');
  t('.', '.', './index.js', './index.js');
  t('esm/file.js', './esm/*', './esm/X*', './esm/Xfile.js');
  t = (path, match)=>assert_eq(undefined, path_match(path, match));
  t('esm/file.js', './esm/');
  t('esm/file.js', './esm');
  t('esm/file.js', './file.js');
  t('file.js', './file.jss');
  t = (pkg_ver, date, v)=>assert_eq(v, lpm_pkg_ver_lookup(pkg_ver, date));
  let pkg_ver = {time: {
    created: '2024-02-13T16:33:48.639Z',
    modified: '2024-05-27T21:37:19.361Z',
    '3.1.1': '2024-02-13T16:33:48.811Z',
    '3.1.2': '2024-02-13T16:38:16.974Z',
    '3.1.4': '2024-02-13T17:36:12.881Z',
    '3.2.0': '2024-03-17T22:32:47.128Z',
  }};
  t(pkg_ver, '2024-02-13T16:38:16.973Z', '3.1.1');
  t(pkg_ver, '2024-02-13T16:38:16.974Z', '3.1.2');
  t(pkg_ver, '2024-02-13T16:38:16.975Z', '3.1.2');
  t(pkg_ver, '2024-03-17T22:32:47.128Z', '3.2.0');
  t(pkg_ver, '2024-03-17T22:32:47.129Z', '3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.639Z', '3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.638Z', '3.2.0');
  t = (lpm, uri, v)=>0 && assert_eq(v, lpm_dep_ver_lookup(lpm, uri));
  t({mod: 'npm/a-pkg', pkg: {lif: {dependencies: {'mod': '/mod'}}}},
    'npm/mod/dir/main.tsx', 'local/mod//dir/main.tsx');
  let lifos = {mod: 'npm/lif-os', pkg: {dependencies:
    {pages: './pages', loc: '/loc', react: '^18.3.1'}}};
  t(lifos, 'npm/pages/_app.tsx', 'npm/lif-os/pages/_app.tsx');
  t(lifos, 'npm/loc/file.js', 'local/loc//file.js');
  t(lifos, 'npm/react', 'npm/react@18.3.1');
  t(lifos, 'npm/react/index.js', 'npm/react@18.3.1/index.js');
  t = (pkg, mod, uri, v)=>assert_eq(v, lpm_dep_lookup({mod, pkg}, uri));
  t({lif: {dependencies: {'mod': '/mod'}}}, 'npm/mod',
    'npm/mod/dir/main.tsx', 'local/mod//dir/main.tsx');
  t = (file, alt, v)=>assert_objv(v, pkg_alt_get({lif: {alt}}, file));
  t('a/file.js', undefined, undefined);
  t('a/file', undefined, ['.js']);
  t('a/file.ts', undefined, undefined);
  t('a/file', ['.js'], ['.js']);
  t('a/file', ['.xjs', '.js'], ['.xjs', '.js']);
  t('a/file.xjs', ['.xjs', '.js'], undefined);
  t('a/file.ico', ['.xjs'], undefined);
  t('a/file.abcxyz', ['.xjs'], ['.xjs']);
  t = (pkg, file, v)=>assert_objv(v, pkg_export_lookup(pkg, file));
  t = (pkg, uri, v)=>assert_objv(v, pkg_web_export_lookup(pkg, uri));
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
test_lpm();

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
      if (typeof v=='string'
        ? !(v = path_match(file, match, v))
        : !path_match(file, match))
      {
        continue;
      }
      parse_val(res, v);
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
  if (f!=file){
    D && console.log('export_lookup redirect '+file+' -> '+f);
    return {file: f, redirect: f};
  }
  return {file: f};
};

function pkg_alt_get(pkg, file){
  let ext = _path_ext(file);
  if (ext && ctype_get(ext))
    return;
  let alt = pkg.lif?.alt||['.js'];
  if (alt.find(e=>file.endsWith(e)))
    return;
  return alt;
}

function lpm_export_get(pkg, uri){
  let {path} = TE_lpm_uri_parse(uri);
  let ofile = path.replace(/^\//, '')||'.';
  return pkg_export_lookup(pkg, ofile);
}

async function reg_http_get({log, url}){
  let response, err, blob;
  let slow = eslow(5000, ['fetch', url]);
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
  if (response.status==404)
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
async function reg_git_get({log, uri}){ assert(0); }
async function reg_bittorrent_get({log, uri}){ assert(0); }
async function reg_get({log, uri, cdn}){
return await ecache(reg_file_t, uri, async function run(reg){
  let lpm, wait, u;
  reg.uri = uri;
  reg.log = log;
  u = reg.u = TE_lpm_uri_parse(reg.uri);
  // select cdn
  // npm/react@18.3.0/file.js
  //   http://unpkg.com/react@18.3.0/file.js
  //   http://cdn.jsdlivr.net/npm/react@18.3.0/file.js
  let pkg, v;
  cdn ||= lpm_get_cdn(u);
  reg.cdn = cdn;
  let src = cdn.src;
  if (u.path=='/--get-ver--/'){
    src = cdn.src_ver;
    u.path = '';
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
      reg.err = 'lpm does not exist '+uri;
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
  D && console.log('fetch OK '+uri);
  return reg;
}); }

async function reg_get_alt({log, uri, alt}){
  // fetch the file
  let first;
  alt = ['', ...(alt||[])];
  for (let a of alt){
    let f = await reg_get({log, uri: uri+a});
    first ||= f;
    f = {...f};
    f.alt = a;
    if (f.not_exist)
      continue;
    if (!f.err)
      return f;
    if (f.err)
      throw Error('fetch failed '+uri);
  }
  D && console.log('module('+log.mod+(alt.length>1 ? ' alt '+alt.join(' ') : '')+
    ') failed fetch not exist '+uri);
  return first; // not_exist
}

async function lpm_pkg_get(log, mod, redir_mod){
return await ecache(lpm_pkg_t, mod, async function run(lpm){
  lpm.mod = mod;
  lpm.log = log;
  let u = lpm.u = TE_lpm_uri_parse(lpm.mod);
  // load package.json to locate module's index.js
  // select cdn
  let pkg, v;
  let uri = lpm.mod+'/package.json';
  let dep = lpm_dep_lookup({pkg: lpm_boot_pkg}, uri);
  let _uri = dep||uri;
  let cdn = lpm.cdn = lpm_get_cdn(_uri);
  let get = await reg_get({log, uri: _uri, cdn});
  if (get.err)
    throw get.err;
  try {
    pkg = lpm.pkg = JSON.parse(get.body);
  } catch(err){
    throw Error('invalid package.json parse '+uri);
  }
  if (!(lpm.ver = pkg.version))
    throw Error('invalid package.json '+uri);
  if (!u.ver && u.reg=='npm'){
    lpm.redirect = TE_lpm_uri_str({...u, ver: lpm.ver});
    D && console.log('lpm.redirect', lpm.redirect);
  }
  return lpm;
}); }

async function lpm_dep_get({log, uri, mod_self, qs}){
  let get_dep = async({log, uri, mod_self})=>{
    let lpm = await lpm_pkg_get(log, lpm_mod(mod_self));
    D && console.log('lpm', uri, 'mod_self', mod_self);
    if (!lpm)
      throw Error('mod_self('+mod_self+') pkg load failed');
    return lpm_dep_lookup(lpm, uri);
  };
  let _uri = uri;
  let l = TE_lpm_uri_parse(uri);
  let dep;
  lookup: {
    if (lpm_boot && (dep = lpm_dep_lookup({pkg: lpm_boot_pkg}, uri)))
      break lookup;
    if (mod_self && (dep = await get_dep({log, uri, mod_self})))
      break lookup;
    if (lpm_app && (dep = await get_dep({log, uri, mod_self: lpm_app})))
      break lookup;
  }
  if (dep)
    return dep;
  D && console.log('no dep('+mod_self+') found: '+uri);
  if (l.ver)
    return uri;
  D && console.log('no version found. TODO - lookup npm.date<=root app date: '+uri);
}

async function lpm_pkg_ver_get(log, mod){
return await ecache(lpm_pkg_ver_t, mod, async function run(pv){
  pv.mod = mod;
  pv.log = log;
  let uri = pv.mod+'/--get-ver--/';
  let cdn = pv.cdn = lpm_get_cdn(uri);
  let get = await reg_get({log, uri, cdn});
  if (get.err)
    throw get.err;
  try {
    pv.pkg_ver = JSON.parse(get.body);
  } catch(err){
    throw Error('invalid package.json parse '+uri);
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
    return found.ver;
  return max?.ver;
}

async function lpm_get({log, uri, mod_self}){
  let dep = await lpm_dep_get({log, uri, mod_self});
  if (!dep)
    dep = uri;
  let u = TE_lpm_uri_parse(dep);
  if (dep!=uri && u.reg!='local')
    return {redirect: '/.lif/'+dep}; // version or other lpm
  if (!u.ver && str.is(dep, 'npm', 'git')){
    let pv = await lpm_pkg_ver_get({log, mod: u.mod});
    u.ver = lpm_pkg_ver_lookup(pv, lpm_app_date);
    if (!u.ver)
      throw Error('failed mod '+u.mod+' getting pkg_ver list');
    dep = TE_lpm_uri_str(u);
    return {redirect: '/.lif/'+dep};
  }
  let lpm_pkg = await lpm_pkg_get(log, lpm_mod(dep));
  let {file, redirect} = lpm_export_get(lpm_pkg.pkg, uri);
  if (redirect){
    let _uri = lpm_mod(uri)+'/'+file;
    D && console.log('redirect '+uri+' -> '+_uri);
    return {redirect: '/.lif/'+_uri};
  }
  let alt = pkg_alt_get(lpm_pkg.pkg, uri);
  let reg = await reg_get_alt({log, uri: dep, alt});
  if (reg.not_exist)
    return reg;
  if (reg.alt){
    D && console.log('redirect /.lif/'+uri+' -> '+reg.alt);
    return {redirect: '/.lif/'+uri+reg.alt};
  }
  // create result lpm file, and cache it
  if (lpm_t[uri])
    return lpm_t[uri];
  let lpm = lpm_t[uri] = {uri, blob: reg.blob, body: reg.body,
    npm_uri: lpm_to_npm(uri), pkg: lpm_pkg.pkg};
  return lpm;
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
  if (uri)
    ext = _path_ext(TE_url_uri_parse(uri).path);
  let opt = {}, v, ctype = ctype_get(ext), h = {};
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
  if (ctype.startsWith('audio/') || ctype.startsWith('image/') ||
    ctype.startsWith('video/') || ctype.startsWith('font/'))
  {
    return true;
  }
  return false;
};

function respond_tr_send({f, qs, uri}){
  let ext = _path_ext(uri);
  let q = new URLSearchParams(qs);
  if (f.redirect)
    return Response.redirect('/.lif/'+f.redirect+qs);
  if (q.has('raw') || ctype_binary(uri))
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
  if (q.has('mjs')){
    return response_send({body: file_tr_mjs(f, {worker: q.get('worker')}),
      ext: 'js'});
  }
  if (type=='cjs' || type=='amd' || type=='')
    return response_send({body: mjs_import_cjs('/.lif/'+uri, q), ext: 'js'});
  if (type=='mjs'){
    return response_send({
      body: mjs_import_mjs(f.ast.has.export_default, '/.lif/'+uri, q),
      ext: 'js'});
  }
  throw Error('invalid lpm file type '+type);
}

async function kernel_fetch_lpm({log, uri, mod_self, qs}){
  let f = await lpm_get({log, uri, mod_self});
  if (f.not_exist)
    return new Response('not found', {status: 404, statusText: 'not found'});
  if (f.redirect)
    return Response.redirect(f.redirect+qs);
  return respond_tr_send({f, qs, uri});
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
  let u = TE_url_parse(url);
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
  // external and non GET requests
  if (request.method!='GET' && request.method!='HEAD')
    return fetch_pass(request, 'non-GET');
  if (external)
    return fetch_pass(request, 'external');
  // lif-kernel passthrough
  if (path=='/' || (lif_kernel_base_u.origin==u.origin &&
    u.pathname.startsWith(lif_kernel_base_u.pathname)))
  {
    return fetch(request);
  }
  // LIF+local GET requests
  D && console.log('req '+log.mod);
  let v;
  // LIF requests
  if (v = str.starts(path, '/.lif/')){
    let uri = v.rest;
    return await kernel_fetch_lpm({log, mod_self, uri, qs});
  }
  // local requests
  let uri;
  if (uri = pkg_web_export_lookup(lpm_app_pkg, path)){
    if (!uri.startsWith('./'))
      throw Error('invalid web_exports '+path+' -> '+uri);
    uri = '/.lif/'+lpm_app+uri.slice(1)+'?raw=1';
    D && console.log('redirect '+path+' -> '+uri);
    return Response.redirect(uri);
  }
  console.log('req default', url);
  let response = await fetch(request);
  let headers = new Headers(response.headers);
  coi_set_headers(headers);
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

let do_module_dep = async function({mod, dep}){
  let lpm = await lpm_pkg_get({mod: dep}, mod);
  if (!lpm)
    return;
  return lpm_dep_lookup(lpm, dep);
};

let do_app_pkg = async function(boot_pkg){
  let lif = boot_pkg.lif;
  lpm_boot = 'boot';
  lpm_boot_pkg = boot_pkg;
  lpm_app = lpm_mod(TE_npm_to_lpm(lif.webapp));
  let lpm = await lpm_pkg_get({mod: 'boot'}, lpm_app);
  lpm_app_pkg = lpm?.pkg;
};

let boot_chan;
function sw_init_post(){
  boot_chan = new util.postmessage_chan();
  boot_chan.add_server_cmd('version', arg=>({version: lif_version}));
  boot_chan.add_server_cmd('module_dep', ({arg})=>do_module_dep(arg));
  boot_chan.add_server_cmd('app_pkg', async({arg})=>await do_app_pkg(arg));
  lif_kernel.on_message = event=>{
    if (boot_chan.listen(event))
      return;
  };
  lif_kernel.on_fetch = event=>kernel_fetch(event);
  lif_kernel.wait_activate.return();
}
sw_init_post();
console.log('lif kernel '+lif_kernel_base
  +' sw '+lif_kernel.version+' util '+util.version);
} catch(err){console.error('lif kernel failed sw init', err);}})();

