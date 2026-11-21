// LICENSE_CODE JPL "Loading… N" while modules are fetched
import {html_elm} from './util.js';

// Shows "Loading… N" over the page, until remove(). N is the number of
// files the kernel fetched since the call.
// opt.text: the text before the count. Default: 'Loading…'
// Usage, around a long import:
//   let l = load_progress();
//   try {
//     await import('./big.js');
//   } finally {
//     l.remove();
//   }
export function load_progress(opt={}){
  let text = opt.text||'Loading…';
  let elm = html_elm('div', {id: 'lif-loader', style:
    'position:fixed;top:0;left:0;width:100%;height:100%;display:flex;'
    +'align-items:center;justify-content:center;font-family:sans-serif;'
    +'color:#888;font-size:14px'});
  let txt = document.createTextNode(text);
  elm.appendChild(txt);
  document.body.appendChild(elm);
  let last, diff;
  let iv = setInterval(async function(){
    let stats = await globalThis.$lif.boot.kernel_stats();
    let all = stats?.fetch?.all;
    if (all==null || all==last)
      return;
    if (last==null)
      diff = all;
    last = all;
    txt.textContent = text+' '+(all-diff);
  }, 200);
  return {
    elm,
    remove: function(){
      if (this.removed)
        return;
      this.removed = true;
      clearInterval(iv);
      elm.remove();
    },
  };
}
