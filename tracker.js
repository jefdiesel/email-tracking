const fs=require('fs'),path=require('path'),crypto=require('crypto');
const DATA_FILE=path.join(__dirname,'data','tracking.json');
const dataDir=path.dirname(DATA_FILE);
if(!fs.existsSync(dataDir))fs.mkdirSync(dataDir,{recursive:true});
if(!fs.existsSync(DATA_FILE))fs.writeFileSync(DATA_FILE,JSON.stringify({emails:[],opens:[]},null,2));
const loadData=()=>{try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf-8'))}catch(e){return{emails:[],opens:[]}}};
const saveData=d=>fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));
const generateTrackingId=()=>crypto.randomBytes(16).toString('hex');
const createTrackedEmail=({subject,recipient,senderEmail})=>{const d=loadData(),e={id:generateTrackingId(),subject:subject||'Untitled',recipient:recipient||'Unknown',senderEmail:senderEmail||'Unknown',createdAt:new Date().toISOString()};d.emails.push(e);saveData(d);return e};
const getAllEmails=()=>{const d=loadData();return d.emails.map(e=>{const o=d.opens.filter(x=>x.emailId===e.id),u=new Set(o.map(x=>x.ip));return{...e,openCount:o.length,uniqueOpens:u.size,forwardDetected:u.size>1,lastOpenedAt:o.length?o[o.length-1].timestamp:null}}).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))};
const getEmailDetails=id=>{const d=loadData(),e=d.emails.find(x=>x.id===id);if(!e)return null;const o=d.opens.filter(x=>x.emailId===id),byIP={};o.forEach(x=>{if(!byIP[x.ip])byIP[x.ip]=[];byIP[x.ip].push(x)});const readers=Object.entries(byIP).map(([ip,ops])=>({ip,location:ops[0].location,userAgent:ops[0].userAgent,openCount:ops.length,firstOpen:ops[0].timestamp,lastOpen:ops[ops.length-1].timestamp}));return{...e,openCount:o.length,uniqueOpens:new Set(o.map(x=>x.ip)).size,forwardDetected:readers.length>1,opens:o,readers}};
async function recordOpen(id,{ip,userAgent,referer}){const d=loadData();if(!d.emails.find(e=>e.id===id))return null;let loc={city:'Unknown',country:'Unknown',isp:'Unknown'};if(ip&&!['127.0.0.1','::1'].includes(ip)&&!ip.startsWith('192.168.')&&!ip.startsWith('10.')){try{const r=await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp`),g=await r.json();if(g.status==='success')loc={city:g.city,region:g.regionName,country:g.country,isp:g.isp}}catch(e){}}const rec={id:generateTrackingId(),emailId:id,timestamp:new Date().toISOString(),ip:ip||'Unknown',userAgent,referer,location:loc};d.opens.push(rec);saveData(d);return rec}
const deleteEmail=id=>{const d=loadData(),i=d.emails.findIndex(e=>e.id===id);if(i===-1)return false;d.emails.splice(i,1);d.opens=d.opens.filter(o=>o.emailId!==id);saveData(d);return true};
const TRACKING_PIXEL=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
module.exports={createTrackedEmail,getAllEmails,getEmailDetails,recordOpen,deleteEmail,TRACKING_PIXEL};
