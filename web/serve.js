#!/usr/bin/env node
import server from './server_lib.js';
import fs from 'fs';
import process from 'process';
console.log('XXX');
await 0;
console.log('XXX');

let dirname = import.meta.dirname;
let root = process.cwd();
let map = {};
let pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
map['/lif-kernel'] = dirname+'/..';
map['/index.html'] = {path: dirname+'/../index.html',
  tr: {__WEBAPP__: '/'+pkg.name+'/', __BOOT_JS__: '/lif-kernel/boot.js'}};
map['/'+pkg.name] = '.';
let peers = [
  'ws://localhost:1842/.lif.net',
/*  'https://lifnet.net/.lif.net',
  'https://zon.life/.lif.net',
  'https://fartyfart.com/.lif.net',*/
];
server({map, root, peers, uplink: false});
