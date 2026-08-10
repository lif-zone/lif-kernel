#!/usr/bin/env node
import server from './server_lib.js';
let root = import.meta.dirname+'/..';
let map = {};
map['/lif-kernel'] = '.';
// local dev
map['/lif-basic'] = './lif-basic';
map['/lif-os'] = '../lif-os';
map['/lif-coin'] = '../lif-coin';
map['/lif-net'] = '../lif-net';
map['/lif-wallet'] = '../lif-wallet';
let peers = ['https://lifnet.net/.lif.net'];
server({map, root, peers});
