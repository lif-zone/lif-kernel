// LICENSE_CODE ZON JPL JEM GPL

function add_domains_hosts({ip, domains, hosts}){
  let ips = Array.isArray(ip) ? ip : [ip];
  for (let ip of ips){
    let _host = host[ip] ||= {domains: {}, hosts: {}};
    for (let d of domains)
      _host.domains[d] = {ssl: true, ip, ns: ['ns1', 'ns2']};
    for (let h of hosts)
      _host.hosts[h] = {ip};
  }
}

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
};
// to purchase: web.city 600$/y, site.space 3.5K, web.center, web.site 1M
//   lif.net 12K, theguide.org 3.5K, lif.io 6.5K, lif.live 300/y
//   holacoin.com 5K holawallet.com 3.5K net.center 9.5K
// ns1.lif.site ns2.lif.site 50.7.177.142
add_domains_hosts({ip: ['50.7.176.34', '50.7.177.142'],
  domains: [
    'lif.site', 'lifnet.net', 'lifnet.com',
    'pub.site', 'lifcoin.com', 'site.center',
    'lifsite.com', 'lifnet.io',
    'lifcoin.org', 'arik.center', 'venao.center',
  ],
  hosts: ['lifcoin-node-1', 'ns1', 'ns2'],
});
// ns1.zon.life ns2.zon.life 216.227.189.196
add_domains_hosts({ip: ['216.227.189.4', '216.227.189.196 '],
  domains: ['zon.life', 'lif-coin.com', 'bright.life'],
  hosts: ['lifcoin-node-1', 'ns1', 'ns2'],
});

export function hosts_get(ip){
  return host[ip];
}
