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

let map;
const server = http.createServer((req, res)=>{
  const opt = {directoryListing: false, cleanUrls: false};
  let uri = decodeURIComponent(req.url), _uri, root;
  let log_url = uri;
  res.on('finish', ()=>console.log(
    `${log_url} ${res.statusCode} ${res.statusMessage}`));
  let v, cwd = import.meta.dirname;
  if (uri=='/' && (v=map['.'])){
    root = path_dir(v);
    _uri = '/'+path_file(v);
  } else {
    for (let f in map){
      let to = map[f];
      if (v=path_prefix(uri, f)){
        root = to;
        _uri = v.rest || f.split('/').at(-1);
        break;
      }
    }
  }
  if (!_uri)
    return res.writeHead(404, 'no map found').end();
  req.url = encodeURIComponent(_uri).replaceAll('%2F', '/');
  opt.public = root;
  log_url = uri+(uri!=_uri ? '->'+root+' '+_uri : '');
  // opt details: https://github.com/vercel/serve-handler#options
  return serve(req, res, opt);
});

function run(opt){
  let port = 3000;
  let [...argv] = [...process.argv];
  map = {...(opt?.map)||{}};
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
    console.log(`Running at http://localhost:${port}`);
  });
}

export default run;
