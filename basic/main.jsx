// test TEST 3
import React from 'react';
import ReactDOM from 'react-dom/client';
import confetti from 'canvas-confetti';

export const App = ()=>{
  function onMouseMove(e){
    confetti({
      particleCount: 5,
      origin: {
        x: e.pageX / window.innerWidth,
        y: (e.pageY + 20) / window.innerHeight,
      }
    });
  }
  return (
    <div onMouseMove={onMouseMove}>
      <h1>Hola Life!</h1>
      <p><img src="/favicon.ico" /></p>
      <p>Say ¡Hi! to forever apps - apps that LIF forever</p>
    </div>
  );
};

// add stylesheet
let link = document.createElement('link');
link.rel = 'stylesheet';
link.href = import.meta.resolve('./style.css');
document.head.appendChild(link);
// start app
let _root = document.body.appendChild(document.createElement('div'));
let root = ReactDOM.createRoot(_root);
root.render(<App />);
