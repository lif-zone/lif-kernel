// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License

// TLS made at the client, over a byte pipe that is not trusted (a tcp_sock of
// net/tcpip.js: the out node only makes the TCP connection, and sees
// encrypted bytes only). The server certificate is verified here.
// Loaded by net/tcpip.js with import(), only when a secure TLS connection is
// asked for: this file, and the TLS library it loads, are not needed
// otherwise.
import {makeTLSClient, setCryptoImplementation, loadX509FromDer,
  loadX509FromPem} from '@reclaimprotocol/tls';
import {webcryptoCrypto} from '@reclaimprotocol/tls/webcrypto';

// The library has two crypto implementations. Its pure js one (0.1.5) fails
// on P-384 signatures and takes its random from Math.random(), so the
// WebCrypto one is used, in the browser and in nodejs. It does
// import {webcrypto} from 'crypto': in the browser 'crypto' must give
// {webcrypto: globalThis.crypto} (compat/crypto.js).
setCryptoImplementation(webcryptoCrypto);

// errors reach the caller by on_end(): nothing is printed
const logger = {info(){}, debug(){}, trace(){}, warn(){}, error(){}};

const OID_BASIC_CONSTRAINTS = '2.5.29.19';

// The library checks the names, the dates and the signatures of the chain,
// up to a root of the Mozilla list, but not that a certificate that signs
// another is allowed to: without that, whoever has any valid certificate
// could sign one for any host. So every certificate after the first (the
// one of the host) must be a CA.
function cert_is_ca(cert){
  let ext = cert.internal.getExtension(OID_BASIC_CONSTRAINTS);
  return !!ext?.ca;
}

function cert_name(cert){
  try {
    return cert.getSubjectField('CN')[0]||'?';
  } catch(err){
    return '?';
  }
}

async function fetch_bytes(url){
  let res = await fetch(url);
  if (!res.ok)
    throw Error('failed to fetch certificate '+url+': '+res.status);
  return new Uint8Array(await res.arrayBuffer());
}

// a missing certificate of the chain, fetched from the url written in the
// certificate it signed. It may come over an untrusted path: the library
// verifies it as any other certificate of the chain.
async function issuer_fetch(url, cert_fetch){
  let bytes = await cert_fetch(url);
  let cert = loadX509FromDer(bytes);
  if (!cert_is_ca(cert))
    throw Error('certificate '+cert_name(cert)+' is not a CA');
  return bytes;
}

// TLS client over a byte pipe.
// opt.host: the name of the server: sent to it (SNI), and the name its
//   certificate must be for
// opt.verify: false accepts any certificate (default true)
// opt.write(bytes): send bytes to the server
// opt.on_secure(info): the handshake is done. info: {version, cipherSuite}
// opt.on_data(bytes): decrypted bytes from the server
// opt.on_end(err): TLS ended. err: why (undefined: the server closed it)
// opt.cert_fetch(url): fetch a missing certificate of the chain. Returns its
//   bytes. default: fetch()
// opt.root_cas: [pem, ...] root certificates to trust, in addition to the
//   Mozilla list (a private CA)
// Returns {start(), recv(bytes), send(bytes), end(), info()}
export function tls_client(opt){
  let {host, verify=true, write, on_secure, on_data, on_end,
    cert_fetch=fetch_bytes, root_cas} = opt;
  let ended = false;
  // records are numbered: one write at a time
  let send_queue = Promise.resolve();
  // The library ends a connection only after the records it already has
  // were handled: a handshake could still finish after an error. So the end
  // is taken here at once, and nothing passes after it.
  let fail = err=>{
    if (ended)
      return;
    ended = true;
    on_end?.(err);
    if (!tls.hasEnded())
      tls.end(err).catch(()=>{});
  };
  let tls = makeTLSClient({
    host,
    verifyServerCertificate: verify,
    rootCAs: root_cas?.map(pem=>loadX509FromPem(pem)),
    logger,
    fetchCertificateBytes: url=>issuer_fetch(url, cert_fetch),
    write({header, content}){
      if (ended)
        return;
      let buf = new Uint8Array(header.length+content.length);
      buf.set(header);
      buf.set(content, header.length);
      write(buf);
    },
    // called after the library verified the chain
    onRecvCertificates({certificates}){
      if (!verify)
        return;
      for (let i=1; i<certificates.length; i++){
        if (cert_is_ca(certificates[i]))
          continue;
        let err = Error('certificate '+cert_name(certificates[i])+' of '+
          host+' is not a CA');
        fail(err);
        throw err;
      }
    },
    onHandshake(){
      if (!ended)
        on_secure?.(tls.getMetadata());
    },
    onApplicationData(data){
      if (!ended)
        on_data?.(data);
    },
    onTlsEnd: err=>fail(err),
  });
  return {
    // send the first message of the handshake
    start(){
      tls.startHandshake().catch(fail);
    },
    // bytes from the server
    recv(bytes){
      if (ended)
        return;
      tls.handleReceivedBytes(bytes).catch(fail);
    },
    // bytes to the server: after on_secure() only. Returns a promise that
    // ends when they were written
    send(bytes){
      return send_queue = send_queue.then(()=>{
        if (!ended)
          return tls.write(bytes);
      }).catch(fail);
    },
    end(){
      fail();
    },
    info: ()=>tls.getMetadata(),
  };
}
