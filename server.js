import http from 'http';
import serve from 'serve-handler';
import process from 'process';

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
const path_file = path=>path.match(/(^|\/)?([^/]*)$/)?.[2];
const path_dir = path=>path.slice(0, path.length-path_file(path).length);
const res_error = (path, res, json, curr, handlers, statusCode, code, msg)=>{
  res.writeHead(statusCode, code);
  res.end(`${statusCode}: ${msg||code}`);
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
    return res.writeHead(404, 'no map found').end();
  if (_uri.endsWith('/'))
    _uri = _uri+'index.html';
  req.url = encodeURIComponent(_uri).replaceAll('%2F', '/');
  opt.public = root+'/'+dir;
  log_url = uri+(uri!=_uri ? '->'+dir+' '+_uri : '');
  // opt details: https://github.com/vercel/serve-handler#options
  return serve(req, res, opt, {error: res_error});
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
  server.listen(port, ()=>{
    console.log(`Serving ${root} on http://localhost:${port}`);
  });
}

export default run;
