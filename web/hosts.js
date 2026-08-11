// LICENSE_CODE ZON JPL JEM GPL

const host = {
  '1.2.3.4': { // example hosting - 
    hosts: {
      'ns1': {ip: '1.2.3.4'},
      'ns2': {ip: '1.2.3.4'},
    },
    domains: {
      'my-domain.com': {ssl: true, ip: '1.2.3.4', ns: ['ns1', 'ns2']},
    }
  },
  // to purchase: web.city 600$/y, site.space 3.5K, web.center, web.site 1M
  //   lif.net 12K, theguide.org 3.5K, lif.io 6.5K, lif.live 300/y
  //   holacoin.com 5K holawallet.com 3.5K net.center 9.5K
  '50.7.176.34': {
    domains: {
      'lifnet.com': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'pub.site': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lifcoin.com': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'site.center': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lifsite.com': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lif.site': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lifnet.io': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lifnet.net': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'lifcoin.org': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'arik.center': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
      'venao.center': {ssl: true, ip: '50.7.176.34', ns: ['ns1', 'ns2']},
    },
    hosts: {
      'lifcoin-node-1': {ip: '50.7.176.34'},
      'ns1': {ip: '50.7.176.34'},
      'ns2': {ip: '50.7.176.34'},
    },
  },
  '216.227.189.4': {
    domains: {
      'zon.life': {ssl: true, ip: '216.227.189.4', ns: ['ns1', 'ns2']},
      'lif-coin.com': {ssl: true, ip: '216.227.189.4', ns: ['ns1', 'ns2']},
      'bright.life': {ssl: true, ip: '216.227.189.4', ns: ['ns1', 'ns2']},
    },
    hosts: {
      'lifcoin-node-2': {ip: '216.227.189.4'},
      'ns1': {ip: '216.227.189.4'},
      'ns2': {ip: '216.227.189.4'},
    },
  }
};

export function hosts_get(ip){
  return host[ip];
}
