import { bundleSections } from './services/section-bundles.mjs';
import http from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const CATALOG_URL = 'https://classcatalog.cc';
const cacheDir = join(root, 'data', 'cache');
const catalogCachePath = join(cacheDir, 'catalog.json');
const courseCacheDir = join(cacheDir, 'courses');
const CACHE_MS = 12 * 60 * 60 * 1000;
const TERM_META = { 'Spring 2027': { id: '2273', campus: 'SDSU - San Diego Campus' } };
const officialOverridesPath = join(root, 'data', 'official-overrides.json');
let catalogRefreshPromise = null;

function safePath(urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const clean = normalize(requested).replace(/^([.][.][/\\])+/, '');
  return join(root, clean);
}
function decodeHTML(s='') {
  return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&ndash;|&#8211;/gi,'–').replace(/&mdash;|&#8212;/gi,'—').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}
function textOnly(s='') {
  return decodeHTML(s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ')).replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
}
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 20000);
  try {
    const r = await fetch(url, {headers:{'user-agent':'SDSU-Schedule-Planner/0.2 (+local student planning app)','accept':'text/html,application/xhtml+xml'}, signal:controller.signal});
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}
async function readJSON(path) { try { return JSON.parse(await readFile(path,'utf8')); } catch { return null; } }
function isFresh(obj) { return obj?.updatedAt && Date.now() - new Date(obj.updatedAt).getTime() < CACHE_MS; }

function parseSubjects(html) {
  const out=[]; const seen=new Set();
  const rx=/<a\b[^>]*href=["']\/subjects\/([^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(rx)) {
    const slug=m[1]; if(seen.has(slug)) continue;
    const label=textOnly(m[2]); if(!label || /browse subjects/i.test(label)) continue;
    seen.add(slug); out.push({slug,label});
  }
  return out;
}
function parseSubjectCourses(html, subjectSlug) {
  const out=[]; const seen=new Set();
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>textOnly(x[1]));
    const link=tr[1].match(/<a\b[^>]*href=["']\/courses\/([^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if(!link || cells.length<2) continue;
    const slug=link[1], code=textOnly(link[2]).replace(/\s+/g,' ').trim();
    if(!/^[A-Z][A-Z &.]*\s+\d{2,4}[A-Z]*$/i.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({code:code.toUpperCase(),title:cells[1],units:cells[2]||'',options:Number((cells[3]||'').match(/\d+/)?.[0]||0),slug,subjectSlug});
  }
  return out;
}
async function mapLimit(items, limit, fn) {
  const out=new Array(items.length); let next=0;
  async function worker(){ while(true){ const i=next++; if(i>=items.length) return; try{out[i]=await fn(items[i],i)}catch(e){out[i]={error:e.message,item:items[i]}} } }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker)); return out;
}
async function refreshCatalog(force=false) {
  if(catalogRefreshPromise && !force) return catalogRefreshPromise;
  catalogRefreshPromise=(async()=>{
    await mkdir(cacheDir,{recursive:true}); await mkdir(courseCacheDir,{recursive:true});
    const cached=await readJSON(catalogCachePath); if(!force && isFresh(cached) && cached.courses?.length>500) return cached;
    const subjectsHtml=await fetchText(`${CATALOG_URL}/subjects`);
    const subjects=parseSubjects(subjectsHtml);
    if(subjects.length<100) throw new Error(`Catalog source returned only ${subjects.length} subjects`);
    const pages=await mapLimit(subjects,8,async s=>({subject:s,courses:parseSubjectCourses(await fetchText(`${CATALOG_URL}/subjects/${s.slug}`),s.slug)}));
    const courseMap=new Map(); let failures=0;
    for(const p of pages){ if(p?.error){failures++;continue;} for(const c of p.courses) if(!courseMap.has(c.code)) courseMap.set(c.code,c); }
    const courses=[...courseMap.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
    if(courses.length<1500) throw new Error(`Catalog scrape looked incomplete (${courses.length} courses)`);
    const data={source:'SDSU public listings via classcatalog.cc',updatedAt:new Date().toISOString(),subjectCount:subjects.length,failedSubjects:failures,courses};
    await writeFile(catalogCachePath,JSON.stringify(data,null,2)); return data;
  })().finally(()=>{catalogRefreshPromise=null});
  return catalogRefreshPromise;
}

const dayMap={Mon:'M',Tue:'T',Wed:'W',Thu:'Th',Fri:'F',Sat:'Sa',Sun:'Su'};
function parseClock(raw, ampm){
  const m=raw.match(/(\d{1,2}):(\d{2})/); if(!m)return null; let h=Number(m[1]),min=Number(m[2]); const p=(ampm||'').toUpperCase(); if(p==='PM'&&h!==12)h+=12;if(p==='AM'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}
function parseMeetings(raw){
  const s=raw.replace(/–|—/g,'-'); const meetings=[];
  const rx=/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\s*\/\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun))*)\s+(\d{1,2}:\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)/gi;
  for(const m of s.matchAll(rx)){ const days=m[1].split('/').map(x=>dayMap[x.trim().slice(0,3)[0].toUpperCase()+x.trim().slice(1,3).toLowerCase()]).filter(Boolean); meetings.push({days,start:parseClock(m[2],m[3]),end:parseClock(m[4],m[5]),location:''}); }
  return meetings;
}
function parseCoursePage(html, fallbackCode, slug) {
  const h1=textOnly(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  const hm=h1.match(/SDSU\s+(.+?)\s+[—-]\s+(.+)$/i); const code=(hm?.[1]||fallbackCode).trim().toUpperCase(); const title=(hm?.[2]||'').trim();
  const ratingByProfessor=new Map();
  const termSections={};
  for(const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
    const before=html.slice(Math.max(0,tableMatch.index-1500),tableMatch.index);
    const heads=[...before.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
    const heading=textOnly(heads.at(-1)?.[1]||''); const tm=heading.match(/((?:Fall|Winter|Spring|Summer)\s+20\d{2})\s+enrollment options/i); if(!tm)continue;
    const term=tm[1]; const sections=[];
    for(const tr of tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>textOnly(x[1])); if(cells.length<7 || /class\s*#/i.test(cells[0]))continue;
      const first=cells[0].match(/^(\d+)\s*(.*)$/); if(!first)continue;
      const classNumber=first[1], component=first[2]||'Class'; const mode=cells[1]||''; const status=cells[2]||''; const seats=cells[3]||''; const time=cells[4]||''; const location=cells[5]||''; const instructor=cells[6]||'TBA'; const rmp=cells[7]||'';
      const rating=Number(rmp.match(/(\d(?:\.\d)?)\s*\/\s*5/)?.[1]||0); if(rating)ratingByProfessor.set(instructor,rating);
      const meetings=parseMeetings(time); for(const m of meetings)m.location=location;
      sections.push({id:`${code.replace(/\s+/g,'')}-${classNumber}`,classNumber,section:component,instructor,rating,seats,status,mode,meetings});
    }
    termSections[term]=sections;
  }
  return {code,title,slug,terms:termSections};
}
async function getCourse(code, term, slugHint='') {
  await mkdir(courseCacheDir,{recursive:true});
  const catalog=await refreshCatalog(false); const meta=catalog.courses.find(c=>c.code===code.toUpperCase()); const slug=slugHint||meta?.slug;
  if(!slug) throw new Error(`Course ${code} not found in catalog`);
  const path=join(courseCacheDir,`${slug}.json`); let cached=await readJSON(path);
  if(!isFresh(cached)){
    const html=await fetchText(`${CATALOG_URL}/courses/${slug}`); cached={...parseCoursePage(html,code,slug),updatedAt:new Date().toISOString()}; await writeFile(path,JSON.stringify(cached,null,2));
  }
  let sections=(cached.terms?.[term]||[]).map(section => ({...section, dataSource:'ClassCatalog (unverified)'}));
  const overrides=(await readJSON(officialOverridesPath))?.[term]||{};
  sections=sections.map(section=>{
    const override=overrides[String(section.classNumber)];
    if(!override) return section;
    const oldMeetings=section.meetings||[];
    const meetings=(override.meetings||[]).map((m,i)=>({
      ...m,
      location:m.location || oldMeetings[i]?.location || oldMeetings[0]?.location || ''
    }));
    return {...section,...override,meetings,dataSource:'Official my.SDSU correction',officiallyVerified:true};
  });
  const enrollmentOptions=bundleSections(sections, cached.code || code);
  return {code:cached.code,title:cached.title||meta?.title||'',sections:enrollmentOptions,rawComponents:sections,term,slug,termId:TERM_META[term]?.id||null};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') {
      res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ok:true, version:'0.5.0'}));
    }
    if (url.pathname === '/api/terms') {
      const terms=Object.entries(TERM_META).map(([name,meta])=>({name,...meta}));
      res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({terms}));
    }
    if (url.pathname === '/api/schedule') {
      const data = await readFile(join(root, 'data/schedule.json'));
      res.writeHead(200, {'content-type':'application/json','cache-control':'no-cache'}); return res.end(data);
    }
    if (url.pathname === '/api/catalog') {
      const force=url.searchParams.get('refresh')==='1'; const data=await refreshCatalog(force);
      res.writeHead(200, {'content-type':'application/json','cache-control':'no-cache'}); return res.end(JSON.stringify(data));
    }
    if (url.pathname === '/api/course') {
      const code=(url.searchParams.get('code')||'').trim(); const term=(url.searchParams.get('term')||'Spring 2027').trim(); const slug=(url.searchParams.get('slug')||'').trim(); if(!code)throw new Error('Missing course code');
      const data=await getCourse(code,term,slug); res.writeHead(200, {'content-type':'application/json','cache-control':'no-cache'}); return res.end(JSON.stringify(data));
    }
    const filePath = safePath(url.pathname); const info = await stat(filePath); if (!info.isFile()) throw new Error('not file');
    const body = await readFile(filePath); res.writeHead(200, {'content-type': mime[extname(filePath)] || 'application/octet-stream'}); res.end(body);
  } catch (e) {
    const isApi=req.url?.startsWith('/api/'); res.writeHead(isApi?500:404, {'content-type':isApi?'application/json':'text/plain; charset=utf-8'}); res.end(isApi?JSON.stringify({error:e.message}):'Not found');
  }
});

server.listen(port, () => {
  console.log(`SDSU planner running at http://localhost:${port}`);
  refreshCatalog(false).then(d=>console.log(`Catalog ready: ${d.courses.length} courses across ${d.subjectCount} subjects`)).catch(e=>console.warn(`Catalog refresh failed: ${e.message}`));
});
