// LIF Kernel: Service Worker BIOS (Basic Input Output System)
let lif_version = '0.2.104';
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
  self.addEventListener('fetch', event=>{
    if (!lif_kernel.on_fetch){
      console.error('sw fetch('+event.request.url+') event before inited');
      event.respondWith(new Response('sw fetch before init',
        {status: 500, statusText: 'sw fetch before init'}));
      return;
    }
    lif_kernel.on_fetch(event);
  });
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
    mod.exports = await eval(mod.script);
    return mod.wait.return(mod.exports);
  } catch(err){
    console.error('import('+url+') failed eval', err, err?.stack);
    throw mod.wait.throw(err);
  }
};

let Babel = await import_module('https://unpkg.com/@babel/standalone@7.26.4/babel.js');
let util = await import_module('/lif-kernel/util.js');
let {postmessage_chan, str, OF,
  path_ext, _path_ext, path_file, path_dir, path_is_dir,
  path_prefix, path_next,
  url_parse, uri_parse, url_uri_parse, npm_uri_parse, npm_modver,
  uri_enc, uri_dec, match_glob_to_regex,
  esleep, eslow, Scroll, _debugger, assert_eq} = util;
let {qw, diff_pos} = str;
let json = JSON.stringify;
let clog = console.log.bind(console);
let cerr = console.error.bind(console);

let npm_cdn = ['https://cdn.jsdelivr.net/npm',
  //'https://unpkg.com',
];
let npm_default;
let npm_map = {};
let npm_pkg = {};
let npm_file = {};

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

