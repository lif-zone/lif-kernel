#!/usr/bin/env node
import process from 'process';
import {fileURLToPath} from 'url';
import path from 'path';
import './browser_env.js';
import {url_http_to_ws} from './util.js';
import {lifnet_connect} from './net_leaf_c.js';
import {leaf_websocket_out} from './net_leaf_s.js';

function node_is_main(mod_self){
  return path.resolve(process.argv[1])==fileURLToPath(mod_self);
}

export function leaf_ip_out(){
  //rpc_sock.listen(rpc, 'tcp/out', rpc_sock_tcp_out);
  //rpc_sock.listen(rpc, 'http/out', rpc_sock_http_out);
  //rpc_sock.listen(rpc, 'websocket/out', rpc_sock_websocket_out);
  leaf_websocket_out('rpc/websocket/out');
  //rpc_sock.listen(rpc, 'dns/out', rpc_sock_dns_out);
}

export const lifcoin_node_url = 'http://localhost:8432';
export const lifcoin_node_ws_url = url_http_to_ws(lifcoin_node_url);
export function leaf_lifcoin_out(rpc){
  // ws://localhost:8432/electrum
  leaf_websocket_out('lifcoin/electrum', lifcoin_node_ws_url+'/electrum');
  // wss://electrumx.nimiq.com:443/electrumx // restricted from localhost:5000
  // wss://bitcoinserver.nl:50004 // unrestricted
  // wss://electrum.blockstream.info:700 // does not work
  leaf_websocket_out('bitcoin/electrum', 'wss://bitcoinserver.nl:50004');
  leaf_websocket_out('bitcoin_test/electrum',
    'wss://electrum.blockstream.info:993');
  //rpc_sock.listen(rpc, 'lifcoin/lif_kv', rpc_sock_lifcoin_lif_kv);
  //rpc_sock.listen(rpc, 'lifcoin/node', rpc_sock_lifcoin_node);
}


async function start_leaf(opt={}){
  leaf_lifcoin_out();
  leaf_ip_out();
}

export async function run(opt={}){
  let [...argv] = [...process.argv];
  let a;
  argv.shift();
  argv.shift();
  while ((a=argv[0])!=undefined){
    if (a=='--ip')
      opt.ip = true;
    if (a=='--lifcoin')
      opt.lifcoin = true;
  }
  if (argv[0]!=undefined)
    throw 'invalid args '+JSON.stringify(argv);
  start_leaf(opt);
}

if (node_is_main(import.meta.url))
  run();
