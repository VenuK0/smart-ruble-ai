/* Deterministic, browser-independent receipt arithmetic for the demo.
 * Financial logic of approval stays on the server; this is a form precheck.
 * The backend enforces its own limits and receipt-id idempotency.
 */
(function(root){
  "use strict";
  function normalizeDecimal(value){
    // Accept decimal comma and space-grouped thousands on a normal keyboard.
    return String(value==null?"":value).trim().replace(/[\\s\\u00a0\\u202f]/g,"").replace(",",".");
  }
  function inspect(items){
    var totalCents=0;
    var amounts=[];
    var message="";
    if(!Array.isArray(items)||items.length<1||items.length>100){
      return {valid:false,message:"Чек должен содержать от 1 до 100 позиций.",total:0,count:Array.isArray(items)?items.length:0,amounts:[]};
    }
    items.forEach(function(item,index){
      var priceRaw=normalizeDecimal(item.price);
      var qtyRaw=normalizeDecimal(item.qty);
      var price=Number(priceRaw),qty=Number(qtyRaw);
      var amount=price*qty;
      var cents=Math.round(amount*100);
      var ok=typeof item.name==="string" && item.name.trim().length>0 &&
        item.name.trim().length<=250 &&
        /^\d+(?:\.\d{1,2})?$/.test(priceRaw) &&
        /^\d+(?:\.\d+)?$/.test(qtyRaw) &&
        Number.isFinite(price)&&Number.isFinite(qty) &&
        price>0&&price<=1e9&&qty>0&&qty<=100000 &&
        Number.isFinite(amount)&&amount>0&&amount<=1e9 &&
        Math.abs(amount*100-cents)<0.000001;
      if(!ok){
        amounts.push(null);
        if(!message)message="Проверьте позицию №"+(index+1)+": название, количество и цену. У цены и суммы позиции должно быть не больше двух знаков после запятой.";
      }else{
        totalCents+=cents;
        amounts.push(cents/100);
      }
    });
    return {valid:!message,message:message,total:totalCents/100,count:items.length,amounts:amounts};
  }
  root.SRReceipt={inspect:inspect,normalizeDecimal:normalizeDecimal};
})(typeof window!=="undefined"?window:globalThis);
