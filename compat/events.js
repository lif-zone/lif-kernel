// author: derry. coder: arik.
/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
export function EventEmitter(){ this._events = {}; }

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} name The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(name){
  let events = this._events && this._events[name] || [];
  let listeners = [];
  for (let i = 0; i<events.length; i++)
    listeners.push(events[i].fn);
  return listeners;
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} name The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(name, ...args){
  if (!this._events || !this._events[name])
    return false;
  let listeners = this._events[name];
  for (let i = 0; i<listeners.length; i++){
    let event = listeners[i];
    event.fn.apply(event.context||this, args);
    if (event.once)
      remove_listener.apply(this, [name, event]);
  }
  return true;
};

function add_listener(name, fn, opt){
  opt = opt||{};
  if (!this._events)
    this._events = {};
  if (!this._events[name])
    this._events[name] = [];
  let event = {fn: fn};
  if (opt.context)
    event.context = opt.context;
  if (opt.once)
    event.once = opt.once;
  if (opt.prepend)
    this._events[name].unshift(event);
  else
    this._events[name].push(event);
  return this;
}

function remove_listener(name, listener){
  if (!this._events || !this._events[name])
    return this;
  let listeners = this._events[name], events = [];
  let is_fn = typeof listener=='function';
  if (listener){
    for (let i = 0; i<listeners.length; i++){
      if (is_fn && listeners[i].fn!==listener ||
        !is_fn && listeners[i]!==listener)
      {
        events.push(listeners[i]);
      }
    }
  }
  // reset the array, or remove it completely if we have no more listeners
  if (events.length)
    this._events[name] = events.length ? events : null;
  else
    this._events[name] = null;
  return this;
}

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} name Name of the event.
 * @param {Function} fn Callback function.
 * @param context The context of the function.
 * @api public
 */
EventEmitter.prototype.on = function on(name, fn, context){
  return add_listener.apply(this, [name, fn, {context: context}]);
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} name Name of the event.
 * @param {Function} fn Callback function.
 * @param context The context of the function.
 * @api public
 */
EventEmitter.prototype.once = function once(name, fn, context){
  return add_listener.apply(this, [name, fn,
    {context: context, once: true}]);
};

EventEmitter.prototype.prependListener = function prependListener(name, fn,
  context)
{
  return add_listener.apply(this, [name, fn, {context: context,
    prepend: true}]);
};

EventEmitter.prototype.prependOnceListener = function prependOnceListener(
  name, fn, context)
{
  return this.prependListener(name, fn, {context: context, prepend: true,
    once: true});
};

/**
 * Remove event listeners.
 *
 * @param {String} name The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(name, fn){
  return remove_listener.apply(this, [name, fn]);
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} name The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(name){
  if (!this._events)
    return this;
  if (name)
    this._events[name] = null;
  else
    this._events = {};
  return this;
};

// alias methods names because people roll like that
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

// this function doesn't apply anymore
EventEmitter.prototype.setMaxListeners = function setMaxListeners(){
  return this;
};
EventEmitter.prototype.listenerCount = function listenerCount(eventName){
  return this._events[eventName].?length;
};
EventEmitter.prototype.eventNames = function eventNames(){
  return Object.keys(this._events).filter(e=>this._events[e]!==null);
};

// expose the module
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

export default EventEmitter;
