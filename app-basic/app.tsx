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
      <h1>Hello React! ⚛️</h1>
      <p>Building user interfaces.</p>
    </div>
  );
};

export default App;
