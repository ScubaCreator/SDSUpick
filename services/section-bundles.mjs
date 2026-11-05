function normComponent(value='') {
  const raw=String(value).trim().replace(/\s+/g,' ');
  const key=raw.toLowerCase();
  if(/^(lrg\s+lect|large\s+lecture|lecture|lect)$/.test(key)) return 'Lecture';
  if(/^(discussion|disc)$/.test(key)) return 'Discussion';
  if(/^(laboratory|lab)$/.test(key)) return 'Laboratory';
  if(/^(activity|act)$/.test(key)) return 'Activity';
  if(/^(seminar|sem)$/.test(key)) return 'Seminar';
  return raw || 'Class';
}

export function inferComponentPatternLength(rows=[]) {
  const types=rows.map(r=>normComponent(r.section||r.component||'Class').toLowerCase());
  if(types.length<=1) return 1;
  for(let size=1; size<=types.length; size++) {
    let ok=true;
    for(let i=0;i<types.length;i++) {
      if(types[i]!==types[i%size]) { ok=false; break; }
    }
    if(ok) return size;
  }
  return types.length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function componentMeeting(component, meeting) {
  return {
    ...meeting,
    component: component.section || component.component || 'Class',
    classNumber: component.classNumber,
    instructor: component.instructor || 'TBA',
    rating: component.rating || 0,
    mode: component.mode || '',
    status: component.status || '',
    seats: component.seats || ''
  };
}

function makeBundle(code, components, index) {
  const classNumbers=unique(components.map(c=>String(c.classNumber||'')));
  const componentNames=components.map(c=>normComponent(c.section||c.component||'Class'));
  const instructors=unique(components.flatMap(c=>String(c.instructor||'').split(',').map(x=>x.trim())));
  const ratings=components.map(c=>Number(c.rating)||0).filter(Boolean);
  const modes=unique(components.map(c=>c.mode));
  const statuses=unique(components.map(c=>c.status));
  const seats=unique(components.map(c=>c.seats));
  const meetings=components.flatMap(c=>(c.meetings||[]).map(m=>componentMeeting(c,m)));
  const verifiedCount=components.filter(c=>c.officiallyVerified).length;
  return {
    id:`${code.replace(/\s+/g,'')}-OPTION-${index+1}`,
    classNumber: classNumbers.join(' + '),
    classNumbers,
    section: componentNames.join(' + '),
    components: components.map(c=>({...c})),
    instructor: instructors.join(', ') || 'TBA',
    rating: ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0,
    mode: modes.join(' + '),
    status: statuses.join(' + '),
    seats: seats.join(' | '),
    meetings,
    dataSource: verifiedCount===components.length && components.length ? 'Official my.SDSU correction' : components[0]?.dataSource || 'ClassCatalog (unverified)',
    officiallyVerified: verifiedCount===components.length && components.length>0,
    partiallyVerified: verifiedCount>0 && verifiedCount<components.length,
    componentCount: components.length
  };
}

export function bundleSections(rows=[], code='COURSE') {
  if(!rows.length) return [];
  const patternLength=inferComponentPatternLength(rows);
  // Same component repeated (Lecture/Lecture/Lecture) means independent section choices.
  // Multiple component types (Lecture + Discussion + Lab) represent one enrollment option
  // and the repeated component pattern indicates subsequent options.
  const bundles=[];
  for(let i=0;i<rows.length;i+=patternLength) {
    bundles.push(makeBundle(code, rows.slice(i,i+patternLength), bundles.length));
  }
  return bundles;
}
