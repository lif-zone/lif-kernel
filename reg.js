// LICENSE_CODE JPL lpm.js
let reg_version = '2026.10.19';
export const version = reg_version;
let D = 0; // Debug

const {str, assert, OE, ecache, eslow, ewait} = await import('./util.js');
const {T_lfile_parse, lfile_ver_missing, lfile_is_perm
  } = await import('./lpm.js');
const clog = console.log.bind(console);
const cerror = console.error.bind(console);
const cwarn = console.warn.bind(console);

// br: lif-os/pages/index.tsx
//     /.lif/npm/lif-os/pages/index.tsx
// sw: /lif-os/pages/index.tsx
//
// req:         react 
// rewrite:     /.lif/npm/lif-os/.lif.imp/react?imp
// kernel 302:  /.lif/npm/react@0.18.1
// out:         https://unpkg.com/react
//
// br:  /.lif/npm.cjs/react
// sw:  https://unpkg.com/react

// reg sources
// NPM metadata
// https://registry.npmjs.com/lif-kernel
// https://registry.npmjs.com/lif-kernel/1.0.6
// https://registry.npmjs.com/lif-kernel/latest
// https://registry.npmmirror.com/lif-kernel
// https://registry.npmmirror.com/lif-kernel/1.0.6
// https://registry.yarnpkg.com/lif-kernel
// https://registry.yarnpkg.com/lif-kernel/1.0.6
// NPM filelist:
// https://data.jsdelivr.com/v1/packages/npm/lif-kernel@1.0.6
// https://unpkg.com/lif-kernel@1.0.6/?meta
// NPM content:
// https://unpkg.com/lif-kernel@1.0.6/boot.js
// https://unpkg.com/lif-kernel@latest/boot.js
// https://cdn.jsdelivr.net/npm/lif-kernel@1.0.6/boot.js
// GITHUB metadata
// https://api.github.com/repos/lif-zone/lif-kernel/tags
// https://api.github.com/repos/lif-zone/lif-kernel/commits/0f78e4cef8ce6b7a0d24d8716cc599143af20312
// https://api.github.com/repos/lif-zone/lif-kernel/git/ref/heads/master
// GITHUB content
// https://raw.githubusercontent.com/lif-zone/lif-kernel/0f78e4cef8ce6b7a0d24d8716cc599143af20312/package.json

