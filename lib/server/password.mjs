import {randomBytes,scrypt as derive,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(derive);
export async function hashPassword(password){if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Use a password of 12–256 characters.');const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `$scrypt$v1$32768$${salt}$${key.toString('hex')}`;}
export const validPasswordHash=value=>typeof value==='string'&&/^\$scrypt\$v1\$32768\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value);
export async function verifyPassword(password,encoded){if(!validPasswordHash(encoded)||typeof password!=='string'||password.length>256)return false;const pieces=encoded.split('$');const key=await scrypt(password,pieces[4],64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(key,Buffer.from(pieces[5],'hex'));}
