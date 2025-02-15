import React from 'react';
window.React = React;
import {Buffer} from 'buffer';
window.Buffer = Buffer;
console.log('os boot started');
import {createRoot} from "react-dom";
let App = (await import('pages/_app.tsx')).default;
//import App from "pages/_app.tsx";
const root = createRoot(document.getElementById("__next"));
root.render(<App />);
console.log('os_boot complete');
export default App;

