import process from 'process';
import path from 'path';
import {fileURLToPath} from 'url';

export function node_is_main(mod_self){
  if (!process.argv[1]) // eg. node -e
    return false;
  return path.resolve(process.argv[1])==fileURLToPath(mod_self);
}

