#!/usr/bin/env node
import server from './server_lib.js';
server({map: {'/lif-kernel': import.meta.dirname}});
