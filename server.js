import http from 'http';
import process from 'process';
import fs from 'fs';
import path from 'path';
import mime_db from './mime_db.js';

const str_prefix = (url, prefix)=>{
  if (url.startsWith(prefix))
    return {prefix: prefix, rest: url.substr(prefix.length)};
};
const path_prefix = (path, prefix)=>{
  let v;
  if (!(v=str_prefix(path, prefix)))
    return;
  if (!v.rest || v.rest[0]=='/' || prefix.endsWith('/'))
    return v;
};
const res_err = (res, code, msg)=>{
  res.writeHead(code, msg, {'cache-control': 'no-cache'}).end();
};
const res_send = (res, _path)=>{
  let ext = (path.extname(_path)||'').slice(1);
  let ctype = mime_db.ext2mime[ext]||'plain/text';
  let e = fs.statSync(_path, {throwIfNoEntry: false});
  if (!e || !e.isFile())
    return res_err(res, 404, 'file not found');
  var stream = fs.createReadStream(_path);
  res.writeHead(200, {'content-type': ctype, 'cache-control': 'no-cache'});
  stream.pipe(res);
};

let map;
let root;
const server = http.createServer((req, res)=>{
  let opt = {directoryListing: false, cleanUrls: false};
  let uri = decodeURIComponent(req.url), _uri, dir;
  let log_url = uri;
  res.on('finish', ()=>console.log(
    `${log_url} ${res.statusCode} ${res.statusMessage}`));
  let v;
  for (let f in map){
    let to = map[f];
    if (v=path_prefix(uri, f)){
      dir = to;
      _uri = v.rest || f.split('/').at(-1);
      break;
    }
  }
  if (!_uri && !opt.strict_map){
    dir = './';
    _uri = uri;
  }
  if (!_uri)
    return res_err(res, 404, 'no map found');
  if (_uri.endsWith('/'))
    _uri = _uri+'index.html';
  req.url = encodeURIComponent(_uri).replaceAll('%2F', '/');
  log_url = uri+(uri!=_uri ? '->'+dir+' '+_uri : '');
  let p = path.join((dir[0]=='/' ? '' : root+'/')+dir+'/'+_uri);
  return res_send(res, p);
});

function run(opt){
  let port = 3000;
  let [...argv] = [...process.argv];
  map = {...(opt?.map)||{}};
  root = opt.root||process.cwd();
  argv.shift();
  argv.shift();
  while (argv[0]!=undefined){
    if (argv[0]=='-p'){
      argv.shift();
      port = +argv.shift();
    } else if (argv[0]=='-m'){
      argv.shift();
      map[argv.shift()] = argv.shift();
      break;
    }
  }
  if (argv[0]!=undefined)
    throw 'invalid args '+JSON.stringify(argv);
  if (!map['/lif-kernel'])
    map['/lif-kernel'] = import.meta.dirname+'/';
  server.listen(port, ()=>{
    console.log(`Serving ${root} on http://localhost:${port}`);
  });
}

export default run;
