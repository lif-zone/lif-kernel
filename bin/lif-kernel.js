#!/usr/bin/env node
import process from 'process';

let cmd = process.argv[2];
if (cmd=='serve'){
  process.argv.splice(2, 1); // strip 'serve', leave remaining args for server_lib
  await import('../web/serve.js');
} else {
  console.error('lif-kernel: unknown command: '+(cmd||'(none)'));
  console.error('usage: lif-kernel serve [-p PORT]');
  process.exit(1);
}
