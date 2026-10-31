// Converts an SDSU public-schedule CSV export into the planner's stable JSON schema.
// Usage: node scripts/normalize-sdsu-csv.mjs input.csv output.json "Spring 2027" 2272
import { readFile, writeFile } from 'node:fs/promises';

const [input, output='data/schedule.json', termName='Current Term', termId='current'] = process.argv.slice(2);
if (!input) { console.error('input CSV required'); process.exit(1); }
const raw = await readFile(input, 'utf8');
function parseCSV(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for (let i=0;i<text.length;i++) { const c=text[i], n=text[i+1];
    if (c==='"' && quoted && n==='"') { cell+='"'; i++; }
    else if (c==='"') quoted=!quoted;
    else if (c===',' && !quoted) { row.push(cell); cell=''; }
    else if ((c==='\n' || c==='\r') && !quoted) { if(c==='\r'&&n==='\n')i++; row.push(cell); if(row.some(v=>v.trim())) rows.push(row); row=[]; cell=''; }
    else cell+=c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const headers=rows.shift().map(h=>h.trim());
  return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}
const records=parseCSV(raw);
const get=(r,...names)=>{for(const n of names) if(r[n]!==undefined&&r[n]!=='') return r[n]; return '';};
const dayMap=[['Mo','M'],['Tu','T'],['We','W'],['Th','Th'],['Fr','F'],['Sa','Sa'],['Su','Su']];
function parseDays(s=''){ const out=[]; for(const [needle,d] of dayMap) if(s.includes(needle)) out.push(d); return out; }
function time24(s=''){ const m=s.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if(!m) return s; let h=+m[1]; if(m[3].toUpperCase()==='PM'&&h!==12)h+=12; if(m[3].toUpperCase()==='AM'&&h===12)h=0; return `${String(h).padStart(2,'0')}:${m[2]}`; }
const map=new Map();
for (const r of records) {
  const subject=get(r,'Subject','Subject Code','Subject Area');
  const catalog=get(r,'Catalog Nbr','Catalog Number','Catalog');
  if(!subject||!catalog) continue;
  const code=`${subject} ${catalog}`.replace(/\s+/g,' ').trim();
  if(!map.has(code)) map.set(code,{code,title:get(r,'Course Title','Title','Class Title'),sections:[]});
  const course=map.get(code);
  const section=get(r,'Class Section','Section');
  const classNumber=get(r,'Class Nbr','Class Number');
  const id=`${code.replace(/\s/g,'')}-${section||classNumber}`;
  let sec=course.sections.find(s=>s.id===id);
  if(!sec){ sec={id,classNumber,section,instructor:get(r,'Instructor','Instructor Name'),rating:null,seats:Number(get(r,'Available Seats','Open Seats','Seats Available')||0),mode:get(r,'Instruction Mode','Mode')||'Unknown',meetings:[]}; course.sections.push(sec); }
  const days=parseDays(get(r,'Days','Meeting Days'));
  const start=time24(get(r,'Meeting Start Time','Start Time'));
  const end=time24(get(r,'Meeting End Time','End Time'));
  if(days.length || start || end) sec.meetings.push({days,start,end,location:get(r,'Room','Location','Facility')});
}
const result={term:{id:termId,name:termName,campus:'SDSU - San Diego Campus',source:'SDSU public schedule CSV',updatedAt:new Date().toISOString()},courses:[...map.values()]};
await writeFile(output, JSON.stringify(result,null,2));
console.log(`Wrote ${result.courses.length} courses to ${output}`);
