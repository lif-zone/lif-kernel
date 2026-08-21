let lif = globalThis.$lif;

function html_elm_frag(html){
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.children; // returns HTMLCollection
}

async function input_webapp(){
  let body = document.querySelector('body');
  const e = html_elm_frag(`
    <h1>Enter LIF site: <input></h1>
    <h2>
      git example: git://github.com/lif-zone/lif-basic
      npm example: npm:lif-basic@1.3.0
    </h2>
  `);
  for (let c; c = e[0];)
    body.appendChild(c);
}

let clean_url = false;
async function tmp_webapp_resolve(){
  let q = new URLSearchParams(location.search);
  let v, webapp;
  let ls = localStorage.getItem('tmp_webapp');
  let qs = q.get('webapp');
  if (qs){
    if (ls && qs!=ls)
      console.warn('changing webapp '+ls+' -> '+v);
    webapp = qs;
    localStorage.setItem('tmp_webapp', webapp);
    if (clean_url){
      q.delete('webapp');
      let _qs = ''+q;
      if (_qs=='?')
        _qs = '';
      window.location = location.origin+location.pathname+_qs+location.hash;
      return;
    }
  } else if (ls)
    webapp = ls;
  if (webapp)
    return await lif.boot.boot_app({lif: {webapp}});
  input_webapp();
}
await tmp_webapp_resolve();

