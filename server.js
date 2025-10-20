#!/usr/bin/env node
import server from './server_lib.js';
let cwd = import.meta.dirname;
let map = {};
map['/lif-kernel'] = cwd;
// local dev
map['/lif-basic'] = cwd+'/../lif-basic';
map['/lif-os-boot'] = cwd+'/../lif-os-boot';
map['/lif-os'] = cwd+'/../';
map['/lif-coin'] = cwd+'/../../lif-coin';
server({map});
