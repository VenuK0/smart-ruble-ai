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
 root.SRAntifraud={percent:percent,barPositions:barPositions,notes:notes};
})(typeof window!=="undefined"?window:globalThis);
