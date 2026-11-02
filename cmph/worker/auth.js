const enc=new TextEncoder();
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function unb64(str){return Uint8Array.from(atob(str.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export async function equal(a,b){if(typeof a!=='string'||typeof b!=='string'||!b)return false;const [x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));const u=new Uint8Array(x),v=new Uint8Array(y);return u.reduce((d,n,i)=>d|(n^v[i]),0)===0;}
async function key(secret){return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function session(secret,now=Date.now()){const payload=b64(enc.encode(JSON.stringify({exp:now+12*3600000,id:crypto.randomUUID()})));return `${payload}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(payload))))}`;}
export async function verify(token,secret,now=Date.now()){try{if(!secret||typeof token!=='string'||token.length>1500)return false;const [p,s,...rest]=token.split('.');if(rest.length)return false;if(!await crypto.subtle.verify('HMAC',await key(secret),unb64(s),enc.encode(p)))return false;const value=JSON.parse(new TextDecoder().decode(unb64(p)));return value.exp>now&&value.exp<=now+13*3600000&&typeof value.id==='string'?value:false;}catch{return false;}}
export function cookie(request){return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('cmph_session='))?.slice(13)||'';}
export function sameOrigin(request){return request.headers.get('Origin')===new URL(request.url).origin;}
