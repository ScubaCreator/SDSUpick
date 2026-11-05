const state={data:null,catalog:[],courseCache:new Map(),core:[],electives:[],commitments:[],schedules:[],index:0,direction:1};
const $=id=>document.getElementById(id);
const dayOrder=['M','T','W','Th','F'];
const dayNames={M:'Mon',T:'Tue',W:'Wed',Th:'Thu',F:'Fri'};
const minute=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m};
const fmt=t=>{if(!t)return '—';const [h0,m]=t.split(':').map(Number);const p=h0>=12?'PM':'AM';const h=h0%12||12;return `${h}:${String(m).padStart(2,'0')} ${p}`};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init(){
  try{
    const [r,cr]=await Promise.all([fetch('/api/schedule'),fetch('/api/catalog')]); state.data=await r.json();
    const catalogData=await cr.json(); if(!cr.ok)throw new Error(catalogData.error||'Could not load catalog'); state.catalog=catalogData.courses||[];
    for(const c of state.data.courses||[])state.courseCache.set(c.code,c);
    $('termLine').textContent=`${state.data.term.name} • ${state.data.term.campus} • term ${state.data.term.id}`;
    $('dataStatus').textContent=`${state.catalog.length.toLocaleString()} courses searchable • sections load automatically when selected`;
    restoreFromURL(); renderAll();
  }catch(e){$('dataStatus').textContent='Could not load schedule'; console.error(e)}
}
function restoreFromURL(){
  const q=new URLSearchParams(location.search);
  state.core=(q.get('core')||'').split(',').filter(Boolean);
  state.electives=(q.get('el')||'').split(',').filter(Boolean);
  if(q.get('pick'))$('electivePick').value=q.get('pick');
  try{state.commitments=JSON.parse(q.get('commitments')||'[]').filter(validCommitmentShape)}catch{state.commitments=[]}
}
function courseByCode(code){return state.courseCache.get(code)}
function catalogByCode(code){return state.catalog.find(c=>c.code===code)}
async function ensureCourseLoaded(code){
  if(state.courseCache.has(code)&&state.courseCache.get(code)?.sections?.length)return state.courseCache.get(code);
  const meta=catalogByCode(code); const q=new URLSearchParams({code,term:state.data.term.name}); if(meta?.slug)q.set('slug',meta.slug);
  const r=await fetch(`/api/course?${q}`); const c=await r.json(); if(!r.ok)throw new Error(c.error||`Could not load ${code}`); state.courseCache.set(code,c); return c;
}
function renderChips(id,codes,type){$(id).innerHTML=codes.map(code=>`<span class="chip">${esc(code)}<button data-remove="${esc(code)}" data-type="${type}">×</button></span>`).join('')}
function renderAll(){
  renderChips('coreChips',state.core,'core'); renderChips('electiveChips',state.electives,'elective');
  $('coreCount').textContent=state.core.length; $('electiveCount').textContent=state.electives.length;
  renderCommitments();
}
function addCourse(code,type){
  const arr=type==='core'?state.core:state.electives;
  if(!arr.includes(code))arr.push(code); renderAll();
}
function wireSearch(inputId,resultsId,type){
  $(inputId).addEventListener('input',()=>{
    const q=$(inputId).value.trim().toLowerCase(); if(!q){$(resultsId).innerHTML='';return}
    const selected=type==='core'?state.core:state.electives;
    const matches=state.catalog.filter(c=>!selected.includes(c.code)&&(c.code.toLowerCase().includes(q)||c.title.toLowerCase().includes(q))).slice(0,20);
    $(resultsId).innerHTML=`<div class="search-menu">${matches.map(c=>`<div class="search-item" data-code="${esc(c.code)}"><strong>${esc(c.code)}</strong><small>${esc(c.title)}${c.units?` • ${esc(c.units)} units`:''} • ${c.options||0} listed option${c.options===1?'':'s'} across available terms</small></div>`).join('')||'<div class="search-item">No matches</div>'}</div>`;
  });
  $(resultsId).addEventListener('click',e=>{const item=e.target.closest('[data-code]');if(!item)return;addCourse(item.dataset.code,type);$(inputId).value='';$(resultsId).innerHTML=''});
}

