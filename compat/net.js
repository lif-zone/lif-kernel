import {tcp_sock} from '../net/tcpip.js';

export const Socket = tcp_sock;

export function connect(...args){
  return new tcp_sock().connect(...args);
}

export const createConnection = connect;

export function createServer(){
  throw Error('net.createServer is not supported in the browser');
}

export function Server(){
  throw Error('net.Server is not supported in the browser');
}

const ip4_re = /^(\d{1,3}\.){3}\d{1,3}$/;
export function isIPv4(host){ return ip4_re.test(host); }
export function isIPv6(host){ return typeof host=='string' && host.includes(':'); }
export function isIP(host){ return isIPv4(host) ? 4 : isIPv6(host) ? 6 : 0; }

export default {Socket, connect, createConnection, createServer, Server,
  isIP, isIPv4, isIPv6};