// reg/lpm scheme
// https://www.iana.org/assignments/uri-schemes/prov/gitoid
// https://docs.npmjs.com/cli/v11/configuring-npm/package-json
// gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://github.com/pinheadmz/bcoin/blob/05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://raw.githubusercontent.com/pinheadmz/bcoin/05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://cdn.jsdelivr.net/gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
//   https://cdn.statically.io/gh/pinheadmz/bcoin@05794f5cb35eb322965d33a045ab68dffc63b21a/lib/bcoin-browser.js
// gh/pinheadmz/bcoin/HEAD/lib/bcoin-browser.js
//   https://github.com/pinheadmz/bcoin/blob/HEAD/lib/bcoin-browser.js
//   https://raw.githubusercontent.com/pinheadmz/bcoin/HEAD/lib/bcoin-browser.js
//   https://cdn.jsdelivr.net/gh/pinheadmz/bcoin@HEAD/lib/bcoin-browser.js
//   https://cdn.statically.io/gh/pinheadmz/bcoin@HEAD/lib/bcoin-browser.js
// Docs:
//   https://statically.io/ - gh GitHub, gl GitLab, 
//   https://www.jsdelivr.com/github - link converter
// Tools: Purge: https://www.jsdelivr.com/tools/purge
// IPFS
//   https://ipfs.io/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN
//   https://cloudflare-ipfs.com/ipfs/QmZULkCELmmk5XNfCgTnCyFgAVxBRBXyDHGGMVoLFLiXEN
//   https://ipfs.io/ipfs/QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX/wiki/Mars.html
//   https://ipfs.io/ipfs/bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq/wiki/Vincent_van_Gogh.html
//   https://bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq.ipfs.dweb.link/wiki/
// Docs:
//   https://docs.ipfs.tech/how-to/address-ipfs-on-web/#path-gateway
//   https://gist.github.com/olizilla/81cee26ffa3ae103e4766d2ae0d2f04b
//
// npm/MOD/PATH
// npm/MOD@VER/PATH
// npm/@SCOPE/MOD/PATH
// npm/@SCOPE/MOD@VER/PATH
//   SOURCE https://registry.npmjs.com/MOD
//   https://unpkg.com/MOD@VER/PATH
//   https://cdn.jsdelivr.net/npm/MOD@VER/PATH
// git/github.com/USER/REPO/PATH
// git/github.com/USER/REPO@VER/PATH
//   SOURCE https://github.com/USER/REPO/blob/VER/PATH
//   https://raw.githubusercontent.com/USER/REPO/VER/PATH
//   https://statically.io/gh/USER/REPO@VER/PATH
//   https://cdn.jsdelivr.net/gh/USER/REPO@HEAD/PATH
// git/gitlab.com/USER/REPO@VER/PATH
//   https://statically.io/gl/USER/REPO@VER/PATH
// http/SITE/PATH
// http/SITE@PORT/PATH
//   http://SITE:PORT/PATH
// https/SITE/PATH
// https/SITE@PORT/PATH
//   http://SITE:PORT/PATH
// ipfs/CID/PATH
//   https://ipfs.io/ipfs/CID
//   https://cloudflare-ipfs.com/ipfs/CID
// ipns/NAME/PATH
// bitcoin/block/BLOCK
// bitcoin/inscription/ID
// lifcoin/block/BLOCK
// lifcoin/inscription/ID
// bittorrent/IH/PATH
//  magnet:?xt=urn:btih:IH 

