/* Pure functions for the research transaction ledger.
 * Input is the server's most recent (up to 100) audit entries, not the entire
 * organization history. This module does not modify entries or decisions.
 */
(function(root){
  "use strict";
  function numeric(value){var n=Number(value);return Number.isFinite(n)?n:0;}
  function summarize(entries){
    var total={count:0,approved:0,review:0,rejected:0};
    (entries||[]).forEach(function(entry){
      var r=(entry||{}).record||{};
      total.count++;
      total.approved+=numeric(r.approved);
      total.review+=numeric(r.review);
      total.rejected+=numeric(r.personal_pay);
    });
    for(var key of ["approved","review","rejected"]){
      total[key]=Math.round(total[key]*100)/100;
    }
    return total;
  }
  // Readable numbers refer only to the current (up to 100) entries.
  // The immutable receipt_id is still used for selection, audit and CSV.
  function shortLabels(entries){
    var list=Array.isArray(entries)?entries:[];
    var labels=Object.create(null);
    list.forEach(function(entry,index){
      var id=entry&&entry.record&&entry.record.receipt_id;
      if(typeof id==="string"&&id){
        labels[id]="ЧЕК-"+String(list.length-index).padStart(4,"0");
      }
    });
    return labels;
  }
  function filter(entries,query,status,shortNumbers){
    var needle=String(query||"").trim().toLocaleLowerCase("ru-RU");
    return (entries||[]).filter(function(entry){
      var r=(entry||{}).record||{};
      if(status&&r.status!==status)return false;
      if(!needle)return true;
      var text=[r.receipt_id,r.merchant,shortNumbers&&shortNumbers[r.receipt_id]].concat((r.items||[]).map(function(x){return x.name;}));
      return text.some(function(value){return String(value==null?"":value).toLocaleLowerCase("ru-RU").includes(needle);});
    });
  }
  root.SRHistory={summarize:summarize,filter:filter,shortLabels:shortLabels};
})(typeof window!=="undefined"?window:globalThis);
