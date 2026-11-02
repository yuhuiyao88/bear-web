export async function appURL(){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;if(!account||!token)throw new Error('Cloudflare credentials missing');
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`Cloudflare account lookup failed (${r.status})`);const d=await r.json();const sub=d.result?.subdomain;if(!d.success||!sub||!/^[-a-z0-9]+$/.test(sub))throw new Error('Cloudflare subdomain unavailable');return `https://cmph-spark.${sub}.workers.dev`;
}
if(process.argv[1]?.endsWith('/url.mjs'))console.log(await appURL());
