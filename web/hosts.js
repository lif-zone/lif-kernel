// LICENSE_CODE ZON JPL JEM GPL

function qw(words){
  if (Array.isArray(words))
    return words;
  return words.split(/\s+/g).filter(w=>w);
}
function add_domains_hosts({ip, domains, hosts}){
  let ips = qw(ip);
  domains = qw(domains);
  hosts = qw(hosts);
  for (let ip of ips){
    let _host = host[ip] ||= {domains: {}};
    for (let d of domains){
      let _d = _host.domains[d] = {
        ssl: true,
        soa: {name: d, primary: 'ns1.'+d, admin: 'admin.'+d},
        ip: [ip],
        ns: ['ns1.'+d, 'ns2.'+d],
        hosts: {},
      };
      for (let h of hosts)
        _d.hosts[h] = {ip: [ip]};
    }
  }
}

const host = {
  '1.2.3.4': { // example hosting - 
    domains: {
      'my-domain.com': {
        soa: {name: 'my-domain.com', primary: 'ns1.my-domain.com',
          admin: 'admin.my-domain.com'},
        ssl: true,
        ip: ['1.2.3.4'],
        ns: ['ns1.my-domain.com', 'ns2.my-domain.com'],
        hosts: {ns1: {ip: ['1.2.3.4']}, ns2: {ip: ['1.2.3.4']}},
      },
    },
  },
};
// to purchase: web.city 600$/y, site.space 3.5K, web.center, web.site 1M
//   lif.net 12K, theguide.org 3.5K, lif.io 6.5K, lif.live 300/y
//   holacoin.com 5K holawallet.com 3.5K net.center 9.5K
// ns1.lif.site ns2.lif.site 50.7.177.142
add_domains_hosts({ip: '50.7.177.142',
  domains: `lif.site lifnet.net lifnet.com pub.site lifcoin.com site.center
    lifsite.com lifnet.io lifcoin.org`,
  hosts: 'lifcoin-node-1 ns1 ns2',
});
// ns1.zon.life ns2.zon.life 216.227.189.196
add_domains_hosts({ip: '216.227.189.196',
  domains: 'zon.life lif-coin.com bright.life',
  hosts: 'lifcoin-node-1 ns1 ns2',
});
add_domains_hosts({ip: '50.7.176.34',
  domains: 'arik.center venao.center',
  hosts: 'ns1 ns2',
});
add_domains_hosts({ip: '216.227.189.4',
  domains: [],
  hosts: [],
});

export function hosts_get(ip){
  return host[ip];
}
