// LICENSE_CODE JPL: micro EventEmitter for browser
export class EventEmitter extends EventTarget {
  on(eventName, listener){
    this.addEventListener(eventName, listener);
    return this;
  }
  once(eventName, listener){
    const wrapper = event=>{
      this.removeEventListener(eventName, wrapper);
      listener(event);
    };
    this.addEventListener(eventName, wrapper);
    return this;
  }
  off(eventName, listener){
    this.removeEventListener(eventName, listener);
    return this;
  }
  emit(eventName, ...args){
    const event = new CustomEvent(eventName, {
      detail: args.length==1 ? args[0] : args, // nice detail for single arg
    });
    return this.dispatchEvent(event);
  }
  // Optional: Node.js style alias
  addListener = this.on;
  removeListener = this.off;
}
EventEmitter.EventEmitter = EventEmitter;

export default EventEmitter;
