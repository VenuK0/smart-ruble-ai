import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/smartruble/web/history-utils.js","utf8");
const ctx={};runInNewContext(source,ctx);
const history=ctx.SRHistory;
const entries=[
  {record:{receipt_id:"demo-1",merchant:"Лента",status:"NEEDS_REVIEW",approved:0,review:500,personal_pay:0,items:[{name:"Лак"}]}},
  {record:{receipt_id:"demo-2",merchant:"ООО Электроника",status:"APPROVED",approved:2500.12,review:0,personal_pay:0,items:[{name:"Arduino Uno R3"}]}},
  {record:{receipt_id:"demo-3",merchant:"Поставка",status:"PARTIAL",approved:10,review:0,personal_pay:340,items:[{name:"Шоколад"}]}}
];
test("summary separates approved, review and rejected without double counting",()=>{
  const x=history.summarize(entries);
  assert.equal(x.count,3);
  assert.equal(x.approved,2510.12);
  assert.equal(x.review,500);
  assert.equal(x.rejected,340);
});
test("searches by vendor, receipt ID and item name ignoring case",()=>{
  assert.equal(history.filter(entries,"лента","").length,1);
  assert.equal(history.filter(entries,"DEMO-2","").length,1);
  assert.equal(history.filter(entries,"лак","").length,1);
  assert.equal(history.filter(entries,"arduino","").length,1);
});
test("status filter composes with search and does not mutate the ledger",()=>{
  const x=history.filter(entries,"","NEEDS_REVIEW");
  assert.equal(x.length,1);
  assert.equal(x[0].record.receipt_id,"demo-1");
  assert.equal(history.filter(entries,"лак","APPROVED").length,0);
  assert.equal(entries.length,3);
});
test("empty data and decimal floats are handled consistently",()=>{
  assert.equal(history.summarize([]).count,0);
  assert.equal(history.filter([],"","").length,0);
  const x=history.summarize([{record:{approved:.1,review:.2,personal_pay:0}},{record:{approved:.2,review:.1,personal_pay:0}}]);
  assert.equal(x.approved,.3);
  assert.equal(x.review,.3);
});
