import { plain, participation, instituteMentions, trialRequirement } from './domain.js';
export async function jsonFetch(url,options={}){const res=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`Source returned HTTP ${res.status}`);return res.json();}
export async function grants(endpoint,body){const data=await jsonFetch(`https://api.grants.gov/v1/api/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(data.errorcode!==0||!data.data)throw new Error('Grants.gov returned an invalid response');return data.data;}
export async function searchNIH(keyword='',offset=0,rows=100){return grants('search2',{keyword:keyword.slice(0,180),agencies:'HHS-NIH11',oppStatuses:'posted',rows,startRecordNum:offset});}
const HOSTS=new Set(['grants.nih.gov','www.grants.nih.gov','api.grants.gov','apply07.grants.gov','www.grants.gov','grants.gov','simpler.grants.gov','files.simpler.grants.gov']);
export function officialURL(raw){try{const u=new URL(raw);u.protocol='https:';return HOSTS.has(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}}
export async function documentBytes(raw){let url=officialURL(raw);if(!url)throw new Error('Untrusted source');for(let i=0;i<5;i++){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000)});if(r.status>=300&&r.status<400){url=officialURL(new URL(r.headers.get('Location'),url).href);if(!url)throw new Error('Untrusted redirect');continue;}if(!r.ok)throw new Error(`Document HTTP ${r.status}`);if(Number(r.headers.get('Content-Length'))>5000000)throw new Error('Document exceeds size limit');const reader=r.body.getReader();let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5000000){await reader.cancel();throw new Error('Document exceeds size limit');}parts.push(value);}const bytes=new Uint8Array(size);let off=0;for(const p of parts){bytes.set(p,off);off+=p.length;}return {bytes,url,type:r.headers.get('Content-Type')||''};}throw new Error('Too many redirects');}
export async function fullAnnouncement(data,pdfReader=null){
 const attachments=(data.synopsisAttachmentFolders||[]).filter(f=>/full|announcement/i.test(`${f.folderType} ${f.folderName}`)).flatMap(f=>f.synopsisAttachments||[]).sort((a,b)=>Date.parse(b.createdDate)-Date.parse(a.createdDate));
 const urls=[...attachments.slice(0,2).map(a=>`https://apply07.grants.gov/grantsws/rest/opportunity/att/download/${a.id}`),data.synopsis?.fundingDescLinkUrl].filter(Boolean);
 const tried=new Set();
 for(let raw of urls){try{for(let hop=0;hop<2;hop++){
  const normalized=officialURL(raw);if(!normalized||tried.has(normalized))break;tried.add(normalized);const {bytes,url,type}=await documentBytes(normalized);let text='';
  if(type.includes('pdf')||(bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70)){if(!pdfReader)continue;text=await pdfReader(bytes);}else{const html=new TextDecoder().decode(bytes);const redirect=html.match(/http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*URL=['\s]*([^'"\s>]+)/i)||html.match(/URL=['\s]*(https?:\/\/[^'"\s>]+)/i);if(redirect){raw=redirect[1];continue;}text=plain(html);}
  if(text.length>5000&&text.includes(data.opportunityNumber)&&/eligib/i.test(text)&&/date/i.test(text))return {fullText:text.slice(0,75000),fullStatus:text.length>75000?'truncated':'retrieved',fullSource:url,fullCheckedAt:new Date().toISOString()};
  break;
 }}catch{/* Missing full text is explicitly retained below. */}}
 return {fullText:'',fullStatus:'unavailable',fullSource:null,fullCheckedAt:null};
}
export async function loadOpportunity(hit,{full=false,pdfReader=null}={}){
 const id=String(hit.id),d=await grants('fetchOpportunity',{opportunityId:Number(id)}),s=d.synopsis||{};
 if(!d.opportunityNumber||!s.synopsisDesc)throw new Error('Opportunity detail incomplete');
 const doc=full?await fullAnnouncement(d,pdfReader):{fullText:'',fullStatus:'not_checked',fullSource:null,fullCheckedAt:null};
 const text=plain(s.synopsisDesc).slice(0,18000),institutes=participation(doc.fullText);
 return {id:`nih-${id}`,kind:'opportunity',sourceId:id,number:d.opportunityNumber,title:d.opportunityTitle,text, ...doc,
  institutes,instituteCandidates:instituteMentions(text),participationStatus:institutes.length?'extracted_from_announcement':'requires_verification',
  trial:trialRequirement(d.opportunityTitle),status:String(d.ost||hit.oppStatus||'unknown').toLowerCase(),expiration:hit.closeDate||s.responseDateStr?.slice(0,10)||'',
  nextDueDate:null,deadlineStatus:'requires_full_announcement_review',eligibilityStatus:'requires_review',
  applicantTypes:(s.applicantTypes||[]).map(x=>x.description),budget:s.awardCeiling?`Posted ceiling: ${s.awardCeiling}; period and cost basis require review`:'See full announcement',
  sourceURL:`https://www.grants.gov/search-results-detail/${id}`,sourceUpdatedAt:s.lastUpdatedDate||null,checkedAt:new Date().toISOString(),
  contact:plain(s.agencyContactDesc||s.agencyContactName||'').slice(0,600),contactEmail:s.agencyContactEmail||'',
  checks:['Official opportunity record retrieved','Next application date, institute conditions and full eligibility require review']};
}
