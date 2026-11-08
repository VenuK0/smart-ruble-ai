import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/smartruble/web/export.js","utf8");
const scope={};
runInNewContext(source,scope);
const csv=scope.SRCSV;

test("CSV is UTF-8 BOM and uses Russian Excel semicolon format",()=>{
  const result=csv.serialize(["Смета","Лимит"],[["Г-1",1000]]);
  assert.equal(result,'\uFEFF"Смета";"Лимит"\r\n"Г-1";"1000"\r\n');
});
test("safe escaping of quotes, separators and newlines",()=>{
  const result=csv.serialize(["Наименование"],[['Текст "А";\nБ']]);
  assert.match(result,/"Текст ""А"";\nБ"/);
});
test("spreadsheet formula injection is prevented for user strings",()=>{
  const result=csv.serialize(["id"],[["=1+1"],["+cmd"],["-HYPERLINK()"],["@SUM()"],["  =cmd"],[100]]);
  for(const dangerous of ["'=1+1","'+cmd","'-HYPERLINK()","'@SUM()","'  =cmd"]){
    assert.ok(result.includes(dangerous),dangerous);
  }
  assert.ok(result.includes('"100"'));
});
test("reject incomplete CSV rows",()=>{
  assert.throws(()=>csv.serialize(["a","b"],[["a"]]),/Неполная строка/);
});
