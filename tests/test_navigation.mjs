import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/smartruble/web/navigation.js","utf8");

function setup(initial,storageBlocked=false){
  const attrs={};
  const saved={};
  const events={};
  const root={dataset:initial?{sidebar:initial}:{}};
  const toggle={
    title:"",
    setAttribute:(k,v)=>{attrs[k]=v;},
    addEventListener:(event,fn)=>{events[event]=fn;}
  };
  const document={
    documentElement:root,
    getElementById:(id)=>id==="sidebar-collapse"?toggle:null
  };
  const localStorage={
    setItem:(k,v)=>{
      if(storageBlocked)throw Error("storage unavailable");
      saved[k]=v;
    }
  };
  runInNewContext(source,{document,localStorage});
  return {attrs,saved,events,root,toggle};
}
test("навигация раскрыта по умолчанию",()=>{
  const app=setup();
  assert.equal(app.attrs["aria-expanded"],"true");
  assert.equal(app.attrs["aria-label"],"Свернуть боковое меню");
});
test("сворачивание сохраняет выбор, разворачивание возвращает подписи",()=>{
  const app=setup();
  app.events.click();
  assert.equal(app.root.dataset.sidebar,"collapsed");
  assert.equal(app.attrs["aria-expanded"],"false");
  assert.equal(app.toggle.title,"Развернуть боковое меню");
  assert.equal(app.saved["smartruble-sidebar"],"collapsed");
  app.events.click();
  assert.equal(app.root.dataset.sidebar,"expanded");
  assert.equal(app.attrs["aria-expanded"],"true");
  assert.equal(app.saved["smartruble-sidebar"],"expanded");
});
test("после перезагрузки сохранённое компактное меню корректно отражено кнопкой",()=>{
  const app=setup("collapsed");
  assert.equal(app.attrs["aria-expanded"],"false");
  app.events.click();
  assert.equal(app.root.dataset.sidebar,"expanded");
});
test("отключённое хранилище не блокирует интерфейс",()=>{
  const app=setup(undefined,true);
  assert.doesNotThrow(()=>app.events.click());
  assert.equal(app.root.dataset.sidebar,"collapsed");
  assert.equal(app.attrs["aria-expanded"],"false");
});
