#!/usr/bin/env python3
"""Normalize a standard XLSX SDSU schedule export without third-party Python packages.
Usage: python3 scripts/normalize_sdsu_xlsx.py input.xlsx data/schedule.json "Spring 2027" 2272
"""
import sys, json, re, zipfile, xml.etree.ElementTree as ET
from datetime import datetime, timezone

src=sys.argv[1] if len(sys.argv)>1 else None
out=sys.argv[2] if len(sys.argv)>2 else 'data/schedule.json'
term_name=sys.argv[3] if len(sys.argv)>3 else 'Current Term'
term_id=sys.argv[4] if len(sys.argv)>4 else 'current'
if not src: raise SystemExit('input XLSX required')
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}

def col_index(ref):
    letters=''.join(c for c in ref if c.isalpha())
    n=0
    for c in letters: n=n*26+ord(c.upper())-64
    return n-1

def sheet_rows(path):
    with zipfile.ZipFile(path) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si',NS):
                shared.append(''.join(t.text or '' for t in si.iter('{%s}t'%NS['m'])))
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        first=wb.find('m:sheets/m:sheet',NS)
        rel_id=first.attrib['{%s}id'%NS['r']]
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target=None
        for rel in rels:
            if rel.attrib.get('Id')==rel_id: target=rel.attrib['Target']; break
        sheet_path='xl/'+target.lstrip('/') if not target.startswith('xl/') else target
        root=ET.fromstring(z.read(sheet_path))
        rows=[]
        for row in root.findall('.//m:sheetData/m:row',NS):
            vals={}
            for c in row.findall('m:c',NS):
                idx=col_index(c.attrib.get('r','A1')); typ=c.attrib.get('t'); v=c.find('m:v',NS)
                inline=c.find('m:is',NS)
                val=''
                if inline is not None: val=''.join(t.text or '' for t in inline.iter('{%s}t'%NS['m']))
                elif v is not None:
                    raw=v.text or ''
                    val=shared[int(raw)] if typ=='s' and raw.isdigit() else raw
                vals[idx]=val
            if vals:
                width=max(vals)+1; rows.append([vals.get(i,'') for i in range(width)])
        return rows

def get(r,*names):
    for n in names:
        if n in r and str(r[n]).strip(): return str(r[n]).strip()
    return ''
def days(s):
    out=[]
    for needle,d in [('Mo','M'),('Tu','T'),('We','W'),('Th','Th'),('Fr','F'),('Sa','Sa'),('Su','Su')]:
        if needle in s: out.append(d)
    return out
def time24(s):
    m=re.search(r'(\d{1,2}):(\d{2})\s*(AM|PM)',s,re.I)
    if not m: return s
    h=int(m.group(1)); ap=m.group(3).upper()
    if ap=='PM' and h!=12:h+=12
    if ap=='AM' and h==12:h=0
    return f'{h:02d}:{m.group(2)}'

rows=sheet_rows(src)
if not rows: raise SystemExit('No rows found')
headers=[str(x).strip() for x in rows[0]]
records=[]
for row in rows[1:]:
    row=row+['']*(len(headers)-len(row)); records.append(dict(zip(headers,row)))
courses={}
for r in records:
    subject=get(r,'Subject','Subject Code','Subject Area')
    catalog=get(r,'Catalog Nbr','Catalog Number','Catalog')
    if not subject or not catalog: continue
    code=re.sub(r'\s+',' ',f'{subject} {catalog}').strip()
    course=courses.setdefault(code,{'code':code,'title':get(r,'Course Title','Title','Class Title'),'sections':[]})
    section=get(r,'Class Section','Section'); class_no=get(r,'Class Nbr','Class Number')
    sid=f"{code.replace(' ','')}-{section or class_no}"
    sec=next((s for s in course['sections'] if s['id']==sid),None)
    if not sec:
        sec={'id':sid,'classNumber':class_no,'section':section,'instructor':get(r,'Instructor','Instructor Name'),'rating':None,'seats':int(float(get(r,'Available Seats','Open Seats','Seats Available') or 0)),'mode':get(r,'Instruction Mode','Mode') or 'Unknown','meetings':[]}
        course['sections'].append(sec)
    ds=days(get(r,'Days','Meeting Days')); st=time24(get(r,'Meeting Start Time','Start Time')); en=time24(get(r,'Meeting End Time','End Time'))
    if ds or st or en: sec['meetings'].append({'days':ds,'start':st,'end':en,'location':get(r,'Room','Location','Facility')})
result={'term':{'id':term_id,'name':term_name,'campus':'SDSU - San Diego Campus','source':'SDSU public schedule XLSX','updatedAt':datetime.now(timezone.utc).isoformat()},'courses':list(courses.values())}
with open(out,'w') as f: json.dump(result,f,indent=2)
print(f"Wrote {len(result['courses'])} courses to {out}")