export function gh_ver(u){
  let ver = typeof u=='string' ? u : u.ver;
  if (!ver)
    return '';
  let _ver = ver.replace(/^@/, '');
  let v;
  if (v=str.starts(_ver, 'semver:'))
    return '@'+v.rest;
  return ver;
}
function _gh_ver(u){
  let ver = gh_ver(u);
  let _ver = ver.replace(/^@/, '');
  if (!_ver)
    return 'latest';
  return _ver;
}
let reg_cdn = {
  npm: {
    src_ping: {
      lfile: 'npm/react@18.3.1/index.js',
      len: 190,
      url: 'https://unpkg.com/react@18.3.1/index.js',
    },
    src: [
      {
        name: 'jsdeliver.net',
        // https://cdn.jsdelivr.net/npm/react@18.3.1/package.json
        url: u=>`https://cdn.jsdelivr.net/npm/${u.name}${u.ver}${u.submod_path}`,
      },
      {
        // package file listing+size+sha256
        // https://unpkg.com/react@18.3.1/?meta
        name: 'unpkg.com',
        // https://unpkg.com/react@18.3.1/package.json
        u: u=>`https://unpkg.com/${u.name}${u.ver}${u.submod_path}`,
      },
      {
        name: 'statically.io',
        // https://cdn.statically.io/npm/react@18.3.1/package.json
        url: u=>`https://cdn.statically.io/npm/${u.name}${u.ver}${u.submod_path}`,
        must_exist: true,
      },
    ],
    src_ver: [
      {
        name: 'npmjs.org',
        // https://registry.npmjs.com/react
        url: u=>`https://registry.npmjs.com/${u.name}`,
      },
      {
        name: 'yarnpkg.com',
        // https://registry.yarnpkg.com/react
        url: u=>`https://registry.yarnpkg.com/${u.name}`,
      },
      {
        // directory listing (not whole tarcall):
        // https://registry.npmmirror.com/react/18.3.1/files/
        // https://registry.npmmirror.com/react/18.3.1/files/umd/
        name: 'npmmirror.com',
        // https://registry.npmmirror.com/react
        url: u=>`https://registry.npmmirror.com/${u.name}`,
      },
    ],
    src_files: [
      {
        name: 'jsdeliver.net',
        // package file listing+size+sha256
        // https://data.jsdelivr.com/v1/packages/npm/react@18.3.1
        url: u=> `https://data.jsdelivr.com/v1/packages/npm/${u.name}${u.ver}`,
        get_data: data=>filelist_jsdelivr(data.files||[], '/', {}),
      },
      {
        name: 'unpkg.com',
        // package file listing+size+sha256
        // https://unpkg.com/react@18.3.1/?meta
        url: u=>`https://unpkg.com/${u.name}${u.ver}/?meta`,
        get_data: data=>filelist_unpkg(data.files||[]),
      },
    ],
  },
  git: {
    'github.com': {
      src_ping: {
        lfile: 'git/github.com/react/react@d9c1dbd61772f8f8ab0cdf389e70463d704c480b/packages/react/npm/index.js',
        lfile_ver: 'git/github.com/react/react@v18.3.1/packages/react/npm/index.js',
        len: 190,
        url: 'https://raw.githubusercontent.com/react/react/refs/tags/v18.3.1/packages/react/npm/index.js',
        url_ver: 'https://raw.githubusercontent.com/react/react/d9c1dbd61772f8f8ab0cdf389e70463d704c480b/packages/react/npm/index.js',
      },
      src: [
        {
          name: 'jsdeliver.net',
          url: u=>`https://cdn.jsdelivr.net/gh/${u.name}${gh_ver(u)}${u.submod_path}`
          // returns 403 on rate limit
        },
        {
          name: 'statically.io',
          url: u=>`https://cdn.statically.io/gh/${u.name}${gh_ver(u)}${u.submod_path}`,
          // returns 403 on rate limit, but without CORS
          // answers 403 404 without cors, causes fetch() throw, so you cannot
          // know if not_exist or forbidden (rate limit).
          // therefore can only be used as 'positive' cdn when filelist
          must_exist: true, // should only be used on files that exist
        },
        {
          name: 'raw.githubusercontent.com',
          url: u=>`https://raw.githubusercontent.com/${u.name}/${_gh_ver(u)}${u.submod_path}`,
        },
      ],
      src_ver: [
        {
          name: 'api.github.com',
          // all branches: [i].name, [i].commit.sha
          // https://api.github.com/repos/facebook/react/branches
          // all tags: [i].name [i].commit.sha
          // https://api.github.com/repos/facebook/react/tags
          // specific branch: name, commit.sha
          // https://api.github.com/repos/facebook/react/branches/main
          // specific tag: object.sha
          // https://api.github.com/repos/facebook/react/git/refs/tags/v19.0.0
          // list of all heads (including non-released): [i].object.sha
          // https://api.github.com/repos/facebook/react/git/refs/heads
          // specific head: object.sha
          // https://api.github.com/repos/facebook/react/git/refs/heads/main
          // without cors:
          // https://github.com/lif-zone/lif-kernel.git/info/refs?service=git-upload-pack
          // commit (with its contents, works partial sha): sha
          // returns only sha if fetch({headers: {Accept: 'application/vnd.github.sha'}})
          // https://api.github.com/repos/lif-zone/lif-kernel/commits/ec37e12
          // https://api.github.com/repos/lif-zone/lif-kernel/commits/ec37e12310d75175dea2366e750952080c236b6e
          // https://api.github.com/repos/lif-zone/lif-kernel/commits/HEAD
          // https://api.github.com/repos/lif-zone/lif-kernel/commits/main
          // lookup branch+date: [0].sha
          // https://api.github.com/repos/lif-zone/lif-kernel/commits?per_page=1&until=2025-12-19T19:49:17Z&sha=main
          // https://api.github.com/repos/lif-zone/lif-kernel/commits?per_page=1&until=2025-12-19T19:49:18Z&sha=main
          url: u=>`https://api.github.com/repos/${u.name}/branches/${u.ver||'main'}`,
          get_data: data=>data.commit.sha,
          _uri_branch: u=>`https://api.github.com/repos/${u.name}/git/ref/heads/${u.ver||'main'}`,
          _uri_tag: u=>`https://api.github.com/repos/${u.name}/git/ref/tags/${u.ver||'main'}`,
          _uri_branch_date: u=>`https://api.github.com/repos/${u.name}/commits?per_page=1&until={u.date}&sha=${u.ver||'main'}`,
          _get_data: data=>data.object.sha,
        },
        {
          name: 'ungh.cc',
          url: u=>`https://ungh.cc/repos/${u.name}/files/${u.ver||'main'}`,
          get_data: data=>data.meta.sha,
        },
      ],
      src_files: [
        {
          name: 'jsdeliver.net',
          // package file listing+size+sha256
          // https://data.jsdelivr.com/v1/packages/gh/jquery/jquery@3.7.1
          // https://data.jsdelivr.com/v1/packages/gh/jquery/jquery@f79d5f1a337528940ab7029d4f8bbba72326f269
          // https://data.jsdelivr.com/v1/packages/gh/lif-zone/lif-coin@de93ceccfe56b8e8631bef8f85f2f252e4d2bf0f
          url: u=> `https://data.jsdelivr.com/v1/packages/gh/${u.name}${u.ver}`,
          get_data: data=>filelist_jsdelivr(data.files||[], '/', {}),
        },
      ],
    },
    'gitlab.com': {
      src: [{
        name: 'statically.io',
        url: u=>`https://cdn.statically.io/gl/${u.name}${gh_ver(u)}${u.submod_path}`,
      }],
      src_ver: [{
        name: "gitlab.com",
        // commit (works partial sha): id
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc83328
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc8332848c7f32dbd0e7eb56a94dd07bcdeabdf4
        // specific tag/branch: id
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/master
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/v18.11.2-ee
        url: (o, r, b)=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(o+'/'+r)}/repository/commits/${b}`,
        get_data: data=>data.id,
      }],
      src_files: [{
        name: 'gitlab.com',
        // the whole repository, 100 entries per page: [i].path, [i].type
        // (blob/tree), [i].id (git hash)
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/repository/tree?ref=main&recursive=true&per_page=100&page=1
        // one directory:
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/repository/tree?ref=main&path=docs
        url: u=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(u.name)}/repository/tree?ref=${u.ver.slice(1)}&recursive=true&per_page=100&page=${u.page}`,
        get_data: data=>filelist_gitlab(data),
        // the answer is in pages: is there a page after this one
        page_next: data=>data.length==100,
        // a larger repository: no filelist
        page_max: 50,
      }],
    },
  },
  ipfs: {src: [
    {
      name: 'ipfs.io',
      url: u=>`https://ipfs.io/ipfs/${u.cid}${u.submod_path}`,
    },
    {
      name: 'dweb.link',
      url: u=>`https://dweb.link/ipfs/${u.cid}${u.submod_path}`,
    },
  ]},
  local: {src: [{
    name: 'local',
    url: u=>u.submod_path,
  }]},
  https: {src: [{
    name: 'https',
    url: u=>`https://${u.host}${u.submod_path}`,
  }]},
  http: {src: [{
    name: 'http',
    url: u=>`http://${u.host}${u.submod_path}`,
  }]},
  bitcoin: {inscription: {src: [
    {
      name: 'ordiscan.com',
      url: u=>`https://ordiscan.com/content/${u.inscription}`,
    },
    {
      name: 'ord.io',
      url: u=>`https://ord.io/content/${u.inscription}`,
    },
  ]}},
};

