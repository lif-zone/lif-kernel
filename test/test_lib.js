import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import etask from 'lif-kernel/etask';
const SEC = 1000;

export async function browser_open(){
  let browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // '--user-data-dir=/tmp/puppeteer-fresh-profile'
  });
  return browser;
}
export async function browser_test({url, search, browser, inactive_stall}){
  let page = await browser.newPage();
  let errors = [];
  let last_activity = Date.now();
  inactive_stall ??= 10*SEC;
  const bump = ()=>{ last_activity = Date.now(); };
  page.on('pageerror', err=>{
    console.error('[pageerror]', err.message);
    errors.push(err.message);
  });
  page.on('console', msg=>{
    bump();
    let type = msg.type();
    if (type=='error'||type=='warning')
      console.error('[con.'+type+']', msg.text());
    else
      console.log('[con.'+type+']', msg.text());
  });
  page.on('requestfailed', req=>{
    console.error('[reqfail]', req.url(), req.failure()?.errorText);
  });
  page.on('response', res=>{
    bump();
    if (res.status()>=400)
      console.error('[res:'+res.status()+']', res.url());
  });
  let res = await page.goto(url, {waitUntil: 'domcontentloaded'});
  assert.equal(res.status(), 200);
  await page.evaluate(()=>console.log(navigator.userAgent));
  // The kernel installs a ServiceWorker then reloads — wait for that navigation
  await page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 15*SEC})
    .catch(()=>{}); // optional: may not happen if SW already installed
  console.log('[domcontentloaded]');
  last_activity = Date.now(); // reset after potential 15s waitForNavigation timeout
  // Poll until App renders; fail if no console log for 10s (hang detection)
  while (true){
    await etask.sleep(500);
    let found = await page.evaluate(search=>{
      return [...document.querySelectorAll('div')].some(
        el=>el.textContent.includes(search));
    }, search);
    if (found)
      break;
    let inactive = Date.now()-last_activity;
    if (inactive_stall && inactive>inactive_stall){
      throw new Error('hang: no console/network activity for '
        +Math.round(inactive/SEC)+'s');
    }
  }
}

export function server_open({cmd, search, cwd}){ return etask(function*(){
  let proc = spawn('node', cmd, {cwd, stdio: ['pipe', 'pipe', 'pipe']});
  let wait = etask.wait(SEC);
  proc.stdout.on('data', data=>{
    process.stdout.write(data);
    if ((''+data).includes(search))
      wait.return();
  });
  proc.stderr.on('data', data=>{
    process.stderr.write(data);
  });
  proc.on('error', err=>this.throw(err));
  proc.on('exit', code=>this.throw(Error('server exited early: '+code)));
  try {
    yield wait;
  } catch(err){
    console.error('server failed to start', err);
    proc.kill();
    throw err;
  }
  return proc;
}); }

export async function fetch_test({url, search}){
  let res = await fetch(url);
  assert.equal(res.status, 200);
  let body = await res.text();
  assert.ok(body.includes(search), `body should contain "${search}"`);
}

