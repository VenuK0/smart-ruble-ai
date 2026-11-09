/* Pure presentation helpers for assumption-based economics scenarios.
 * Does not calculate financial effectiveness: authoritative values come
 * from POST /economics/scenario (Python smartruble.economics.scenario).
 */
(function(root){
  "use strict";
  function volumes(raw){
    var n=Number(raw);
    if(!Number.isInteger(n)||n<1||n>100000000)throw Error("Некорректное число отчётов");
    return [
      {id:"low",label:"Низкая нагрузка",count:Math.max(1,Math.round(n*.6))},
      {id:"base",label:"Базовый сценарий",count:n},
      {id:"high",label:"Высокая нагрузка",count:Math.min(100000000,Math.round(n*1.4))}
    ];
  }
  function projection(result,years){
    var horizon=years==null?5:Number(years);
    if(!Number.isInteger(horizon)||horizon<1||horizon>20)throw Error("Некорректный горизонт");
    var net=Number(result.net_effect_rub_year),development=Number(result.development_rub);
    if(!Number.isFinite(net)||!Number.isFinite(development))throw Error("Некорректные показатели");
    return Array.from({length:horizon+1},function(_,year){
      return {year:year,value:Math.round((year*net-development)*100)/100};
    });
  }
  function chartLines(scenarios){
    var series=scenarios.map(function(item){return {id:item.id,values:projection(item.result,5)};});
    var numbers=series.flatMap(function(s){return s.values.map(function(v){return v.value;});});
    if(!numbers.length)return {lines:[],zero:95};
    var min=Math.min(0,...numbers),max=Math.max(0,...numbers);
    var diff=max-min||1;
    var y=function(value){return 12+166*(max-value)/diff;};
    return {
      lines:series.map(function(s){return {
        id:s.id,
        points:s.values.map(function(v){return {year:v.year,x:44+v.year*79,y:Math.round(y(v.value)*10)/10,value:v.value};})
      };}),
      zero:Math.round(y(0)*10)/10
    };
  }
  function barWidth(value,maximum){
    var n=Number(value),den=Number(maximum);
    if(!Number.isFinite(n)||!Number.isFinite(den)||den<=0)return 0;
    return Math.max(0,Math.min(100,Math.round(Math.abs(n)/den*1000)/10));
  }
  root.SREconomics={volumes:volumes,projection:projection,chartLines:chartLines,barWidth:barWidth};
})(typeof window!=="undefined"?window:globalThis);
