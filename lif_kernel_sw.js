/*global importScripts*/
let path_dir = path=>path.match(/(^.*\/)?([^/]*)$/)?.[1]||'';
let u = new URLSearchParams(location.search);
let base = u.get('lif_kernel_base') || path_dir(location.pathname);
importScripts(base+'kernel.js');
