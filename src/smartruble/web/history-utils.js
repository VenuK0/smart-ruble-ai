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
  function filter(entries,query,status){
    var needle=String(query||"").trim().toLocaleLowerCase("ru-RU");
    return (entries||[]).filter(function(entry){
      var r=(entry||{}).record||{};
      if(status&&r.status!==status)return false;
      if(!needle)return true;
      var text=[r.receipt_id,r.merchant].concat((r.items||[]).map(function(x){return x.name;}));
      return text.some(function(value){return String(value==null?"":value).toLocaleLowerCase("ru-RU").includes(needle);});
    });
  }
  root.SRHistory={summarize:summarize,filter:filter};
})(typeof window!=="undefined"?window:globalThis);
