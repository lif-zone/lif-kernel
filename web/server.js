#!/usr/bin/env node
import server from './server_lib.js';
let root = import.meta.dirname+'/..';
let map = {};
map['/.lif.lif-kernel'] = '.';
let conf = {
  // or a cdn: 'https://unpkg.com/lif-kernel@latest'
  lif_kernel_base: '/.lif.lif-kernel',
  boot_pkg: {lif: {
    webapp: 'lif-kernel/hi.js',
    temp: true, // hi.js is just a loader of the final application: not persisted by kernel
  }},
};
map['/index.html'] = {path: './index.html', tr: {__CONF__: conf}};
if (process.argv.includes('--local-dev')){
  console.log('local dev enabled');
  map['/lif-basic'] = './lif-basic';
  map['/lif-os'] = '../lif-os';
  map['/lif-coin'] = '../lif-coin';
  map['/lif-net'] = '../lif-net';
  map['/lif-wallet'] = '../lif-wallet';
  map['/lif-explorer'] = '../lif-explorer';
  map['/lif-start'] = '../lif-start';
}
let peers = [
  'https://lifnet.net/.lif.net',
  'https://zon.life/.lif.net',
  'https://fartyfart.com/.lif.net',
];
server({map, root, peers});