function reg_get_cdn(u){
  let cdn = reg_cdn;
  if (typeof u=='string')
    u = T_lfile_parse(u);
  switch (u.reg){
  case 'npm': return cdn.npm;
  case 'git': return cdn.git[u.host];
  case 'ipfs': return cdn.ipfs;
  case 'local': return cdn.local;
  case 'https': return cdn.https;
  case 'http': return cdn.http;
  case 'bitcoin': return cdn.bitcoin[u.btctype];
  case 'lifcoin': return cdn.lifcoin[u.liftype];
  }
  throw Error('invalid reg '+u.reg);
}

// bitcoin ordinals: 
// /content/547a6709441bc5c9d206150ce5fb7605c28a90c46bd6e4330c4420cb41477aeai0
// /content/99dfe03e22d556dc6e12209403936f840ff0eb542d075cfb0efa7f794192862bi0
// ID = /[a-z0-9]{66}/
// /content/ID
// /.lif/bitcoin/inscription/ID
// fetch from:
// https://ordiscan.com/content/547a6709441bc5c9d206150ce5fb7605c28a90c46bd6e4330c4420cb41477aeai0
// A nice HTML orginal 3D world, movable by mouse:
// https://ordiscan.com/inscription/69458794

export const reg_file_t = {};
// 0 no-cache, 1 cache registry, 2 cache http/https, 3 cache local
let cache_enable = 1;
export function reg_cache_enable(enable){
  cache_enable = enable;
}

