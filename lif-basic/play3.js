import Keyboard from 'simple-keyboard@3.8.53';
function playground(){
  let play = 0;
  if (play){
    let {create} = await import('./play3.js');
    let m = await import('./fetch_tr.js');
    let p = create();
    m.init_ev(p.ev);
  }
}
let play = {};
function onChange(input){
  //document.querySelector(".input").value = input;
  //console.log("Input changed", input);
}

function onKeyPress(button){
  //console.log("Button pressed", button);
  play.ev.onkey?.(button);
}
addEventListener('keypress', e=>{
  //console.log("Key pressed", e.key);
  play.ev.onkey?.(e.key);
});

export let create = ()=>{
  // remove existing ./style.css that conflicts
  let link = document.querySelector("link[href='./style.css']");
  link?.remove();
  // add style
  link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/.lif/npm/simple-keyboard@3.8.53/build/css/index.css';
  document.head.appendChild(link);
  let d = document.createElement('div');
  document.body.appendChild(d);
  d.innerHTML = `
    <div class=simple-keyboard></div>
    <input class=input style="width:100%" />
    <pre id=msg style="width:100%"></pre>
  `;
  play.keyboard = new Keyboard.SimpleKeyboard({
    onChange: input => onChange(input),
    onKeyPress: button => onKeyPress(button)
  });
  play.ev = {
    onkey: null,
    getv: ()=>document.querySelector('.input').value,
    log: msg=>document.querySelector('#msg').textContent = msg,
  };
  return play;
};

