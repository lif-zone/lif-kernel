// LICENSE_CODE ZON JPL JEM GPL
import http from 'http';
import https from 'https';
import process from 'process';
import fs from 'fs';
import path from 'path';
import {ext2mime} from '../mime_db.js';
import '../compat/browser_env.js';
import {esleep, assert_eq, path_starts, path_join, path_dots, qs_enc,
  path_file, path_is_dir, str, rpc_websocket, version as util_version,
  rpc_sock_pipe, OA, url_http_to_ws, websocket_pipe,
} from '../util.js';
import {sni_cb, do_ssl} from './ssl_s.js';
import {WebSocketServer} from 'ws';
import {ws_trunk_accept, rpc_methods_lifnet_trunk, trunk_peer_add, trunk_router,
} from '../net/trunk.js';
import {lifnet_connect, lifnet_call, lifnet_set, lifnet_init_router,
} from '../net/lifnet.js';
const efs = fs.promises;

let lifcoin_node_url = 'http://localhost:8432';
const lifcoin_electrum_ws_url = 'ws://localhost:8432/electrum';
function http_pipe_lif_kv(req, res){ // obsolete
  let url = new URL(req.url, 'http://x');
  let key = url.searchParams.get('key');
  let lif_kv_url = lifcoin_node_url+'/lif_kv'+qs_enc({key});
  http.get(lif_kv_url, _res=>{
    res.writeHead(_res.statusCode, _res.headers);
    _res.pipe(res);
  }).on('error', err=>{
    res_err(res, 502, 'proxy error: '+err.message);
  });
}

function http_pipe({req, res, url}){
  url = new URL(url);
  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.host, // important – overwrite the original host
    },
  };
  const _req = http.request(options, _res=>{
    res.writeHead(_res.statusCode, _res.headers);
    _res.pipe(res);
  });
  _req.on('error', err=>{
    console.error('Proxy error http_pipe:', err);
    res.writeHead(502);
    res.end('Bad Gateway http_pipe');
  });
  req.pipe(_req);
}

async function lifnet_lif_kv_handler(req, res){
  let url = new URL(req.url, 'http://x');
  let key = url.searchParams.get('key');
  let {ret, error} = await lifnet_call('lifcoin/lif_kv', {key});
  if (error)
    return res_err(res, 500, 'proxy error: '+error);
  let {result} = ret;
  res_send(res, {body: result.body, ext: 'json'});
}

async function rpc_websocket_pipe_lif(ws, topic){ // obsolete
  let c = new rpc_websocket({D: 1, jsonrpc: '2.0'});
  c.accept({ws});
  let {sock: s, error} = await lifnet_connect(topic);
  if (error)
    return c.close();
  rpc_sock_pipe(c, s);
}

function ws_on_trunk_connect(ws){
  let rpc = ws_trunk_accept(ws);
  rpc_methods_lifnet_trunk(rpc);
}

function res_err(res, code, msg){
  res.writeHead(code, msg, {'cache-control': 'no-cache'})
  .end(''+code+' '+msg);
}
let coi_enable = true; // for shared-array-buffer
let cors_enable = true; // to be used by other domains
let g_opt = {};

function headers_set({h, ctype}){
  h['content-type'] = ctype;
  h['cache-control'] = 'no-cache'; // for dev/debug
  if (coi_enable){
    h['cross-origin-embedder-policy'] = 'require-corp';
    h['cross-origin-opener-policy'] = 'same-origin';
  }
  if (cors_enable){
    h['access-control-allow-headers'] = '*';
    h['access-control-allow-methods'] = 'GET,HEAD,OPTIONS';
    h['access-control-allow-origin'] = '*';
    h['access-control-expose-headers'] = '*';
  }
}