export function fetch_opt(url, perm){
  let no_cache = url.startsWith('/') ? !cache_enable : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}} : {};
}

export async function reg_http_get({log, url, perm}){
  let response, err, blob;
  let slow = eslow(5000, 'fetch '+url);
  try {
    D && clog('fetch '+url+' for '+log.mod);
    response = await fetch(url, fetch_opt(url, perm));
  } catch(_err){
    // jsdelivr 503 is due to rate limit appear as fetch-throw
    err = 'module('+log.mod+') failed fetch('+url+'): '+_err;
    clog(err);
    return {err, status: 0, fail_cdn: true};
  } finally {
    slow.end();
  }
  if (response.status==404)
    return {status: response.status, not_exist: true};
  if (response.status==403){
    cerror('403 cdn rate limit', url);
    return {status: response.status, fail_cdn: true};
  }
  if (response.redirected){
    cwarn('reg_http_fetch('+url+') CDN bug: got 302 redirect');
    return {status: response.status, not_exist: true};
  }
  if (response.status!=200){
    err = 'cdn failed fetch '+response.status+' '+url;
    clog(err);
    return {status: response.status, err, fail_cdn: true};
  }
  let ctype = response.headers.get('content-type');
  try {
    blob = await response.blob();
  } catch(err){
    err = 'fetch('+url+'): '+err;
    clog(err);
    return {err, fail_cdn: true};
  }
  return {blob, ctype};
}
let reg_filelist_t = {};
// filelist of a package: {dir: {name: {type: 'file'|'dir', size, hash}}}
// dir: '/', '/cjs/'. hash: sha256 of the file, in base64.
// A source may list all the directories at once (npm), or not (git, in the
// future): a directory that was not listed yet is not in the table.
// hash_git: the git hash of a file or a directory (a source of git).
// get_data of a src_files source: its answer (a page of it, for a source
// that answers in pages) -> filelist
function filelist_jsdelivr(files, dir, dirs){
  let d = dirs[dir] = {};
  for (let f of files){
    if (f.type=='file')
      d[f.name] = {type: 'file', size: f.size, hash: f.hash};
    else if (f.type=='directory'){
      d[f.name] = {type: 'dir'};
      filelist_jsdelivr(f.files||[], dir+f.name+'/', dirs);
    }
  }
  return dirs;
}
function filelist_unpkg(files){
  let dirs = {'/': {}};
  for (let f of files){
    let parts = f.path.split('/').slice(1), dir = '/';
    for (let i=0; i<parts.length-1; i++){
      dirs[dir][parts[i]] ||= {type: 'dir'};
      dir += parts[i]+'/';
      dirs[dir] ||= {};
    }
    dirs[dir][parts.at(-1)] = {type: 'file', size: f.size,
      hash: str.starts(f.integrity||'', 'sha256-')?.rest};
  }
  return dirs;
}
function filelist_gitlab(files){
  let dirs = {'/': {}};
  for (let f of files){
    let parts = f.path.split('/'), dir = '/';
    for (let i=0; i<parts.length-1; i++){
      dirs[dir][parts[i]] ||= {type: 'dir'};
      dir += parts[i]+'/';
      dirs[dir] ||= {};
    }
    let name = parts.at(-1);
    if (f.type=='tree'){
      dirs[dir][name] = {type: 'dir', hash_git: f.id};
      dirs[dir+name+'/'] ||= {};
    }
    else if (f.type=='blob')
      dirs[dir][name] = {type: 'file', hash_git: f.id};
  }
  return dirs;
}
// true: path is a file. false: it does not exist (for sure: not in the
// list). undefined: not known (its directory was not listed)
function filelist_lookup(dirs, path){
  let parts = path.split('/').slice(1), dir = '/';
  for (let i=0; i<parts.length; i++){
    let d = dirs[dir];
    if (!d)
      return;
    let e = d[parts[i]];
    if (i==parts.length-1)
      return e?.type=='file';
    if (e?.type!='dir')
      return false;
    dir += parts[i]+'/';
  }
  return false;
}
let enable_filelist = 1;
async function reg_filelist_get({log, lfile, opt}){
  let u = T_lfile_parse(lfile);
  let pkg_lmod = u.lmod.slice(0, -u.submod.length || undefined);
  let t;
  if (t=reg_filelist_t[pkg_lmod]){
    if (t.wait)
      return await t.wait;
    // a failed fetch of the list is temporary: no_cache retries it
    if (t.dirs || !opt?.no_cache)
      return t;
  }
  function do_ret(err){
    if (err)
      cwarn('reg_filelist fetch failed '+lfile+': '+err);
    t.err = err;
    t.wait.return(t);
    t.wait = null;
    return t;
  }
  t = reg_filelist_t[pkg_lmod] = {dirs: null, wait: ewait()};
  let cdn = reg_get_cdn(lfile);
  if (!cdn.src_files)
    return do_ret('no_src');
  // a source that answers in pages (page_next): page N is --files/N
  let dirs = {}, src;
  for (let page=1;; page++){
    let reg;
    try {
      reg = await reg_get({log, opt,
        lfile: pkg_lmod+'/--files'+(page>1 ? '/'+page : '')});
    } catch(e){
      return do_ret(''+e);
    }
    if (reg.err)
      return do_ret(reg.err);
    if (reg.not_exist)
      return do_ret('not_found');
    assert(reg.blob);
    // the pages of a list: all from one source
    if (src && src!=reg.src_ver)
      return do_ret('src changed');
    src = reg.src_ver;
    let body;
    try { body = JSON.parse(await reg.blob.text()); }
    catch(e){
      return do_ret('parse err');
    }
    // XXX handle invalid data (get_data throws)
    for (let [dir, d] of OE(src.get_data(body)))
      dirs[dir] = {...dirs[dir], ...d};
    if (!src.page_next?.(body))
      break;
    if (page>=src.page_max)
      return do_ret('too many pages');
  }
  t.dirs = dirs;
  return do_ret();
}
// true: exists. false: does not exist, for sure. undefined: not known
async function reg_filelist_has({log, lfile, opt}){
  if (!enable_filelist)
    return;
  let u = T_lfile_parse(lfile);
  let t = await reg_filelist_get({log, lfile, opt});
  if (!t.dirs)
    return;
  // the list is of the whole package: the path includes the submod
  return filelist_lookup(t.dirs, u.submod.replace(/\/$/, '')+u.path);
}

