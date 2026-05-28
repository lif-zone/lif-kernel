// querystring-browser.js
const querystring = {
  parse: str=>{
    const params = new URLSearchParams(str);
    const obj = {};
    for (const [k, v] of params) {
      obj[k] = k in obj ? [].concat(obj[k], v) : v;
    }
    return obj;
  },
  stringify: (obj, sep = '&', eq = '=')=>{
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v])=>{
      if (Array.isArray(v))
        v.forEach(val=>params.append(k, val));
      else
        params.append(k, v);
    });
    return params.toString().replace(/&/g, sep).replace(/=/g, eq); // rare custom sep/eq
  },
};

export default querystring;
