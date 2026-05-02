// from code.esm.sh
import React, {type MouseEvent} from 'react';
import confetti from 'canvas-confetti';

const App = () => {
  function onMouseMove(e: MouseEvent) {
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
      <h1>Hello Life!</h1>
      <p><img src="/favicon.ico" /></p>
      <p>Build forever apps</p>
    </div>
  );
};

export default App;