export async function reg_git_get({log, lfile}){ assert(0); }
export async function reg_bittorrent_get({log, lfile}){ assert(0); }
// a result that is final: of a perm lfile, its content, or a not_exist by
// the filelist. Any other result is temporary (a failure, a 404 of a cdn,
// which may be a problem of the cdn, a list of versions)
function reg_is_final(reg){
  return lfile_is_perm(reg.lfile) && !!(reg.blob || reg.not_exist_perm);
}

// opt.no_cache: a result that is not final is fetched again
export async function reg_get({log, lfile, opt}){
  if (opt?.no_cache){
    let reg = ecache.get_sync(reg_file_t, lfile);
    if (reg && !reg_is_final(reg))
      delete reg_file_t[lfile];
  }
  return await ecache({table: reg_file_t, id: lfile, opt},
    async function run(reg)
{
  let wait, u, get_ver, get_files;
  reg.lfile = lfile;
  reg.log = log;
  u = reg.u = T_lfile_parse(reg.lfile);
  let perm = lfile_is_perm(u);
  u.submod_path = u.submod.replace(/\/$/, '')+u.path;
  // select cdn
  // npm/react@18.3.0/index.js
  //   http://unpkg.com/react@18.3.0/index.js
  //   http://cdn.jsdelivr.net/npm/react@18.3.0/index.js
  let pkg, v;
  reg.cdn = reg_get_cdn(u);
  let src = reg.cdn.src;
  if (u.path=='/--ver'){
    get_ver = true;
    src = reg.cdn.src_ver;
    u.submod = '';
    u.path = '';
    if (u.ver)
      throw Error('reg_get invalid --ver: '+lfile);
  } else if (u.path=='/--files' || (v=str.starts(u.path, '/--files/'))){
    get_files = true;
    u.page = v ? +v.rest : 1;
    src = reg.cdn.src_files;
    u.submod = '';
    u.path = '';
    if (lfile_ver_missing(u))
      throw Error('reg_get files missing ver: '+lfile);
  } else {
    if (lfile_ver_missing(u))
      throw Error('reg_get missing ver: '+lfile);
    // check filelist to avoid unnecessary fetches for alt searches.
    // only a perm lfile has a filelist that is final
    if (perm && reg.cdn.src_files){
      let fl = await reg_filelist_has({log, lfile, opt});
      if (fl==false){
        // not in the filelist: does not exist, for sure and forever
        reg.not_exist = reg.not_exist_perm = true;
        return reg;
      }
    }
  }
  let ret;
  src = src.toSorted((a, b)=>(a.fail?.tm||0) - (b.fail?.tm||0));
  for (let [i, _src] of OE(src)){
    if (_src.fail && _src.fail.tm+3000>Date.now())
      continue;
    if (_src.must_exist && !opt?.must_exist)
      continue;
    let url_fn = _src.url;
    if (!url_fn)
      continue;
    let url = url_fn(u);
    reg.url = url;
    reg.src_ver = _src;
    ret = await reg_http_get({log, url, perm});
    if (ret.blob) // fetch OK
      break;
    if (ret.not_exist){
      reg.not_exist = true;
      return reg;
    }
    assert(ret.fail_cdn);
    cwarn('cdn failed '+_src.name+'. '+
      'switching cdn '+(src[+i+1]?.name || 'all cdns failed'));
    _src.fail = {url, err: ret.err, tm: Date.now()};
  }
  if (!(reg.blob = ret?.blob)){
    reg.err = ret ? ret.err : 'all cdns failed';
    return reg;
  }
  if (opt?.ctype)
    reg.ctype = ret.ctype;
  D && clog('fetch OK '+lfile);
  return reg;
}); }

