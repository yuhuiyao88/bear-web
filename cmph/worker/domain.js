export const INSTITUTES = [
 ['NCI','National Cancer Institute'],['NEI','National Eye Institute'],['NHLBI','National Heart, Lung, and Blood Institute'],['NHGRI','National Human Genome Research Institute'],['NIA','National Institute on Aging'],['NIAAA','National Institute on Alcohol Abuse and Alcoholism'],['NIAID','National Institute of Allergy and Infectious Diseases'],['NIAMS','National Institute of Arthritis and Musculoskeletal and Skin Diseases'],['NIBIB','National Institute of Biomedical Imaging and Bioengineering'],['NICHD','Eunice Kennedy Shriver National Institute of Child Health and Human Development'],['NIDCD','National Institute on Deafness and Other Communication Disorders'],['NIDCR','National Institute of Dental and Craniofacial Research'],['NIDDK','National Institute of Diabetes and Digestive and Kidney Diseases'],['NIDA','National Institute on Drug Abuse'],['NIEHS','National Institute of Environmental Health Sciences'],['NIGMS','National Institute of General Medical Sciences'],['NIMH','National Institute of Mental Health'],['NIMHD','National Institute on Minority Health and Health Disparities'],['NINDS','National Institute of Neurological Disorders and Stroke'],['NINR','National Institute of Nursing Research'],['NLM','National Library of Medicine'],['NCATS','National Center for Advancing Translational Sciences'],['NCCIH','National Center for Complementary and Integrative Health'],['FIC','Fogarty International Center'],['OD','Office of the Director']
].map(([id,name])=>({id,name}));
export const BRIEF_FIELDS = ['question','population','outcomes','design','data','preliminary','budget','timeline','pi','team','gaps'];
export function cleanBrief(value={}) { value=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return Object.fromEntries(BRIEF_FIELDS.map(k=>[k,typeof value[k]==='string'?value[k].slice(0,3000):''])); }
export function plain(html='') {return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();}
export function words(s=''){return [...new Set(s.toLowerCase().match(/[a-z][a-z-]{2,}/g)||[])].filter(x=>!['the','and','for','with','this','that','research','study','health','would','want','from','about','into'].includes(x));}
export function lexical(query,doc){const text=`${doc.title||doc.name||''} ${doc.text||''} ${(doc.tags||[]).join(' ')}`.toLowerCase();return words(query).reduce((n,w)=>n+(text.includes(w)?1:0),0);}
export function instituteMentions(text=''){return INSTITUTES.filter(i=>new RegExp(`\\b${i.id}\\b`,'i').test(text)||text.toLowerCase().includes(i.name.toLowerCase())).map(i=>i.id);}
export function participation(text=''){
 // Only a bounded, explicitly labelled participation section establishes participation.
 const start=text.search(/(?:components of participating organizations|participating (?:organizations|institutes|nih institutes))/i);
 if(start<0)return [];
 const section=text.slice(start,start+6000).split(/(?:funding opportunity title|activity code|announcement type|related notices|funding opportunity number)/i)[0];
 return instituteMentions(section);
}
export function trialRequirement(title=''){if(/clinical trial(?:s)? not allowed/i.test(title))return 'not_allowed';if(/clinical trial(?:s)? required/i.test(title))return 'required';if(/clinical trial(?:s)? optional/i.test(title))return 'optional';return 'unknown';}
export function expired(record,now=Date.now()){const d=Date.parse(record.expiration||'');return Number.isFinite(d)&&d+86400000<now;}
export function matchesInstitute(r,chosen=[]){const known=[...(r.institutes||[]),...(r.instituteCandidates||[])];return !chosen.length||!known.length||known.some(x=>chosen.includes(x));}
export function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
export function publicCard(r){return {...r,text:undefined,fullText:undefined,raw:undefined};}
export function validateModelOutput(raw,faculty,opportunities,posts=[]){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const allowedP=new Set(posts.map(x=>x.id));
 const allowedF=new Set(faculty.map(x=>x.id)),allowedO=new Set(opportunities.map(x=>x.id));
 return {
  summary:typeof raw.summary==='string'?raw.summary.slice(0,8000):'',
  opportunities:(Array.isArray(raw.opportunities)?raw.opportunities:[]).filter(x=>x&&typeof x==='object'&&allowedO.has(x.id)).slice(0,5).map(x=>({id:x.id,reason:String(x.reason||'').slice(0,1600),unknowns:(Array.isArray(x.unknowns)?x.unknowns:[]).map(String).slice(0,8)})),
  collaborators:(Array.isArray(raw.collaborators)?raw.collaborators:[]).filter(x=>x&&typeof x==='object'&&allowedF.has(x.id)).slice(0,5).map(x=>({id:x.id,role:String(x.role||'').slice(0,500),reason:String(x.reason||'').slice(0,1200),evidenceIds:(Array.isArray(x.evidenceIds)?x.evidenceIds:[]).filter(id=>{const f=faculty.find(f=>f.id===x.id);return id===f.id||(f.publications||[]).some(p=>p.id===id);}).slice(0,6)})),
  sharedMatches:(Array.isArray(raw.sharedMatches)?raw.sharedMatches:[]).filter(x=>x&&typeof x==='object'&&allowedP.has(x.id)).slice(0,5).map(x=>({id:x.id,reason:String(x.reason||'').slice(0,1200),role:String(x.role||'').slice(0,500)})),
  nextSteps:(Array.isArray(raw.nextSteps)?raw.nextSteps:[]).map(String).slice(0,8)
 };
}
