import http from 'http';
import https from 'https';
import process from 'process';
import fs from 'fs';
import path from 'path';
import {ext2mime} from './mime_db.js';
import './browser_env.js';
import {esleep, assert_eq, path_starts, path_join, path_dots, qs_enc,
  path_file, path_is_dir, str, rpc_websocket, version as util_version,
  rpc_sock_pipe, OA, url_http_to_ws, websocket_pipe,
} from './util.js';
import {sni_cb, do_ssl} from './ssl_s.js';
import {WebSocketServer} from 'ws';
import {ws_trunk_connect, rpc_methods_lifnet_trunk} from './trunk.js';
import {lifnet_connect, lifnet_call} from './lifnet.js';
const efs = fs.promises;

let lifcoin_node_url = 'http://localhost:8432';
const lifcoin_electrum_ws_url = 'ws://localhost:8432/electrum';
function http_pipe_lif_kv(req, res){ // XXX obsolete
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

async function lifnet_lif_kv_handler(req, res){
  let url = new URL(req.url, 'http://x');
  let key = url.searchParams.get('key');
  let {ret, error} = await lifnet_call('lifcoin/lif_kv', {key});
  if (error)
    return res_err(res, 500, 'proxy error: '+error);
  let {result} = ret;
  res_send(res, {body: result.body, ext: 'json'});
}

async function rpc_websocket_pipe_lif(ws, topic){
  let c = new rpc_websocket({D: 1, jsonrpc: '2.0'});
  c.accept({ws});
  let {sock: s, error} = await lifnet_connect(topic);
  if (error)
    return c.close();
  rpc_sock_pipe(c, s);
}

function ws_on_trunk_connect(ws){
  let rpc = ws_trunk_connect(ws);
  rpc_methods_lifnet_trunk(rpc);
}

function res_err(res, code, msg){
  res.writeHead(code, msg, {'cache-control': 'no-cache'})
  .end(''+code+' '+msg);
}
let coi_enable = true;
let g_opt = {};

function res_send_file(res, _path){
  let ext = (path.extname(_path)||'').slice(1);
  let ctype = ext2mime[ext]||'plain/text';
  let e = fs.statSync(_path, {throwIfNoEntry: false});
  if (!e || !e.isFile())
    return res_err(res, 404, 'file not found');
  let h = {};
  h['content-type'] = ctype;
  h['cache-control'] = 'no-cache'; // for dev/debug
  if (coi_enable){
    h['cross-origin-embedder-policy'] = 'require-corp';
    h['cross-origin-opener-policy'] = 'same-origin';
  }
  let stream = fs.createReadStream(_path);
  res.writeHead(200, h);
  stream.pipe(res);
}

function res_send(res, {body, ext}){
  let ctype = ext2mime[ext]||'plain/text';
  let h = {};
  h['content-type'] = ctype;
  h['cache-control'] = 'no-cache'; // for dev/debug
  if (coi_enable){
    h['cross-origin-embedder-policy'] = 'require-corp';
    h['cross-origin-opener-policy'] = 'same-origin';
  }
  res.writeHead(200, h);
  res.end(body);
}

function map_uri({uri, opt: {map, root}}){
  let _uri, _to;
  if (path_is_dir(uri))
    uri = path_join(uri, 'index.html');
  for (let f in map){
    let to = map[f], v;
    if (v=path_starts(uri, f)){
      _to = to;
      _uri = v.rest;
      break;
    }
  }
  if (_uri==undefined)
    return;
  if (path_starts(_to, '.', '..'))
    _to = path_join(root, _to);
  if (_uri)
    _to = path_join(_to, _uri);
  _to = path_dots(_to);
  if (_to.endsWith('/'))
    _to = path_join(_to, path_file(uri)||'index.html');
  return _to;
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
  let url;
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
  let path = map_uri({uri, opt: g_opt});
  if (!path)
    return res_err(res, 404, 'no map found');
  return res_send_file(res, path);
}

function ws_upgrade_accept(req, socket, head){
  const wss = new WebSocketServer({noServer: true});
  let uri = (new URL(req.url, 'http://x')).pathname;
  let fn;
  if (uri=='/.lif.net' && g_opt.lifnet_trunk)
    fn = ws_on_trunk_connect;
  else if (uri=='/.lif.net/electrum')
    fn = ws=>rpc_websocket_pipe_lif(ws, 'lifcoin/electrum');
  else if (uri=='/.lif.net/electrum-proxy') // obsolete
    fn = ws=>websocket_pipe(ws, new WebSocket(lifcoin_electrum_ws_url));
  if (!fn){
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    return socket.destroy();
  }
  return wss.handleUpgrade(req, socket, head, fn);
}

let server;
let sserver;
async function server_init({port, ssl}){
  server = http.createServer(http_listener);
  sserver = https.createServer({SNICallback: sni_cb}, http_listener);
  // WebSocket
  server.on('upgrade', ws_upgrade_accept);
  sserver.on('upgrade', ws_upgrade_accept);
  server.listen(port, ()=>{
    console.log(`Serving ${g_opt.root} on http://localhost:${port}`);
  });
  if (ssl){
    let {sport} = await do_ssl();
    sserver.listen(sport, ()=>{
      console.log(`Serving SSL ${g_opt.root} on https://localhost:${sport}`);
    });
  } else 
    console.log('SSL: off (-s to enable auto cert generation)');
}

async function start_web(){
  let lif_kernel;
  let map = g_opt.map;
  if (!(lif_kernel = map['/lif-kernel']))
    map['/lif-kernel'] = lif_kernel = import.meta.dirname;
  if (!map['/.lif.kernel_sw.js'])
    map['/.lif.kernel_sw.js'] = lif_kernel+'/lif_kernel_sw.js';
  if (!map['/index.html']) // XXX remove
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
  g_opt.port = 3000;
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
    }
  }
  if (argv[0]!=undefined)
    throw 'invalid args '+JSON.stringify(argv);
  if (!g_opt.web && !g_opt.lifnet_trunk){
    g_opt.web = true;
    g_opt.lifnet_trunk  = true;
  }
  start_web();
}

export default run;