function res_send_file(res, _path){
  let opt;
  if (_path.path){
    opt = _path;
    _path = _path.path;
  }
  let ext = (path.extname(_path)||'').slice(1);
  let ctype = ext2mime[ext]||'plain/text';
  let e = fs.statSync(_path, {throwIfNoEntry: false});
  if (!e || !e.isFile())
    return res_err(res, 404, 'file not found');
  let h = {};
  headers_set({h, ctype});
  if (opt?.tr_fn){
    let _body = fs.readFileSync(_path, 'utf8');
    let body = opt.tr_fn(_body);
    return res_send(res, {body, ext});
  }
  res.writeHead(200, h);
  let stream = fs.createReadStream(_path);
  stream.pipe(res);
}

function res_send(res, {body, ext}){
  let ctype = ext2mime[ext]||'plain/text';
  let h = {};
  headers_set({h, ctype});
  res.writeHead(200, h);
  res.end(body);
}

function map_uri({uri, opt: {map, root}}){
  let _uri, to;
  if (path_is_dir(uri))
    uri = path_join(uri, 'index.html');
  for (let f in map){
    let _to = map[f], v;
    if (v=path_starts(uri, f)){
      to = _to;
      _uri = v.rest;
      break;
    }
  }
  if (_uri==undefined)
    return;
  if (to.path)
    return {uri, ...to};
  if (path_starts(to, '.', '..'))
    to = path_join(root, to);
  if (_uri)
    to = path_join(to, _uri);
  to = path_dots(to);
  if (to.endsWith('/'))
    to = path_join(to, path_file(uri)||'index.html');
  return to;
}
function test_server(){
  let map = {
    '/os': '../',
    '/kernel': '/root/os/kernel',
    '/this': '/that/mod',
    '/sw.js': '/root/os/kernel/sw.js',
    '/': './',
  };
  let root = '/ROOT/os';
  let t = (uri, path, opt)=>
    assert_eq(path, map_uri({uri, opt: {root, map}}));
  t('/', '/ROOT/os/index.html');
  t('/util.js', '/ROOT/os/util.js');
  t('/sw.js', '/root/os/kernel/sw.js');
  t('/kernel/kernel.js', '/root/os/kernel/kernel.js');
  t('/os/package.json', '/ROOT/package.json');
  t('/index.html', '/ROOT/os/index.html');
  t('/favicon.ico', '/ROOT/os/favicon.ico');
  t('/kernel/mod/favicon.ico', '/root/os/kernel/mod/favicon.ico');
  t('/this/mod/favicon.ico', '/that/mod/mod/favicon.ico');
  delete map['/'];
  t('/', undefined);
  t('/util.js', undefined);
}
test_server();

function http_listener(req, res){
  let url, v;
  try {
    url = new URL(req.url, 'http://x');
  } catch(err){
    return res_err(res, 400, 'error: '+err);
  }
  let uri = decodeURI(url.pathname);
  res.on('finish', ()=>console.log(
    `${uri} ${res.statusCode} ${res.statusMessage}`));
  if (uri=='/.lif.net/lif_kv')
    return lifnet_lif_kv_handler(req, res);
  if (uri=='/.lif.net/lif_kv-proxy') // obsolete
    return http_pipe_lif_kv(req, res);
  if (v=str.starts(req.url, '/lif-explorer/'))
    return http_pipe({req, res, url: `http://localhost:1806/lif-explorer/${v.rest}`});
  if (v=str.starts(req.url, '/blockstream/'))
    return http_pipe({req, res, url: `http://localhost:8432/blockstream/${v.rest}`});
  if (v=map_uri({uri, opt: g_opt}))
    return res_send_file(res, v);
  let dest = req.headers['sec-fetch-dest'];
  let mode = req.headers['sec-fetch-mode'];
  let lif_kernel = g_opt.map['/lif-kernel'];
  if (dest=='document' || mode=='navigate') // SPA
    return res_send_file(res, lif_kernel+'/index.html');
  return res_err(res, 404, 'no map found');
}

