import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { extractText,getDocumentProxy } from 'unpdf';
import { searchNIH,loadOpportunity } from '../worker/sources.js';
import { plain,instituteMentions,INSTITUTES } from '../worker/domain.js';
const corpus=process.argv[2];if(!['nih','faculty'].includes(corpus))throw new Error('Usage: node scripts/research.mjs nih|faculty');
const APP=process.env.CMPH_URL,ADMIN=process.env.CMPH_ADMIN_TOKEN;if(!APP||!/^https:\/\/cmph-spark\.[a-z0-9-]+\.workers\.dev$/.test(APP)||!ADMIN)throw new Error('Remote URL/admin secret missing');
const batch=`${corpus}-${Date.now()}`,coverage={errors:[],sources:[],unverifiedPublications:0};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();}
async function post(path,data){for(let i=0;i<3;i++){try{const r=await fetch(APP+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ADMIN}`},body:JSON.stringify(data),signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`Remote ingest HTTP ${r.status}`);return await r.json();}catch(e){if(i===2)throw e;await wait(2000*(i+1));}}}
async function pdfReader(bytes){const pdf=await getDocumentProxy(bytes,{isEvalSupported:false,maxImageSize:16777216});try{if(pdf.numPages>100)throw new Error('PDF exceeds page limit');const result=await extractText(pdf,{mergePages:true});return result.text;}finally{await pdf.destroy();}}
async function nih(){
 const hits=[];let expected=0;for(let offset=0;offset<3000;offset+=100){const page=await searchNIH('',offset,100);expected=page.hitCount;if(expected>3000)throw new Error('NIH inventory exceeds prototype capacity; preserving prior snapshot');hits.push(...page.oppHits||[]);if(offset+100>=page.hitCount)break;await wait(300);}
 const unique=[...new Map(hits.map(h=>[String(h.id),h])).values()];if(!unique.length)throw new Error('NIH returned an empty inventory; preserving prior snapshot');
 if(unique.length!==expected)throw new Error('NIH pagination changed or was incomplete; preserving prior snapshot');
 coverage.searchCount=unique.length;coverage.sources.push('https://api.grants.gov/v1/api/search2');
 const records=[];let failed=0;
 // Keep public-source traffic bounded and process three independent records at a time.
 for(let i=0;i<unique.length;i+=3){const chunk=await Promise.all(unique.slice(i,i+3).map(async h=>{try{return await loadOpportunity(h,{full:true,pdfReader});}catch(e){failed++;coverage.errors.push(`${h.number}: ${e.message}`);return null;}}));records.push(...chunk.filter(Boolean));if(i%30===0)console.log(`NIH: processed ${Math.min(i+3,unique.length)}/${unique.length}`);await wait(250);}
 if(failed)throw new Error(`${failed} NIH records failed; preserve prior snapshot and retry the monthly job`);
 coverage.institutes=INSTITUTES.map(ic=>({id:ic.id,name:ic.name,participating:records.filter(r=>r.institutes.includes(ic.id)).length,mentioned:records.filter(r=>r.instituteCandidates.includes(ic.id)).length,status:'Searched NIH-wide inventory; counts depend on extracted institute evidence, not issuing-only filters'}));coverage.unknownInstitute=records.filter(r=>!r.institutes.length&&!r.instituteCandidates.length).length;
 coverage.fullAnnouncements=records.filter(r=>r.fullStatus==='retrieved').length;coverage.partialAnnouncements=records.length-coverage.fullAnnouncements;
 const supplements=[['nih-topics','topic','NIH Highlighted Topics','https://grants.nih.gov/funding/find-a-fit-for-your-research/highlighted-topics'],['nih-notices','notice','NIH Guide notices','https://grants.nih.gov/grants/guide/newsfeed/fundingopps.xml'],['nih-fit','context','NIH institute and mission guidance','https://www.grants.nih.gov/funding/find-a-fit-for-your-research']];
 for(const [id,kind,title,url] of supplements){try{const raw=await fetchText(url),text=plain(raw).slice(0,60000);records.push({id,kind,title,text,sourceURL:url,checkedAt:new Date().toISOString(),institutes:instituteMentions(text)});coverage.sources.push(url);}catch(e){coverage.errors.push(`${title}: ${e.message}`);}}
 return records;
}
async function publications(f){
 const result=[];try{
  // Names alone are discovery hints. No discovered paper is promoted to verified expertise.
  const last=f.name.split(' ').at(-1),first=f.name.split(' ')[0];const query=`${last} ${first}[Author] AND (Alabama[Affiliation]) AND ("${new Date().getUTCFullYear()-4}"[Date - Publication] : "3000"[Date - Publication])`;
  const base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
  const res=await fetch(base+'esearch.fcgi?'+new URLSearchParams({db:'pubmed',term:query,retmode:'json',retmax:'8',sort:'pub_date'}),{signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`PubMed HTTP ${res.status}`);const data=await res.json(),ids=data.esearchresult?.idlist||[];await wait(400);
  if(ids.length){const xml=await fetchText(base+'efetch.fcgi?'+new URLSearchParams({db:'pubmed',id:ids.join(','),retmode:'xml'}));
   for(const article of xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g)||[]){const pmid=article.match(/<PMID[^>]*>(\d+)/)?.[1],title=plain(article.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]||'');if(!pmid||!title)continue;result.push({id:`pubmed-${pmid}-${f.id}`,kind:'publication',facultyId:f.id,title,text:plain(article).slice(0,16000),sourceURL:`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,checkedAt:new Date().toISOString(),evidenceStatus:'metadata_only',authorshipStatus:'requires_faculty_confirmation'});}
  }
 }catch(e){coverage.errors.push(`${f.name} publication discovery: ${e.message}`);}
 await wait(400);return result;
}
async function faculty(){
 const seeds=JSON.parse(await readFile(new URL('../data/faculty.json',import.meta.url),'utf8'));
 const rosterURL='https://cchs.ua.edu/departments/community-medicine-and-population-health/people/',roster=await fetchText(rosterURL),records=[];coverage.sources.push(rosterURL);
 const rosterIds=[...new Set([...roster.matchAll(/person\/\?id=(\d+)/g)].map(m=>m[1]))];coverage.directoryPeople=rosterIds.length;coverage.seedFaculty=seeds.length;
 for(const f of seeds){
  const id=new URL(f.sourceURL).searchParams.get('id');if(rosterIds.length&&!rosterIds.includes(id)){coverage.errors.push(`${f.name}: no longer found on current directory; omitted pending review`);continue;}
  const html=await fetchText(f.sourceURL);let text=plain(html);const start=text.lastIndexOf('About Dr.');if(start>=0)text=text.slice(start);else{const at=text.indexOf('Jump to bio');if(at>=0)text=text.slice(at);}text=text.split('Contact CCHS')[0].slice(0,14000);
  if(text.length<150)throw new Error(`Could not read biography for ${f.name}; preserving prior snapshot`);
  records.push({...f,kind:'faculty',title:f.name,text,checkedAt:new Date().toISOString(),availability:'Not confirmed',evidenceStatus:'official_biography',publicationStatus:'Candidate discovery only; authorship and full texts require review'});
  records.push(...await publications(f));console.log(`Faculty: processed ${f.name}`);
 }
 for(const [id,title,url] of [['resource-irhr','Institute for Rural Health Research','https://cchs.ua.edu/research/research-centers-and-areas/'],['resource-preaward','CCHS proposal-development support','https://cchs.ua.edu/research/proposal-development/']]){const text=plain(await fetchText(url));records.push({id,kind:'resource',title,text:text.slice(0,30000),sourceURL:url,checkedAt:new Date().toISOString(),availability:'Access and capacity require confirmation'});}
 coverage.unverifiedPublications=records.filter(r=>r.kind==='publication').length;coverage.scholar='Member-supplied Google Scholar profile links and CSV exports are shared through the authenticated Knowledge & needs board; automated Scholar scraping is not enabled.';coverage.openAlex='Optional author IDs/API adapter are not configured in this prototype.';
 if(records.filter(r=>r.kind==='faculty').length<seeds.length/2)throw new Error('Faculty inventory unexpectedly small; preserving prior snapshot');
 return records;
}
const records=await (corpus==='nih'?nih():faculty());
// Vectors contain public-source summaries; full source text remains in structured records.
let vectorFailures=0;for(let i=0;i<records.length;i+=15){const chunk=records.slice(i,i+15);await post('/api/admin/stage',{corpus,batch,records:chunk});try{await post('/api/admin/index',{corpus,batch,records:chunk.map(r=>({id:r.id,text:`${r.title} ${(r.tags||[]).join(' ')} ${r.text}`.slice(0,6000)}))});}catch{vectorFailures+=chunk.length;}}
coverage.vectorFailures=vectorFailures;
await post('/api/admin/publish',{corpus,batch,ids:records.map(r=>r.id),coverage,vectorStatus:vectorFailures?'partial; keyword fallback available':'submitted'});
await mkdir('research-output',{recursive:true});await writeFile(`research-output/${corpus}-summary.json`,JSON.stringify({corpus,batch,records:records.length,coverage},null,2));
console.log(`Published ${corpus}: ${records.length} records; ${vectorFailures} vector failures. Previous snapshot retained for rollback.`);
