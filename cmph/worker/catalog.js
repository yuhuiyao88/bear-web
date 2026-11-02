import { visiblePost } from './community.js';
export class Catalog {
 constructor(ctx){this.ctx=ctx;this.storage=ctx.storage;}
 async fetch(request){
  const u=new URL(request.url),data=request.method==='POST'?await request.json():{};
  if(u.pathname==='/rate'){
   const now=Date.now(),key=`rate:${data.key}`,old=await this.storage.get(key);const state=old&&old.until>now?old:{count:0,until:now+data.window};state.count++;
   await this.storage.put(key,state);await this.storage.setAlarm(now+3600000);return Response.json({allowed:state.count<=data.limit});
  }
  if(u.pathname==='/board/read')return Response.json({posts:[...(await this.storage.list({prefix:'post:',limit:100})).values()].map(visiblePost)});
  if(u.pathname==='/board/write')return this.storage.transaction(async tx=>{
   const key=`post:${data.id}`,old=await tx.get(key);
   if(data.action==='create'){
    if(old)return Response.json({error:'Post already exists'},{status:409});
    if((await tx.list({prefix:'post:',limit:100})).size>=100)return Response.json({error:'Pilot board capacity reached. Contact the curator.'},{status:409});
    await tx.put(key,data.post);return Response.json({post:visiblePost(data.post)});
   }
   if(!old)return Response.json({error:'Post not found'},{status:404});
   if(!data.admin&&old.editHash!==data.editHash)return Response.json({error:'That edit key does not belong to this post.'},{status:403});
   if(data.action==='delete'){await tx.delete(key);return Response.json({deleted:true});}
   if(data.version!==old.version)return Response.json({error:'This post changed. Reload it before editing.'},{status:409});
   const post={...data.post,id:old.id,editHash:old.editHash,createdAt:old.createdAt,version:old.version+1};await tx.put(key,post);return Response.json({post:visiblePost(post)});
  });
  if(u.pathname==='/stage'){
   if(!['nih','faculty'].includes(data.corpus)||!/^[-\w]+$/.test(data.batch)||!Array.isArray(data.records)||data.records.length>30)return Response.json({error:'Invalid batch'},{status:400});
   const current=await this.storage.get(`snapshot:${data.corpus}`);if(current?.batch===data.batch)return Response.json({error:'Published snapshots are immutable'},{status:409});
   const writes={};for(const r of data.records){if(!r.id||typeof r.id!=='string'||new TextEncoder().encode(JSON.stringify(r)).length>115000)return Response.json({error:'Invalid record'},{status:400});writes[`record:${data.corpus}:${data.batch}:${r.id}`]=r;}
   await this.storage.put(writes);return Response.json({stored:data.records.length});
  }
  if(u.pathname==='/publish'){
   if(!['nih','faculty'].includes(data.corpus)||!/^[-\w]+$/.test(data.batch)||!Array.isArray(data.ids)||!data.ids.length||data.ids.length>3000)return Response.json({error:'Invalid manifest'},{status:400});
   if(new Set(data.ids).size!==data.ids.length)return Response.json({error:'Duplicate IDs'},{status:400});
   const keys=data.ids.map(id=>`record:${data.corpus}:${data.batch}:${id}`);
   for(let i=0;i<keys.length;i+=100){const found=await this.storage.get(keys.slice(i,i+100));if(found.size!==keys.slice(i,i+100).length)return Response.json({error:'Snapshot incomplete; prior snapshot retained'},{status:409});}
   const previous=await this.storage.get(`snapshot:${data.corpus}`);
   await this.storage.put({[`previous:${data.corpus}`]:previous||null,[`snapshot:${data.corpus}`]:{corpus:data.corpus,batch:data.batch,ids:data.ids,updatedAt:new Date().toISOString(),coverage:data.coverage||{},vectorStatus:data.vectorStatus||'unavailable'}});
   return Response.json({published:true,count:data.ids.length});
  }
  if(u.pathname==='/details'){
   if(!['nih','faculty'].includes(data.corpus)||!/^[-\w]{1,40}$/.test(data.batch)||!Array.isArray(data.ids)||data.ids.length>5)return Response.json({error:'Invalid detail request'},{status:400});
   const keys=data.ids.map(id=>`record:${data.corpus}:${data.batch}:${id}`),found=keys.length?await this.storage.get(keys):new Map();return Response.json({records:[...found.values()]});
  }
  if(u.pathname==='/read'){
   const result={};for(const corpus of ['nih','faculty']){const snap=await this.storage.get(`snapshot:${corpus}`);const records=[];if(snap){for(let i=0;i<snap.ids.length;i+=100){const found=await this.storage.get(snap.ids.slice(i,i+100).map(id=>`record:${corpus}:${snap.batch}:${id}`));for(const r of found.values()){const {fullText,raw,...summary}=r;records.push({...summary,text:data.publicOnly?undefined:String(r.text||'').slice(0,r.kind==='faculty'?7000:3000)});}}}result[corpus]={snapshot:snap||null,records};}
   return Response.json(result);
  }
  return new Response('Not found',{status:404});
 }
 async alarm(){const rows=await this.storage.list({prefix:'rate:'});const expired=[...rows].filter(([,v])=>v.until<Date.now()).map(([k])=>k);for(let i=0;i<expired.length;i+=100)await this.storage.delete(expired.slice(i,i+100));}
}
