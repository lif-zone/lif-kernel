import util from './util.js';
import lif from './boot.js';
let {OF, html_elm} = util;

let webapp_index = {
  '': '*demo_index', // special handling for built-in demo_index
  'basic': '.git/github/xderry/lif-os@main/lif-basic//main.tsx',
  'basic-npm': 'lif-basic@1.3.0/main.tsx',
  'basic-local': '/lif-basic//main.tsx',
  'play': '.git/github/xderry/lif-os@main/lif-basic//play.html',
  'play-npm': 'lif-basic@1.3.0/play.html',
  'play-local': '/lif-basic//play.html',
  'play2': '.git/github/xderry/lif-os@main/lif-basic//play2.tsx',
  'play2-npm': 'lif-basic@1.3.0/play2.tsx',
  'play2-local': '/lif-basic//play2.tsx',
  'play3': '.git/github/xderry/lif-os@main/lif-basic//play3.js',
  'play3-npm': 'lif-basic@1.3.0/play3.js',
  'play3-local': '/lif-basic//play3.js',
  'play4': '.git/github/xderry/lif-os@main/lif-basic//play4.html',
  'play4-npm': 'lif-basic@1.3.0/play4.html',
  'play4-local': '/lif-basic//play4.html',
  'os': '.git/github/xderry/lif-os@main/lif-os-boot/main.tsx',
  'os-local': '/lif-os//lif-os-boot/main.tsx',
  'lif-coin': '.git/github/xderry/lif-coin@latest/scripts/index.html',
  'lif-coin-local': '/lif-coin//scripts/index.html',
};

function demo_index(){
  let body = document.querySelector('body');
  for (let [k, v] of OF(webapp_index)){
    let p = html_elm('p');
    let e = html_elm('a', {href: '/?'+v});
    e.innerText = k;
    p.appendChild(e);
    body.appendChild(p);
  }
}

let webapp_default = ()=>{
  let q = new URLSearchParams(location.search);
  let e = [...q.entries()][0];
  let webapp, v;
  if (e && e[0] && !e[1])
    webapp = e[0];
  if (v=q.get('webapp'))
    webapp = v;
  if (v=webapp_index[webapp||''])
    webapp = v;
  if (webapp)
    return webapp;
};

async function life(){
  let webapp = webapp_default();
  if (webapp=='*demo_index')
    return demo_index();
  return await lif.boot.boot_app({lif: {webapp}});
}

export default life;
