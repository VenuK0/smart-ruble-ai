/* Проверка темы без браузера: Node.js built-in test + minimal document mocks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source=readFileSync("src/smartruble/web/theme.js","utf8");

function setup(initial,blocked=false){
  const attributes={};
  const handlers={};
  const glyph={textContent:""};
  const label={textContent:""};
  const root={dataset:{theme:initial}};
  const button={
    title:"",
    addEventListener:(name,handler)=>{handlers[name]=handler;},
    setAttribute:(key,val)=>{attributes[key]=val;}
  };
  const nodes={"theme-toggle":button,"theme-glyph":glyph,"theme-label":label};
  const saved={};
  const document={documentElement:root,getElementById:(id)=>nodes[id]};
  const localStorage={setItem:(k,v)=>{
    if(blocked)throw Error("storage denied");
    saved[k]=v;
  }};
  runInNewContext(source,{document,localStorage});
  return {attributes,handlers,glyph,label,root,button,saved};
}

test("переключение light → dark → light с запоминанием",()=>{
  const app=setup("light");
  assert.equal(app.attributes["aria-pressed"],"false");
  assert.equal(app.label.textContent,"Тёмная тема");
  app.handlers.click();
  assert.equal(app.root.dataset.theme,"dark");
  assert.equal(app.attributes["aria-pressed"],"true");
  assert.equal(app.saved["smartruble-theme"],"dark");
  assert.equal(app.label.textContent,"Светлая тема");
  assert.match(app.button.title,/светлую тему/);
  app.handlers.click();
  assert.equal(app.root.dataset.theme,"light");
  assert.equal(app.saved["smartruble-theme"],"light");
  assert.equal(app.attributes["aria-pressed"],"false");
});

test("уже выбранная тёмная тема корректно показывается",()=>{
  const app=setup("dark");
  assert.equal(app.attributes["aria-pressed"],"true");
  assert.equal(app.label.textContent,"Светлая тема");
});

test("режим приватности не блокирует переключение",()=>{
  const app=setup("light",true);
  assert.doesNotThrow(()=>app.handlers.click());
  assert.equal(app.root.dataset.theme,"dark");
  assert.equal(app.attributes["aria-pressed"],"true");
});