document.addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const arr=b.dataset.type==='core'?state.core:state.electives;const i=arr.indexOf(b.dataset.remove);if(i>=0)arr.splice(i,1);renderAll()});
wireSearch('coreSearch','coreResults','core');wireSearch('electiveSearch','electiveResults','elective');
$('clearBtn').onclick=()=>{state.core=[];state.electives=[];state.commitments=[];renderAll()};

function validCommitmentShape(c){
  return c&&typeof c.name==='string'&&Array.isArray(c.days)&&c.days.length&&typeof c.start==='string'&&typeof c.end==='string'&&minute(c.start)!=null&&minute(c.end)!=null&&minute(c.end)>minute(c.start);
}
function renderCommitments(){
  const el=$('commitmentList'); if(!el)return;
  el.innerHTML=state.commitments.map((c,i)=>`<div class="commitment-item"><div><strong>${esc(c.name)}</strong><span>${c.days.map(d=>dayNames[d]||d).join(', ')} • ${fmt(c.start)}–${fmt(c.end)}</span></div><button class="secondary" data-remove-commitment="${i}">Remove</button></div>`).join('');
}
function commitmentAsSection(c,i=0){
  return {id:`COMMITMENT-${i}`,custom:true,name:c.name,instructor:'Custom commitment',mode:'Commitment',meetings:[{days:[...c.days],start:c.start,end:c.end,location:c.name}]};
}
$('addCommitmentBtn').onclick=()=>{
  const name=$('commitmentName').value.trim()||'Custom commitment';
  const days=[...document.querySelectorAll('input[name="commitmentDay"]:checked')].map(x=>x.value);
  const start=$('commitmentStart').value,end=$('commitmentEnd').value,error=$('commitmentError');
  error.classList.add('hidden');
  if(!days.length||!start||!end){error.textContent='Choose at least one day and a start/end time.';error.classList.remove('hidden');return}
  if(minute(end)<=minute(start)){error.textContent='End time must be later than start time.';error.classList.remove('hidden');return}
  state.commitments.push({name,days,start,end});
  $('commitmentName').value='';$('commitmentStart').value='';$('commitmentEnd').value='';
  document.querySelectorAll('input[name="commitmentDay"]').forEach(x=>x.checked=false);
  renderCommitments();
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-remove-commitment]');if(!b)return;state.commitments.splice(Number(b.dataset.removeCommitment),1);renderCommitments()});

