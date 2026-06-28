#!/usr/bin/env node
import process from 'process';
import {fileURLToPath} from 'url';
import path from 'path';
import './browser_env.js';
import {url_http_to_ws, qs_enc} from './util.js';
import {lifnet_connect, lifnet_listen} from './lifnet.js';
import {leaf_rpc_websocket_out, leaf_fetch_out, leaf_websocket_out,
  leaf_http_out, leaf_tcp_out, leaf_dns_out, leaf_lifcoin_node_out,
} from './leaf_out.js';

function node_is_main(mod_self){
  return path.resolve(process.argv[1])==fileURLToPath(mod_self);
}

export function leaf_ip_out(){
  lifnet_listen('tcp/out', leaf_tcp_out); // unused
  lifnet_listen('http/out', leaf_http_out); // unused
  lifnet_listen('websocket/out', leaf_websocket_out); // unused
  leaf_rpc_websocket_out('rpc/websocket/out'); // unused
  lifnet_listen('dns/out', leaf_dns_out); // unused
}

const lifcoin_node_url = 'http://localhost:8432';
const lifcoin_node_ws_url = url_http_to_ws(lifcoin_node_url);
const lifcoin_lif_kv_url = 'http://localhost:8432/lif_kv';
async function leaf_lifcoin_lif_kv_out({msg, sock}){
  let {key} = msg.params;
  let m = {params: {url: lifcoin_lif_kv_url+qs_enc({key})}};
  return await leaf_fetch_out({msg: m, sock, allow_ip: true}); // used
}

export function leaf_lifcoin_out(rpc){
  // ws://localhost:8432/electrum
  leaf_rpc_websocket_out('lifcoin/electrum', lifcoin_node_ws_url+'/electrum');
  // wss://electrumx.nimiq.com:443/electrumx // restricted from localhost:5000
  // wss://bitcoinserver.nl:50004 // unrestricted
  // wss://electrum.blockstream.info:700 // does not work
  leaf_rpc_websocket_out('bitcoin/electrum', 'wss://bitcoinserver.nl:50004'); // untested
  leaf_rpc_websocket_out('bitcoin_test/electrum',
    'wss://electrum.blockstream.info:993'); // untested
  lifnet_listen('lifcoin/lif_kv', leaf_lifcoin_lif_kv_out); // used
  lifnet_listen('lifcoin/node', leaf_lifcoin_node_out); // unused
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
