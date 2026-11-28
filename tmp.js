let lif = globalThis.$lif;

function html_elm_frag(html){
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.children; // returns HTMLCollection
}

async function input_webapp(){
  let body = document.querySelector('body');
  const e = html_elm_frag(`
    <h1>Enter LIF site: <input><button>GO</button></h1>
    <h2>
      git example: git://github.com/lif-zone/lif-basic<br>
      npm example: npm:lif-basic@1.3.0<br>
    </h2>
  `);
  for (let c; c = e[0];)
    body.appendChild(c);
  const input = body.querySelector('input');
  const btn = body.querySelector('button');
  const go = ()=>{
    const val = input.value.trim();
    if (!val)
      return;
    localStorage.setItem('tmp_webapp', val);
    window.location.reload();
  };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', e=>{ if (e.key=='Enter') go(); });
}

// This tmp domain is registered to another webapp than the one asked for
function webapp_conflict(cur, req){
  let body = document.body;
  let add = (tag, text)=>{
    let e = document.createElement(tag);
    e.textContent = text;
    body.appendChild(e);
    return e;
  };
  add('h1', 'This domain is registered to a different webapp');
  add('h2', 'Registered: '+cur);
  add('h2', 'Requested: '+req);
  add('button', 'Keep '+cur).onclick = ()=>{
    let q = new URLSearchParams(location.search);
    q.delete('webapp');
    let qs = ''+q;
    window.location = location.origin+location.pathname+(qs ? '?'+qs : '')
      +location.hash;
  };
  add('button', 'Change to '+req).onclick = ()=>{
    localStorage.setItem('tmp_webapp', req);
    window.location.reload();
  };
}

let clean_url = false;
async function tmp_webapp_resolve(){
  let q = new URLSearchParams(location.search);
  let v, webapp;
  let ls = localStorage.getItem('tmp_webapp');
  let qs = q.get('webapp');
  if (qs){
    if (ls && qs!=ls)
      return webapp_conflict(ls, qs);
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