function meetingsConflict(a,b){
  for(const ma of a.meetings)for(const mb of b.meetings){
    if(!ma.days.some(d=>mb.days.includes(d)))continue;
    const as=minute(ma.start),ae=minute(ma.end),bs=minute(mb.start),be=minute(mb.end);
    if(as!=null&&bs!=null&&as<be&&bs<ae)return true;
  }
  return false;
}
function validSection(sec){
  const after=$('afterTime').value?minute($('afterTime').value):null,before=$('beforeTime').value?minute($('beforeTime').value):null,avoid=$('avoidDay').value,online=$('onlineMode').value;
  if(online==='none'&&/online/i.test(sec.mode))return false;
  for(const m of sec.meetings){if(avoid&&m.days.includes(avoid))return false;if(after!=null&&minute(m.start)<after)return false;if(before!=null&&minute(m.end)>before)return false}
  return true;
}
function combinations(arr,k,start=0,prefix=[],out=[]){if(k===0){out.push([...prefix]);return out}for(let i=start;i<=arr.length-k;i++){prefix.push(arr[i]);combinations(arr,k,i+1,prefix,out);prefix.pop()}return out}
async function generate(){
  $('generateError').classList.add('hidden');
  if(!state.core.length){$('generateError').textContent='Choose at least one core course first.';$('generateError').classList.remove('hidden');return}
  const pick=Math.max(0,Number($('electivePick').value||0)); if(pick>state.electives.length){$('generateError').textContent='Elective count is larger than the number of electives selected.';$('generateError').classList.remove('hidden');return}
  const needed=[...new Set([...state.core,...state.electives])]; $('generateBtn').disabled=true; $('generateBtn').textContent='Loading SDSU sections…';
  try{await Promise.all(needed.map(ensureCourseLoaded));}catch(e){$('generateError').textContent=e.message;$('generateError').classList.remove('hidden');$('generateBtn').disabled=false;$('generateBtn').textContent='BUILD SCHEDULES';return}
  $('generateBtn').disabled=false;$('generateBtn').textContent='BUILD SCHEDULES';
  const electiveSets=pick?combinations(state.electives,pick):[[]]; const results=[];
  const commitmentSections=state.commitments.map(commitmentAsSection);
  outer: for(const es of electiveSets){
    const codes=[...state.core,...es]; const courseObjs=codes.map(courseByCode).filter(Boolean);
    const pools=courseObjs.map(c=>c.sections.filter(validSection)); if(pools.some(p=>!p.length))continue;
    const stack=[];
    function dfs(i){
      if(results.length>=200)return;
      if(i===pools.length){const scored=scoreSchedule([...stack]);scored.commitments=commitmentSections;results.push(scored);return}
      for(const sec of pools[i]){if(commitmentSections.some(c=>meetingsConflict(c,sec))||stack.some(existing=>meetingsConflict(existing,sec)))continue;stack.push(sec);dfs(i+1);stack.pop();if(results.length>=200)return}
    }
    dfs(0); if(results.length>=200)break outer;
  }
  state.schedules=results;state.index=0;state.direction=1;rerank();
  if(!results.length){$('generateError').textContent='No conflict-free schedules matched those filters.';$('generateError').classList.remove('hidden');return}
  $('resultsSection').classList.remove('hidden');$('scheduleCount').textContent=`${results.length} found`;renderSchedule();$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'});
}
function scoreSchedule(sections){
  const campusDays=new Set(),ratings=[],dayMeetings=Object.fromEntries(dayOrder.map(d=>[d,[]]));let earliest=24*60,onlineCount=0;
  for(const s of sections){if(s.rating)ratings.push(s.rating);if(/online/i.test(s.mode))onlineCount++;for(const m of s.meetings){earliest=Math.min(earliest,minute(m.start)??earliest);for(const d of m.days){if(dayOrder.includes(d)){campusDays.add(d);dayMeetings[d].push([minute(m.start),minute(m.end)])}}}}
  let gap=0;for(const d of dayOrder){const ms=dayMeetings[d].sort((a,b)=>a[0]-b[0]);for(let i=1;i<ms.length;i++)gap+=Math.max(0,ms[i][0]-ms[i-1][1])}
  return {sections,avgRating:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:0,days:campusDays.size,earliest,gap,onlineCount,score:0};
}
function rerank(){
  const rw=+$('ratingWeight').value,dw=+$('daysWeight').value,sw=+$('startWeight').value,gw=+$('gapsWeight').value,prefer=$('onlineMode').value==='prefer';
  for(const s of state.schedules)s.score=rw*(s.avgRating/5)+dw*((5-s.days)/5)+sw*(s.earliest/(24*60))+gw*(1-Math.min(s.gap,360)/360)+(prefer?s.onlineCount*.15:0);
  state.schedules.sort((a,b)=>state.direction*(b.score-a.score)); state.index=0; renderSchedule();
}
function renderSchedule(){
  if(!state.schedules.length)return; const s=state.schedules[state.index];
  const commitmentSections=s.commitments||[];
  const allMeetings=[...s.sections,...commitmentSections].flatMap(x=>x.meetings||[]).filter(m=>minute(m.start)!=null&&minute(m.end)!=null);
  const minMinute=allMeetings.length?Math.min(...allMeetings.map(m=>minute(m.start))):8*60;
  const maxMinute=allMeetings.length?Math.max(...allMeetings.map(m=>minute(m.end))):20*60;
  const startHour=Math.min(8,Math.floor(minMinute/60)),endHour=Math.max(20,Math.ceil(maxMinute/60)),height=Math.max(660,(endHour-startHour)*55),span=(endHour-startHour)*60;
  const heads=`<div class="cal-head"></div>${dayOrder.map(d=>`<div class="cal-head">${dayNames[d]}</div>`).join('')}`;
  let cols=`<div class="time-col" style="height:${height}px">${Array.from({length:endHour-startHour+1},(_,i)=>`<span class="time-label" style="top:${i*55}px">${fmt(`${String(startHour+i).padStart(2,'0')}:00`)}</span>`).join('')}</div>`;
  for(const d of dayOrder){
    let events='';
    for(const sec of s.sections)for(const m of sec.meetings)if(m.days.includes(d)){
      const st=minute(m.start),en=minute(m.end),top=((st-startHour*60)/span)*height,h=Math.max(28,((en-st)/span)*height);
      const component=m.component||sec.section||'Class';
      const classNumber=m.classNumber||sec.classNumber;
      const instructor=m.instructor||sec.instructor;
      const rating=m.rating||sec.rating;
      events+=`<div class="event" style="top:${top}px;height:${h}px"><strong>${esc(sec.id.split('-')[0])} • ${esc(component)}</strong><span>${fmt(m.start)}–${fmt(m.end)}<br>${esc(instructor)}${rating?` • ★ ${Number(rating).toFixed(1)}`:''}<br>${esc(m.location||m.mode||sec.mode)}<br><small>Class #${esc(classNumber)}${sec.officiallyVerified?' • my.SDSU verified':sec.partiallyVerified?' • partly verified':' • verify in my.SDSU'}</small></span></div>`;
    }
    for(const sec of commitmentSections)for(const m of sec.meetings)if(m.days.includes(d)){
      const st=minute(m.start),en=minute(m.end),top=((st-startHour*60)/span)*height,h=Math.max(28,((en-st)/span)*height);
      events+=`<div class="event commitment" style="top:${top}px;height:${h}px"><strong>${esc(sec.name)}</strong><span>${fmt(m.start)}–${fmt(m.end)}<br>Custom commitment</span></div>`;
    }
    cols+=`<div class="day-col" style="height:${height}px">${events}</div>`;
  }
  $('scheduleCard').innerHTML=`<div class="schedule-summary"><div class="metric"><small>Avg professor</small><strong>${s.avgRating?s.avgRating.toFixed(2):'N/A'}</strong></div><div class="metric"><small>Campus days</small><strong>${s.days}</strong></div><div class="metric"><small>Earliest class</small><strong>${fmt(`${String(Math.floor(s.earliest/60)).padStart(2,'0')}:${String(s.earliest%60).padStart(2,'0')}`)}</strong></div><div class="metric"><small>Weekly class gaps</small><strong>${Math.floor(s.gap/60)}h ${s.gap%60}m</strong></div></div><div class="calendar-wrap"><div class="calendar">${heads}${cols}</div></div>`;
  $('pageText').textContent=`Schedule ${state.index+1} of ${state.schedules.length}`;
}
$('generateBtn').onclick=generate;
for(const [id,out] of [['ratingWeight','ratingOut'],['daysWeight','daysOut'],['startWeight','startOut'],['gapsWeight','gapsOut']])$(id).addEventListener('input',()=>{$(out).textContent=$(id).value;rerank()});
$('betterBtn').onclick=()=>{state.direction=1;rerank()};$('worseBtn').onclick=()=>{state.direction=-1;rerank()};
$('prevBtn').onclick=()=>{if(state.schedules.length){state.index=(state.index-1+state.schedules.length)%state.schedules.length;renderSchedule()}};
$('nextBtn').onclick=()=>{if(state.schedules.length){state.index=(state.index+1)%state.schedules.length;renderSchedule()}};
$('copyLinkBtn').onclick=async()=>{const u=new URL(location.href);u.searchParams.set('core',state.core.join(','));u.searchParams.set('el',state.electives.join(','));u.searchParams.set('pick',$('electivePick').value);if(state.commitments.length)u.searchParams.set('commitments',JSON.stringify(state.commitments));else u.searchParams.delete('commitments');await navigator.clipboard.writeText(u.toString());$('copyLinkBtn').textContent='Copied!';setTimeout(()=>$('copyLinkBtn').textContent='Copy link',1200)};
$('saveBtn').onclick=()=>saveScheduleImage();
function saveScheduleImage(){
  const s=state.schedules[state.index];if(!s)return;const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=700;const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,1200,700);c.fillStyle='#15202b';c.font='bold 32px sans-serif';c.fillText(`${state.data.term.name} Schedule`,40,50);c.font='16px sans-serif';c.fillStyle='#687583';c.fillText(`Avg professor ${s.avgRating.toFixed(2)} • ${s.days} campus days • ${Math.floor(s.gap/60)}h ${s.gap%60}m weekly class gaps`,40,82);
  const all=[...s.sections,...(s.commitments||[])],allMeetings=all.flatMap(x=>x.meetings||[]).filter(m=>minute(m.start)!=null&&minute(m.end)!=null);const minM=allMeetings.length?Math.min(...allMeetings.map(m=>minute(m.start))):8*60,maxM=allMeetings.length?Math.max(...allMeetings.map(m=>minute(m.end))):20*60;const start=Math.min(8*60,Math.floor(minM/60)*60),end=Math.max(20*60,Math.ceil(maxM/60)*60);const x0=120,y0=120,colW=200,scale=520/(end-start);c.strokeStyle='#d9e0e6';c.fillStyle='#15202b';c.font='bold 14px sans-serif';dayOrder.forEach((d,i)=>{c.fillText(dayNames[d],x0+i*colW+70,108);c.strokeRect(x0+i*colW,y0,colW,520)});c.font='12px sans-serif';for(let h=start/60;h<=end/60;h++){const y=y0+(h*60-start)*scale;c.fillStyle='#687583';c.fillText(fmt(`${String(h).padStart(2,'0')}:00`),20,y+4);c.strokeStyle='#eef1f3';c.beginPath();c.moveTo(x0,y);c.lineTo(x0+colW*5,y);c.stroke()}
  for(const sec of all)for(const m of sec.meetings)for(const d of m.days){const i=dayOrder.indexOf(d);if(i<0)continue;const y=y0+(minute(m.start)-start)*scale,h=Math.max(25,(minute(m.end)-minute(m.start))*scale);c.fillStyle=sec.custom?'#f1e8fb':'#dcecf6';c.fillRect(x0+i*colW+6,y,colW-12,h);c.strokeStyle=sec.custom?'#cbb4e8':'#9fc5dc';c.strokeRect(x0+i*colW+6,y,colW-12,h);c.fillStyle='#15202b';c.font='bold 13px sans-serif';c.fillText(sec.custom?sec.name:`${sec.id.split('-')[0]} ${m.component||''}`.trim(),x0+i*colW+12,y+17);c.font='11px sans-serif';c.fillText(`${fmt(m.start)}–${fmt(m.end)}`,x0+i*colW+12,y+33)}
  const a=document.createElement('a');a.download=`${state.data.term.name.replace(/\s+/g,'-').toLowerCase()}-schedule.png`;a.href=canvas.toDataURL('image/png');a.click();
}

init();
