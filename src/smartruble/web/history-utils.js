/* Pure functions for the research transaction ledger.
 * Input is the server's most recent (up to 100) audit entries, not the entire
 * organization history. This module does not modify entries or decisions.
 */
(function(root){
  "use strict";
  function numeric(value){var n=Number(value);return Number.isFinite(n)?n:0;}
  // The original receipt and its hash never change. Derive the *current*
  // display amounts from separate review events returned by the server.
  // If older records lack item decisions, preserve the original summary.
  function outcome(entry,reviews){
    var r=(entry||{}).record||{};
    var items=r.items;
    if(!Array.isArray(items)||!items.length||items.some(function(x){
      return !["APPROVE","REVIEW","REJECT"].includes(x.decision);
    })){
      return {status:r.status,approved:numeric(r.approved),
              review:numeric(r.review),rejected:numeric(r.personal_pay)};
    }
    var result={status:r.status,approved:0,review:0,rejected:0};
    items.forEach(function(item,index){
      var decision=item.decision;
      if(decision==="REVIEW"){
        var found=(reviews||[]).find(function(x){
          return x.receipt_id===r.receipt_id&&x.item_index===index;
        });
        if(found&&found.resolution){
          if(found.resolution.decision==="APPROVE")decision="APPROVE";
          else if(found.resolution.decision==="REJECT")decision="REJECT";
        }
      }
      var amount=numeric(item.amount);
      if(decision==="APPROVE")result.approved+=amount;
      else if(decision==="REJECT")result.rejected+=amount;
      else result.review+=amount;
    });
    for(var key of ["approved","review","rejected"])
      result[key]=Math.round(result[key]*100)/100;
    // While any item is still pending, preserve the initial status semantics.
    if(result.review>0)return result;
    if(result.approved>0&&result.rejected>0)result.status="PARTIAL";
    else if(result.approved>0)result.status="APPROVED";
    else if(result.rejected>0)result.status="REJECTED";
    return result;
  }
  function summarize(entries,reviews){
    var total={count:0,approved:0,review:0,rejected:0};
    (entries||[]).forEach(function(entry){
      var final=outcome(entry,reviews);
      total.count++;
      total.approved+=final.approved;
      total.review+=final.review;
      total.rejected+=final.rejected;
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
  function filter(entries,query,status,shortNumbers,reviews){
    var needle=String(query||"").trim().toLocaleLowerCase("ru-RU");
    return (entries||[]).filter(function(entry){
      var r=(entry||{}).record||{};
      if(status&&outcome(entry,reviews).status!==status)return false;
      if(!needle)return true;
      var text=[r.receipt_id,r.merchant,shortNumbers&&shortNumbers[r.receipt_id]].concat((r.items||[]).map(function(x){return x.name;}));
      return text.some(function(value){return String(value==null?"":value).toLocaleLowerCase("ru-RU").includes(needle);});
    });
  }
  root.SRHistory={summarize:summarize,filter:filter,shortLabels:shortLabels,outcome:outcome};
})(typeof window!=="undefined"?window:globalThis);
