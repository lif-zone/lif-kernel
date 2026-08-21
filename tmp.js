let lif = globalThis.$lif;

async function tmp_webapp_resolve(){
  let q = new URLSearchParams(location.search);
  let v, webapp;
  let ls = localStorage.getItem('tmp_webapp');
  if (v=q.get('webapp')){
    if (ls)
      console.warn('changing webapp '+ls+' -> '+v);
    webapp = v;
    localStorage.setItem('tmp_webapp', webapp);
  } else if (ls)
    webapp = v;
  else
    console.error('ask user to enter webapp');
  if (!webapp)
    return;
  return await lif.boot.boot_app({lif: {webapp}});
}
await tmp_webapp_resolve();

