// LICENSE_CODE JPL lpm.js
let reg_version = '2026.10.19';
export const version = reg_version;
let D = 0; // Debug

const {str, assert, OE, ecache, eslow, ewait, str_to_buf,
  } = await import('./util.js');
const sha256 = await import('./sha256.js');
const sha1 = await import('./sha1.js');
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
          // ref: the commit of one ref (u.ref: a branch, a tag, a commit id
          // that may be partial, HEAD)
          ref: true,
          url: u=>`https://api.github.com/repos/${u.name}/commits/${u.ref}`,
          get_data: data=>data.sha,
          // its answer for a ref that does not exist
          not_exist_status: 422,
        },
        {
          // off: its answer holds also the whole filelist
          name: 'ungh.cc',
          ref: true,
          x_url: u=>`https://ungh.cc/repos/${u.name}/files/${u.ref}`,
          get_data: data=>data.meta.sha,
        },
        {
          // the version table: all the refs (branches, tags), 100 at most
          // [i].ref ('refs/heads/main', 'refs/tags/v1.0'), [i].object.sha,
          // [i].object.type ('commit', or 'tag': an annotated tag, its sha
          // is of the tag and not of its commit)
          // https://api.github.com/repos/lif-zone/lif-kernel/git/matching-refs/
          name: 'api.github.com',
          url: u=>`https://api.github.com/repos/${u.name}/git/matching-refs/?per_page=100`,
          get_data: data=>ver_table_github(data),
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
          // answers 403 for a repository of more than 50MB
        },
        {
          name: 'api.github.com',
          // the whole repository in one answer: tree[i].path, .type
          // (blob/tree/commit), .sha (git hash), .size. truncated: true
          // above 100,000 entries. 60 requests per hour without a login
          // https://api.github.com/repos/lif-zone/lif-os/git/trees/76aaf454f4fde9b27e584be96cda153302b2a2a4?recursive=1
          url: u=>`https://api.github.com/repos/${u.name}/git/trees/${u.ver.slice(1)}?recursive=1`,
          // a list that was cut is not a filelist
          get_data: data=>!data.truncated && filelist_git(data.tree, 'sha'),
        },
        {
          // tree walk: one directory, by its git hash (the root: by the
          // commit). tree[i].path is the name
          // https://api.github.com/repos/lif-zone/lif-kernel/git/trees/67865560c3301522343abf53dc49ee23c359279d
          name: 'api.github.com',
          walk: true,
          x_url: u=>`https://api.github.com/repos/${u.name}/git/trees/${u.dir_hash||u.ver.slice(1)}`,
          get_data: data=>!data.truncated &&
            filelist_git_dir(data.tree, 'sha', 'path'),
        },
      ],
    },
    'gitlab.com': {
      src: [{
        name: 'statically.io',
        url: u=>`https://cdn.statically.io/gl/${u.name}${gh_ver(u)}${u.submod_path}`,
        // answers 429 on rate limit
      }, {
        name: 'gitlab.com',
        // content-type is always text/plain
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/repository/files/docs%2F_index.md/raw?ref=d41e103b8f560e2e1c84f40e30063ed9f53e205e
        url: u=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(u.name)}/repository/files/${encodeURIComponent(u.submod_path.slice(1))}/raw?ref=${u.ver.slice(1)}`,
      }],
      src_ver: [{
        name: "gitlab.com",
        // commit (works partial sha): id
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc83328
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/dc8332848c7f32dbd0e7eb56a94dd07bcdeabdf4
        // specific tag/branch: id
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/master
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab/repository/commits/v18.11.2-ee
        ref: true,
        url: u=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(u.name)}/repository/commits/${u.ref}`,
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
        get_data: data=>filelist_git(data, 'id'),
        // the answer is in pages: is there a page after this one
        page_next: data=>data.length==100,
        // a larger repository: no filelist
        page_max: 50,
      }, {
        // tree walk: one directory, by its path, 100 entries per page
        // https://gitlab.com/api/v4/projects/gitlab-org%2Fgitlab-runner/repository/tree?ref=main&path=docs&per_page=100&page=1
        name: 'gitlab.com',
        walk: true,
        x_url: u=>`https://gitlab.com/api/v4/projects/${encodeURIComponent(u.name)}/repository/tree?ref=${u.ver.slice(1)}&path=${encodeURIComponent(u.dir.slice(1, -1))}&per_page=100&page=${u.page}`,
        get_data: data=>filelist_git_dir(data, 'id', 'name'),
        page_next: data=>data.length==100,
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

// src_ver: the versions of a package. They are not final: versions and tags
// are added, and a branch (or a tag of git) moves.
// - the version table, the lfile <lmod with no version>/--ver: all the
//   versions. npm: the document of the registry (versions, time,
//   dist-tags). git: its refs, by get_data: {refs: {'heads/main': {sha,
//   type}, 'tags/v1.0': ...}, more: true if the table was cut}
// - one ref (a source with ref: true), the lfile <lmod>@<ref>/--ver: get_data
//   gives its commit id
// reg.js fetches; the caller (lpm) parses, by get_data of the source that
// answered (reg.src_ver), and resolves.
// The http cache of the browser is the cache: an answer is used while the
// source says its fresh. If the sources failed, the last answer the browser
// has stored is used, however old (reg.stale). opt.no_cache: asked again
// from the source.
function ver_table_github(data){
  let refs = {};
  for (let r of data){
    refs[str.starts(r.ref, 'refs/').rest] = {sha: r.object.sha,
      type: r.object.type};
  }
  return {refs, more: data.length==100};
}

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

// cache: the cache mode of fetch().
// 'force-cache': what the browser has stored for the url (http cache) is
// used, however old, with no request. For what never changes and is asked
// again and again: a filelist of a perm lfile (the http cache is its
// persistent store), and a url of the hash table.
// Not for the fetch of a file by its own url: there the cache headers of the
// cdn do (a year for a file, none for a 404).
// 'no-cache': the source is asked, also if the stored answer is fresh
export function fetch_opt(url, cache){
  let no_cache = url.startsWith('/') ? !cache_enable : false;
  if (no_cache)
    return {headers: {'Cache-Control': 'no-cache'}};
  return cache ? {cache} : {};
}

// retry: (cache: 'force-cache') an answer that is not 200 is asked again,
// from the source
export async function reg_http_get({log, url, cache, retry}){
  let response, err, blob;
  let slow = eslow(5000, 'fetch '+url);
  try {
    D && clog('fetch '+url+' for '+log.mod);
    response = await fetch(url, fetch_opt(url, cache));
    // a failure may be an old answer, stored by the browser: only the
    // content is forever. ask the cdn itself
    if (retry && response.status!=200)
      response = await fetch(url, {cache: 'reload'});
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
    // a rate limit, or a refusal (jsdelivr: the filelist of a repository of
    // more than 50MB)
    err = 'cdn 403 (rate limit or refused) '+url;
    cerror(err);
    return {status: response.status, err, fail_cdn: true};
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
// filelist of a package: {dir: {name: {type: 'file'|'dir', size, sha256,
// git_sha1}}}. dir: '/', '/cjs/'. The hashes: those the source gives.
// sha256: of the content of the file, in hex.
// A source lists all the directories at once (the full list), or one
// directory per request (walk: true, a source of git): a directory that was
// not listed yet is not in the table.
// A source is switched off by the name of its url: x_url.
// git_sha1: the id of the file or directory in git, in hex (for a file:
// see hash_git_sha1()).
// get_data of a src_files source: its answer (a page of it, for a source
// that answers in pages) -> filelist. Of a walk source: -> the entries of
// the directory, {name: entry}
function filelist_jsdelivr(files, dir, dirs){
  let d = dirs[dir] = {};
  for (let f of files){
    if (f.type=='file')
      d[f.name] = {type: 'file', size: f.size, sha256: base64_hex(f.hash)};
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
      sha256: base64_hex(str.starts(f.integrity||'', 'sha256-')?.rest)};
  }
  return dirs;
}
// a list of a git source: [{path, type: 'blob'|'tree'|'commit', size}], and
// the git hash in the field of name id
function filelist_git(files, id){
  let dirs = {'/': {}};
  for (let f of files){
    let parts = f.path.split('/'), dir = '/';
    for (let i=0; i<parts.length-1; i++){
      dirs[dir][parts[i]] ||= {type: 'dir'};
      dir += parts[i]+'/';
      dirs[dir] ||= {};
    }
    let name = parts.at(-1);
    let hash = {[f[id]?.length==64 ? 'git_sha256' : 'git_sha1']: f[id]};
    if (f.type=='tree'){
      dirs[dir][name] = {type: 'dir', ...hash};
      dirs[dir+name+'/'] ||= {};
    }
    else if (f.type=='blob')
      dirs[dir][name] = {type: 'file', size: f.size, ...hash};
    // 'commit': a submodule. a dir that is not listed: not known
    else
      dirs[dir][name] = {type: 'dir', no_list: true};
  }
  return dirs;
}
// one directory of a git source (tree walk): [{type, size}], the name of an
// entry in the field of name name, its git hash in the field of name id
function filelist_git_dir(files, id, name){
  let d = {};
  for (let f of files){
    let hash = {[f[id]?.length==64 ? 'git_sha256' : 'git_sha1']: f[id]};
    if (f.type=='tree')
      d[f[name]] = {type: 'dir', ...hash};
    else if (f.type=='blob')
      d[f[name]] = {type: 'file', size: f.size, ...hash};
    else
      d[f[name]] = {type: 'dir', no_list: true};
  }
  return d;
}
function base64_hex(v){
  if (!v)
    return;
  let hex = '';
  for (let c of atob(v))
    hex += c.charCodeAt(0).toString(16).padStart(2, '0');
  return hex;
}
// the entry of the file of path. false: it does not exist (for sure: not in
// the list). undefined: not known (its directory was not listed)
function filelist_lookup(dirs, path){
  let parts = path.split('/').slice(1), dir = '/';
  for (let i=0; i<parts.length; i++){
    let d = dirs[dir];
    if (!d)
      return;
    let e = d[parts[i]];
    if (i==parts.length-1)
      return e?.type=='file' ? e : false;
    if (e?.type!='dir')
      return false;
    dir += parts[i]+'/';
  }
  return false;
}
let enable_filelist = 1;
// fetches a list that comes in pages (page_next of the source), from
// lfile_page(page). on_data(data): the get_data of a page.
// Returns an error text, or undefined
async function filelist_pages_get({log, opt, lfile_page, on_data}){
  let src;
  for (let page=1;; page++){
    let reg;
    try {
      reg = await reg_get({log, opt, lfile: lfile_page(page)});
    } catch(e){
      return ''+e;
    }
    if (reg.err)
      return reg.err;
    if (reg.not_exist)
      return 'not_found';
    assert(reg.blob);
    src = reg.src_ver;
    let body;
    try { body = JSON.parse(await reg.blob.text()); }
    catch(e){
      return 'parse err';
    }
    // XXX handle invalid data (get_data throws)
    let data = src.get_data(body);
    if (!data)
      return 'no data';
    on_data(data);
    if (!src.page_next?.(body))
      return;
    if (page>=src.page_max)
      return 'too many pages';
  }
}

// the filelist of the package of lfile: t.dirs, from the first source of
// src_files that works. A source of the full list: page N of the list is
// the lfile --files/<source index>/N. A source of a tree walk (t.walk):
// t.dirs is filled a directory at a time, by filelist_walk()
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
  t = reg_filelist_t[pkg_lmod] = {lmod: pkg_lmod, dirs: null,
    wait: ewait()};
  // the sources, by their order in src_files: the first that works is
  // used. t.src: its index
  let err = 'no_src';
  for (let [i, src] of (reg_get_cdn(lfile).src_files||[]).entries()){
    if (!src.url)
      continue;
    t.src = i;
    t.dirs = {};
    if (src.walk){
      t.walk = {}; // dir -> the wait of its fetch
      // the root: every lookup needs it, and it tells if the source works
      err = await filelist_dir_get({log, opt, t, dir: '/'});
    } else {
      t.walk = null;
      err = await filelist_pages_get({log, opt,
        lfile_page: page=>pkg_lmod+'/--files/'+i+'/'+page,
        on_data: data=>{
          for (let [dir, d] of OE(data))
            t.dirs[dir] = {...t.dirs[dir], ...d};
        }});
    }
    if (!err)
      return do_ret();
    cwarn('reg_filelist '+pkg_lmod+' source '+src.name+': '+err);
  }
  t.dirs = null;
  return do_ret(err);
}

// tree walk: fetches the directory dir ('/', '/web/') of the filelist t.
// hash: the git hash of the directory (none: the root).
// Page N of the directory is the lfile --dir/<source index>/N<dir>.
// Returns an error text, or undefined
async function filelist_dir_get({log, opt, t, dir, hash}){
  let d = {};
  let err = await filelist_pages_get({log, opt: {...opt, dir_hash: hash},
    lfile_page: page=>t.lmod+'/--dir/'+t.src+'/'+page+dir,
    on_data: data=>Object.assign(d, data)});
  if (err)
    cwarn('reg_filelist dir fetch failed '+t.lmod+dir+': '+err);
  else
    t.dirs[dir] = d;
  return err;
}

// filelist_lookup() by a tree walk: a directory on the way that was not
// listed yet is fetched
async function filelist_walk({log, opt, t, path}){
  let parts = path.split('/').slice(1), dir = '/', hash;
  for (let i=0; i<parts.length; i++){
    if (!t.dirs[dir]){
      // one fetch of a directory, for all that wait for it
      let wait = t.walk[dir] ||= filelist_dir_get({log, opt, t, dir, hash});
      let err = await wait;
      delete t.walk[dir];
      if (err)
        return;
    }
    let e = t.dirs[dir][parts[i]];
    if (i==parts.length-1)
      return e?.type=='file' ? e : false;
    if (e?.type!='dir')
      return false;
    if (e.no_list)
      return;
    hash = e.git_sha1||e.git_sha256;
    dir += parts[i]+'/';
  }
  return false;
}

// the entry of the lfile in the filelist: exists. false: does not exist,
// for sure. undefined: not known
async function reg_filelist_has({log, lfile, opt}){
  if (!enable_filelist)
    return;
  let u = T_lfile_parse(lfile);
  let t = await reg_filelist_get({log, lfile, opt});
  if (!t.dirs)
    return;
  // the list is of the whole package: the path includes the submod
  let path = u.submod.replace(/\/$/, '')+u.path;
  if (t.walk)
    return await filelist_walk({log, opt, t, path});
  return filelist_lookup(t.dirs, path);
}

// The hash table: the content that was already fetched, by its hash.
// A new version of a package has mostly the files of the version before it:
// the filelist gives the hash of a file, and a file of that hash that was
// fetched (under another lfile) is taken from the url it was fetched from,
// which the browser has in its http cache (best effort: if it does not, the
// url is fetched again).
// sha256 (of the content, hex) is the canonical hash. The tables:
//   reg_hash: sha256 -> {sha256, git_sha1, git_sha256, url, lfile}
//   reg_git_sha1: git_sha1 -> {git_sha1, sha256}
//   reg_git_sha256: git_sha256 -> {git_sha256, sha256} (no source gives it)
// They are tables of the db of the kernel, which hands its access:
// reg_db_init({get(table, key), set(table, val)})
let reg_db;
export function reg_db_init(db){
  reg_db = db;
}
// development: true. the hashes that the filelist gives of the content of
// a perm lfile (sha256, git_sha1) are computed from the fetched content and
// compared.
// false: a hash of the filelist is trusted.
// sha256 is computed in any case when the filelist does not give it (no
// filelist, or a filelist of git_sha1): its the canonical hash
let enable_hash_validation = 0;
// 0: for debug. no hash table: a file is fetched from its own url
let enable_hash = 1;
const hash_git_kinds = ['git_sha1', 'git_sha256'];

function hash_sha256(buf){
  return sha256.digest(new sha256.Buffer(buf)).toHex();
}
// the id of a file in git: git hashes the object it stores, which is the
// content after a header: 'blob <length>\0'
function hash_git_sha1(buf){
  let head = new sha1.Buffer(str_to_buf('blob '+buf.byteLength+'\0'));
  return sha1.multi(head, new sha1.Buffer(buf)).toHex();
}

// the row of the content of a file of the filelist (e: its entry)
async function reg_hash_get(e){
  if (!reg_db || !enable_hash)
    return;
  try {
    let sha256 = e.sha256;
    for (let kind of hash_git_kinds){
      if (!sha256 && e[kind])
        sha256 = (await reg_db.get('reg_'+kind, [e[kind]]))?.sha256;
    }
    if (sha256)
      return await reg_db.get('reg_hash', [sha256]);
  } catch(err){
    cerror('reg_hash_get', err);
  }
}

// content was fetched (reg.blob, from reg.url): sets reg.sha256, and adds
// the content to the hash table. e: the entry of the file in the filelist,
// if known
async function reg_hash_set(reg, e){
  let h = {sha256: e?.sha256, git_sha1: e?.git_sha1,
    git_sha256: e?.git_sha256};
  let valid = true;
  if (enable_hash_validation || !h.sha256){
    let buf = await reg.blob.arrayBuffer();
    let calc = {sha256: hash_sha256(buf)};
    if (enable_hash_validation && h.git_sha1)
      calc.git_sha1 = hash_git_sha1(buf);
    for (let [kind, v] of OE(calc)){
      if (h[kind] && h[kind]!=v){
        valid = false;
        cerror('reg hash mismatch '+kind+' '+reg.lfile+' '+reg.url+
          ': filelist '+h[kind]+' content '+v);
      }
      h[kind] = v;
    }
  }
  reg.sha256 = h.sha256;
  // content that is not as listed: not for other lfiles
  if (!reg_db || !enable_hash || !valid)
    return;
  // in the background: the fetch does not wait for the db
  reg_hash_write({...h, url: reg.url, lfile: reg.lfile});
}

async function reg_hash_write(row){
  try {
    for (let kind of hash_git_kinds){
      if (row[kind]){
        await reg_db.set('reg_'+kind,
          {[kind]: row[kind], sha256: row.sha256});
      }
    }
    await reg_db.set('reg_hash', row);
  } catch(err){
    cerror('reg_hash_write', err);
  }
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
  let wait, u, get_ver, get_files, fl;
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
    // with no version: the version table. with one: the commit of this ref
    get_ver = true;
    u.ref = u.ver ? u.ver.slice(1) : undefined;
    src = (reg.cdn.src_ver||[]).filter(_src=>!!_src.ref==!!u.ref);
    u.submod = '';
    u.path = '';
  } else if (v=str.starts(u.path, '/--dir/')){
    // a directory of the filelist, by a tree walk, from one source:
    // --dir/<source index>/<page><dir>
    get_files = true;
    let [i, page] = v.rest.split('/');
    u.page = +page;
    u.dir = v.rest.slice(i.length+page.length+1);
    u.dir_hash = opt?.dir_hash;
    src = [reg.cdn.src_files[i]];
    u.submod = '';
    u.path = '';
  } else if (v=str.starts(u.path, '/--files/')){
    // the full filelist, from one source: --files/<source index>/<page>
    get_files = true;
    let [i, page] = v.rest.split('/');
    u.page = +page;
    src = [reg.cdn.src_files[i]];
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
      fl = await reg_filelist_has({log, lfile, opt});
      if (fl===false){
        // not in the filelist: does not exist, for sure and forever
        reg.not_exist = reg.not_exist_perm = true;
        return reg;
      }
    }
  }
  let ret;
  // the content of a perm lfile is hashed, and kept in the hash table
  let is_content = perm && !get_ver && !get_files;
  // a file of this hash was already fetched, under another lfile: from the
  // url it was fetched from
  let h = is_content && fl && await reg_hash_get(fl);
  if (h){
    ret = await reg_http_get({log, url: h.url, cache: 'force-cache',
      retry: true});
    if (ret.blob){
      reg.url = h.url;
      reg.hash_lfile = h.lfile;
      src = [];
    }
    else
      ret = undefined;
  }
  let now = Date.now();
  src = src.toSorted((a, b)=>(a.fail?.tm||0) - (b.fail?.tm||0)).filter(_src=>{
    if (_src.fail && _src.fail.tm+3000>now)
      return;
    if (_src.must_exist && !opt?.must_exist)
      return;
    if (!_src.url)
      return;
    return true;
  });
  for (let [i, _src] of OE(src)){
    let url_fn = _src.url;
    let url = url_fn(u);
    reg.url = url;
    reg.src_ver = _src;
    if (perm && get_files)
      ret = await reg_http_get({log, url, cache: 'force-cache', retry: true});
    else if (get_ver && opt?.no_cache)
      ret = await reg_http_get({log, url, cache: 'no-cache'});
    else
      ret = await reg_http_get({log, url});
    if (ret.blob) // fetch OK
      break;
    if (ret.not_exist || ret.status && ret.status==_src.not_exist_status){
      reg.not_exist = true;
      return reg;
    }
    assert(ret.fail_cdn);
    cwarn('cdn failed '+_src.name+'. '+
      'switching cdn '+(src[+i+1]?.name || 'all cdns failed'));
    _src.fail = {url, err: ret.err, tm: Date.now()};
  }
  // versions: the sources failed. the last answer that the browser has
  // stored, however old
  for (let _src of !ret?.blob && get_ver ? src : []){
    let url = _src.url(u);
    let stale = await reg_http_get({log, url, cache: 'force-cache'});
    if (!stale.blob)
      continue;
    cwarn('reg '+lfile+': '+_src.name+' failed, using its stored answer');
    ret = stale;
    reg.url = url;
    reg.src_ver = _src;
    reg.stale = true;
    break;
  }
  if (!(reg.blob = ret?.blob)){
    reg.err = ret?.err || 'all cdns failed';
    return reg;
  }
  if (opt?.ctype)
    reg.ctype = ret.ctype;
  if (is_content)
    await reg_hash_set(reg, fl);
  D && clog('fetch OK '+lfile);
  return reg;
}); }

