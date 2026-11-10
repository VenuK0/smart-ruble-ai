import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const sandbox={};
runInNewContext(readFileSync("src/smartruble/web/estimate-editor.js","utf8"),sandbox);
const {parseRub,inspect,importText,formatRub,categories}=sandbox.SREstimate;

test("обычные цифры заменяют тире и символ рубля",()=>{
  for(const [raw,cents] of [["50000",5000000],["50 000",5000000],["1250,50",125050],
                            ["1250.50",125050],["0,01",1],["120 000,5",12000050]]){
    const x=parseRub(raw);
    assert.equal(x.ok,true,raw);
    assert.equal(x.cents,cents,raw);
  }
});
test("нельзя ввести валютный знак, отрицательную сумму или лишние копейки",()=>{
  for(const raw of ["-100","100₽","100 руб","0","0.00","1e3","NaN","Infinity","12,345","1,000.00",""]){
    assert.equal(parseRub(raw).ok,false,raw);
  }
  assert.equal(parseRub("100000000001").ok,false);
});
test("суммируются несколько категорий, включая повтор одной статьи",()=>{
  const rows=[
    {category:"consumables",amount:"50000"},
    {category:"equipment",amount:"120 000"},
    {category:"services",amount:"10 000"},
    {category:"consumables",amount:"1250,50"},
  ];
  const x=inspect(rows);
  assert.equal(x.valid,true);
  assert.equal(x.totalCents,18125050);
  assert.equal(x.lines.length,4);
  assert.deepEqual(Array.from(x.lines),[
    "Расходные материалы - 50000.00","Оборудование - 120000.00",
    "Услуги - 10000.00","Расходные материалы - 1250.50"
  ]);
  assert.ok(formatRub(x.totalCents).includes("181"));
});
test("пустая категория и ошибочная сумма не могут отправить частичную смету",()=>{
  const x=inspect([{category:"equipment",amount:"120000"},{category:"",amount:"50000"}]);
  assert.equal(x.valid,false);
  assert.match(x.message,/строки №2/);
  assert.equal(x.lines.length,1);
  const y=inspect([{category:"equipment",amount:"120000"},{category:"services",amount:"bad"}]);
  assert.equal(y.valid,false);
  assert.match(y.message,/Строка №2/);
});
test("не больше 50 статей и никаких пустых смет",()=>{
  assert.equal(inspect([]).valid,false);
  const one={category:"equipment",amount:"1"};
  assert.equal(inspect(Array(50).fill(one)).valid,true);
  assert.equal(inspect(Array(51).fill(one)).valid,false);
});
test("импорт без специальных символов: дефис, двоеточие, пробелы, руб",()=>{
  const input="Расходные материалы - 50 000\nОборудование: 120000 руб\nУслуги хостинга - 10000";
  const r=importText(input);
  assert.equal(r.valid,true,r.message);
  assert.deepEqual(Array.from(r.rows,x=>x.category),["consumables","equipment","services"]);
  assert.equal(inspect(r.rows).totalCents,18000000);
});
test("неизвестная строка не теряется незаметно при импорте",()=>{
  const input="Оборудование - 1000\nНеизвестный раздел - 2000";
  const r=importText(input);
  assert.equal(r.valid,false);
  assert.equal(r.rows.length,0);
  assert.match(r.message,/№2/);
  assert.equal(importText("Оборудование 1000").valid,false);
  assert.equal(importText("Материалы - ???").valid,false);
});
test("поддерживаются четыре категории, а форматирование всегда добавляет ₽ само",()=>{
  assert.equal(categories.length,4);
  assert.equal(new Set(categories.map(c=>c.id)).size,4);
  assert.ok(formatRub(125050).includes("₽"));
  assert.ok(formatRub(0).includes("₽"));
});
