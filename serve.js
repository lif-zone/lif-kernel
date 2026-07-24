#!/usr/bin/env node
import server from './server_lib.js';
let root = import.meta.dirname;
let map = {};
let pkg_json = file_json('./package.json');
let pkg_name = pkg.name;
map['/lif-kernel'] = 'node_modules/lif-kernel';
map['/'+pkg.name] = '.';
map['/index.html'] = {path: 'serve_index.html',
  tr_fn: s=>s.replace(/__WEBAPP__/g, '/'+pkg.name+'/')};
server({map, root});
