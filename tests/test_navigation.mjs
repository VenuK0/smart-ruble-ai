import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync("src/smartruble/web/navigation.js","utf8");
function setup(path){
  const spaces=["funds","control","analytics"];
  const links=spaces.map(space=>{
    const attributes={};
    return {dataset:{space},
      setAttribute:(k,v)=>{attributes[k]=v;},
      removeAttribute:k=>{delete attributes[k];},
      getAttribute:k=>attributes[k]||null};
  });
  const groups=spaces.map(space=>({dataset:{space},hidden:false}));
  const caption={textContent:""};
  const doc={
    documentElement:{dataset:{}},
    getElementById:id=>id==="workspaces"?{}:id==="space-caption"?caption:null,
    querySelectorAll:selector=>selector.startsWith("#workspaces")?links:groups
  };
  const window={document:doc,location:{pathname:path}};
  runInNewContext(source,{window});
  return {window,links,groups,caption,doc};
}
test("все шесть адресов распределены по трём рабочим пространствам",()=>{
  const f=setup("/app");
  const fn=f.window.SRWorkspaceNavigation.spaceFromPath;
  for(const route of ["/app","/app/overview","/app/estimates"]){
    assert.equal(fn(route),"funds");
  }
  for(const route of ["/app/receipts","/app/history"]){
    assert.equal(fn(route),"control");
  }
  for(const route of ["/app/antifraud","/app/economics"]){
    assert.equal(fn(route),"analytics");
  }
});
test("текущее пространство выделяется, остальные ссылки не активны",()=>{
  const f=setup("/app/receipts");
  assert.equal(f.doc.documentElement.dataset.space,"control");
  assert.equal(f.links[1].getAttribute("aria-current"),"location");
  assert.equal(f.links[0].getAttribute("aria-current"),null);
  assert.equal(f.links[2].getAttribute("aria-current"),null);
  assert.equal(f.caption.textContent,"Проверка операций");
});
test("неактивные группы вкладок скрыты для клавиатуры и скринридеров",()=>{
  const f=setup("/app/economics");
  assert.deepEqual(f.groups.map(x=>x.hidden),[true,true,false]);
  assert.equal(f.links[2].getAttribute("aria-current"),"location");
});
test("навигация следует URL без сохранённых устаревших настроек",()=>{
  const f=setup("/app");
  f.window.location.pathname="/app/history";
  assert.equal(f.window.SRWorkspaceNavigation.sync(),"control");
  assert.deepEqual(f.groups.map(x=>x.hidden),[true,false,true]);
  assert.equal(f.links[1].getAttribute("aria-current"),"location");
  assert.equal(f.links[0].getAttribute("aria-current"),null);
});
