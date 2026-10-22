// LICENSE_CODE JPL lpm.js
let reg_version = '2026.10.19';
export const version = reg_version;
let D = 0; // Debug

const {str, assert, OE, ecache, eslow} = await import('./util.js');
const {T_lpm_parse, lpm_ver_missing} = await import('./lpm.js');

// br: lif-os/pages/index.tsx
//     /.lif/npm/lif-os/pages/index.tsx
// sw: /lif-os/pages/index.tsx
//
// req:         react 
// rewrite:     /.lif/npm/react?self=/lif-os/components/file.js
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
// https://registry.yarnpkg.com/lif-kernel
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
// bitcoin/ordinal/ID
// lifcoin/block/BLOCK
// lifcoin/ordinal/ID
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
  if (!ver)
    return 'latest';
  return ver;
}
let reg_cdn = {
  npm: {
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
        // https://cdn.jsdelivr.net/npm/react@18.3.1/package.json
        url: u=> `https://data.jsdelivr.com/v1/packages/npm/${u.name}${u.ver}`,
      },
      {
        name: 'unpkg.com',
        // package file listing+size+sha256
        // https://unpkg.com/react@18.3.1/?meta
        u: u=>`https://unpkg.com/${u.name}${u.ver}/?meta`,
      },
    ],
  },
  git: {
    'github.com': {
      src: [
        {
          name: 'jsdeliver.net',
          url: u=>`https://cdn.jsdelivr.net/gh/${u.name}${gh_ver(u)}${u.submod_path}`
        },
        {
          name: 'statically.io',
          url: u=>`https://cdn.statically.io/gh/${u.name}${gh_ver(u)}${u.submod_path}`,
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
  bitcoin: {ordinal: {src: [
    {
      name: 'ordiscan.com',
      url: u=>`https://ordiscan.com/content/${u.ordinal}`,
    },
    {
      name: 'ord.io',
      url: u=>`https://ord.io/content/${u.ordinal}`,
    },
  ]}},
};

let reg_get_cdn = u=>{
  let cdn = reg_cdn;
  if (typeof u=='string')
    u = T_lpm_parse(u);
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
};

// bitcoin ordinals: 
// /content/547a6709441bc5c9d206150ce5fb7605c28a90c46bd6e4330c4420cb41477aeai0
// /content/99dfe03e22d556dc6e12209403936f840ff0eb542d075cfb0efa7f794192862bi0
// ID = /[a-z0-9]{66}/
// /content/ID
// /.lif/bitcoin/ordinal/content/ID
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

export function fetch_opt(url){
  let no_cache = url.startsWith('/') ? !cache_enable : false;
  return no_cache ? {headers: {'Cache-Control': 'no-cache'}} : {};
}

export async function reg_http_get({log, url}){
  let response, err, blob;
  let slow = eslow(5000, 'fetch '+url);
  try {
    D && console.log('fetch '+url+' for '+log.mod);
    response = await fetch(url, fetch_opt(url));
  } catch(_err){
    // jsdelivr 503 is due to rate limit appear as fetch-throw
    err = 'module('+log.mod+') failed fetch('+url+'): '+_err;
    console.log(err);
    return {err, status: 0, fail_cdn: true};
  } finally {
    slow.end();
  }
  // jsdelivr/gh/gl returns 403 for not-exist
  if (response.status==404 || response.status==403)
    return {status: response.status, not_exist: true};
  if (response.redirected){
    console.warn('reg_http_fetch('+url+') CDN bug: got 302 redirect');
    return {status: response.status, not_exist: true};
  }
  if (response.status!=200){
    err = 'cdn failed fetch '+response.status+' '+url;
    console.log(err);
    return {status: response.status, err, fail_cdn: true};
  }
  let ctype = response.headers.get('content-type');
  try {
    blob = await response.blob();
  } catch(err){
    err = 'fetch('+url+'): '+err;
    console.log(err);
    return {err, fail_cdn: true};
  }
  return {blob, ctype};
}
export async function reg_git_get({log, lmod}){ assert(0); }
export async function reg_bittorrent_get({log, lmod}){ assert(0); }
export async function reg_get({log, lmod, opt}){
  return await ecache({table: reg_file_t, id: lmod, opt},
    async function run(reg)
{
  let wait, u, get_ver, get_files;
  reg.lmod = lmod;
  reg.log = log;
  u = reg.u = T_lpm_parse(reg.lmod);
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
      throw Error('reg_get invalid --ver: '+lmod);
  } else if (u.path=='/--files'){
    get_files = true;
    src = reg.cdn.src_files;
    u.submod = '';
    u.path = '';
    if (lpm_ver_missing(u))
      throw Error('reg_get files missing ver: '+lmod);
  } else {
    if (lpm_ver_missing(u))
      throw Error('reg_get missing ver: '+lmod);
  }
  let ret;
  src.sort((a, b)=>(a.fail?.tm||0) - (b.fail?.tm||0));
  for (let [i, _src] of OE(src)){
    if (_src.fail && _src.fail.tm+3000>Date.now())
      continue;
    let url_fn = _src.url;
    if (!url_fn)
      continue;
    let url = url_fn(u);
    reg.url = url;
    reg.src_ver = _src;
    ret = await reg_http_get({log, url});
    if (ret.blob) // fetch OK
      break;
    if (ret.not_exist){
      reg.not_exist = true;
      return reg;
    }
    assert(ret.fail_cdn);
    console.warn('cdn failed '+_src.name+'. '+
      'switching cdn '+(src[i+1]?.name || 'all cdns failed'));
    _src.fail = {url, err: ret.err, tm: Date.now()};
  }
  if (!(reg.blob = ret?.blob)){
    reg.err = ret ? ret.err : 'all cdns failed';
    return reg;
  }
  if (opt?.ctype)
    reg.ctype = ret.ctype;
  reg.body = await reg.blob.text();
  D && console.log('fetch OK '+lmod);
  return reg;
}); }


