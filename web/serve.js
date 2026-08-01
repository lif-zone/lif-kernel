#!/usr/bin/env node
import server from './server_lib.js';
import fs from 'fs';
import process from 'process';
let root = process.cwd();
let map = {};
let pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
map['/lif-kernel'] = 'node_modules/lif-kernel';
map['/index.html'] = {path: 'node_modules/lif-kernel/serve_index.html',
  tr_fn: s=>s.replace(/__WEBAPP__/g, '/'+pkg.name+'/')};
map['/'+pkg.name] = '.';
let peers = ['ws://localhost:1842/.lif.net'];
server({map, root, peers});
