// from code.esm.sh
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './app.tsx';
// set favicon
let link = document.createElement('link');
link.rel = 'icon';
link.href = '/favicon.ico';
document.head.appendChild(link);
// add stylesheet
link = document.createElement('link');
link.rel = 'stylesheet';
link.href = import.meta.resolve('/style.css');
document.head.appendChild(link);
// start app
let _root = document.body.appendChild(document.createElement('div'));
let root = createRoot(_root);
root.render(<App />);
