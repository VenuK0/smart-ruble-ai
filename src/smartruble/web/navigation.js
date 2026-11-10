/* SmartRubleAI UI v0.4: route-driven navigation without a sidebar.
 * Every workspace and tab has a real bookmarkable URL.
 * No client-side stored selection: the address itself is the source of truth.
 */
(function(root){
  "use strict";
  function spaceFromPath(path){
    var normalized=String(path||"").replace(/\/+$/,"")||"/app";
    if(normalized==="/app/receipts"||normalized==="/app/history")return "control";
    if(normalized==="/app/antifraud"||normalized==="/app/economics")return "analytics";
    return "funds";
  }
  function sync(){
    var space=spaceFromPath(root.location.pathname);
    var rootNode=root.document.documentElement;
    rootNode.dataset.space=space;
    var titles={funds:"Работа со средствами",control:"Проверка операций",analytics:"Исследования и аналитика"};
    var caption=root.document.getElementById("space-caption");
    if(caption)caption.textContent=titles[space];

    root.document.querySelectorAll("#workspaces a[data-space]").forEach(function(link){
      if(link.dataset.space===space)link.setAttribute("aria-current","location");
      else link.removeAttribute("aria-current");
    });
    root.document.querySelectorAll("#navigation .nav-section[data-space]").forEach(function(group){
      // Hidden groups must not be keyboard-focusable or visible to AT.
      group.hidden=group.dataset.space!==space;
    });
    return space;
  }
  root.SRWorkspaceNavigation={spaceFromPath:spaceFromPath,sync:sync};
  if(root.document.getElementById("workspaces"))sync();
})(typeof window!=="undefined"?window:globalThis);
