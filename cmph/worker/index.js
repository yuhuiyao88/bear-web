import { cleanPost,matchablePosts,collaborationEvidence,hashKey } from './community.js';
import { Catalog } from './catalog.js';
import { equal,session,verify,cookie,sameOrigin } from './auth.js';
import { INSTITUTES,cleanBrief,lexical,words,matchesInstitute,expired,publicCard,validateModelOutput } from './domain.js';
import { searchNIH,loadOpportunity } from './sources.js';
import { generate,INTERVIEW,RECOMMEND } from './gemini.js';
export { Catalog };
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(data,status=200,more={})=>Response.json(data,{status,headers:{...HEADERS,...more}});
function store(env,path,data){return env.CATALOG.getByName('cmph').fetch(`https://catalog${path}`,{method:'POST',body:JSON.stringify(data||{}),headers:{'Content-Type':'application/json'}});}
async function body(request,max=50000){const reader=request.body?.getReader();if(!reader)throw new Error('Request body missing');let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Object.assign(new Error('Request too large. Shorten the text or import fewer publications.'),{status:413});}parts.push(value);}const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}const parsed=JSON.parse(new TextDecoder().decode(all));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Object.assign(new Error('Expected a JSON object.'),{status:400});return parsed;}
async function rate(env,key,limit,window){return (await (await store(env,'/rate',{key,limit,window})).json()).allowed;}
function selected(raw){return Array.isArray(raw)?raw.filter(x=>INSTITUTES.some(i=>i.id===x)).slice(0,25):[];}
async function retrieve(env,query,records,snapshot){
 const scored=new Map(records.map(r=>[r.id,lexical(query,r)]));let mode='keyword';
 if(env.AI&&env.VECTORIZE&&snapshot?.batch){try{const emb=await env.AI.run('@cf/baai/bge-base-en-v1.5',{text:[`Represent this sentence for searching relevant passages: ${query.slice(0,1500)}`]});const found=await env.VECTORIZE.query(emb.data[0],{topK:20,namespace:`${snapshot.corpus}-${snapshot.batch}`,returnMetadata:'all'});for(const m of found.matches||[]){const id=m.metadata?.recordId;if(scored.has(id))scored.set(id,scored.get(id)+m.score*5);}mode='hybrid';}catch{mode='keyword (vector search unavailable)';}}
 return {records:[...records].sort((a,b)=>scored.get(b.id)-scored.get(a.id)).filter(r=>scored.get(r.id)>0),mode};
}
export default {
 async fetch(request,env){try{
  const url=new URL(request.url),p=url.pathname;
  if(p==='/api/health')return json({status:'ok',application:'SPARK',version:'0.1.0'});
  if(p==='/robots.txt')return new Response('User-agent: *\nDisallow: /',{headers:{'Content-Type':'text/plain'}});
  if(p.startsWith('/api/admin/')){
   if(request.method!=='POST')return json({error:'Method not allowed'},405);
   if(!await equal(request.headers.get('Authorization')||'',`Bearer ${env.ADMIN_TOKEN||''}`)||!env.ADMIN_TOKEN)return json({error:'Unauthorized'},401);
   const data=await body(request,2500000);
   if(p==='/api/admin/board-delete'){const out=await store(env,'/board/write',{action:'delete',id:String(data.id),admin:true});return json(await out.json(),out.status);}
   if(p==='/api/admin/stage'||p==='/api/admin/publish'){const out=await store(env,p.endsWith('/stage')?'/stage':'/publish',data);return json(await out.json(),out.status);}
   if(p==='/api/admin/index'){
    if(!['nih','faculty'].includes(data.corpus)||!/^[-\w]{1,40}$/.test(data.batch)||!Array.isArray(data.records)||data.records.length>20)return json({error:'Invalid index request'},400);
    if(!env.AI||!env.VECTORIZE)return json({error:'Vector index not configured'},503);
    const embedding=await env.AI.run('@cf/baai/bge-base-en-v1.5',{text:data.records.map(r=>String(r.text||'').slice(0,6000))});
    const batch=data.records.map((r,i)=>({id:`${data.batch}:${r.id}`,values:embedding.data[i],namespace:`${data.corpus}-${data.batch}`,metadata:{recordId:r.id}}));
    await env.VECTORIZE.upsert(batch);return json({indexed:batch.length});
   }
   return json({error:'Not found'},404);
  }
  if(p==='/api/login'){
   if(request.method!=='POST'||!sameOrigin(request))return json({error:'Invalid request'},403);
   if(!env.ACCESS_CODE)return json({error:'Prototype access is not configured'},503);
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('CF-Connecting-IP')||'unknown'));const ip=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(!await rate(env,`login:${ip}`,12,15*60000))return json({error:'Too many attempts. Try again in 15 minutes.'},429);
   const data=await body(request,2000);if(!await equal(data.code,env.ACCESS_CODE))return json({error:'That invitation code is not valid.'},401);
   return json({ok:true},200,{'Set-Cookie':`cmph_session=${await session(env.ACCESS_CODE)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`});
  }
  if(['/login.html','/login.js','/styles.css'].includes(p)){const r=await env.ASSETS.fetch(request);return new Response(r.body,{status:r.status,headers:{...Object.fromEntries(r.headers),...HEADERS}});}
  const user=await verify(cookie(request),env.ACCESS_CODE);
  if(!user){if(p.startsWith('/api/'))return json({error:'Please sign in with your invitation code.'},401);return new Response(null,{status:302,headers:{Location:'/login.html',...HEADERS}});}
  if(request.method==='POST'&&!sameOrigin(request))return json({error:'Origin not allowed'},403);
  if(p==='/api/logout'&&request.method==='POST')return json({ok:true},200,{'Set-Cookie':'cmph_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  if(p==='/api/community'&&request.method==='GET'){const out=await store(env,'/board/read');return json(await out.json());}
  if(p==='/api/community'&&request.method==='POST'){
   if(!await rate(env,`board:${user.id}`,30,3600000))return json({error:'Board update limit reached. Try again later.'},429);
   const data=await body(request,350000),action=data.action;
   if(!['create','update','delete'].includes(action))return json({error:'Invalid board action'},400);
   if(action!=='create'&&(!/^post-[\w-]{36}$/.test(data.id||'')||typeof data.editKey!=='string'||!/^[-a-f0-9]{64}$/.test(data.editKey)))return json({error:'Enter this post’s edit key.'},400);
   let post;try{if(action!=='delete')post=cleanPost(data.post);if(post&&new TextEncoder().encode(JSON.stringify(post)).length>110000)return json({error:'This post is too large. Import fewer publications or shorten the details.'},413);}catch(e){return json({error:e.message},400);}
   const now=new Date().toISOString(),id=action==='create'?`post-${crypto.randomUUID()}`:data.id,editKey=action==='create'?Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''):data.editKey,editHash=await hashKey(editKey);
   const out=await store(env,'/board/write',{action,id,version:data.version,editHash,post:post?{...post,id,editHash,createdAt:now,updatedAt:now,version:1}:undefined});
   return json({...await out.json(),...(out.ok&&action==='create'?{editKey}:{})},out.status);
  }
  if(p==='/api/catalog'&&request.method==='GET'){const d=await (await store(env,'/read',{publicOnly:true})).json();return json({institutes:INSTITUTES,nih:{snapshot:d.nih.snapshot,records:d.nih.records.map(publicCard)},faculty:{snapshot:d.faculty.snapshot,records:d.faculty.records.map(publicCard)},model:env.GEMINI_MODEL,privacy:'Conversation stays in this tab and is sent to Gemini only when requested; no private project is saved on this server.'});}
  if(p==='/api/interview'&&request.method==='POST'){
   if(!await rate(env,`ai:${user.id}`,40,3600000))return json({error:'Hourly prototype limit reached. Please try later.'},429);
   const data=await body(request,500000);const messages=(Array.isArray(data.messages)?data.messages:[]).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-16).map(m=>({role:m.role,text:m.text.slice(0,5000)}));
   if(!messages.length)return json({error:'Please enter a research question.'},400);
   const out=await generate(env,INTERVIEW,{brief:cleanBrief(data.brief),messages,institutes:INSTITUTES});
   return json({message:String(out.message||'').slice(0,7000),questions:(Array.isArray(out.questions)?out.questions:[]).map(String).slice(0,3),brief:cleanBrief(out.brief),institutes:selected(out.institutes),ready:out.ready===true});
  }
  if(p==='/api/recommend'&&request.method==='POST'){
   if(!await rate(env,`ai:${user.id}`,40,3600000))return json({error:'Hourly prototype limit reached. Please try later.'},429);
   const data=await body(request,150000),brief=cleanBrief(data.brief),chosen=selected(data.institutes);if(brief.question.length<12)return json({error:'Add a research question before searching.'},400);
   const catalog=await (await store(env,'/read')).json(),query=Object.values(brief).join(' ');
   const nih=await retrieve(env,query,catalog.nih.records.filter(x=>x.kind==='opportunity'&&!expired(x)&&x.status==='posted'&&matchesInstitute(x,chosen)),catalog.nih.snapshot);
   const faculty=await retrieve(env,query,catalog.faculty.records.filter(x=>x.kind==='faculty'),catalog.faculty.snapshot);
   const publicEvidence=collaborationEvidence(catalog.faculty.records,query);
   const board=await (await store(env,'/board/read')).json(),sharedPosts=matchablePosts(board.posts,query);
   const checks=[],updates=new Map();let discovery='not_checked';
   const liveQueries=[words(brief.question).slice(0,4).join(' '),...chosen.slice(0,3).map(ic=>`${words(brief.question).slice(0,2).join(' ')} ${ic}`)];
   let searched=0;for(const keyword of liveQueries){try{const newHits=await searchNIH(keyword,0,12);searched++;
    for(const h of (newHits.oppHits||[]).slice(0,3)){if(!nih.records.some(x=>x.sourceId===String(h.id))&&!updates.has(`nih-${h.id}`)){try{const fresh=await loadOpportunity(h);if(matchesInstitute(fresh,chosen))updates.set(fresh.id,fresh);}catch{checks.push(`Could not retrieve new opportunity ${h.number}`);}}}
   }catch{checks.push(`Live NIH search failed for: ${keyword}`);}}
   discovery=searched?`Completed ${searched}/${liveQueries.length} bounded NIH searches (question plus up to 3 selected institute codes); inspected at most 12 hits and fetched at most 3 new details per query. Participation may be missing from keyword results. This is not exhaustive.`:'New-opportunity search unavailable; the monthly snapshot may miss recent calls.';
   const detailed=catalog.nih.snapshot?(await (await store(env,'/details',{corpus:'nih',batch:catalog.nih.snapshot.batch,ids:nih.records.slice(0,5).map(r=>r.id)})).json()).records:[];
   const verified=await Promise.all(nih.records.slice(0,5).map(async summary=>{const old=detailed.find(r=>r.id===summary.id)||summary;return (async()=>{try{const fresh=await loadOpportunity({id:old.sourceId},{full:true});return {...fresh,snapshotAt:catalog.nih.snapshot?.updatedAt,fullText:fresh.fullText||old.fullText,fullStatus:fresh.fullStatus==='unavailable'&&old.fullText?'snapshot_only':fresh.fullStatus,verification:'official_record_checked'};}catch{return {...old,verification:'live_check_failed'};}})();}));
   for(const r of verified)updates.set(r.id,r);
   const opportunities=[...updates.values()].filter(r=>r.status==='posted'&&!expired(r)&&matchesInstitute(r,chosen)).sort((a,b)=>lexical(query,b)-lexical(query,a)).slice(0,8);
   const facultyCandidates=[...new Map([...publicEvidence,...faculty.records].map(f=>[f.id,f])).values()].slice(0,8).map(f=>({...f,publications:publicEvidence.find(x=>x.id===f.id)?.publications||[]}));const sourceInput=opportunities.map(r=>({...r,fullText:undefined,text:`${r.text.slice(0,5000)}\n${(r.fullText||'').slice(0,14000)}`}));
   const out=validateModelOutput(await generate(env,RECOMMEND,{brief,institutes:chosen,opportunities:sourceInput,faculty:facultyCandidates.map(r=>({...r,text:r.text.slice(0,7000),publications:r.publications.map(p=>({...p,text:undefined}))})),sharedPosts,freshness:{nih:catalog.nih.snapshot?.updatedAt||null,faculty:catalog.faculty.snapshot?.updatedAt||null,discovery,checks}}),facultyCandidates,opportunities,sharedPosts);
   // Recheck consent/status after the model call, so withdrawn posts are not returned as matches.
   const currentBoard=await (await store(env,'/board/read')).json();
   const currentPosts=matchablePosts(currentBoard.posts,query).filter(p=>sharedPosts.some(old=>old.id===p.id&&old.version===p.version));
   if(sharedPosts.some(old=>!currentPosts.some(p=>p.id===old.id)))return json({error:'Shared posts changed while matching. Please search again to use the current permissions and content.'},409);
   return json({...out,sharedMatches:out.sharedMatches.filter(m=>currentPosts.some(p=>p.id===m.id)).map(m=>({...currentPosts.find(p=>p.id===m.id),...m})),opportunities:out.opportunities.map(o=>({...publicCard(opportunities.find(r=>r.id===o.id)),...o,eligibilityStatus:'requires_review'})),collaborators:out.collaborators.map(f=>({...publicCard(facultyCandidates.find(r=>r.id===f.id)),...f,evidence:[{id:f.id,title:'Official faculty biography',sourceURL:facultyCandidates.find(r=>r.id===f.id).sourceURL,evidenceStatus:'official_biography'},...(facultyCandidates.find(r=>r.id===f.id).publications||[]).map(publicCard)].filter(e=>f.evidenceIds.includes(e.id)),availability:'Not confirmed'})),freshness:{nih:catalog.nih.snapshot?.updatedAt||null,faculty:catalog.faculty.snapshot?.updatedAt||null,checkedAt:new Date().toISOString(),discovery,checks,retrieval:nih.mode},resources:catalog.faculty.records.filter(x=>x.kind==='resource').map(publicCard)});
  }
  if(p.startsWith('/api/'))return json({error:'Not found'},404);
  const r=await env.ASSETS.fetch(request);return new Response(r.body,{status:r.status,headers:{...Object.fromEntries(r.headers),...HEADERS}});
 }catch(e){return json({error:e instanceof SyntaxError?'Invalid JSON request':String(e.message||'Request failed')},e.status|| (e instanceof SyntaxError?400:502));}}
};
