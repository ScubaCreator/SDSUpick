import assert from 'node:assert/strict';
import { bundleSections, inferComponentPatternLength } from '../services/section-bundles.mjs';

const row=(n,type,time)=>({classNumber:String(n),section:type,instructor:'Professor',rating:4,mode:'In person',meetings:[{days:['M'],start:time,end:'23:59',location:'ROOM'}]});

assert.equal(inferComponentPatternLength([row(1,'Lecture','08:00'),row(2,'Lecture','09:00'),row(3,'Lecture','10:00')]),1);
assert.equal(bundleSections([row(1,'Lecture','08:00'),row(2,'Lecture','09:00')],'A E 331').length,2);

const chem251=[
  row(1849,'Discussion','13:00'),row(1852,'Laboratory','08:00'),
  row(1849,'Discussion','13:00'),row(1850,'Laboratory','08:00'),
  row(1849,'Discussion','13:00'),row(1851,'Laboratory','13:00')
];
const chemBundles=bundleSections(chem251,'CHEM 251');
assert.equal(chemBundles.length,3);
assert.equal(chemBundles[0].componentCount,2);
assert.deepEqual(chemBundles[0].classNumbers,['1849','1852']);
assert.deepEqual(chemBundles[1].classNumbers,['1849','1850']);
assert.equal(chemBundles[2].meetings.length,2);

const seniorDesign=bundleSections([row(8748,'Discussion','12:30'),row(8749,'Laboratory','10:00')],'E E 491W');
assert.equal(seniorDesign.length,1);
assert.equal(seniorDesign[0].componentCount,2);
assert.deepEqual(seniorDesign[0].classNumbers,['8748','8749']);

const triple=[
  row(100,'Lecture','09:00'),row(101,'Discussion','10:00'),row(102,'Laboratory','11:00'),
  row(100,'Lecture','09:00'),row(103,'Discussion','12:00'),row(104,'Laboratory','13:00')
];
const tripleBundles=bundleSections(triple,'CHEM 200');
assert.equal(tripleBundles.length,2);
assert.equal(tripleBundles[0].componentCount,3);
assert.deepEqual(tripleBundles[1].classNumbers,['100','103','104']);

console.log('section bundle tests passed');
