import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/smartruble/web/receipt-utils.js","utf8");
const scope={};
runInNewContext(source,scope);
const inspect=scope.SRReceipt.inspect;

test("simple two-item receipt totals and per-line sums",()=>{
  const r=inspect([{name:"Микроконтроллер",qty:"1",price:"2500"},{name:"Шоколад",qty:"1",price:"240"}]);
  assert.equal(r.valid,true);
  assert.equal(r.count,2);
  assert.equal(r.total,2740);
  assert.deepEqual(Array.from(r.amounts),[2500,240]);
});
test("fractional quantities with exact two-decimal totals are supported",()=>{
  const r=inspect([{name:"Услуга",qty:"0.5",price:"120.50"},{name:"Товар",qty:"2",price:"1.23"}]);
  assert.equal(r.valid,true);
  assert.equal(r.total,62.71);
});
test("empty names and nonpositive values are rejected",()=>{
  for(const item of [
    {name:"",qty:"1",price:"10"},
    {name:"Товар",qty:"0",price:"10"},
    {name:"Товар",qty:"1",price:"-10"},
    {name:"Товар",qty:"",price:"10"},
    {name:"Товар",qty:"1",price:""},
  ]){
    const r=inspect([item]);
    assert.equal(r.valid,false,JSON.stringify(item));
    assert.match(r.message,/позицию №1/);
  }
});
test("more than two kopeck decimals in unit or resulting amount are rejected",()=>{
  assert.equal(inspect([{name:"Цена",qty:"1",price:"12.345"}]).valid,false);
  assert.equal(inspect([{name:"Сумма",qty:"0.5",price:"1.23"}]).valid,false);
  assert.equal(inspect([{name:"Товар",qty:"1",price:"1e5"}]).valid,false);
});
test("server maximums are enforced by receipt precheck",()=>{
  assert.equal(inspect([{name:"Большая цена",qty:"1",price:"1000000001"}]).valid,false);
  assert.equal(inspect([{name:"Большое количество",qty:"100001",price:"1"}]).valid,false);
  assert.equal(inspect([{name:"Большая сумма",qty:"100000",price:"100000"}]).valid,false);
  const hundred=Array.from({length:100},()=>({name:"Товар",qty:"1",price:"1.00"}));
  assert.equal(inspect(hundred).valid,true);
  assert.equal(inspect(hundred).total,100);
  assert.equal(inspect(hundred.concat(hundred[0])).valid,false);
});
test("one invalid line cannot silently pass the whole check",()=>{
  const r=inspect([{name:"Нормальный товар",qty:"1",price:"2"},{name:"",qty:"1",price:"3"}]);
  assert.equal(r.valid,false);
  assert.equal(r.total,2);
  assert.deepEqual(Array.from(r.amounts),[2,null]);
});

test("decimal comma and typed thousand separators work without currency glyph",()=>{
  const x=inspect([{name:"Резистор",qty:"2",price:"1 250,50"}]);
  assert.equal(x.valid,true);
  assert.equal(x.total,2501);
  const y=inspect([{name:"Жидкость",qty:"1,5",price:"100,00"}]);
  assert.equal(y.valid,true);
  assert.equal(y.total,150);
});
test("currency glyph and wrong decimal formats are rejected in numeric fields",()=>{
  for(const raw of ["12₽","12 руб","1.2.3","2,345","1e3"]){
    assert.equal(inspect([{name:"Товар",qty:"1",price:raw}]).valid,false);
  }
});

test("receipt error points to the exact invalid input rather than the whole form",()=>{
  const items=[
    {name:"",qty:"1",price:"50"},
    {name:"Товар",qty:"0",price:"50"},
    {name:"Услуга",qty:"1",price:"12,345"}
  ];
  const r=inspect(items);
  assert.equal(r.valid,false);
  assert.deepEqual(Array.from(r.errors,x=>x.field),["name","qty","price"]);
  assert.deepEqual(Array.from(r.errors,x=>x.index),[0,1,2]);
  assert.match(r.errors[1].message,/Количество/);
  assert.match(r.errors[2].message,/цену/);
});
test("a corrected receipt produces no lingering inline errors",()=>{
  const r=inspect([{name:"Товар",qty:"2",price:"1 250,50"}]);
  assert.equal(r.valid,true);
  assert.equal(r.errors.length,0);
  assert.equal(r.total,2501);
});
