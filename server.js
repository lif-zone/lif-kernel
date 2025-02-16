#!/usr/bin/env node
//#!/usr/bin/env node --input-type=module
// to lint: $ eslint server.js public/lif_*.js public/index.js
import serve from 'serve-handler';
import http from 'http';
import process from 'process';

const is_prefix = (url, prefix)=>{
  if (url.startsWith(prefix))
    return {prefix: prefix, rest: url.substr(prefix.length)};
};

let app_name = 'app-os';
const server = http.createServer((req, res)=>{
  const opt = {directoryListing: false, cleanUrls: false};
  let uri = decodeURIComponent(req.url);
  res.on('finish', ()=>console.log(
    `${log_url} ${res.statusCode} ${res.statusMessage}`));
  let file, v;
  if (uri=='/')
    uri = '/index.html';
  if (v=is_prefix(uri, '/lif-app/'))
    file = '/'+v.rest;
  else if (v=is_prefix(uri, '/lif-kernel/'))
    file = '/lif-kernel/'+v.rest;
  else
    file = '/lif-kernel/'+app_name+uri;
  if (file)
    opt.rewrites = [{source: '**', destination: file}];
  let log_url = uri+(file && file!=uri ? '->'+file : '');
  // You pass two more arguments for config and middleware
  // More details here: https://github.com/vercel/serve-handler#options
  return serve(req, res, opt);
});

let port = 3000;
let [...argv] = [...process.argv];
argv.shift();
argv.shift();
while (argv[0]!=undefined){
  if (argv[0]=='-p'){
    argv.shift();
    port = +argv.shift();
  } else if (argv[0]=='app-basic'){
    app_name = 'app-basic';
    argv.shift();
  } else if (argv[0]=='app-os'){
    app_name = 'app-os';
    argv.shift();
  } else
    break;
}
if (argv[0]!=undefined)
  throw 'invalid args '+JSON.stringify(argv);

server.listen(port, ()=>{
  console.log(`Running at http://localhost:${port}`);
});
