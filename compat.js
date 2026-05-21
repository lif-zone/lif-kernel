// LICENSE_CODE JPL node/browser compatibility
export const xerr = function(){ console.log(...arguments); };
xerr.debug = function(){};
xerr.is = function(){ return false; };
xerr.L = {DEBUG: 0};

export const is_node = process?.versions?.node!==undefined; /*global process*/

export const node = {};
if (is_node)
  node.assert = (await import('assert')).default;

export const _process = {nextTick: function(fn){ setTimeout(fn, 0); }, env: {}};

export const assert = function(val, msg){
  if (val)
    return;
  console.error(msg);
  debugger; // eslint-disable-line no-debugger
};

