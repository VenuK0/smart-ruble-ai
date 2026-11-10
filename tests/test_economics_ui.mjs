import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const scope={};
runInNewContext(readFileSync("src/smartruble/web/economics-utils.js","utf8"),scope);
const {volumes,projection,chartLines,barWidth}=scope.SREconomics;
test("three sensitivity scenarios are 60, 100 and 140 percent of workload",()=>{
  const v=Array.from(volumes(5000));
  assert.deepEqual(v.map(x=>x.count),[3000,5000,7000]);
  assert.deepEqual(v.map(x=>x.id),["low","base","high"]);
});
test("scenario volumes honor integer API bounds",()=>{
  assert.throws(()=>volumes(0),/Некорректное/);
  assert.throws(()=>volumes(12.5),/Некорректное/);
  assert.throws(()=>volumes(100000001),/Некорректное/);
  assert.deepEqual(Array.from(volumes(1)).map(x=>x.count),[1,1,1]);
  assert.deepEqual(Array.from(volumes(100000000)).map(x=>x.count),[60000000,100000000,100000000]);
});
test("five-year cumulative effect deducts development investment in year zero",()=>{
  const p=Array.from(projection({net_effect_rub_year:250000,development_rub:1018000}));
  assert.equal(p.length,6);
  assert.equal(p[0].value,-1018000);
  assert.equal(p[4].value,-18000);
  assert.equal(p[5].value,232000);
  assert.equal(p[5].year,5);
});
test("negative annual effect remains negative over time",()=>{
  const p=Array.from(projection({net_effect_rub_year:-20000,development_rub:50000}));
  assert.equal(p[0].value,-50000);
  assert.equal(p[5].value,-150000);
  assert.throws(()=>projection({net_effect_rub_year:2,development_rub:0},21),/горизонт/);
});
test("chart coordinates stay inside viewBox, and zero is shown",()=>{
  const sets=[
    {id:"low",result:{net_effect_rub_year:-20000,development_rub:1018000}},
    {id:"base",result:{net_effect_rub_year:250000,development_rub:1018000}},
    {id:"high",result:{net_effect_rub_year:610000,development_rub:1018000}}
  ];
  const chart=chartLines(sets);
  assert.equal(chart.lines.length,3);
  assert.equal(chart.lines[0].points.length,6);
  assert.ok(chart.zero>=12&&chart.zero<=178);
  for(const line of chart.lines){
    assert.equal(line.points[0].x,44);
    assert.equal(line.points[5].x,439);
    for(const p of line.points){assert.ok(p.y>=12&&p.y<=178);}
  }
});
test("simple comparative bars never present percentages outside 0..100",()=>{
  assert.equal(barWidth(0,500),0);
  assert.equal(barWidth(-250,500),50);
  assert.equal(barWidth(250,500),50);
  assert.equal(barWidth(900,500),100);
  assert.equal(barWidth(100,0),0);
});

const parseLocaleNumber=scope.SREconomics.parseLocaleNumber;
const validateAssumptions=scope.SREconomics.validateAssumptions;
const defaultInputs={
  "econ-count":"5 000","econ-before":"20","econ-after":"8",
  "econ-hour":"450","econ-maint":"200000","econ-dev":"1018000"
};
test("economics fields accept numbers with spaces and comma or dot decimals",()=>{
  assert.equal(parseLocaleNumber("1 250,50"),1250.5);
  assert.equal(parseLocaleNumber("1\u00a0250.50"),1250.5);
  assert.equal(parseLocaleNumber("0,01"),.01);
  const r=validateAssumptions({...defaultInputs,"econ-before":"20,5","econ-hour":"1 250,50"});
  assert.equal(r.valid,true);
  assert.equal(r.values["econ-count"],5000);
  assert.equal(r.values["econ-before"],20.5);
  assert.equal(r.values["econ-hour"],1250.5);
});
test("economics fields reject special characters, empty or unsupported values",()=>{
  for(const bad of [""," ","-1","1e3","100₽","100 руб","12,345.6","Infinity","NaN","1.2.3"]){
    assert.equal(parseLocaleNumber(bad),null,bad);
  }
  assert.equal(validateAssumptions({...defaultInputs,"econ-count":"1,5"}).valid,false);
  assert.equal(validateAssumptions({...defaultInputs,"econ-hour":"100 ₽"}).errors[0].id,"econ-hour");
  assert.equal(validateAssumptions({...defaultInputs,"econ-after":"21"}).errors[0].id,"econ-after");
  assert.equal(validateAssumptions({...defaultInputs,"econ-dev":""}).errors[0].id,"econ-dev");
});
