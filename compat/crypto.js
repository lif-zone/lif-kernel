// LIF Residential Gateway: a Hypernet between residences.
// Zion Overlay Network. LICENSE_CODE JPL - JEM Jungo Public License
//
// The 'crypto' module of nodejs, for the browser: only its webcrypto, which
// is the crypto of the browser.
// import {webcrypto} from 'crypto';
export const webcrypto = globalThis.crypto;
export default {webcrypto};