let file_ast = f=>{
  if (f.ast)
    return;
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
      } catch (err){
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
    let has = ast.has = {};
    let _handle_import_source = path=>{
      let n = path.node;
      if (n.source.type=='StringLiteral'){
        let s = n.source;
        let v = s.value;
        let type = ast_get_scope_type(path);
        ast.imports.push({module: v, start: s.start, end: s.end, type});
      }
    };
    let handle_import_source = path=>{
      has.import = true;
      _handle_import_source(path);
    };
    let handle_export_source = (path)=>{
      has.export ||= true;
      if (path.node.source)
        _handle_import_source(path);
    };
    traverse(ast.ast, {
      AssignmentExpression: path=>{
        let n = path.node, l = n.left, r = n.right;
        if (n.operator=='=' &&
          l.type=='MemberExpression' &&
          l.object.name=='exports' && l.object.type=='Identifier' &&
          l.property.type=='Identifier')
        {
          ast.exports.push(l.property.name);
        }
      },
      CallExpression: path=>{
        has.require = true;
        let n = path.node, v;
        if (n.callee.type=='Identifier' && n.callee.name=='require' &&
          n.arguments.length==1 && n.arguments[0].type=='StringLiteral')
        {
          v = n.arguments[0].value;
          let type = ast_get_scope_type(path);
          ast.requires.push({module: v, start: n.start, end: n.end, type});
        }
        if (n.callee.type=='Import')
          ast.imports_dyn.push({start: n.callee.start, end: n.callee.end});
      },
      ImportDeclaration: path=>handle_import_source(path),
      ExportNamedDeclaration: path=>handle_export_source(path),
      ExportDefaultDeclaration: path=>handle_export_source(path),
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
  };
  tr_jsx_ts();
  parse_ast();
  scan_ast();
  f.type = ast.type||f.type_lookup||f.npm.type;
};

const file_tr_amd = f=>{
  if (f.tr_amd)
    return f.tr_amd;
  let _exports = '';
  let uri_s = json(f.uri);
  f.ast.exports.forEach(e=>{
    if (e=='default')
      return;
    _exports += `export const ${e} = mod.exports.${e};\n`;
  });
  _exports += `export default mod.exports;\n`;
  return f.tr_amd = `
    let lif_boot = globalThis.lif.boot;
    let define = function(id, deps, factory){
      return lif_boot.define_amd(${uri_s}, arguments); };
    define.amd = {};
    let require = function(deps, cb){
      return lif_boot.require_cjs_amd(${uri_s}, arguments); };
    (()=>{
    ${f.js}
    })();
    let mod = await lif_boot.module_get(${uri_s});
    ${_exports}
  `;
};

const file_tr_cjs_shim = async(f)=>{
  if (f.wait_tr_cjs)
    return await f.wait_tr_cjs;
  let p = f.wait_tr_cjs = ewait();
  let uri_s = json(f.uri);
  let _exports = '';
  let npm_cjs_uri = '/.lif/npm.cjs/'+f.uri;
  f.log('call import('+npm_cjs_uri+')');
  let res = await boot_chan.cmd('import', {url: npm_cjs_uri});
  f.log('ret  import('+npm_cjs_uri+')', res);
  f.exports_cjs_shim = res.exports;
  f.exports_cjs_shim.forEach(e=>{
    if (e=='default')
      return;
    _exports += `export const ${e} = _export.${e};\n`;
  });
  return p.return(f.tr_cjs_shim = `
    import _export from ${json(npm_cjs_uri)};
    export default _export;
    ${_exports}
  `);
};

let tr_cjs_require = f=>{
  let s = Scroll(f.js);
  for (let d of f.ast.requires){
    if (!(d.type=='sync' || d.type=='try'))
      s.splice(d.start, d.end, '(await require_async('+json(d.module)+'))');
  }
  return s.out();
};

const file_tr_cjs = f=>{
  if (f.tr_cjs)
    return f.tr_cjs;
  let uri_s = json(f.uri);
  let tr = tr_cjs_require(f);
  let pre = '';
  for (let r of f.ast.requires){
    if (r.type=='sync')
      pre += 'await require_async('+json(r.module)+');\n';
  }
  return f.tr_cjs = `
    let lif_boot = globalThis.lif.boot;
    let module = {exports: {}};
    let exports = module.exports;
    let process = lif_boot.process;
    let require = module=>lif_boot.require_cjs(${uri_s}, module);
    let require_async = async(module)=>await lif_boot.require_single(${uri_s}, module);
    let define = function(id, deps, factory){
      return lif_boot.define_amd(${uri_s}, arguments, module); };
    define.amd = {};
    ${pre}
    await (async()=>{
    ${tr}
    })();
    export default module.exports;
  `;
}

let str_splice = (s, at, len, add)=>s.slice(0, at)+add+s.slice(at+len);

let npm_dep_lookup = (pkg, uri)=>{
  let v, u = url_uri_parse(uri);
  if (u.is_based)
    return uri;
  if (!(u = npm_uri_parse(uri))){
    console.error('invalid npm uri import('+uri+')');
    return uri;
  }
  let modver = u.name+u.version;
  let map = npm_map[modver];
  if ((v=map?.base) && map.pkg)
    return '/.lif/npm'+v+u.path;
  if (v = pkg.lif?.modmap?.[modver]){
    if (v.startsWith('/'))
      v = npm_default+v;
    return '/.lif/npm/'+v+u.path;
  }
  if (!u.version){
    let version = npm_dep_ver_lookup(pkg, u.name)||'';
    return '/.lif/npm/'+u.name+version+u.path;
  }
  return uri;
};

let modmap_lookup = (pkg, uri)=>{
  for (let [pre, base] of OF(pkg.lif?.modmap)){
    let v;
    if (v=path_prefix(uri, pre))
      return npm_default+base+v.rest;
  }
};

let tr_mjs_import = f=>{
  let s = Scroll(f.js), v;
  for (let d of f.ast.imports){
    if (v=npm_dep_lookup(f.npm.pkg, d.module))
      s.splice(d.start, d.end, json(v));
  }
  for (let d of f.ast.imports_dyn)
    s.splice(d.start, d.end, 'import_lif');
  return s.out();
};

const file_tr_mjs = f=>{
  if (f.tr_mjs)
    return f.tr_mjs;
  let uri_s = json(f.uri);
  let tr = tr_mjs_import(f);
  let slow = 0, log = 0, pre = '', post = '';
  let _import = f.ast.imports.length;
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
  return f.tr_mjs = pre+tr+post;
};

let content_type_get = destination=>{
  // audio, audioworklet, document, embed, fencedframe, font, frame, iframe,
  // image, json, manifest, object, paintworklet, report, script,
  // sharedworker, style, track, video, worker, xslt
  let types = {
    script: 'application/javascript',
    json: 'application/json',
  };
  return types[destination] || types.script;
};

let npm_dep_ver_lookup = (pkg, module)=>{
  let get_dep = dep=>{
    let ver, m, op;
    if (!(ver = dep?.[module]))
      return;
    ver = ver.replaceAll(' ', '');
    if (!(m = ver.match(/^([^0-9.]*)([0-9.]+)$/)))
      return void console.log('invalid dep('+module+') version '+ver);
    [, op, ver] = m;
    if (op=='>=')
      return;
    if (!(op=='^' || op=='=' || op=='' || op=='~'))
      return void console.log('invalid dep('+module+') op '+op);
    return '@'+ver;
  };
  let ver
  if (ver = get_dep(pkg.dependencies))
    return ver;
  if (ver = get_dep(pkg.peerDependencies))
    return ver;
  if (ver = get_dep(pkg.devDependencies))
    return ver;
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
  let check_val = (res, dst, type)=>{
    let v;
    if (typeof dst!='string')
      return;
    if (!dst.includes('*')){
      res.push(v = {file: dst, type});
      return v;
    }
    let dfile = path_file(dst);
    let ddir = path_dir(dst);
    if (ddir.includes('*') || dfile!='*')
      throw Error('module('+pkg.name+' dst match * ('+dst+') unsupported');
    res.push(v = {file: dst.slice(0, -1)+dfile, type});
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
      return check_val(res, v, null);
    if (typeof v!='object')
      return;
    if (Array.isArray(v)){
      for (let e of v){
        if (parse_val(e))
          return;
      }
      return;
    }
    return check_val(res, v.module, 'mjs') ||
      check_val(res, v.import, 'mjs') ||
      check_val(res, v.default, 'cjs') ||
      check_val(res, v.require, 'amd');
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
      return check_val([], pkg.module, 'mjs') ||
        check_val([], pkg.browser, 'cjs') ||
        check_val([], pkg.main, 'cjs') ||
        check_val([], 'index.js', 'cjs');
    }
    if (v = parse_section(pkg.browser))
      return v;
  };
  // start package.json lookup
  let v;
  let {file: f, type} = parse_pkg()||{file};
  type ||= pkg.lif?.type;
  if (f.startsWith('./'))
    f = f.slice(2);
  let alt, _alt = pkg.lif?.alt||['.js'];
  if (!['.js', '.json', '.css', '.mjs', '.esm', '.jsx', '.ts', '.tsx']
    .find(e=>f.endsWith(e)) && !_alt.find(e=>f.endsWith(e)))
  {
    alt = _alt;
  }
  return {file: f, type, alt};
};

