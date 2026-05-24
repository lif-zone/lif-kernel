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

let nextId = 1;
let callbacks = {};
export const setImmediate = is_node ? globalThis.setImmediate : function(fn, ...args){
  if (typeof fn!='function')
    throw new TypeError('setImmediate argument must be a function');
  var id = nextId++;
  callbacks[id] = true; // mark as active
  setTimeout(function(){
    if (!callbacks[id])
      return;
    delete callbacks[id];
    fn(...args);
  }, 0);
  return id;
};
export const clearImmediate = is_node ? globalThis.clearImmediate : function(id){
  if (id)
    delete callbacks[id];
};

const exports = {
  setImmediate,
  clearImmediate,
  assert,
  process,
}
export default exports;
