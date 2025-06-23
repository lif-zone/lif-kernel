// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let lif_version = '1.1.17';
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
  T_lpm_parse, T_lpm_str, lpm_ver_missing,
  uri_dec, match_glob_to_regex, semver_range_parse,
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
    u = T_lpm_parse(u);
  switch (u.reg){
  case 'npm': return cdn.npm;
  case 'git': return cdn.git[u.site];
  case 'ipfs': return cdn.ipfs;
  case 'local': return cdn.local;
  }
  throw Error('invalid reg '+u.reg);
};

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
  let ast = f.ast = {}, lmod = f.lmod;
  let tr_jsx_ts = ()=>{
    let ext = _path_ext(lmod);
    ast.is_ts = ext=='ts' || ext=='tsx';
    ast.is_jsx = ext=='jsx' || ext=='tsx';
    f.js = f.body;
    if (ast.is_ts || ast.is_jsx){
      let opt = {presets: [], plugins: [], sourceMaps: true,
        generatorOpts: {importAttributesKeyword: 'with'}};
      if (ast.is_ts){
        opt.presets.push('typescript');
        opt.filename = path_file(lmod);
      }
      if (ast.is_jsx)
        opt.presets.push('react');
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

let lpm_imp_lookup = ({lpm, lmod})=>{
  let D = 0;
  let pkg = lpm.pkg, mod_self = lpm.lmod;
  let ret_err = err=>{
    D && console.log('lpm_imp_lookup('+mod_self+') imp '+lmod+': '+err);
  };
  let u, _lmod = lmod;
  if (!(u = lpm_parse(_lmod)))
    return ret_err('invalid lpm uri import');
  if (u.ver || u.reg=='local')
    return _lmod;
  let imp = lpm_imp_ver_lookup({lmod: mod_self, pkg}, _lmod);
  if (!imp || imp=='-')
    return ret_err('imp missing');
  if (imp.startsWith('peer:')){
    if (lpm_pkg_app &&
      (imp = lpm_imp_ver_lookup({lmod: mod_self, pkg: lpm_pkg_app.pkg}, _lmod)))
    {
      return imp;
    }
    for (let l = lpm; lpm; lpm = lpm.parent){
      if (!(imp = lpm_imp_ver_lookup(lpm, lmod)))
        continue;
      if (!imp || imp=='-')
        continue;
      return imp;
    }
    return ret_err('imp missing lpm_app');
  }
  return imp;
};

let tr_mjs_import = f=>{
  let s = Scroll(f.js), v;
  for (let d of f.ast.imports){
    let imp = d.module;
    if (url_uri_type(imp)=='rel')
      s.splice(d.start, d.end, json(imp+'?mjs=1'));
    else if (v=lpm_imp_lookup({lpm: {pkg: f.pkg, lmod: T_lpm_lmod(f.lmod)},
      lmod: T_npm_to_lpm(imp)}))
    {
      v = '/.lif/'+v;
      if (d.imported)
        v += '?imported='+d.imported.join(',');
      s.splice(d.start, d.end, json(v));
    } else
      console.log('import('+f.lmod+') missing: '+imp);
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

let lpm_imp_ver_lookup = (lpm, mod_uri)=>{
  let pkg = lpm.pkg;
  let X = (reason, val)=>{
    return val;
    if (['npm1', 'modver'].includes(reason))
      return val;
    if (pkg.name=='lif-os')
      console.log(reason, pkg.name, mod_uri, val);
    return val;
  };
  let lmod = T_lpm_lmod(mod_uri);
  let npm = T_lpm_to_npm(lmod);
  let path = T_lpm_parse(mod_uri).path;
  let get_imp = imp=>{
    let d, v;
    if (!(d = imp?.[npm]))
      return;
    if (d[0]=='/')
      return X('root', T_lpm_str({reg: 'local', submod: d=='/' ? '' : d+'/', path}));
    if (v=str.starts(d, './'))
      return X('same_pkg', lpm.lmod+(v.rest?'/'+v.rest:'')+path);
    if (v=str.starts(d, 'npm:'))
      return X('npm2', 'npm/'+v.rest+path);
    if (v=str.starts(d, '.git/'))
      return X('git', 'git/'+v.rest+path);
    let range = semver_range_parse(d);
    if (!range){
      console.log('invalid imp('+lmod+') ver '+d);
      return X('none2', '-');
    }
    let {op, ver} = range[0];
    if (range.length>1)
      console.log('ignoring multi-op imp: '+d);
    if (op=='>=')
      return X('ver', ver);
    if (!(op=='^' || op=='=' || op=='' || op=='~')){
      console.log('invalid imp('+lmod+') op '+op);
      return X('none', '-');
    }
    return X('modver', lmod+'@'+ver+path);
  };
  let d
  if (d = get_imp(pkg.lif?.dependencies))
    return d;
  if (d = get_imp(pkg.dependencies))
    return d;
  if (d = get_imp(pkg.peerDependencies))
    return X('peer', 'peer:'+d);
  if (d = get_imp(pkg.devDependencies))
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

let path_match = (path, match, to)=>{
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

function pkg_web_export_lookup(pkg, path){
  function lookup(exports){
    if (!exports)
      return;
    for (let [match, to] of OF(exports)){
      let v;
      if (v=path_match(path, match, to))
        return v;
    }
  }
  let v;
  if (v=lookup(pkg.lif?.web_exports))
    return v;
  if (v=lookup(pkg.web_exports))
    return v;
}

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
  if (file=='package.json')
    return {file};
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

function lpm_export_get(pkg, lmod){
  let {path} = T_lpm_parse(lmod);
  let ofile = path.slice(1)||'.';
  return pkg_export_lookup(pkg, ofile);
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
  let lpm, wait, u, get_ver;
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
  let reg = await reg_get({log, lmod: lmod+'/package.json'});
  if (reg.not_exist)
    return OA(lpm_pkg, reg);
  lpm_pkg.blob = reg.blob;
  lpm_pkg.body = reg.body;
  try {
    lpm_pkg.pkg = JSON.parse(lpm_pkg.body);
  } catch(err){
    throw Error('lmod('+lmod+'): '+err);
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
  let {file, redirect} = lpm_export_get(pkg, lmod);
  if (redirect){
    let _uri = T_lpm_lmod(lmod)+'/'+file;
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
  let v, _lmod;
  if (_lmod = lpm_imp_lookup({lpm: lpm_pkg_root, lmod})){
    if (_lmod.startsWith('peer:'))
      _lmod = undefined;
  }
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
async function lpm_pkg_resolve({log, lmod, mod_self}){
  D && console.log('lpm_pkg_resolve', lmod, mod_self);
  assert_lmod(lmod);
  if (!mod_self)
    return {lpm_pkg: await lpm_pkg_get_follow({log, lmod})};
  assert_lmod(mod_self);
  // same name & ver
  //if (lmod==mod_self)
  //  break mod_self;
  // same name, empty ver; use base to complete ver
  let imp = lpm_ver_from_base(lmod, mod_self);
  if (imp && imp!=lmod)
    return {redirect: lmod};
  let found = lpm_same_base(lmod, mod_self);
  // different modules: load parent, and lookup imports.
  // when loading package, use boot packege for redirects
  let lpm_self = await lpm_pkg_get_follow({log, lmod: mod_self});
  // same package?
  if (mod_self==lmod)
    return {lpm_pkg: lpm_self};
  // lookup imports from parent
  imp = lpm_imp_lookup({lpm: lpm_self, lmod});
  found ||= !!imp;
  let v;
  if (imp && imp.startsWith('peer:')){
    let peer = v.rest, _imp;
    for (let p = lpm_self.parent; p; p = p.parent){
      _imp = lpm_imp_lookup({lpm: p, lmod});
      if (_imp && !_imp.startsWith('peer:')){
        imp = _imp;
        break;
      }
    }
  }
  let _lmod = imp || lmod;
  let u = T_lpm_parse(_lmod);
  if (u.reg=='npm' && !u.ver && !found)
    throw Error('mod('+mod_self+') missing dependency: '+lmod);
  let lpm_pkg = await lpm_pkg_get({log, lmod: T_lpm_lmod(_lmod),
    mod_self: lpm_self.lmod});
  return {lpm_pkg, subdir: u.path};
}

async function lpm_file_resolve({log, lmod, mod_self}){
  D && console.log('lpm_file_resolve', lmod, mod_self);
  if (!mod_self)
    mod_self = lpm_app;
  let {lpm_pkg, subdir} = await lpm_pkg_resolve({log, lmod: T_lpm_lmod(lmod),
    mod_self: mod_self && T_lpm_lmod(mod_self)});
  if (lpm_pkg.redirect){
    let u = T_lpm_parse(lmod);
    return {redirect: lpm_pkg.redirect+u.path};
  }
  let u = T_lpm_parse(lmod);
  let _lmod = lpm_pkg.lmod+(subdir||'')+u.path;
  let lpm_file = await lpm_file_get({log, lmod: _lmod, lpm_pkg});
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
  if (q.has('mjs')){
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

async function kernel_fetch_lpm({log, lmod, mod_self, qs}){
  let f = await lpm_file_resolve({log, lmod, mod_self});
  if (f.not_exist)
    return new Response('not found', {status: 404, statusText: 'not found'});
  if (f.redirect){
    D && console.log('redirect lpm-f '+lmod+' -> '+f.redirect);
    return Response.redirect('/.lif/'+f.redirect+qs);
  }
  return respond_tr_send({f, qs, lmod});
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
    return await kernel_fetch_lpm({log, mod_self, lmod, qs});
  }
  // local requests
  let _path;
  if (!lpm_pkg_app)
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

function test_lpm(){
  let t, pkg;
  t = (path, match, tr, v)=>assert_obj(v, path_match(path, match, tr));
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
  t = (path, match, v)=>assert_eq(v, path_match(path, match));
  t('esm/file.js', './esm/', true);
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
  t(pkg_ver, '2024-02-13T16:38:16.973Z', '@3.1.1');
  t(pkg_ver, '2024-02-13T16:38:16.974Z', '@3.1.2');
  t(pkg_ver, '2024-02-13T16:38:16.975Z', '@3.1.2');
  t(pkg_ver, '2024-03-17T22:32:47.128Z', '@3.2.0');
  t(pkg_ver, '2024-03-17T22:32:47.129Z', '@3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.639Z', '@3.2.0');
  t(pkg_ver, '2024-02-13T16:33:48.638Z', '@3.2.0');
  t = (lpm, imp, v)=>0 && assert_eq(v, lpm_imp_ver_lookup(lpm, imp));
  t({lmod: 'npm/a-pkg', pkg: {lif: {dependencies: {'mod': '/mod'}}}},
    'npm/mod/dir/main.tsx', 'local/mod//dir/main.tsx');
  let lifos = {lmod: 'npm/lif-os', pkg: {dependencies:
    {pages: './pages', loc: '/loc', react: '^18.3.1',
    os: '.git/github/repo/mod'}}};
  t(lifos, 'npm/pages/_app.tsx', 'npm/lif-os/pages/_app.tsx');
  t(lifos, 'npm/loc/file.js', 'local/loc//file.js');
  t(lifos, 'npm/react', 'npm/react@18.3.1');
  t(lifos, 'npm/react/index.js', 'npm/react@18.3.1/index.js');
  t(lifos, 'npm/os/dir/index.js', 'git/github/repo/mod/dir/index.js');
  t = (lpm, imp, v)=>assert_eq(v, lpm_imp_lookup({lpm, lmod: imp}));
  let lpm = {lmod: 'npm/mod', pkg: {lif: {dependencies: {
    mod: '/MOD',
    react: 'npm:react@18.3.1',
    reactbad: 'reactbad@18.3.1',
    dir: './DIR'}}}};
  t(lpm, 'npm/mod/dir/main.tsx', 'local/MOD//dir/main.tsx');
  t(lpm, 'npm/react', 'npm/react@18.3.1');
  t(lpm, 'npm/react/file.js', 'npm/react@18.3.1/file.js');
  t(lpm, 'npm/reactbad');
  t(lpm, 'local/file', 'local/file');
  t(lpm, 'npm/dir', 'npm/mod/DIR');
  t = (file, alt, v)=>assert_obj(v, pkg_alt_get({lif: {alt}}, file));
  t('a/file.js', undefined, undefined);
  t('a/file', undefined, ['.js']);
  t('a/file.ts', undefined, undefined);
  t('a/file', ['.js'], ['.js']);
  t('a/file', ['.xjs', '.js'], ['.xjs', '.js']);
  t('a/file.xjs', ['.xjs', '.js'], undefined);
  t('a/file.ico', ['.xjs'], undefined);
  t('a/file.abcxyz', ['.xjs'], ['.xjs']);
  t = (pkg, file, v)=>assert_obj(v, pkg_export_lookup(pkg, file));
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
test_lpm();

let do_app_pkg = async function(boot_pkg){
  // XXX todo: store boot_pkg in localStorage
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
      lmod: T_lpm_lmod(_lpm_app), mod_self: 'local/--boot/'}));
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

