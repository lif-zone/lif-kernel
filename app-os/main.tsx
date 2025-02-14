import React from 'react';
window.React = React;
console.log('os boot started');
import {createRoot} from "react-dom";
let App = (await import('pages/_app.tsx')).default;
//import App from "./app.tsx";
const root = createRoot(document.getElementById("root"));
root.render(<App />);
console.log('os_boot complete');
export default App;

