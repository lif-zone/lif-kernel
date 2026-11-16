import process from 'process';
import {fileURLToPath} from 'url';

export function node_is_main(mod_self){
  return path.resolve(process.argv[1])==fileURLToPath(mod_self);
}