function ws_upgrade_accept(req, socket, head){
  const wss = new WebSocketServer({noServer: true});
  let uri = (new URL(req.url, 'http://x')).pathname;
  let fn;
  if (uri=='/.lif.net' && g_opt.lifnet_trunk)
    fn = ws_on_trunk_connect;
  else if (uri=='/.lif.net/electrum') // obsolete
    fn = ws=>rpc_websocket_pipe_lif(ws, 'lifcoin/electrum');
  else if (uri=='/.lif.net/electrum-proxy') // obsolete
    fn = ws=>websocket_pipe(ws, new WebSocket(lifcoin_electrum_ws_url));
  if (!fn){
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    return socket.destroy();
  }
  return wss.handleUpgrade(req, socket, head, fn);
}

function http_redirect_https(req, res){
  const host = req.headers.host;
  res.writeHead(301, {Location: `https://${host}${req.url}`});
  res.end();
}

let server;
let sserver;
async function server_init({port, ssl}){
  if (ssl){
    // production: ssl 433 and http 80 redirect to https
    sserver = https.createServer({SNICallback: sni_cb}, http_listener);
    let {sport} = await do_ssl();
    sserver.listen(sport, ()=>{
      console.log(`Serving SSL ${g_opt.root} on https://DOMAIN:${sport}`);
    });
    sserver.on('upgrade', ws_upgrade_accept);
    let server_redir = http.createServer(http_redirect_https);
    server_redir.listen(80, ()=>{
      console.log('Service http://DOMAIN (port 80) redirect https://DOMAIN');
    });
  } else
    console.log('SSL: off (-s to enable auto cert generation)');
  // localhost: local lif server, and dev server
  server = http.createServer(http_listener);
  server.on('upgrade', ws_upgrade_accept);
  server.listen(port, '127.0.0.1', ()=>{
    console.log(`Serving ${g_opt.root} on http://localhost:${port}`);
  });
}

async function start_web(){
  let lif_kernel;
  let map = g_opt.map;
  if (!(lif_kernel = map['/lif-kernel']))
    map['/lif-kernel'] = lif_kernel = import.meta.dirname;
  if (!map['/.lif.kernel_sw.js'])
    map['/.lif.kernel_sw.js'] = lif_kernel+'/lif_kernel_sw.js';
  if (!map['/index.html'])
    map['/index.html'] = lif_kernel+'/index.html';
  if (!map['/favicon.ico'])
    map['/favicon.ico'] = lif_kernel+'/favicon.ico';
  console.log(map);
  await server_init({port: g_opt.port, ssl: g_opt.ssl});
}

async function run(opt){
  let [...argv] = [...process.argv];
  let a;
  OA(g_opt, opt);
  let map = g_opt.map = {...opt?.map||{}};
  g_opt.root = opt.root||process.cwd();
  g_opt.port = opt.port||1842;
  argv.shift();
  argv.shift();
  while ((a=argv[0])!=undefined){
    if (a=='-p' || a=='--port'){
      argv.shift();
      g_opt.port = +argv.shift();
    } else if (a=='-m' || a=='--map'){
      argv.shift();
      map[argv.shift()] = argv.shift();
      break;
    } else if (a=='-s' || a=='--ssl'){
      argv.shift();
      g_opt.ssl = true;
    } else if (a=='-l' || a=='--local'){
      argv.shift();
      console.log('in the browser open localhost:port url, and in console '+
        'run: localStorage.setItem("local_dev_enable", true)');
      process.exit(1);
    } else if (a=='--web'){
      argv.shift();
      g_opt.web = true;
    } else if (a=='--peer'){
      argv.shift();
      let peer_url = argv.shift();
      g_opt.peers = [...(g_opt.peers||[]), peer_url];
    }
  }
  if (argv[0]!=undefined)
    throw 'invalid args '+JSON.stringify(argv);
  if (!g_opt.web && !g_opt.lifnet_trunk){
    g_opt.web = true;
    g_opt.lifnet_trunk  = true;
  }
  lifnet_set({client_name:
    g_opt.lifnet_trunk
    ? (g_opt.peers?.length ? 'tpeer'+g_opt.port : 'tmain'+g_opt.port)
    : 'leaf'});
  if (g_opt.lifnet_trunk)
    lifnet_init_router(trunk_router());
  start_web();
  for (let url of (g_opt.peers||[]))
    trunk_peer_add(url);
}

export default run;
