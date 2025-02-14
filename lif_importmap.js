(function(){

const string = {}; // string.js
string.split_ws = s=>s.split(/\s+/).filter(s=>s);
string.es6_str = args=>{
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
string.qw = function(s){
  return string.split_ws(!Array.isArray(s) ? s : string.es6_str(arguments)); };
const qw = string.qw;
// parse-package-name
const npm_uri_parse = path=>{
  const RE_SCOPED = /^(@[^\/]+\/[^@\/]+)(?:@([^\/]+))?(\/.*)?$/
  const RE_NON_SCOPED = /^([^@\/]+)(?:(@[^\/]+))?(\/.*)?$/
  const m = RE_SCOPED.exec(path) || RE_NON_SCOPED.exec(path)
  return !m ? null : {name: m[1]|| '', version: m[2]||'', path: m[3]||''};
};

let versions = {
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
};
let importmap = {imports: {}, scopes: {}};
let importmap_gen = ()=>{
  let {imports, scopes} = importmap, a;
  imports['next/dynamic'] = './lif_next_dynamic.js';
  /*
  // core react
  a = [];
  a.push(...qw`react@18.3.1 react-dom@18.3.1 scheduler`);
  a.push(...qw`canvas-confetti
    frameer-motion motion-dom styled-components stylis
    stylis-rule-sheet @emotion/. react-is memoize-one prop-types
    merge-anything framer-motion motion-utils tslib shallowequal ini idb
    browserfs is-arguments @monaco-editor/. @panzoom/. scripts nostr-tools
    react-rnd @noble/. state-local react-draggable re-resizable @scure/.`);
  // core node modules
  a.push(...qw`path assert buffer child_process cluster console
    constants crypto dgram dns domain events fs http https http2 inspector
    module net os path perf_hooks punycode querystring readline repl stream
    _stream_duplex _stream_passthrough _stream_readable _stream_transform
    _stream_writable string_decoder sys timers tls tty url util vm zlib
    _process`);
  a.forEach(e=>{
    let v
    if (!(v = npm_uri_parse(e))){
      console.error('invalid npm: '+e);
      return;
    }
    let {name, version, path} = v;
    if (name.endsWith('/.'))
      name = name.slice(0, -2);
    if (!version && !path && (v = versions[name]))
      version = '@'+v.replace(/^[=^]/, '');
    let p = '/.lif/npm/'+name+version;
    imports[name] = p+'/';
    imports[name+'/'] = p+'/';
    if (version){
      imports[e] = p+'/';
      imports[e+'/'] = p+'/';
    }
  });
  a = qw`public components hooks contexts pages utils styles`;
  a.forEach(e=>{
    let p = '/.lif/pkgroot/'+e;
    imports[e+'/'] = p+'/';
    imports['/'+e+'/'] = p+'/';
  });
  */
  return importmap;
};
let importmap_load = ()=>{
  let importmap = importmap_gen();
  let im = document.createElement('script');
  im.type = 'importmap';
  im.textContent = JSON.stringify(importmap);
  document.head.appendChild(im);
};

importmap_load();

})();
