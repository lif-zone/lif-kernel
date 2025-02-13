// lif kernel service worker boot loader
// -------------------------------------
// How to install lif kernel:
// - put this file in website: http://site.com/lif_kernel_sw.js
// - in site.com site's /index.html 
//   <script>window.lif_boot_url="lif-app/pages/index_boot.js";</script>
//   <script type=module src=/lif-kernel/boot.js></script>

/*global importScripts*/
//importScripts('https://unpkg.com/lif-kernel@0.1.4/kernel.js'); // remote
importScripts('/lif-kernel/kernel.js'); // local dev
