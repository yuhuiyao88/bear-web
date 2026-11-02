import { lexical,safeURL } from './domain.js';
const text=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function cleanPost(raw,now=Date.now()){
 if(!raw||!['knowledge','need'].includes(raw.kind))throw new Error('Choose knowledge or need.');
 const title=text(raw.title,160),author=text(raw.author,100),details=text(raw.details,5000);
 if(title.length<5||author.length<2||details.length<20)throw new Error('Add your name, a title (5+ characters), and details (20+ characters).');
 const link=text(raw.link,500),scholarURL=text(raw.scholarURL,500);
 if(link&&!safeURL(link))throw new Error('The resource/contact link must use HTTPS.');
 if(scholarURL){const u=new URL(scholarURL);if(u.protocol!=='https:'||u.hostname!=='scholar.google.com'||u.pathname!=='/citations'||!u.searchParams.get('user')||u.username||u.password)throw new Error('Use a Google Scholar profile link with a user identifier.');}
 const days=[30,90,180].includes(Number(raw.days))?Number(raw.days):90;
 const publications=(Array.isArray(raw.publications)?raw.publications:[]).slice(0,50).map((p,i)=>({id:`export-${i}`,title:text(p.title,500),authors:text(p.authors,700),year:text(String(p.year||''),4),source:'Member-supplied Google Scholar CSV export; not independently verified',evidenceStatus:'metadata_only'})).filter(p=>p.title.length>4);
 return {kind:raw.kind,title,author,details,tags:(Array.isArray(raw.tags)?raw.tags:[]).map(x=>text(x,50)).filter(Boolean).slice(0,12),link,scholarURL,publications,status:raw.status==='closed'?'closed':'open',aiConsent:raw.aiConsent===true,days,expiresAt:new Date(now+days*86400000).toISOString(),identityStatus:'self_reported_unverified'};
}
export function visiblePost(record){const {editHash,...post}=record;return post;}
export function activePost(p,now=Date.now()){return p.status==='open'&&Date.parse(p.expiresAt)>now;}
export function matchablePosts(posts,query,now=Date.now()){
 return posts.filter(p=>p.aiConsent===true&&activePost(p,now)).map(p=>({...p,text:`${p.details} ${(p.publications||[]).map(x=>x.title).join(' ')}`})).map(p=>({p,score:lexical(query,p)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.p.updatedAt.localeCompare(a.p.updatedAt)).slice(0,8).map(x=>x.p);
}
export function collaborationEvidence(records,query){
 const pubs=records.filter(r=>r.kind==='publication');
 return records.filter(r=>r.kind==='faculty').map(f=>{const evidence=pubs.filter(p=>p.facultyId===f.id).sort((a,b)=>lexical(query,b)-lexical(query,a)).slice(0,5);return {...f,publications:evidence,matchScore:lexical(query,f)+Math.max(0,...evidence.map(p=>lexical(query,p)))};}).filter(f=>f.matchScore>0).sort((a,b)=>b.matchScore-a.matchScore).slice(0,8);
}
export async function hashKey(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
