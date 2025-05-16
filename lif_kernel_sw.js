/*global importScripts*/
let u = new URLSearchParams(location.search);
let base = u.get('lif_kernel_base') || '/lif-kernel/';
importScripts(base+'kernel.js'); // https://unpkg.com/lif-kernel@1.1.3/kernel.js
