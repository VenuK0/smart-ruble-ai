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

test("readable numbers are stable across search and never replace receipt IDs",()=>{
 const names=history.shortLabels(entries);
 assert.equal(names["demo-1"],"ЧЕК-0003");
 assert.equal(names["demo-2"],"ЧЕК-0002");
 assert.equal(names["demo-3"],"ЧЕК-0001");
 assert.equal(history.filter(entries,"ЧЕК-0002","",names)[0].record.receipt_id,"demo-2");
 assert.equal(history.filter(entries,"DEMO-2","",names)[0].record.receipt_id,"demo-2");
 assert.equal(entries[1].record.receipt_id,"demo-2");
});
test("short labels handle empty journal and do not produce executable markup",()=>{
 const labels=history.shortLabels([]);
 assert.equal(Object.keys(labels).length,0);
 assert.equal(history.filter([],"ЧЕК-0001","",labels).length,0);
});

test("manual review statuses update summaries and filters without touching original receipts",()=>{
  const originals=[
    {record:{receipt_id:"r175",merchant:"Учебный магазин",status:"NEEDS_REVIEW",
      approved:0,review:175,personal_pay:0,items:[{name:"Arduino",decision:"REVIEW",amount:175}]}},
    {record:{receipt_id:"r200",merchant:"Учебный магазин",status:"NEEDS_REVIEW",
      approved:0,review:200,personal_pay:0,items:[{name:"Arduino",decision:"REVIEW",amount:200}]}}
  ];
  const before=JSON.stringify(originals);
  const reviews=[
    {receipt_id:"r175",item_index:0,status:"APPROVED",
      resolution:{decision:"APPROVE",category:"services",note:"Разрешено"}},
    {receipt_id:"r200",item_index:0,status:"REJECTED",
      resolution:{decision:"REJECT",category:null,note:"Не соответствует лимиту"}}
  ];
  assert.equal(history.outcome(originals[0],reviews).status,"APPROVED");
  assert.equal(history.outcome(originals[1],reviews).status,"REJECTED");
  const summary=history.summarize(originals,reviews);
  assert.equal(summary.approved,175);
  assert.equal(summary.review,0);
  assert.equal(summary.rejected,200);
  assert.equal(history.filter(originals,"","APPROVED",undefined,reviews).length,1);
  assert.equal(history.filter(originals,"","REJECTED",undefined,reviews).length,1);
  assert.equal(history.filter(originals,"","NEEDS_REVIEW",undefined,reviews).length,0);
  assert.equal(JSON.stringify(originals),before);
  assert.equal(originals[0].record.status,"NEEDS_REVIEW");
  assert.equal(originals[1].record.review,200);
});
test("unresolved, mixed and legacy receipts keep truthful current totals",()=>{
  const original={record:{receipt_id:"mixed",status:"NEEDS_REVIEW",approved:25,review:200,
    personal_pay:0,items:[
      {decision:"APPROVE",amount:25},{decision:"REVIEW",amount:100},
      {decision:"REVIEW",amount:100}]}};
  const one=[{receipt_id:"mixed",item_index:1,resolution:{decision:"REJECT"}}];
  const pending=history.outcome(original,one);
  assert.equal(pending.status,"NEEDS_REVIEW");
  assert.equal(pending.approved,25);
  assert.equal(pending.rejected,100);
  assert.equal(pending.review,100);
  const both=one.concat([{receipt_id:"mixed",item_index:2,resolution:{decision:"APPROVE"}}]);
  const finished=history.outcome(original,both);
  assert.equal(finished.status,"PARTIAL");
  assert.equal(finished.approved,125);
  assert.equal(finished.rejected,100);
  assert.equal(finished.review,0);
  assert.equal(history.outcome({record:{status:"NEEDS_REVIEW",approved:0,review:200,personal_pay:0}},both).review,200);
  assert.equal(original.record.items[1].decision,"REVIEW");
});
