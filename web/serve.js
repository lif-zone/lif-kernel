#!/usr/bin/env node
import server from './server_lib.js';
import fs from 'fs';
import process from 'process';

let dirname = import.meta.dirname;
let root = process.cwd();
let map = {};
let pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
map['/lif-kernel'] = dirname+'/..';
let conf = {
  boot_js: '/lif-kernel/boot.js', // 'https://unpkg.com/lif-kernel@latest/boot.js',
  boot_pkg: {lif: {
    webapp: 'local:/'+pkg.name+'//',
    temp: false, // loading directly the final app
  }},
};
map['/index.html'] = {path: dirname+'/../index.html', tr: {__CONF__: conf}};
map['/'+pkg.name] = '.';
let peers = [
  'ws://localhost:1842/.lif.net',
];
server({map, root, peers});
