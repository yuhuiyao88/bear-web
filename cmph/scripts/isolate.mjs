// One-time revocation only. Never use the old provider token for SPARK deployment/research.
const token=process.env.CLEANUP_CF_TOKEN,account=process.env.CLEANUP_CF_ACCOUNT;
if(!token||!account||!/^[a-f0-9]{32}$/i.test(account))throw new Error('Cleanup authentication missing');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/cmph-spark/secrets`;
const headers={Authorization:`Bearer ${token}`};
async function list(){const r=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||!data.success||!Array.isArray(data.result))throw new Error(`Could not verify SPARK secret names (HTTP ${r.status})`);return data.result.map(x=>x.name);}
if((await list()).includes('GEMINI_API_KEY')){const r=await fetch(endpoint+'/GEMINI_API_KEY',{method:'DELETE',headers,signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||!data.success)throw new Error(`SPARK secret removal failed (HTTP ${r.status})`);}
if((await list()).includes('GEMINI_API_KEY'))throw new Error('SPARK still has the Gemini secret');
console.log('Verified: cmph-spark has no GEMINI_API_KEY secret. BEAR was not modified.');
