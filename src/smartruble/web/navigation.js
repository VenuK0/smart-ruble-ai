/* СмартРубль AI: только поведение бокового меню.
 * Пункты ведут на реальные маршруты. Состояние панели хранится локально,
 * на мобильной ширине панель всегда показывается с текстовыми подписями. */
(function(){
  "use strict";
  var toggle=document.getElementById("sidebar-collapse");
  if(!toggle)return;

  var root=document.documentElement;
  var key="smartruble-sidebar";

  function sync(){
    var collapsed=root.dataset.sidebar==="collapsed";
    toggle.setAttribute("aria-expanded",String(!collapsed));
    toggle.setAttribute("aria-label",collapsed?"Развернуть боковое меню":"Свернуть боковое меню");
    toggle.title=collapsed?"Развернуть боковое меню":"Свернуть боковое меню";
  }

  toggle.addEventListener("click",function(){
    var next=root.dataset.sidebar==="collapsed"?"expanded":"collapsed";
    root.dataset.sidebar=next;
    try{localStorage.setItem(key,next);}catch(_){/* Private browsing: session-only preference. */}
    sync();
  });

  sync();
})();
