#!/usr/bin/env node
import server from './server_lib.js';
import fs from 'fs';
let root = import.meta.dirname;
let map = {};
let pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
map['/lif-kernel'] = 'node_modules/lif-kernel';
map['/'+pkg.name] = '.';
map['/index.html'] = {path: 'serve_index.html',
  tr_fn: s=>s.replace(/__WEBAPP__/g, '/'+pkg.name+'/')};
server({map, root});