async function npm_pkg_load(log, modver){
  let npm, npm_s;
  if (npm = npm_pkg[modver])
    return await npm.wait;
  npm = npm_pkg[modver] = {modver, wait: ewait(), log};
  npm.file_lookup = uri=>{
    let {path} = npm_uri_parse(uri);
    let ofile = path.replace(/^\//, '')||'.';
    let {file, type, alt} = pkg_export_lookup(npm.pkg, ofile);
    let nfile = file||ofile;
    let redirect;
    if (nfile && nfile!=ofile)
      redirect = '/.lif/npm/'+npm.modver+'/'+nfile;
    let mix = 'ext '+_path_ext(ofile)+' export '+type+' npm '+npm.type;
    return {type, redirect, nfile, alt, mix};
  };
  // load package.json to locate module's index.js
  try {
    let pkg, v;
    let map = npm_map[npm.modver];
    npm.base = map?.base || (npm?.net||npm_cdn)+'/'+npm.modver;
    if (map){
      log('map', map, 'modver', modver);
      npm.pkg = map.pkg;
      npm.base = map.base;
      if (map.pkg)
        return npm.wait.return(npm);
    }
    let u = npm_uri_parse(npm.modver);
    log('map u', u, 'modver', npm.modver);
    let url = npm.base+'/package.json';
    let response = await fetch(url, fetch_opt(url));
    if (response.status!=200)
      throw Error('module('+log.mod+') failed fetch '+url);
    pkg = npm.pkg = await response.json();
    if (!pkg)
      throw Error('empty package.json '+url);
    if (!(npm.version = pkg.version))
      throw Error('invalid package.json '+url);
    if (!u.version && !map){
      npm.redirect = '/.lif/npm/'+u.name+'@'+npm.version+u.path;
      log('npm.redirect', npm.redirect);
    }
    return npm.wait.return(npm);
  } catch(err){
    throw npm.wait.throw(err);
  }
}

async function npm_file_load(log, uri, test_alt){
  let file, D = 0, npm;
  if (file = npm_file[uri])
    return await file.wait;
  file = npm_file[uri] = {uri, wait: ewait(), log};
  npm = file.npm = await npm_pkg_load(log, npm_modver(uri));
  if (npm.redirect){
    let u = npm_uri_parse(uri);
    log(u, 'npm.redir', npm.redirect);
    return file.wait.return({redirect: npm.redirect+u.path});
  }
  let {nfile, type, redirect, alt, mix} = npm.file_lookup(uri);
  file.nfile = nfile;
  file.url = npm.base+'/'+nfile;
  file.type_lookup = type;
  file.redirect = redirect;
  file.alt = alt;
  file.mix = mix;
  if (file.redirect)
    return file.wait.return(file);
  // fetch the file
  let slow = eslow(5000, ['fetch', file.url]);
  let response;
  try {
    response = await fetch(file.url, fetch_opt(file.url));
  } catch(err){
    slow.end();
    err.message = 'fetch('+file.url+')'+err.message;
    throw file.wait.throw(err);
  }
  slow.end();
  if (response.status!=200){
    if (test_alt)
      throw file.wait.throw(Error('fetch failed '+file.url));
    if (alt){
      let afile, err;
      loop: for (let a of alt){
        try {
          afile = await npm_file_load(log, uri+a, true);
          break loop;
        } catch(err){}
      }
      if (afile){
        file.redirect = '/.lif/npm/'+afile.uri;
        D && console.log('fetch OK redirect '+file.url);
        return file.wait.return(file);
      }
    }
    let e = 'module('+log.mod+(alt ? ' alt '+alt.join(' ') : '')+
      ') failed fetch '+file.url;
    console.error(e);
    throw file.wait.throw(Error(e));
  }
  let response2 = response.clone();
  file.blob = await response.blob();
  file.body = await response2.text();
  D && console.log('fetch OK '+file.url);
  return file.wait.return(file);
}

let _npm_pkg_load = async function(modver, dep){
  let npm, slow;
  try {
    slow = eslow(5000, ['_npm_pkg_load', modver, dep]);
    npm = await npm_pkg_load(()=>{}, modver);
    slow.end();
    slow = eslow(5000, ['_npm_pkg_load', modver, dep]);
    if (npm.redirect)
      npm = await npm_pkg_load(()=>{}, npm.redirect);
    slow.end();
  } catch(err){
    slow.end();
    console.error('_npm_pkg_load err:', err);
    return null;
  }
  return npm;
};

let ctype_get = ext=>{
  let ctype_map = { // content-type
    js: {ctype: 'application/javascript'},
    mjs: {ctype: 'application/javascript', js_module: 'mjs'},
    ts: {tr: 'ts', ctype: 'application/javascript'},
    tsx: {tr: ['ts', 'jsx'], ctype: 'application/javascript'},
    jsx: {tr: 'jsx', ctype: 'application/javascript'},
    json: {ctype: 'application/json'},
    text: {ctype: 'plain/text'},
    webp: {ctype: 'image/webp'},
  };
  let t = ctype_map[ext];
  if (!t)
    return;
  t = {...t};
  t.ext = ext;
  return t;
};
let new_response = ({body, uri, ext})=>{
  let opt = {}, v, ctype = ctype_get(ext||_path_ext(uri)), h = {};
  h['content-type'] = ctype.ctype;
  opt.headers = new Headers(h);
  return new Response(body, opt);
};
 
let pp = {};
let boot_chan;
async function _kernel_fetch(event){
  let {request, request: {url}} = event;
  let u = url_parse(url);
  let ref = request.headers.get('referer');
  let external = u.origin!=self.location.origin;
  let log_mod = url+(ref && ref!=u.origin+'/' ? ' ref '+ref : '');
  let path = uri_dec(u.path);
  let ext = _path_ext(path);
  let log = function(){
    if (url.includes(' none '))
      return console.log(url, ...arguments), 1;
  };
  log.mod = log_mod;
  if (request.method!='GET'){
    console.log('non GET fetch', url);
    return fetch(request);
  }
  if (external){
    console.log('external fetch', url);
    return fetch(request);
  }
  log('Req');
  let v;
  if (v = str.prefix(path, '/.lif/')){
    v = path_next(v.rest);
    let lpm = v.dir;
    if (lpm=='npm' || lpm.startsWith('npm.')){
      log(lpm);
      let uri = v.rest;
      if (!uri)
        throw Error('invalid uri '+path);
      let f = await npm_file_load(log, uri);
      if (lpm=='npm'){
        if (f.redirect){
          let redirect = 0 && f.redirect[0]=='/' ? uri_enc(f.redirect)
            : f.redirect;
          log(`module ${uri} -> ${redirect}`);
          return Response.redirect(redirect);
        }
        if (ext=='json')
          return new_response({body: f.blob, ext});
        file_ast(f);
        let type = f.ast.type;
        let tr = f.js || f.body;
        if (type=='raw');
        else if (type=='amd')
          tr = file_tr_amd(f);
        else if (type=='cjs' || !type)
          tr = await file_tr_cjs_shim(f);
        else if (type=='mjs')
          tr = file_tr_mjs(f);
        else
          throw Error('invalid type '+type);
        log(`module ${uri} served ${f.url}`);
        return new_response({body: tr, uri});
      }
      if (lpm=='npm.cjs'){
        let tr = file_tr_cjs(f);
        log(`module ${uri} served ${f.url}`);
        return new_response({body: tr, ext: 'js'});
      }
      if (lpm=='npm.raw'){
        log(`module ${uri} served ${f.url}`);
        return new_response({body: f.blob, uri});
      }
    }
    throw Error('invalid lpm '+lpm);
  }
  let app_pkg = (await _npm_pkg_load(npm_default)).pkg;
  if (v = modmap_lookup(app_pkg, path)){
    log('modmap '+path+' -> '+v);
    return Response.redirect('/.lif/npm.raw/'+v);
  }
  console.log('req default', url);
  return await fetch(request);
}

async function kernel_fetch(event){
  let slow;
  try {
    slow = eslow(15000, ['_kernel_fetch', event.request.url]);
    let res = await _kernel_fetch(event);
    slow.end();
    return res;
  } catch (err){
    console.error('kernel_fetch err', err);
    slow.end();
    return new Response(''+err, {status: 500, statusText: ''+err});
  }
}

let do_module_dep = async function({modver, dep}){
  let npm = await _npm_pkg_load(modver, dep);
  if (!npm)
    return;
  return npm_dep_lookup(npm.pkg, dep);
};

let do_pkg_map = function({map}){
  npm_map = {...map};
  let i = 0;
  for (let [name, mod] of OF(map)){
    if (!i++)
      npm_default = name;
    if (typeof mod=='string')
      npm_map[name] = mod = mod.endsWith('/') ? {net: mod} : {base: mod};
    if (!mod.base && mod.net)
      mod.base = mod.net+name;
  }
};
do_pkg_map({map: {'lif-kernel': '/'}});

function sw_init_post(){
  boot_chan = new util.postmessage_chan();
  boot_chan.add_server_cmd('version', arg=>({version: lif_version}));
  boot_chan.add_server_cmd('module_dep', ({arg})=>do_module_dep(arg));
  boot_chan.add_server_cmd('pkg_map', async({arg})=>do_pkg_map(arg));
  lif_kernel.on_message = event=>{
    if (boot_chan.listen(event))
      return;
  };
  lif_kernel.on_fetch = event=>{
    try {
      event.respondWith(kernel_fetch(event));
    } catch (err){
      console.error("lif kernel sw NetworkError: "+err);
    }
  };
  lif_kernel.wait_activate.return();
}
sw_init_post();
console.log('lif kernel sw '+lif_kernel.version+' util '+util.version);
} catch(err){console.error('lif kernel failed sw init', err);}})();

