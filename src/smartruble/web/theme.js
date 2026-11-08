/* СмартРубль AI: переключение светлой и тёмной темы.
 * Тема применяется до загрузки CSS в index.html, чтобы избежать мигания.
 * Данные смет и операций не затрагиваются. */
(function(){
  "use strict";
  var key="smartruble-theme";
  var root=document.documentElement;
  var button=document.getElementById("theme-toggle");
  var glyph=document.getElementById("theme-glyph");
  var label=document.getElementById("theme-label");
  if(!button || !glyph || !label)return;

  function repaint(){
    var isDark=root.dataset.theme==="dark";
    glyph.textContent=isDark?"☼":"☾";
    label.textContent=isDark?"Светлая тема":"Тёмная тема";
    button.setAttribute("aria-pressed",isDark?"true":"false");
    button.setAttribute("aria-label",isDark?"Переключить на светлую тему":"Переключить на тёмную тему");
    button.title=isDark?"Включить светлую тему":"Включить тёмную тему";
  }
  button.addEventListener("click",function(){
    var theme=root.dataset.theme==="dark"?"light":"dark";
    root.dataset.theme=theme;
    try{localStorage.setItem(key,theme);}catch(_){/* Storage can be unavailable in private mode. */}
    repaint();
  });
  repaint();
})();
