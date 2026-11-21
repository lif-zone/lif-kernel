// LICENSE_CODE JPL "Loading… N" and fatal error, shown over the page
import {html_elm} from './util.js';

// Shows "Loading… N" over the page, until remove(). N is the number of
// files the kernel fetched since the call.
// opt.text: the text before the count. Default: 'Loading…'
// Returns ops: {elm, remove()}
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
  let ops = {
    elm,
    remove: function(){
      if (ops.removed)
        return;
      ops.removed = true;
      clearInterval(iv);
      elm.remove();
    },
  };
  return ops;
}

// Shows a fatal error in a box over the page, covering 90% of the window.
// The content of the page is not changed.
// Returns ops: {elm, remove()}, as load_progress() does.
// err: an Error (its message and stack are shown) or a text
// opt.title: default 'Error'
// opt.retry: function. If set, a Retry button calls it
// Usage:
//   try {
//     await import('./app.js');
//   } catch(err){
//     load_error(err, {title: 'Load Error'});
//   }
export function load_error(err, opt={}){
  let text = err instanceof Error ? err.message : ''+err;
  let stack = err?.stack;
  if (stack)
    text = stack.includes(text) ? stack : text+'\n'+stack;
  let elm = html_elm('div', {id: 'lif-error', style:
    'position:fixed;top:5%;left:5%;width:90%;height:90%;z-index:2147483647;'
    +'box-sizing:border-box;padding:24px;overflow:auto;background:#fff;'
    +'color:#222;border:1px solid #e74c3c;border-radius:8px;'
    +'box-shadow:0 4px 24px rgba(0,0,0,0.3);font-family:sans-serif'});
  let ops = {
    elm,
    remove: function(){
      if (ops.removed)
        return;
      ops.removed = true;
      elm.remove();
    },
  };
  let close = html_elm('div', {title: 'Close', style:
    'float:right;cursor:pointer;font-size:24px;line-height:24px;color:#888'});
  close.textContent = '×';
  close.onclick = ()=>ops.remove();
  let title = html_elm('div', {style: 'font-size:24px;color:#e74c3c'});
  title.textContent = opt.title||'Error';
  let pre = html_elm('pre', {style:
    'font-size:12px;white-space:pre-wrap;word-break:break-word'});
  pre.textContent = text;
  elm.appendChild(close);
  elm.appendChild(title);
  if (opt.retry){
    let retry = html_elm('button', {style:
      'margin-top:12px;padding:6px 16px;font-size:14px;cursor:pointer'});
    retry.textContent = '🔄 Retry';
    retry.onclick = ()=>opt.retry();
    elm.appendChild(retry);
  }
  elm.appendChild(pre);
  document.body.appendChild(elm);
  return ops;
}
