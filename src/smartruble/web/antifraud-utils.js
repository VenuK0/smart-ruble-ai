/* SmartRubleAI · anti-fraud presentation helpers.
 * The model score is a relative ranking, NOT a probability or calibrated risk.
 */
(function(root){
 "use strict";
 function score(value){var v=Number(value);return Number.isFinite(v)?v:0;}
 function percent(fraction){
   var n=Number(fraction);
   return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n*1000)/10)):0;
 }
 function barPositions(rows){
   var list=Array.isArray(rows)?rows:[];
   if(!list.length)return [];
   var scores=list.map(function(x){return score(x.anomaly_score);});
   var lowest=Math.min.apply(null,scores),highest=Math.max.apply(null,scores);
   return scores.map(function(v){
     return highest===lowest?60:Math.round(12+88*(v-lowest)/(highest-lowest));
   });
 }
 function notes(signals){
   var x=signals||{};
   var items=[];
   if(percent(x.night_share)>=30)items.push("Большая доля операций в ночные часы.");
   if(percent(x.round_large_share)>=30)items.push("Часто встречаются крупные круглые суммы.");
   if(percent(x.largest_student_share)>=60)items.push("Заметна концентрация операций у одного получателя.");
   if(!items.length)items.push("Ярко выраженные признаки по выбранным простым порогам не обнаружены.");
   return items;
 }
 // These are transparent comparisons of observed signals, NOT feature
 // attributions from Isolation Forest and not evidence of misconduct.
 function comparisonHighlights(item){
   var s=item&&item.signals, peer=item&&item.comparison;
   var b=peer&&peer.signals;
   if(!s||!b||!Number.isFinite(Number(peer.merchant_count))||Number(peer.merchant_count)<1)return [];
   var results=[];
   function pct(v){return String(percent(v)).replace(".",",")+"%";}
   if(Number(s.night_share)>=.30 && Number(s.night_share)-Number(b.night_share)>=.15){
     results.push("Ночные операции: "+pct(s.night_share)+" против "+pct(b.night_share)+" у остальных.");
   }
   if(Number(s.round_large_share)>=.30 && Number(s.round_large_share)-Number(b.round_large_share)>=.15){
     results.push("Крупные круглые суммы: "+pct(s.round_large_share)+" против "+pct(b.round_large_share)+" у остальных.");
   }
   if(Number(s.largest_student_share)>=.60 && Number(s.largest_student_share)-Number(b.largest_student_share)>=.15){
     results.push("Доля одного получателя: "+pct(s.largest_student_share)+" против "+pct(b.largest_student_share)+" у остальных.");
   }
   var amount=Number(s.average_amount_rub),peerAmount=Number(b.average_amount_rub);
   if(peerAmount>0&&amount>peerAmount*1.5&&amount>=10000){
     results.push("Средняя сумма операции заметно выше среднего среди остальных продавцов.");
   }
   var tx=Number(s.transaction_count),peerTx=Number(b.transaction_count);
   if(peerTx>0&&tx>peerTx*1.5&&tx>=10){
     results.push("Операций у продавца заметно больше, чем в среднем у остальных.");
   }
   return results;
 }
 function comparisonTeaser(item){
   var highlights=comparisonHighlights(item);
   return highlights.length?highlights[0].replace(/\.$/,""):
     "Оценка основана на сочетании признаков";
 }
 root.SRAntifraud={percent:percent,barPositions:barPositions,notes:notes,
   comparisonHighlights:comparisonHighlights,comparisonTeaser:comparisonTeaser};
})(typeof window!=="undefined"?window:globalThis);
