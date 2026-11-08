/* СмартРубль AI — экспорт реестров в Excel-совместимый CSV.
   Все операции клиентские: данные остаются локальными в браузере.
   Имя листа/файла фиксировано, пользовательский ввод защищён от CSV-формул. */
(function(root){
  "use strict";
  function cell(value){
    var numeric=typeof value==="number" && Number.isFinite(value);
    var s=value==null?"":String(value);
    if(!numeric && /^[\s\uFEFF]*[=+\-@]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function serialize(headers,rows){
    if(!Array.isArray(headers)||!Array.isArray(rows))throw Error("Неверные данные экспорта");
    var data=[headers].concat(rows).map(function(row){
      if(!Array.isArray(row)||row.length!==headers.length)throw Error("Неполная строка экспорта");
      return row.map(cell).join(";");
    }).join("\r\n");
    return "\uFEFF"+data+"\r\n";
  }
  function download(filename,headers,rows){
    if(typeof document==="undefined"||typeof Blob==="undefined"||typeof URL==="undefined")return false;
    var blob=new Blob([serialize(headers,rows)],{type:"text/csv;charset=utf-8"});
    var url=URL.createObjectURL(blob);
    var link=document.createElement("a");
    link.href=url;
    link.download=filename;
    link.style.display="none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},0);
    return true;
  }
  root.SRCSV={serialize:serialize,download:download};
})(typeof window!=="undefined"?window:globalThis);
