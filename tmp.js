import lif from './boot.js';

async function tmp_webapp_resolve(){
  let q = new URLSearchParams(location.search);
  let v, webapp;
  if (v=q.get('webapp')){
    webapp = v;
    localStorage.setItem('tmp_webapp', webapp);
  } else if (v=localStorage.getItem('tmp_webapp'))
    webapp = v;
  else
    console.log('ask user to enter webapp');
  if (!webapp)
    return;
  return await lif.boot.boot_app({lif: {webapp}});
}
await tmp_webapp_resolve();

