/* Deterministic, browser-independent receipt arithmetic for the demo.
 * Financial logic of approval stays on the server; this is a form precheck.
 * The backend enforces its own limits and receipt-id idempotency.
 */
(function(root){
  "use strict";
  function normalizeDecimal(value){
    // Accept decimal comma and space-grouped thousands on a normal keyboard.
    return String(value==null?"":value).trim().replace(/[\s\u00a0\u202f]/g,"").replace(",",".");
  }
  function inspect(items){
    var totalCents=0;
    var amounts=[];
    var errors=[];
    var message="";
    if(!Array.isArray(items)||items.length<1||items.length>100){
      return {valid:false,message:"Чек должен содержать от 1 до 100 позиций.",total:0,count:Array.isArray(items)?items.length:0,amounts:[],errors:[]};
    }
    items.forEach(function(item,index){
      var priceRaw=normalizeDecimal(item.price);
      var qtyRaw=normalizeDecimal(item.qty);
      var price=Number(priceRaw),qty=Number(qtyRaw);
      var amount=price*qty;
      var cents=Math.round(amount*100);
      var nameOk=typeof item.name==="string" && item.name.trim().length>0 && item.name.trim().length<=250;
      var qtyOk=/^\d+(?:\.\d+)?$/.test(qtyRaw) && Number.isFinite(qty) && qty>0 && qty<=100000;
      var priceOk=/^\d+(?:\.\d{1,2})?$/.test(priceRaw) && Number.isFinite(price) && price>0 && price<=1e9;
      var amountOk=Number.isFinite(amount)&&amount>0&&amount<=1e9 &&
        Math.abs(amount*100-cents)<0.000001;
      if(!(nameOk&&qtyOk&&priceOk&&amountOk)){
        amounts.push(null);
        var field=!nameOk?"name":!qtyOk?"qty":"price";
        var detail=!nameOk?"Укажите название товара или услуги (до 250 символов).":
          !qtyOk?"Количество должно быть положительным числом не более 100 000.":
          !priceOk?"Введите положительную цену до 1 млрд ₽, максимум две цифры после запятой.":
          "Сумма позиции должна быть не больше 1 млрд ₽ и содержать максимум две цифры после запятой.";
        errors.push({index:index,field:field,message:detail});
        if(!message)message="Проверьте позицию №"+(index+1)+": "+detail;
      }else{
        totalCents+=cents;
        amounts.push(cents/100);
      }
    });
    return {valid:!message,message:message,total:totalCents/100,count:items.length,amounts:amounts,errors:errors};
  }
  root.SRReceipt={inspect:inspect,normalizeDecimal:normalizeDecimal};
})(typeof window!=="undefined"?window:globalThis);
