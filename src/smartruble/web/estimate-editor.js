/* SmartRubleAI v0.4 — typed estimate rows, Russian amount normalization.
 * This is presentation logic. The backend still parses /contracts.text.
 * Do not silently discard unknown categories or malformed imported lines.
 */
(function(root){
  "use strict";
  var CATEGORIES=[
    {id:"consumables",name:"Расходные материалы",keywords:["расходн","материал","реактив","комплектующ"]},
    {id:"equipment",name:"Оборудование",keywords:["оборудован","прибор","техник"]},
    {id:"literature_software",name:"Литература и ПО",keywords:["литератур","книг","программн","лиценз","подписк","публикац","конференц"]},
    {id:"services",name:"Услуги",keywords:["услуг","аренд","хостинг","сервер","доставк","облач"]}
  ];
  var MAX_ROWS=50,MAX_RUB=100000000000;
  function parseRub(value){
    var normalized=String(value==null?"":value).trim().replace(/[\s\u00a0\u202f]/g,"");
    if(!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)){
      return {ok:false,message:"Введите положительную сумму цифрами, например 50000 или 1250,50."};
    }
    var parts=normalized.split(/[.,]/);
    var rub=Number(parts[0]);
    var kop=Number((parts[1]||"").padEnd(2,"0"));
    var cents=rub*100+kop;
    if(!Number.isSafeInteger(cents)||cents<1||cents>MAX_RUB*100){
      return {ok:false,message:"Сумма должна быть больше нуля и не более 100 млрд ₽."};
    }
    return {ok:true,cents:cents,rubles:cents/100};
  }
  function formatRub(cents){
    return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2,minimumFractionDigits:0}).format(cents/100)+" ₽";
  }
  function inspect(rows){
    if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS){
      return {valid:false,message:"Добавьте от 1 до 50 статей.",totalCents:0,lines:[],errors:[]};
    }
    var errors=[],lines=[],totalCents=0;
    rows.forEach(function(row,index){
      var category=CATEGORIES.find(function(c){return c.id===row.category;});
      if(!category){
        errors.push({index:index,message:"Выберите категорию для строки №"+(index+1)+"."});
        return;
      }
      var parsed=parseRub(row.amount);
      if(!parsed.ok){
        errors.push({index:index,message:"Строка №"+(index+1)+": "+parsed.message});
        return;
      }
      totalCents+=parsed.cents;
      // Canonical words recognized by the existing Python parser, simple
      // hyphen and number, no user keyboard currency/dash requirements.
      lines.push(category.name+" - "+(parsed.cents/100).toFixed(2));
    });
    return {
      valid:errors.length===0 && Number.isSafeInteger(totalCents),
      message:errors.length?errors[0].message:(!Number.isSafeInteger(totalCents)?"Слишком большая общая сумма.":""),
      totalCents:totalCents,
      lines:lines,
      errors:errors
    };
  }
  function categoryFor(name){
    var lower=String(name).trim().toLocaleLowerCase("ru-RU");
    return CATEGORIES.find(function(c){
      return c.keywords.some(function(w){return lower.includes(w);});
    })||null;
  }
  function importText(text){
    var input=String(text||"");
    if(input.length>30000)return {valid:false,message:"Текст слишком длинный (максимум 30 000 символов).",rows:[]};
    var nonempty=input.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
    if(!nonempty.length||nonempty.length>MAX_ROWS)
      return {valid:false,message:"Укажите от 1 до 50 строк для импорта.",rows:[]};
    var rows=[];
    for(var i=0;i<nonempty.length;i++){
      var line=nonempty[i];
      // Accept common keyboard separators: -, :, — and –.
      var m=line.match(/^(.+?)\s*[:—–-]\s*(.+?)\s*$/);
      if(!m)return {valid:false,message:"Строка №"+(i+1)+": разделите название и сумму обычным дефисом - или двоеточием.",rows:[]};
      var category=categoryFor(m[1]);
      if(!category)return {valid:false,message:"Строка №"+(i+1)+": категория не распознана. Выберите её из списка в редакторе.",rows:[]};
      var rawAmount=m[2].replace(/\s*(?:₽|руб\.?|р\.?)\s*$/i,"");
      var amount=parseRub(rawAmount);
      if(!amount.ok)return {valid:false,message:"Строка №"+(i+1)+": "+amount.message,rows:[]};
      rows.push({category:category.id,amount:rawAmount});
    }
    return {valid:true,rows:rows,message:""};
  }
  root.SREstimate={
    categories:CATEGORIES,maxRows:MAX_ROWS,parseRub:parseRub,formatRub:formatRub,
    inspect:inspect,importText:importText
  };
})(typeof window!=="undefined"?window:globalThis);
