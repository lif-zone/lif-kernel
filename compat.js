// LICENSE_CODE JPL node/browser compatibility

export const xerr = function(){ console.log(...arguments); };
xerr.debug = function(){};
xerr.is = function(){ return false; };
xerr.L = {DEBUG: 0};

export const is_node = globalThis.process?.versions?.node!==undefined;

export const node = {};
if (is_node)
  node.assert = (await import('assert')).default;

export const process = is_node ? globalThis.process : {
  nextTick: function(fn){ setTimeout(fn, 0); },
  env: {},
};

export const assert = function(val, msg){
  if (val)
    return;
  console.error(msg);
  debugger; // eslint-disable-line no-debugger
};

