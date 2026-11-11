/* SmartRubleAI — финансовое рабочее место; простая навигация по настоящим URL.
   Исследовательский прототип: без реальных платежей и без пользователей/ролей. */
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id);};
  var PAGE=(location.pathname.split("/").filter(Boolean)[1]||"overview");
  var ROUTES={overview:"Обзор",estimates:"Сметы и лимиты",receipts:"Проверка чеков",history:"История операций",antifraud:"Проверка аномалий",economics:"Экономическая оценка"};
  var active=sessionStorage.getItem("sr-active-grant")||"";
  var contracts=[];
  var root=$("page");
  var labels={consumables:"Расходные материалы",equipment:"Оборудование",literature_software:"Литература и ПО",services:"Услуги",other:"Прочее"};
  var nfmt=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2});
  var cash=function(n){return nfmt.format(Number(n)||0)+" ₽";};
  var number=function(n){return nfmt.format(Number(n)||0);};
  var txt=function(v){return String(v==null?"":v);};
  var esc=function(v){return txt(v).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});};
  var sum=function(values){return Object.values(values||{}).reduce(function(a,v){return a+Number(v||0);},0);};
  var statusTitle={APPROVED:"Одобрено",PARTIAL:"Частично",NEEDS_REVIEW:"На проверке",APPROVE:"Одобрено",REVIEW:"На проверке",REJECT:"Отклонено",PENDING:"Ожидает решения",REJECTED:"Отклонено"};
  var statusClass={APPROVED:"ok",PARTIAL:"warn",NEEDS_REVIEW:"warn",APPROVE:"ok",REVIEW:"warn",REJECT:"bad",PENDING:"warn",REJECTED:"bad"};
  function badge(s){return '<span class="status '+(statusClass[s]||"muted")+'">'+esc(statusTitle[s]||s)+'</span>';}
  function section(title,desc,actions){return '<div class="page-head"><div><div class="eyebrow">Контроль целевых средств</div><h1>'+title+'</h1><p class="page-description">'+desc+'</p></div>'+(actions?'<div class="page-actions">'+actions+'</div>':"")+'</div>';}
  function panel(title,content,right){return '<section class="panel"><div class="panel-head"><h2>'+title+'</h2>'+(right||"")+'</div>'+content+'</section>';}
  function empty(title,help){return '<div class="empty"><strong>'+title+'</strong>'+help+'</div>';}
  function notice(){return '<div class="inline-note"><strong>Демонстрационная версия.</strong> Все операции выполняются на синтетических данных. Средства не списываются, интеграции с платёжными системами нет.</div>';}
  function table(head,rows,emptyText){return '<div class="table-wrap" tabindex="0" role="region" aria-label="Таблица данных с горизонтальной прокруткой"><table><thead><tr>'+head.map(function(h){return '<th'+(h.num?' class="number"':'')+'>'+esc(h.title||h)+'</th>';}).join("")+'</tr></thead><tbody>'+(rows.length?rows.join(""):'<tr><td colspan="'+head.length+'" class="table-empty">'+esc(emptyText||"Нет данных")+'</td></tr>')+'</tbody></table></div><div class="table-swipe-hint" aria-hidden="true">Проведите по таблице влево, чтобы увидеть остальные столбцы.</div>';}
  function tr(cells,rowClass){return '<tr'+(rowClass?' class="'+esc(rowClass)+'"':"")+'>'+cells.map(function(v){return '<td>'+v+'</td>';}).join("")+'</tr>';}
  function field(id,label,value,type){return '<div class="field"><label for="'+id+'">'+label+'</label><input class="input" id="'+id+'" type="'+(type||"text")+'" value="'+esc(value)+'"></div>';}
  function formMessage(id){return '<div class="form-message" role="status" aria-live="polite" id="'+id+'"></div>';}
  function say(id,msg,error){var e=$(id);if(e){e.textContent=msg;e.className="form-message"+(error?" error":"");}}
  var toastTimeout;
  function toast(message,error){var el=$("toast");el.textContent=message;el.className="toast show"+(error?" error":"");clearTimeout(toastTimeout);toastTimeout=setTimeout(function(){el.className="toast";},4300);}
  async function api(url,method,payload){
    var opts={method:method||"GET",headers:{"Content-Type":"application/json"}};
    if(payload!==undefined)opts.body=JSON.stringify(payload);
    var response=await fetch(url,opts);
    var data;try{data=await response.json();}catch(_){throw Error("Не удалось прочитать ответ сервера");}
    if(!response.ok){
      var message=data.detail||("Ошибка запроса: "+response.status);
      if(typeof message!=="string")message=Array.isArray(message)?message.map(function(x){return (x.loc||[]).slice(-1).join("")+": "+x.msg;}).join("; "):JSON.stringify(message);
      throw Error(message);
    }
    return data;
  }
  function current(){return contracts.find(function(c){return c.grant_id===active;})||null;}
  function link(path,title){return '<a href="/app/'+path+'" class="btn secondary">'+title+'</a>';}
  function grantNeeded(){
    return empty("Выберите смету","Создайте первую смету или выберите существующую в верхней панели.")+
      '<div style="padding:0 20px 22px;text-align:center">'+link("estimates","Перейти к сметам")+'</div>';
  }
  function paintGrantSelect(){
    var select=$("active-grant");
    if(!contracts.some(function(c){return c.grant_id===active;})){
      active=contracts.length?contracts[0].grant_id:"";
      if(active)sessionStorage.setItem("sr-active-grant",active);
      else sessionStorage.removeItem("sr-active-grant");
    }
    select.innerHTML='<option value="">Не выбрана</option>'+contracts.map(function(c){return '<option value="'+esc(c.grant_id)+'"'+(c.grant_id===active?' selected':'')+'>'+esc(c.grant_id)+'</option>';}).join("");
  }
  async function reloadContracts(shouldRender){
    var res=await api("/contracts");
    contracts=res.contracts||[];
    paintGrantSelect();
    if(shouldRender!==false)render();
  }
  function metaCard(title,val,note){return '<div class="metric"><div class="metric-label">'+title+'</div><div class="metric-value">'+val+'</div><div class="metric-foot">'+note+'</div></div>';}
  function percent(spent,limit){
    return limit>0?Math.max(0,Math.min(100,100*spent/limit)):0;
  }
  function progress(spent,limit){
    var p=percent(spent,limit);
    return '<div class="usage-meter" role="progressbar" aria-label="Освоение лимита" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(p)+'">'+
      '<span class="usage-fill'+(p>=90?' high':p>=75?' medium':'')+'" style="width:'+p.toFixed(2)+'%"></span></div>';
  }
  function ledgerRows(items){
    return items.map(function(x){
      var limit=sum(x.limits),spent=sum(x.spent);
      return tr([
        '<span class="ledger-name">'+esc(x.grant_id)+'</span>'+(x.grant_id===active?'<span class="ledger-active">Активная</span>':''),
        cash(limit),cash(spent),
        '<span class="ledger-balance">'+cash(Math.max(0,limit-spent))+'</span>'+progress(spent,limit),
        '<button class="btn secondary btn-sm choose-grant" type="button" data-id="'+esc(x.grant_id)+'" aria-label="Выбрать смету '+esc(x.grant_id)+'">Выбрать</button>'
      ]);
    });
  }
  function bindGrantButtons(){
    Array.from(root.querySelectorAll(".choose-grant")).forEach(function(btn){
      btn.onclick=function(){
        active=btn.dataset.id;
        sessionStorage.setItem("sr-active-grant",active);
        paintGrantSelect();
        render();
        toast("Активная смета: "+active);
      };
    });
  }
  function showOverview(){
    var budget=contracts.reduce(function(t,x){return t+sum(x.limits);},0);
    var spent=contracts.reduce(function(t,x){return t+sum(x.spent);},0);
    var checks=contracts.reduce(function(t,x){return t+Number(x.transactions||0);},0);
    var estimate=current();
    root.innerHTML=section("Рабочий стол","Обзор смет и контроль расходования средств в одном месте.",
      '<a class="btn secondary" href="/app/receipts">Проверить чек</a><a class="btn primary" href="/app/estimates">Создать смету</a>')+
      '<div class="workspace-disclaimer"><span class="disclaimer-dot"></span><span><strong>Демонстрационный режим</strong> · Только синтетические операции. Сметы и история находятся в памяти сервера и сбрасываются при перезапуске.</span></div>'+
      (contracts.length===0?
        '<section class="panel welcome-panel"><div class="welcome-content"><div class="eyebrow">НАЧАЛО РАБОТЫ</div>'+
        '<h2>Начните с создания сметы</h2><p>Проверка чеков работает относительно установленных статей и лимитов. Последовательно выполните три действия.</p>'+
        '<div class="step-list"><a href="/app/estimates"><b>01</b><span><strong>Создайте смету</strong><small>Укажите допустимые статьи и суммы</small></span><span class="step-arrow">›</span></a>'+
        '<a href="/app/receipts"><b>02</b><span><strong>Проверьте чек</strong><small>Добавьте товары для условной проверки</small></span><span class="step-arrow">›</span></a>'+
        '<a href="/app/history"><b>03</b><span><strong>Посмотрите журнал</strong><small>Разберитесь, почему принято решение</small></span><span class="step-arrow">›</span></a></div>'+
        '<a href="/app/estimates" class="btn primary">Создать первую смету</a></div></section>'
      :'<div class="metric-grid">'+
        metaCard("Сметы",number(contracts.length),"В текущем сеансе сервера")+
        metaCard("Лимит",cash(budget),"Всего по сметам")+
        metaCard("Условно одобрено",cash(spent),"По обработанным чекам")+
        metaCard("Остаток",cash(Math.max(0,budget-spent)),"Обработано чеков: "+number(checks))+
        '</div><div class="columns wide-first">'+
        panel("Реестр смет",table(["Смета",{title:"Лимит",num:true},{title:"Одобрено",num:true},{title:"Остаток",num:true},""],ledgerRows(contracts)),
        '<a href="/app/estimates" class="tiny-action">Открыть реестр</a>')+
        panel("Активная смета",estimate?
        '<div class="panel-body"><div class="chosen-grant">'+esc(estimate.grant_id)+'</div>'+
        '<div class="overview-budget"><span>Освоено</span><strong>'+cash(sum(estimate.spent))+' / '+cash(sum(estimate.limits))+'</strong></div>'+
        progress(sum(estimate.spent),sum(estimate.limits))+
        '<div class="overview-shortcuts"><a class="btn primary" href="/app/receipts">Проверить чек</a><a class="btn secondary" href="/app/estimates">Статьи сметы</a><a class="btn secondary" href="/app/history">Журнал</a></div></div>'
        :grantNeeded())+
        '</div>');
    bindGrantButtons();
  }
  function showEstimates(){
    var estimate=current();
    function suggestedGrantId(){
      var base="грант-"+new Date().getFullYear();
      var used=new Set(contracts.map(function(c){return c.grant_id;}));
      if(!used.has(base))return base;
      var n=2;
      while(used.has(base+"-"+n))n++;
      return base+"-"+n;
    }
    var estimateCategories=window.SREstimate.categories;
    function estimateRow(row){
      row=row||{category:"",amount:""};
      return '<div class="estimate-editor-row">'+
        '<label class="estimate-row-field"><span>Категория расходов</span>'+
          '<select class="input estimate-category" aria-label="Категория расходов" aria-required="true">'+
            '<option value="">Выберите статью</option>'+
            estimateCategories.map(function(cat){return '<option value="'+cat.id+'"'+(cat.id===row.category?' selected':'')+'>'+esc(cat.name)+'</option>';}).join("")+
          '</select></label>'+
        '<label class="estimate-row-field"><span>Лимит, ₽</span>'+
          '<input class="input estimate-amount" type="text" inputmode="decimal" autocomplete="off" maxlength="24" placeholder="Например, 50000" aria-label="Лимит статьи в рублях" aria-required="true" value="'+esc(row.amount||"")+'"></label>'+
        '<button type="button" class="estimate-remove-row" aria-label="Удалить статью" title="Удалить статью">×</button>'+ 
        '<div class="estimate-row-error" role="status" aria-live="polite"></div></div>';
    }
    root.innerHTML=section("Сметы и лимиты","Реестр смет, остатки средств и статьи расходов.")+
      '<div class="estimates-layout">'+
      panel("Реестр смет",contracts.length?
        '<div class="toolbar register-toolbar"><div class="left">'+
        '<label class="sr-only" for="estimate-search">Поиск сметы</label>'+
        '<input class="input" id="estimate-search" placeholder="Найти смету по номеру" autocomplete="off">'+
        '</div><div class="right"><span class="registry-count" id="estimate-count"></span>'+
        '<button class="btn secondary btn-sm" id="estimate-export" type="button">Экспорт CSV</button></div></div>'+
        '<div id="estimate-table"></div>':
        '<div class="register-empty"><div class="register-empty-symbol" aria-hidden="true">01</div>'+
        '<div><h3>Смет пока нет</h3><p>Создайте первую смету в форме ниже. После этого здесь появятся лимиты, остатки и история проверок.</p></div></div>')+
      (estimate?'<div class="stack detail-stack" id="estimate-details"></div>':'')+
      panel("Новая смета",'<div class="panel-body estimate-form-body"><form id="estimate-form">'+
        '<div class="estimate-editor-intro"><div class="estimate-editor-id">'+
        field("grant-name","Номер сметы",suggestedGrantId())+
        '<p class="field-help">Номер может содержать обычные буквы, цифры и дефис.</p></div>'+
        '<p class="estimate-editor-prompt">Выберите категории, затем укажите лимиты обычными числами. Тире и символ ₽ вводить не нужно.</p></div>'+
        '<div class="estimate-editor-heading"><div><h3>Статьи расходов</h3>'+
        '<p>Одинаковые категории суммируются. Можно использовать запятую для копеек.</p></div>'+
        '<span class="estimate-line-count" id="estimate-line-count">Статей: 1</span></div>'+
        '<div id="estimate-rows">'+estimateRow({category:"",amount:""})+'</div>'+
        '<div class="estimate-editor-controls"><button class="btn secondary btn-sm" id="estimate-add" type="button">+ Добавить статью</button>'+
        '<span>Не более 50 строк</span></div>'+
        '<div class="estimate-editor-total"><div><span>Общий лимит сметы</span>'+
        '<small>Сумма введённых корректных строк</small></div>'+
        '<output id="estimate-total" aria-live="polite">0 ₽</output></div>'+
        '<details class="estimate-import"><summary>Есть текстовая смета? Импортировать строки</summary>'+
        '<div class="estimate-import-body"><label for="estimate-text">Вставьте текст сметы</label>'+
        '<textarea id="estimate-text" rows="4" maxlength="30000" placeholder="Материалы - 50000&#10;Оборудование: 120000&#10;Услуги - 10000"></textarea>'+
        '<p>Подойдут обычный дефис <code>-</code> или двоеточие <code>:</code>. Знак ₽ и длинное тире необязательны.</p>'+
        '<button class="btn secondary btn-sm" type="button" id="estimate-import-btn">Разобрать текст в таблицу</button>'+
        formMessage("estimate-import-msg")+'</div></details>'+
        '<div class="form-actions"><button class="btn primary" type="submit">Создать смету</button>'+
        '<button class="btn secondary" type="button" id="new-example">Заполнить пример</button></div>'+
        formMessage("estimate-msg")+'</form></div>')+
      '</div>';
    function paintList(){
      var q=$("estimate-search").value.trim().toLocaleLowerCase("ru-RU");
      var filtered=contracts.filter(function(x){return x.grant_id.toLocaleLowerCase("ru-RU").includes(q);});
      $("estimate-table").innerHTML=table(["Смета",{title:"Лимит",num:true},{title:"Одобрено",num:true},{title:"Остаток",num:true},""],ledgerRows(filtered),
        "Сметы не найдены. Измените поисковый запрос или создайте новую смету.");
      $("estimate-count").textContent="Смет: "+filtered.length;
      bindGrantButtons();
    }
    if(contracts.length){
      $("estimate-search").addEventListener("input",paintList);
      paintList();
      $("estimate-export").onclick=function(){
      var q=$("estimate-search").value.trim().toLocaleLowerCase("ru-RU");
      var filtered=contracts.filter(function(x){return x.grant_id.toLocaleLowerCase("ru-RU").includes(q);});
      if(!filtered.length){toast("Нет смет для выгрузки",true);return;}
      window.SRCSV.download("smartruble-estimates.csv",
        ["Смета","Лимит, ₽","Одобрено, ₽","Остаток, ₽","Обработано чеков"],
        filtered.map(function(x){var limit=sum(x.limits),spent=sum(x.spent);return [x.grant_id,limit,spent,Math.max(0,limit-spent),x.transactions];}));
      };
    }
    function estimateRows(){
      return Array.from($("estimate-rows").querySelectorAll(".estimate-editor-row")).map(function(row){
        return {category:row.querySelector(".estimate-category").value,
          amount:row.querySelector(".estimate-amount").value};
      });
    }
    var showEstimateErrors=false;
    function setEstimateRows(rows){
      showEstimateErrors=false;
      $("estimate-rows").innerHTML=rows.map(estimateRow).join("");
      updateEstimateEditor();
    }
    function updateEstimateEditor(){
      var rows=estimateRows(),result=window.SREstimate.inspect(rows);
      $("estimate-total").textContent=window.SREstimate.formatRub(result.totalCents);
      $("estimate-line-count").textContent="Статей: "+number(rows.length);
      $("estimate-add").disabled=rows.length>=window.SREstimate.maxRows;
      Array.from($("estimate-rows").querySelectorAll(".estimate-editor-row")).forEach(function(row,i){
        row.querySelector(".estimate-remove-row").disabled=rows.length<=1;
        var category=row.querySelector(".estimate-category");
        var amount=row.querySelector(".estimate-amount");
        var message=row.querySelector(".estimate-row-error");
        category.removeAttribute("aria-invalid");
        amount.removeAttribute("aria-invalid");
        var problem=showEstimateErrors&&result.errors.find(function(e){return e.index===i;});
        message.textContent=problem?problem.message:"";
        if(problem){
          var categoryValid=estimateCategories.some(function(cat){return cat.id===rows[i].category;});
          (categoryValid?amount:category).setAttribute("aria-invalid","true");
        }
      });
      return result;
    }
    $("estimate-rows").addEventListener("input",function(){
      updateEstimateEditor();
      say("estimate-msg","");
    });
    $("estimate-rows").addEventListener("change",function(){
      updateEstimateEditor();
      say("estimate-msg","");
    });
    $("estimate-rows").addEventListener("click",function(e){
      var btn=e.target.closest(".estimate-remove-row");
      if(!btn||estimateRows().length<=1)return;
      btn.closest(".estimate-editor-row").remove();
      updateEstimateEditor();
      say("estimate-msg","");
    });
    $("estimate-add").onclick=function(){
      if(estimateRows().length>=window.SREstimate.maxRows)return;
      $("estimate-rows").insertAdjacentHTML("beforeend",estimateRow({category:"",amount:""}));
      updateEstimateEditor();
      var last=$("estimate-rows").lastElementChild;
      if(last)last.querySelector(".estimate-category").focus();
    };
    $("new-example").onclick=function(){
      $("grant-name").value=suggestedGrantId();
      setEstimateRows([
        {category:"consumables",amount:"50000"},
        {category:"equipment",amount:"120000"},
        {category:"services",amount:"10000"}
      ]);
      say("estimate-msg","");
    };
    $("estimate-import-btn").onclick=function(){
      var result=window.SREstimate.importText($("estimate-text").value);
      if(!result.valid){say("estimate-import-msg",result.message,true);return;}
      setEstimateRows(result.rows);
      say("estimate-import-msg","Импортировано строк: "+number(result.rows.length)+". Проверьте категории и суммы перед созданием.");
      say("estimate-msg","");
    };
    $("estimate-form").onsubmit=async function(e){
      e.preventDefault();
      var id=$("grant-name").value.trim();
      if(!id){say("estimate-msg","Введите номер сметы.",true);$("grant-name").focus();return;}
      if(id.length>80){say("estimate-msg","Номер сметы не должен превышать 80 символов.",true);return;}
      showEstimateErrors=true;
      var result=updateEstimateEditor();
      if(!result.valid){
        say("estimate-msg",result.message,true);
        var first=result.errors[0];
        if(first){
          var row=$("estimate-rows").querySelectorAll(".estimate-editor-row")[first.index];
          var input=row.querySelector('[aria-invalid="true"]');
          if(input)input.focus();
        }
        return;
      }
      var button=$("estimate-form").querySelector("button[type=submit]");
      button.disabled=true;
      try{
        // Existing /contracts API accepts structured information as text;
        // generation happens here so users never type ₽ or a special dash.
        var contractText=result.lines.join("\n");
        var x=await api("/contracts","POST",{grant_id:id,text:contractText});
        if(x.unparsed && x.unparsed.length){
          throw Error("Сервер не смог распознать все статьи. Проверьте данные и попробуйте снова.");
        }
        active=x.grant_id;
        sessionStorage.setItem("sr-active-grant",active);
        await reloadContracts();
        toast("Смета создана: "+window.SREstimate.formatRub(result.totalCents));
      }catch(err){say("estimate-msg",err.message,true);}
      finally{button.disabled=false;}
    };
    updateEstimateEditor();
    if(estimate){
      var total=sum(estimate.limits),spent=sum(estimate.spent);
      var rows=Object.keys(estimate.limits).map(function(cat){
        var limit=Number(estimate.limits[cat]),used=Number(estimate.spent[cat]||0);
        return tr([
          '<strong>'+esc(labels[cat]||cat)+'</strong>',
          cash(limit),cash(used),
          '<span class="ledger-balance">'+cash(Math.max(0,limit-used))+'</span>'+progress(used,limit)
        ]);
      });
      $("estimate-details").innerHTML=panel("Статьи сметы · "+esc(estimate.grant_id),
        '<div class="budget-summary"><div><span>Общий лимит</span><strong>'+cash(total)+'</strong></div>'+
          '<div><span>Условно одобрено</span><strong>'+cash(spent)+'</strong></div>'+
          '<div><span>Осталось</span><strong>'+cash(Math.max(0,total-spent))+'</strong></div>'+
        '</div>'+
        table(["Статья",{title:"Лимит",num:true},{title:"Одобрено",num:true},{title:"Остаток и освоение",num:true}],rows),
        '<a class="btn secondary btn-sm" href="/app/receipts">Проверить чек</a>');
    }
  }
  var demoItems=[{name:"Микроконтроллер Arduino Uno R3",qty:1,price:2500},{name:"Шоколад Аленка молочный",qty:1,price:240}];
  function receiptRow(item){
    var key=Math.random().toString(36).slice(2);
    var name=item.name==null?"":item.name;
    var qty=item.qty==null?1:item.qty;
    var price=item.price==null?"":item.price;
    return '<div class="receipt-row" data-row="'+key+'">'+
      '<input class="input item-name" aria-label="Название товара" placeholder="Название товара или услуги" maxlength="250" aria-required="true" value="'+esc(name)+'">'+
      '<span class="receipt-mobile-label qty-label" aria-hidden="true">Кол-во</span>'+
      '<span class="receipt-mobile-label price-label" aria-hidden="true">Цена, ₽</span>'+
      '<span class="receipt-mobile-label total-label" aria-hidden="true">Сумма</span>'+
      '<input class="input item-qty" type="text" inputmode="decimal" maxlength="24" aria-label="Количество" aria-required="true" value="'+esc(qty)+'">'+
      '<input class="input item-price" type="text" inputmode="decimal" maxlength="24" aria-label="Цена за единицу, ₽" aria-required="true" value="'+esc(price)+'">'+
      '<output class="receipt-line-total" aria-label="Сумма позиции">—</output>'+
      '<button class="remove-item" type="button" title="Удалить позицию" aria-label="Удалить позицию">×</button>'+ 
      '<div class="receipt-row-error" role="status" aria-live="polite"></div></div>';
  }
  function showReceipts(){
    var estimate=current();
    var heading=section("Проверка чеков","Создайте чек и узнайте решение по каждой позиции в рамках выбранной сметы.",
      '<a class="btn secondary" href="/app/history">Журнал операций</a>');
    if(!estimate){root.innerHTML=heading+grantNeeded();return;}
    var available=sum(estimate.limits)-sum(estimate.spent);
    var resultPlaceholder='<div class="receipt-result-empty"><div class="receipt-result-empty-symbol" aria-hidden="true">✓</div>'+
      '<h3>Чек пока не проверен</h3><p>Заполните позиции и нажмите «Проверить чек». Здесь появятся суммы, статьи и причины решений по каждой покупке.</p></div>';

    root.innerHTML=heading+
      '<div class="receipt-context"><div><span>АКТИВНАЯ СМЕТА</span><strong>'+esc(estimate.grant_id)+'</strong></div>'+
        '<div><span>ОСТАТОК ПО СМЕТЕ</span><strong>'+cash(Math.max(0,available))+'</strong></div>'+
        '<div><span>ПРОВЕРЕНО ЧЕКОВ</span><strong>'+number(estimate.transactions||0)+'</strong></div>'+
        '<a href="/app/estimates" class="receipt-context-link">Открыть смету</a></div>'+
      '<div class="receipts-layout">'+
      panel("Новый чек",'<div class="panel-body receipt-form-body"><form id="receipt-form">'+
        '<div class="receipt-document-head"><div><div class="receipt-step">ШАГ 01 / 02</div>'+
        '<h3>Данные покупки</h3></div><span class="receipt-demo-chip">Демо</span></div>'+
        '<div class="field receipt-merchant-field"><label for="merchant">Продавец</label>'+
        '<input class="input" id="merchant" placeholder="Название организации или магазина" maxlength="200" aria-required="true" autocomplete="off">'+
        '<div class="field-help">Данные используются только для демонстрационной проверки.</div></div>'+
        '<div class="receipt-items-head"><div><h3>Состав покупки</h3><p>Укажите товар, количество и цену обычными цифрами. Копейки можно вводить через запятую; знак ₽ не нужен.</p></div>'+
        '<button class="btn secondary btn-sm" type="button" id="receipt-example">Заполнить пример</button></div>'+
        '<div class="receipt-row receipt-columns" aria-hidden="true"><span>Наименование</span><span>Кол-во</span><span>Цена, ₽</span><span>Сумма</span><span></span></div>'+
        '<div id="receipt-lines">'+receiptRow({name:"",qty:1,price:""})+'</div>'+
        '<div class="receipt-add-row"><button class="btn secondary btn-sm" type="button" id="add-item">+ Добавить позицию</button>'+
        '<span class="receipt-count" id="receipt-count">Позиций: 1 / 100</span></div>'+
        '<div class="receipt-summary"><div><span>Итого по чеку</span><small>До проверки по смете</small></div>'+
        '<strong id="receipt-total" aria-live="polite">0 ₽</strong></div>'+
        '<div class="receipt-action-row"><button class="btn primary" id="receipt-submit" type="submit">Проверить чек</button>'+
        '<button class="btn secondary" type="button" id="receipt-clear">Очистить</button>'+
        '<button class="btn primary receipt-new" id="receipt-new" type="button" hidden>Новый чек</button></div>'+
        formMessage("receipt-msg")+'</form></div>')+
      panel("Результат проверки",'<div id="receipt-result" aria-live="polite">'+resultPlaceholder+'</div>')+
      '</div><p class="receipt-footnote">Результаты носят демонстрационный характер: нет списания реальных денег или подключения к платёжной инфраструктуре. «На проверке» означает необходимость решения специалиста. В разделе «История операций» доступна демонстрационная очередь ручных решений (без реальных платежей и авторизации).</p>';

    var form=$("receipt-form");
    var locked=false;
    var draftId=null;
    var showReceiptErrors=false;

    function formItems(){
      return Array.from($("receipt-lines").querySelectorAll(".receipt-row")).map(function(row){
        return {name:row.querySelector(".item-name").value.trim(),
          qty:row.querySelector(".item-qty").value,
          price:row.querySelector(".item-price").value};
      });
    }
    function refreshReceiptTotal(){
      var result=window.SRReceipt.inspect(formItems());
      $("receipt-count").textContent="Позиций: "+number(result.count)+" / 100";
      $("receipt-total").textContent=cash(result.total);
      var rows=$("receipt-lines").querySelectorAll(".receipt-row");
      Array.from(rows).forEach(function(row,i){
        row.querySelector(".receipt-line-total").textContent=
          result.amounts[i]==null?"—":cash(result.amounts[i]);
        ["name","qty","price"].forEach(function(key){
          row.querySelector(".item-"+key).removeAttribute("aria-invalid");
        });
        var problem=showReceiptErrors&&result.errors.find(function(err){return err.index===i;});
        row.querySelector(".receipt-row-error").textContent=problem?problem.message:"";
        if(problem)row.querySelector(".item-"+problem.field).setAttribute("aria-invalid","true");
      });
      if(!locked)$("add-item").disabled=rows.length>=100;
    }
    function setLocked(value){
      locked=value;
      form.classList.toggle("receipt-locked",value);
      Array.from(form.querySelectorAll("input,button")).forEach(function(el){
        if(el.id!=="receipt-new")el.disabled=value;
      });
      $("receipt-new").hidden=!value;
      if(value)$("receipt-submit").textContent="Чек проверен";
      else $("receipt-submit").textContent="Проверить чек";
    }
    function resetReceipt(items,merchant){
      setLocked(false);
      draftId=null;
      showReceiptErrors=false;
      $("merchant").value=merchant||"";
      $("receipt-lines").innerHTML=items.map(receiptRow).join("");
      $("receipt-result").innerHTML=resultPlaceholder;
      say("receipt-msg","");
      refreshReceiptTotal();
    }
    $("receipt-lines").addEventListener("input",refreshReceiptTotal);
    $("add-item").onclick=function(){
      if(locked)return;
      if($("receipt-lines").querySelectorAll(".receipt-row").length>=100){
        toast("Не больше 100 позиций в одном чеке",true);return;
      }
      $("receipt-lines").insertAdjacentHTML("beforeend",receiptRow({name:"",qty:1,price:""}));
      refreshReceiptTotal();
      var last=$("receipt-lines").lastElementChild;
      if(last)last.querySelector(".item-name").focus();
    };
    $("receipt-example").onclick=function(){resetReceipt(demoItems,"ООО Электроника");};
    $("receipt-clear").onclick=function(){resetReceipt([{name:"",qty:1,price:""}],"");};
    $("receipt-new").onclick=function(){resetReceipt([{name:"",qty:1,price:""}],"");$("merchant").focus();};
    $("receipt-lines").onclick=function(e){
      var button=e.target.closest(".remove-item");
      if(!button||locked)return;
      if($("receipt-lines").querySelectorAll(".receipt-row").length<=1){
        toast("В чеке должна остаться хотя бы одна позиция",true);return;
      }
      button.closest(".receipt-row").remove();
      refreshReceiptTotal();
    };
    refreshReceiptTotal();
    form.onsubmit=async function(e){
      e.preventDefault();
      if(locked)return;
      var merchant=$("merchant").value.trim();
      var raw=formItems();
      var check=window.SRReceipt.inspect(raw);
      if(!merchant){say("receipt-msg","Укажите продавца.",true);$("merchant").focus();return;}
      if(!check.valid){
        showReceiptErrors=true;
        refreshReceiptTotal();
        say("receipt-msg",check.message,true);
        var problem=check.errors[0];
        if(problem){
          var badRow=$("receipt-lines").querySelectorAll(".receipt-row")[problem.index];
          if(badRow)badRow.querySelector(".item-"+problem.field).focus();
        }
        return;
      }
      var payload={id:draftId||("demo-"+(typeof crypto!=="undefined"&&crypto.randomUUID?
        crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2))),
        merchant:merchant,items:raw.map(function(x){return {name:x.name,qty:Number(window.SRReceipt.normalizeDecimal(x.qty)),price:Number(window.SRReceipt.normalizeDecimal(x.price))};})};
      draftId=payload.id;
      var submit=$("receipt-submit");
      submit.disabled=true;submit.textContent="Проверяем…";
      say("receipt-msg","");
      try{
        var result=await api("/contracts/"+encodeURIComponent(active)+"/validate","POST",payload);
        var cards=[
          {label:"Одобрено",value:result.approved,variant:"approved"},
          {label:"На проверке",value:result.review,variant:"review"},
          {label:"Отклонено",value:result.personal_pay,variant:"rejected"}
        ].map(function(item){return '<div class="receipt-outcome '+item.variant+'"><span>'+item.label+'</span><strong>'+cash(item.value)+'</strong></div>';}).join("");
        var rows=result.items.map(function(x){
          return '<div class="receipt-decision-row"><div class="receipt-decision-text">'+
            '<strong>'+esc(x.name)+'</strong><small>Статья: '+esc(x.category==="other"?"Не определена":(labels[x.category]||x.category||"Не определена"))+'</small>'+
            '<p>'+esc(x.reason||"Причина не указана")+'</p></div>'+
            '<div class="receipt-decision-right">'+badge(x.decision)+'<strong>'+cash(x.amount)+'</strong></div></div>';
        }).join("");
        var explanation=result.status==="APPROVED"?
          "Все позиции автоматически одобрены в рамках условий демонстрационной сметы.":
          result.status==="NEEDS_REVIEW"?
          "Автоматическая проверка завершена. Есть позиции, которые требуют решения специалиста; они не списаны из лимита автоматически. Ручное согласование в прототипе пока не реализовано.":
          "В чеке есть отклонённые позиции. Изучите причины и результаты по каждой строке.";
        $("receipt-result").innerHTML=
          '<div class="receipt-result-body"><div class="receipt-step">ШАГ 02 / 02</div>'+
          '<div class="receipt-result-heading"><div><h3>Проверка завершена</h3><small>Чек '+esc(result.receipt_id)+'</small></div>'+badge(result.status)+'</div>'+
          '<p class="receipt-result-explanation">'+esc(explanation)+'</p>'+
          '<div class="receipt-outcomes">'+cards+'</div>'+
          '<div class="receipt-decisions-title">Разбор позиций <span>'+number(result.items.length)+'</span></div>'+
          '<div class="receipt-decisions">'+rows+'</div>'+
          '<div class="receipt-result-links"><a href="/app/history" class="btn secondary btn-sm">Открыть журнал</a></div></div>';
        say("receipt-msg","Чек сохранён в журнале. Для следующей проверки нажмите «Новый чек».");
        setLocked(true);
        try{
          await reloadContracts(false);
          toast("Проверка завершена");
        }catch(refreshErr){
          toast("Чек сохранён, но данные сметы не обновились. Откройте страницу смет.",true);
        }
      }catch(err){
        say("receipt-msg",err.message,true);
        submit.disabled=false;
        submit.textContent="Проверить чек";
      }
    };
  }
  function dateLabel(timestamp){
    try{return new Date(timestamp*1000).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return "—";}
  }
  async function showHistory(){
    var estimate=current();
    root.innerHTML=section("История операций","Проверенные чеки, суммы и основания решений по выбранной смете.",
      '<a class="btn primary" href="/app/receipts">Проверить новый чек</a>')+
      (!estimate?grantNeeded():
      '<div class="history-context"><div><span>АКТИВНАЯ СМЕТА</span><strong>'+esc(active)+'</strong></div>'+
      '<div><span>ИСТОЧНИК ДАННЫХ</span><strong>Журнал симуляции · до 100 последних операций</strong></div>'+
      '<span id="audit-state" class="history-audit muted" role="status" aria-live="polite">Проверяем целостность…</span></div>'+
      '<div class="history-notice"><strong>Только локальная симуляция.</strong> Решения в этой очереди демонстрационные: нет пользователей, ролей, электронной подписи и реальных списаний. Используйте только вымышленные данные.</div>'+
      '<div class="history-stats">'+
        '<div><span>Операций в выборке</span><strong id="history-stat-count">0</strong></div>'+
        '<div><span>Условно одобрено</span><strong id="history-stat-approved">0 ₽</strong></div>'+
        '<div><span>На проверке при создании чека</span><strong id="history-stat-review">0 ₽</strong></div>'+
        '<div><span>Отклонено</span><strong id="history-stat-rejected">0 ₽</strong></div>'+
      '</div>'+
      panel("Очередь ручной проверки",'<div class="review-queue-info"><div><strong id="review-count">Загружаем решения…</strong><p>Ручное согласование позиции изменяет лимит только при одобрении и записывается отдельным событием в проверяемый журнал. Исходный чек остаётся неизменным.</p></div><button id="review-reload" type="button" class="btn secondary btn-sm">Обновить очередь</button></div>'+
        '<div id="review-queue" class="review-queue" aria-live="polite">'+empty("Загрузка","Получаем спорные позиции.")+'</div>')+
      '<div class="history-layout">'+
        panel("Журнал операций",'<div class="history-toolbar">'+
          '<div class="history-filter-area"><div class="field"><label for="history-search">Поиск</label><input id="history-search" class="input" placeholder="Чек, продавец или товар" autocomplete="off"></div>'+
          '<div class="field"><label for="history-status">Результат</label><select id="history-status"><option value="">Все решения</option><option value="APPROVED">Одобрено</option><option value="NEEDS_REVIEW">На проверке</option><option value="PARTIAL">Частично</option></select></div></div>'+
          '<div class="history-toolbar-actions"><button id="history-export" class="btn secondary btn-sm" type="button" disabled>Экспорт CSV</button>'+
          '<button id="history-reload" class="btn secondary btn-sm" type="button">Обновить</button></div></div>'+
          '<div id="history-table">'+empty("Загрузка","Получаем записи журнала.")+'</div>'+
          '<div id="history-count" class="history-filter-count">Проверяем данные…</div>')+
        panel("Детали операции",'<div id="history-detail" class="history-detail">'+
          '<div class="history-detail-empty">Выберите запись в журнале для просмотра позиций и причин решений.</div></div>')+
      '</div><p class="history-footnote">История ограничена последними 100 операциями выбранной сметы. Данные находятся в памяти сервера и сбрасываются после перезапуска; это не постоянный платёжный реестр.</p>');
    if(!estimate)return;

    var entries=[];
    var matched=[];
    var shortNumbers=Object.create(null);
    var selectedId="";
    var reviews=[];
    var reviewBusy=false;

    function showReviews(){
      var pending=reviews.filter(function(x){return x.status==="PENDING";});
      var resolved=reviews.filter(function(x){return x.status!=="PENDING";}).slice(-5).reverse();
      $("review-count").textContent=number(pending.length)+" ожидают решения · "+number(reviews.length-pending.length)+" обработано";
      if(!reviews.length){
        $("review-queue").innerHTML=empty("Нет спорных позиций","Если классификатор не уверен, позиция появится в этой очереди.");
        return;
      }
      var options=Object.keys(estimate.limits||{}).map(function(key){
        return '<option value="'+esc(key)+'">'+esc(labels[key]||key)+' · доступно '+cash(Number(estimate.limits[key])-Number((current()||estimate).spent[key]||0))+'</option>';
      }).join("");
      var rows=pending.concat(resolved).map(function(item){
        var index=reviews.indexOf(item);
        var done=item.status!=="PENDING";
        var result=item.resolution;
        return '<div class="review-item" data-index="'+index+'"><div class="review-item-head"><div>'+
          '<strong>'+esc(item.name)+'</strong><small>'+esc(shortNumbers[item.receipt_id]||item.receipt_id)+' · '+esc(item.merchant)+' · позиция '+number(item.item_index+1)+'</small></div>'+
          '<div class="review-item-right"><strong>'+cash(item.amount)+'</strong>'+badge(item.status)+'</div></div>'+
          '<p class="review-item-reason">Причина направления: '+esc(item.reason||"не указана")+'</p>'+
          (done?'<div class="review-complete">Решение: '+esc(result.decision==="APPROVE"?"одобрено по статье «"+(labels[result.category]||result.category)+"»":"отклонено")+
              '. Комментарий: '+esc(result.note)+'</div>':
           '<div class="review-editor"><label>Статья сметы для одобрения<select class="input review-category"><option value="">Выберите статью</option>'+options+'</select></label>'+
           '<label>Обоснование решения<textarea class="input review-note" rows="2" maxlength="500" placeholder="Почему одобряем или отклоняем позицию?"></textarea></label>'+
           '<div class="review-actions"><button type="button" class="btn primary btn-sm review-action" data-index="'+index+'" data-decision="APPROVE">Одобрить по статье</button>'+
             '<button type="button" class="btn secondary btn-sm review-action" data-index="'+index+'" data-decision="REJECT">Отклонить</button></div>'+
           '<div class="form-message review-inline-error" role="status" aria-live="polite"></div></div>')+
          '</div>';
      });
      $("review-queue").innerHTML=rows.join("");
    }

    function detail(entry){
      if(!entry){
        $("history-detail").innerHTML='<div class="history-detail-empty"><span>Нет выбранной операции.</span><small>Выберите другую запись или измените фильтр.</small></div>';
        return;
      }
      var r=entry.record||{};
      var items=(r.items||[]).map(function(item,index){
        var category=item.category==="other"?"Не определена":(labels[item.category]||item.category||"Не определена");
        var review=reviews.find(function(x){return x.receipt_id===r.receipt_id&&x.item_index===index;});
        var resolution=review&&review.resolution;
        var reviewNote=item.decision==="REVIEW"?(resolution?
          '<div class="review-history-update">Ручное демо-решение: '+esc(resolution.decision==="APPROVE"?"одобрено":"отклонено")+
            (resolution.category?" · "+esc(labels[resolution.category]||resolution.category):"")+'<br>Причина: '+esc(resolution.note)+'</div>':
          '<div class="review-history-update pending">Ожидает ручного решения в очереди выше.</div>'):"";
        return '<div class="history-item"><div class="history-item-description"><strong>'+esc(item.name)+'</strong>'+
          '<small>Категория модели: '+esc(category)+'</small>'+
          '<p>'+esc(item.reason||"Причина не указана")+'</p>'+reviewNote+'</div>'+
          '<div class="history-item-values">'+badge(item.decision)+'<strong>'+cash(item.amount)+'</strong></div></div>';
      }).join("");
      $("history-detail").innerHTML=
        '<div class="history-detail-header"><span class="history-detail-label">Номер в текущем журнале</span>'+
        '<strong>'+esc(shortNumbers[r.receipt_id]||"Чек")+'</strong>'+
        '<div class="history-original-id"><span>Исходный ID:</span><code>'+esc(r.receipt_id)+'</code></div>'+
        '<div>'+badge(r.status)+'</div></div>'+
        '<dl class="history-facts"><dt>Дата</dt><dd>'+dateLabel(entry.ts)+'</dd>'+
        '<dt>Продавец</dt><dd>'+esc(r.merchant)+'</dd>'+
        '<dt>Одобрено</dt><dd>'+cash(r.approved)+'</dd>'+
        '<dt>Требует проверки</dt><dd>'+cash(r.review)+'</dd>'+
        '<dt>Отклонено</dt><dd>'+cash(r.personal_pay)+'</dd></dl>'+
        '<div class="history-items-heading">Позиции чека <span>'+number((r.items||[]).length)+'</span></div>'+
        (items||'<div class="history-items-empty">Сведения о позициях отсутствуют.</div>')+
        '<p class="history-detail-foot">Отображены первоначальные решения модели. Если позиция рассмотрена человеком в демо-очереди, итог указан отдельно; исходная запись не переписывается.</p>';
    }

    function display(){
      var q=$("history-search").value;
      var status=$("history-status").value;
      matched=window.SRHistory.filter(entries,q,status,shortNumbers);
      var totals=window.SRHistory.summarize(matched);
      $("history-stat-count").textContent=number(totals.count);
      $("history-stat-approved").textContent=cash(totals.approved);
      $("history-stat-review").textContent=cash(totals.review);
      $("history-stat-rejected").textContent=cash(totals.rejected);
      $("history-export").disabled=!matched.length;
      if(!matched.some(function(e){return e.record.receipt_id===selectedId;})){
        selectedId=matched.length?matched[0].record.receipt_id:"";
      }
      var rows=matched.map(function(entry,i){
        var r=entry.record;
        return tr([
          dateLabel(entry.ts),
          '<span class="history-view-wrap"><button type="button" class="history-view" data-index="'+i+'" aria-pressed="'+(r.receipt_id===selectedId?'true':'false')+'" aria-label="Открыть '+esc(shortNumbers[r.receipt_id]||r.receipt_id)+'">'+esc(shortNumbers[r.receipt_id]||r.receipt_id)+'</button>'+
          (r.receipt_id===selectedId?'<small class="history-selected-note">Выбран</small>':'')+'</span>',
          '<span class="history-merchant">'+esc(r.merchant)+'</span>',
          badge(r.status),
          '<strong class="history-amount">'+cash(Number(r.approved||0)+Number(r.review||0)+Number(r.personal_pay||0))+'</strong>'
        ],r.receipt_id===selectedId?"history-selected-row":"");
      });
      $("history-table").innerHTML=table(["Дата","Чек","Продавец","Решение",{title:"Сумма",num:true}],rows,
        entries.length?"Ничего не найдено. Попробуйте изменить фильтр.":"Здесь пока нет операций. Проверьте первый чек.");
      $("history-count").textContent="Показано "+number(matched.length)+" из "+number(entries.length)+" последних записей. Короткие номера действуют в текущем журнале; CSV содержит исходные ID.";
      detail(matched.find(function(e){return e.record.receipt_id===selectedId;})||null);
    }

    async function load(){
      $("history-reload").disabled=true;
      $("audit-state").textContent="Проверяем целостность…";
      $("audit-state").className="history-audit muted";
      try{
        var results=await Promise.all([
          api("/contracts/"+encodeURIComponent(active)+"/history"),
          api("/contracts/"+encodeURIComponent(active)+"/reviews")
        ]);
        var result=results[0];
        reviews=results[1].items||[];
        entries=(result.entries||[]).slice().reverse();
        shortNumbers=window.SRHistory.shortLabels(entries);
        $("audit-state").textContent=result.chain_valid?
          "Цепочка записей проверена":"Нарушена целостность журнала";
        $("audit-state").className="history-audit "+(result.chain_valid?"ok":"bad");
        showReviews();
        display();
      }catch(err){
        entries=[];
        reviews=[];
        showReviews();
        selectedId="";
        $("audit-state").textContent="Не удалось проверить журнал";
        $("audit-state").className="history-audit bad";
        display();
        $("history-table").innerHTML=empty("Не удалось получить историю",esc(err.message));
      }finally{
        $("history-reload").disabled=false;
      }
    }
    $("review-reload").onclick=load;
    $("review-queue").onclick=async function(event){
      var button=event.target.closest(".review-action");
      if(!button||reviewBusy)return;
      var index=Number(button.dataset.index);
      var item=reviews[index];
      if(!item||item.status!=="PENDING")return;
      var container=button.closest(".review-item");
      var note=container.querySelector(".review-note").value.trim();
      var category=button.dataset.decision==="APPROVE"?container.querySelector(".review-category").value:null;
      var error=container.querySelector(".review-inline-error");
      if(note.length<4||note.length>500){error.textContent="Укажите обоснование от 4 до 500 символов.";error.className="form-message error review-inline-error";return;}
      if(button.dataset.decision==="APPROVE"&&!category){error.textContent="Для одобрения выберите статью сметы.";error.className="form-message error review-inline-error";return;}
      reviewBusy=true;
      container.querySelectorAll(".review-action").forEach(function(b){b.disabled=true;});
      try{
        await api("/contracts/"+encodeURIComponent(active)+"/reviews/"+encodeURIComponent(item.receipt_id)+"/"+item.item_index+"/resolve","POST",{
          decision:button.dataset.decision,category:category,note:note
        });
        toast("Демо-решение записано в журнал.");
        await reloadContracts(false);
        await load();
      }catch(err){
        error.textContent=err.message;
        error.className="form-message error review-inline-error";
        container.querySelectorAll(".review-action").forEach(function(b){b.disabled=false;});
      }finally{reviewBusy=false;}
    };
    $("history-search").oninput=display;
    $("history-status").onchange=display;
    $("history-reload").onclick=load;
    $("history-table").onclick=function(event){
      var button=event.target.closest(".history-view");
      if(!button)return;
      var index=Number(button.dataset.index);
      if(!Number.isInteger(index)||index<0||index>=matched.length)return;
      selectedId=matched[index].record.receipt_id;
      display();
      var selectedButton=$("history-table").querySelector('.history-view[aria-pressed="true"]');
      if(selectedButton)selectedButton.focus({preventScroll:true});
      if(window.matchMedia&&window.matchMedia("(max-width: 1600px)").matches){
        $("history-detail").scrollIntoView({behavior:"smooth",block:"start"});
      }
    };
    $("history-export").onclick=function(){
      if(!matched.length){toast("Нет операций для выгрузки",true);return;}
      window.SRCSV.download("smartruble-operations.csv",
        ["Дата","Смета","Номер чека","Продавец","Результат","Одобрено, ₽","На проверке, ₽","Отклонено, ₽"],
        matched.map(function(e){var r=e.record;return [dateLabel(e.ts),active,r.receipt_id,r.merchant,
          statusTitle[r.status]||r.status,r.approved,r.review,r.personal_pay];}));
    };
    await load();
  }
  function showAntifraud(){
    root.innerHTML=section("Проверка аномалий","Исследование необычных финансовых связей и операций на синтетических данных.")+
      '<div class="af-warning"><strong>Исследовательская модель, не система обвинений.</strong> Анализ использует искусственные данные. Высокая оценка аномальности не означает мошенничество, не является вероятностью и требует независимой проверки специалистом.</div>'+
      '<div class="af-config">'+
        '<div class="af-config-heading"><div class="eyebrow">ПАРАМЕТРЫ ИССЛЕДОВАНИЯ</div>'+
        '<h2>Построить аналитическую выборку</h2><p>Граф связей получателей и продавцов + алгоритм Isolation Forest. Набор с одинаковым номером воспроизводится.</p></div>'+
        '<div class="af-config-actions"><div class="field"><label for="fraud-seed">Номер набора</label>'+
        '<input class="input" id="fraud-seed" type="number" min="0" max="10000" step="1" value="3" inputmode="numeric"></div>'+
        '<button id="fraud-run" class="btn primary" type="button">Выполнить анализ</button></div>'+
        formMessage("fraud-msg")+'</div>'+
      '<div id="af-output" aria-live="polite">'+
        '<div class="af-placeholder"><div class="af-placeholder-icon" aria-hidden="true">◎</div>'+
        '<h3>Анализ ещё не запускался</h3><p>Введите номер синтетического набора и выполните расчёт, чтобы увидеть рейтинг и характеристики продавцов.</p></div></div>'+
      '<p class="af-footnote">Используются исключительно синтетические транзакции. Результаты не относятся к реальным людям, продавцам и банковским операциям.</p>';
    var selected="";
    var sample=null;
    function percentText(value){return number(window.SRAntifraud.percent(value))+" %";}
    function peerValue(key,value){
      if(key==="night_share"||key==="round_large_share"||key==="largest_student_share")return percentText(value);
      if(key==="average_amount_rub")return cash(value);
      return number(value);
    }
    function renderDetail(merchant){
      var item=(sample.top||[]).find(function(x){return x.merchant===merchant;});
      var target=$("af-detail");
      if(!target)return;
      if(!item){
        target.innerHTML='<div class="af-detail-empty">Выберите продавца слева, чтобы увидеть параметры синтетического сценария.</div>';
        return;
      }
      var s=item.signals||{};
      var descriptions=window.SRAntifraud.notes(s);
      var highlights=window.SRAntifraud.comparisonHighlights(item);
      var peers=item.comparison&&item.comparison.signals;
      var peerCount=item.comparison&&Number(item.comparison.merchant_count);
      var rank=(sample.top||[]).findIndex(function(x){return x.merchant===merchant;})+1;
      var signalData=[
        {key:"transaction_count",caption:"Операций",value:number(s.transaction_count),help:"Число транзакций продавца"},
        {key:"student_count",caption:"Получателей",value:number(s.student_count),help:"Различные получатели средств"},
        {key:"round_large_share",caption:"Крупные круглые суммы",value:percentText(s.round_large_share),help:"Доля операций на сумму от 10 000 ₽, кратную 1 000 ₽"},
        {key:"night_share",caption:"Ночные операции",value:percentText(s.night_share),help:"Доля операций с 22:00 до 05:59"},
        {key:"largest_student_share",caption:"Доля одного получателя",value:percentText(s.largest_student_share),help:"Максимальная доля одного получателя"},
        {key:"average_amount_rub",caption:"Средняя операция",value:cash(s.average_amount_rub),help:"Средняя сумма в синтетической выборке"}
      ];
      target.innerHTML='<div class="af-detail-heading"><div><span class="af-eyebrow">КАРТОЧКА ПРОДАВЦА</span>'+
        '<h3>'+esc(item.merchant)+'</h3></div><span class="af-groundtruth '+(item.planted_anomaly?'flag':'normal')+'">'+
        (item.planted_anomaly?'Заложен тестовый сценарий':'Обычный тестовый сценарий')+'</span></div>'+
        '<div class="af-score"><div><span>Балльная оценка · не процент</span><strong>'+esc(Number(item.anomaly_score).toFixed(4).replace(".",","))+'</strong>'+
        '<small>Место №'+number(rank)+' в топ-'+number((sample.top||[]).length)+' текущего набора</small></div>'+
        '<p>Оценка Isolation Forest служит для ранжирования необычности. Она не является процентом риска или вероятностью мошенничества.</p></div>'+
        (peers&&peerCount>0?'<p class="af-comparison-context">Сравнение со средними показателями остальных '+number(peerCount)+' продавцов (без '+esc(merchant)+'). Среднее считается по продавцам, а не по отдельным транзакциям.</p>':
          '<p class="af-comparison-context">Для этого набора сравнение с другими продавцами недоступно.</p>')+
        '<div class="af-signal-grid">'+signalData.map(function(x){
          return '<div class="af-signal"><span>'+x.caption+'</span><strong>'+x.value+'</strong><small>'+x.help+'</small>'+
            (peers&&peerCount>0&&Number.isFinite(Number(peers[x.key]))?
              '<div class="af-signal-peer"><span>В среднем у остальных</span><b>'+esc(peerValue(x.key,peers[x.key]))+'</b></div>':"")+'</div>';
        }).join("")+'</div>'+
        '<div class="af-explanation"><h4>Чем отличается от остальных</h4>'+
          (highlights.length?'<ul>'+highlights.slice(0,3).map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul>':
            '<p>Выраженных отличий по выбранным простым правилам сравнения не найдено. Рейтинг учитывает сочетание всех признаков.</p>')+
          '<p class="af-explanation-note">Это наблюдаемые отличия, а не объяснение вклада признаков в расчёт Isolation Forest и не доказательство нарушения.</p></div>'+
        '<div class="af-observations"><h4>Наблюдения по простым порогам</h4>'+
        '<ul>'+descriptions.map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul>'+
        '<p>Это описание измеренных признаков, а не доказательство нарушения и не объяснение вклада признаков в расчёт модели.</p></div>';
    }
    function renderResults(){
      var data=sample;
      var top=data.top||[];
      var bars=window.SRAntifraud.barPositions(top);
      $("af-output").innerHTML=
        '<div class="af-summary">'+
          '<div><span>Транзакций</span><strong>'+number(data.transactions)+'</strong><small>В синтетической выборке</small></div>'+
          '<div><span>Продавцов</span><strong>'+number(data.merchant_count)+'</strong><small>В графе связей</small></div>'+
          '<div><span>Заложенных сценариев</span><strong>'+number(data.planted_count)+'</strong><small>Во всём тестовом наборе</small></div>'+
          '<div><span>В рейтинге</span><strong>'+number(top.length)+'</strong><small>Продавцов с наибольшей оценкой</small></div>'+
        '</div>'+
        '<div class="af-layout">'+
          panel("Рейтинг аномальности",'<div class="af-rank-head"><span>Оценка выше — поведение необычнее относительно выборки</span>'+
          '<span>Топ '+number(top.length)+'</span></div>'+
          '<div class="af-rank-list">'+top.map(function(item,i){
            return '<button type="button" class="af-rank-item'+(selected===item.merchant?' selected':'')+'" data-index="'+i+'" aria-pressed="'+(selected===item.merchant?'true':'false')+'" aria-label="Характеристики продавца '+esc(item.merchant)+'">'+
              '<span class="af-rank-number">'+(i+1)+'</span><span class="af-rank-content"><span class="af-rank-name">'+esc(item.merchant)+'</span>'+
              '<span class="af-rank-teaser">'+esc(window.SRAntifraud.comparisonTeaser(item))+'</span>'+
              '<span class="af-rank-track" aria-hidden="true"><span class="af-rank-fill" style="width:'+bars[i]+'%"></span></span></span>'+
              '<span class="af-rank-score">'+esc(Number(item.anomaly_score).toFixed(4).replace(".",","))+'</span></button>';
          }).join("")+'</div>'+
          '<div class="af-rank-foot">Полосы показывают только относительные позиции в этом рейтинге. Баллы — не проценты риска. Подписи описывают измеренные признаки, а не внутренние причины решения модели.</div>')+
          panel("Характеристики продавца",'<div class="af-detail" id="af-detail"></div>')+
        '</div>'+
        '<div class="af-method"><h3>Как читать результаты</h3><div class="af-method-grid">'+
        '<div><strong>1. Рейтинг</strong><p>Isolation Forest сравнивает поведение продавцов в текущем синтетическом наборе.</p></div>'+
        '<div><strong>2. Признаки</strong><p>Число операций, концентрация, время, круглые суммы и средняя сумма помогают изучить данные.</p></div>'+
        '<div><strong>3. Интерпретация</strong><p>Заложенные сценарии известны только потому, что набор создан искусственно. Решения о мошенничестве программа не принимает.</p></div>'+
        '</div></div>';
      Array.from($("af-output").querySelectorAll(".af-rank-item")).forEach(function(btn){
        btn.onclick=function(){
          var i=Number(btn.dataset.index);
          if(!Number.isInteger(i)||i<0||i>=top.length)return;
          selected=top[i].merchant;
          Array.from($("af-output").querySelectorAll(".af-rank-item")).forEach(function(el){
            var selectedNow=el===btn;
            el.classList.toggle("selected",selectedNow);
            el.setAttribute("aria-pressed",String(selectedNow));
          });
          renderDetail(selected);
        };
      });
      renderDetail(selected);
    }
    $("fraud-run").onclick=async function(){
      var seed=Number($("fraud-seed").value);
      if(!Number.isInteger(seed)||seed<0||seed>10000){
        say("fraud-msg","Введите целое число от 0 до 10000.",true);return;
      }
      var button=$("fraud-run");
      button.disabled=true;button.textContent="Анализируем…";
      say("fraud-msg","");
      try{
        sample=await api("/antifraud/demo?seed="+encodeURIComponent(seed));
        if(!Array.isArray(sample.top))throw Error("Сервер вернул неверный формат рейтинга.");
        selected=sample.top.length?sample.top[0].merchant:"";
        renderResults();
        say("fraud-msg","Набор №"+number(seed)+" проанализирован. Можно выбрать продавца в рейтинге.");
      }catch(e){
        say("fraud-msg",e.message,true);
      }finally{
        button.disabled=false;button.textContent="Выполнить анализ";
      }
    };
  }
  function showEconomics(){
    var assumptions=[
      {id:"econ-count",name:"Отчётов в год",value:5000,min:1,max:100000000,step:1,help:"Ожидаемое число проверок за год"},
      {id:"econ-before",name:"Ручная проверка, мин",value:20,min:.01,max:100000,step:"any",help:"Время обработки одного отчёта вручную"},
      {id:"econ-after",name:"С системой, мин",value:8,min:0,max:100000,step:"any",help:"Предполагаемое время после автоматизации"},
      {id:"econ-hour",name:"Стоимость часа, ₽",value:450,min:.01,max:100000000,step:"any",help:"Расчётная стоимость рабочего времени"},
      {id:"econ-maint",name:"Эксплуатация за год, ₽",value:200000,min:0,max:100000000000,step:"any",help:"Предполагаемые ежегодные затраты"},
      {id:"econ-dev",name:"Разработка, ₽",value:1018000,min:0,max:100000000000,step:"any",help:"Разовая оценка стоимости разработки"}
    ];
    function inputField(item){
      return '<div class="field econ-field"><label for="'+item.id+'">'+item.name+'</label>'+
        '<input class="input" id="'+item.id+'" type="text" inputmode="'+(item.step===1?"numeric":"decimal")+'" autocomplete="off" aria-required="true" aria-describedby="'+item.id+'-help '+item.id+'-error" value="'+item.value+'">'+
        '<div class="field-help" id="'+item.id+'-help">'+item.help+'</div>'+
        '<div class="econ-field-error" id="'+item.id+'-error" role="status" aria-live="polite"></div></div>';
    }
    var placeholder='<div class="econ-empty"><div class="econ-empty-icon" aria-hidden="true">▥</div>'+
      '<h3>Расчёт ещё не выполнен</h3><p>Укажите предположения и нажмите «Рассчитать». Система сравнит низкую, базовую и высокую нагрузку.</p></div>';
    root.innerHTML=section("Экономическая оценка","Исследуйте возможный эффект автоматизации при разных предположениях о нагрузке и затратах.")+
      '<div class="econ-warning"><strong>Это сценарный расчёт, а не подтверждённая экономия.</strong> Все исходные показатели заданы в качестве предположений. Без реальных замеров, дисконтирования, налогов, рисков и затрат на интеграцию цифры нельзя считать прогнозом фактической окупаемости.</div>'+
      '<div class="econ-layout">'+
      panel("Исходные предположения",'<div class="econ-form-body"><div class="econ-section-head"><span>ВВОДНЫЕ ДАННЫЕ</span><p>Все значения можно редактировать. Данные не сохраняются на сервере. Используйте обычные цифры, запятую или точку для дробной части; символ ₽ вводить не нужно.</p></div>'+
        '<form id="econ-form">'+
        '<div class="econ-fields">'+assumptions.map(inputField).join("")+'</div>'+
        '<div class="econ-presets"><span>Быстрый выбор объёма:</span>'+
          '<button type="button" class="econ-preset" data-volume="2000">2 000</button>'+
          '<button type="button" class="econ-preset" data-volume="5000">5 000</button>'+
          '<button type="button" class="econ-preset" data-volume="10000">10 000</button></div>'+
        '<div class="econ-submit-row"><button id="econ-submit" class="btn primary" type="submit">Рассчитать сценарии</button>'+
        '<span>Сервер проверит формулы для трёх вариантов нагрузки</span></div>'+
        formMessage("econ-msg")+'</form></div>')+
      panel("Результат базового сценария",'<div id="econ-result" aria-live="polite">'+placeholder+'</div>')+
      '</div>'+
      '<div id="econ-results"></div>'+
      '<p class="econ-footer">Методика: прямой денежный эквивалент сэкономленного рабочего времени и простая окупаемость без дисконтирования. Положительный расчётный эффект не означает реальную экономию бюджета или сокращение затрат организации.</p>';

    function payload(){
      var raw={};
      assumptions.forEach(function(item){raw[item.id]=$(item.id).value;});
      var parsed=window.SREconomics.validateAssumptions(raw);
      assumptions.forEach(function(item){
        var input=$(item.id);
        var problem=parsed.errors.find(function(e){return e.id===item.id;});
        var note=$(item.id+"-error");
        note.textContent=problem?problem.message:"";
        if(problem)input.setAttribute("aria-invalid","true");
        else input.removeAttribute("aria-invalid");
      });
      if(!parsed.valid){
        $(parsed.errors[0].id).focus();
        throw Error("Проверьте выделенные поля с исходными данными.");
      }
      var values=parsed.values;
      return {workflows_per_year:values["econ-count"],manual_minutes:values["econ-before"],
        automated_minutes:values["econ-after"],hourly_cost_rub:values["econ-hour"],
        maintenance_rub_year:values["econ-maint"],development_rub:values["econ-dev"]};
    }
    function barRow(label,amount,max,kind){
      return '<div class="econ-breakdown-row"><div><span>'+label+'</span><strong class="'+(amount<0?'econ-negative':'')+'">'+cash(amount)+'</strong></div>'+
        '<div class="econ-bar-track" aria-hidden="true"><span class="econ-bar-fill '+(kind||"")+'" style="width:'+window.SREconomics.barWidth(amount,max)+'%"></span></div></div>';
    }
    function renderResult(input,cases){
      var current=cases[1].result;
      var max=Math.max(1,Math.abs(current.gross_labor_value_rub_year),Math.abs(current.maintenance_rub_year),Math.abs(current.net_effect_rub_year));
      var saving=(input.manual_minutes-input.automated_minutes);
      var payback=current.payback_years==null?"Не достигается":number(current.payback_years)+" года";
      $("econ-result").innerHTML='<div class="econ-result-body">'+
        '<div class="econ-result-intro"><span>БАЗОВЫЙ СЦЕНАРИЙ · '+number(input.workflows_per_year)+' ОТЧЁТОВ В ГОД</span>'+
        '<h3 class="'+(current.net_effect_rub_year<0?'econ-negative':'')+'">'+cash(current.net_effect_rub_year)+'</h3>'+
        '<p>Расчётный чистый эффект за год после предполагаемых эксплуатационных расходов.</p></div>'+
        '<div class="econ-kpis"><div><span>Высвобождение времени</span><strong>'+number(current.hours_saved_per_year)+' ч</strong></div>'+
        '<div><span>Простая окупаемость</span><strong>'+payback+'</strong></div>'+
        '<div><span>Сокращение времени на отчёт</span><strong>'+number(saving)+' мин</strong></div>'+
        '<div><span>Порог покрытия эксплуатации</span><strong>'+(current.breakeven_workflows_per_year==null?"Не достигается":number(current.breakeven_workflows_per_year)+" отчётов/год")+'</strong></div></div>'+
        '<div class="econ-breakdown"><h4>Структура годового эффекта</h4>'+
          barRow("Денежный эквивалент времени",current.gross_labor_value_rub_year,max,"gross")+
          barRow("Расходы на эксплуатацию",current.maintenance_rub_year,max,"expense")+
          barRow("Чистый годовой эффект",current.net_effect_rub_year,max,current.net_effect_rub_year<0?"negative":"net")+
        '</div>'+
        '<div class="econ-development">Предполагаемые разовые затраты на разработку <strong>'+cash(current.development_rub)+'</strong></div>'+
        '</div>';
      var chart=window.SREconomics.chartLines(cases);
      var colors={low:"#B89A83",base:"#BB080B",high:"#417C6B"};
      var paths=chart.lines.map(function(s){
        var color=colors[s.id];
        var points=s.points.map(function(p){return p.x+","+p.y;}).join(" ");
        return '<polyline points="'+points+'" stroke="'+color+'" stroke-width="'+(s.id==="base"?"3":"2.3")+'" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'+
          s.points.map(function(p){return '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(s.id==="base"?"3.6":"2.8")+'" fill="'+color+'"/>';}).join("");
      }).join("");
      var zero='<line x1="44" x2="439" y1="'+chart.zero+'" y2="'+chart.zero+'" stroke="#A79C90" stroke-width="1" stroke-dasharray="5 5"/>';
      var ticks=[0,1,2,3,4,5].map(function(y){return '<text x="'+(44+y*79)+'" y="200" text-anchor="middle">'+y+'</text>';}).join("");
      var svg='<svg class="econ-chart" role="img" aria-label="Упрощённый накопленный расчётный эффект по трём сценариям за пять лет. Значения и формула указаны ниже." viewBox="0 0 480 212" preserveAspectRatio="xMidYMid meet">'+
        '<g class="econ-chart-guide"><line x1="44" x2="439" y1="12" y2="12"/><line x1="44" x2="439" y1="178" y2="178"/></g>'+zero+paths+
        '<g class="econ-chart-ticks">'+ticks+'</g></svg>';
      var peak=Math.max(1,...cases.map(function(x){return Math.abs(x.result.net_effect_rub_year);}));
      var comparison=cases.map(function(entry,i){
        var result=entry.result;
        var negative=result.net_effect_rub_year<0;
        return '<div class="econ-case'+(i===1?' is-base':'')+'">'+
          '<div class="econ-case-top"><span>'+entry.label+'</span><span>'+number(entry.count)+' отч./год</span></div>'+
          '<strong class="'+(negative?'econ-negative':'')+'">'+cash(result.net_effect_rub_year)+'</strong>'+
          '<div class="econ-case-bar"><span class="'+(negative?'negative':'')+'" style="width:'+window.SREconomics.barWidth(result.net_effect_rub_year,peak)+'%"></span></div>'+
          '<div class="econ-case-bottom"><span>Высвобождено '+number(result.hours_saved_per_year)+' ч/год</span>'+
          '<span>Окупаемость: '+(result.payback_years==null?"не достигается":number(result.payback_years)+" г.")+'</span></div></div>';
      }).join("");
      var totals=cases.map(function(entry){
        var row=window.SREconomics.projection(entry.result,5);
        return '<tr><th scope="row">'+entry.label+'</th>'+row.map(function(r){return '<td>'+cash(r.value)+'</td>';}).join("")+'</tr>';
      }).join("");
      $("econ-results").innerHTML=
        '<div class="econ-bottom-grid">'+
          panel("Анализ чувствительности",'<div class="econ-compare-intro">Сравнение при 60%, 100% и 140% от указанной нагрузки. Время обработки и затраты во всех вариантах одинаковые.</div>'+
            '<div class="econ-cases">'+comparison+'</div>')+
          panel("Накопленный эффект за 5 лет",'<div class="econ-chart-body"><p>Упрощённый эффект = годы × чистый годовой эффект − разовые затраты на разработку.</p>'+
            '<div class="econ-legend"><span class="low">Низкая</span><span class="base">Базовая</span><span class="high">Высокая</span></div>'+
            svg+'<div class="econ-chart-note">Горизонталь из пунктиров — нулевой эффект. Линии отражают только заданные предположения.</div></div>')+
        '</div>'+
        panel("Расшифровка расчётов",'<div class="econ-math">'+
          '<div><b>1. Высвобожденные часы</b><span>Отчётов в год × (время вручную − время с системой) / 60</span></div>'+
          '<div><b>2. Денежный эквивалент</b><span>Высвобожденные часы × стоимость часа</span></div>'+
          '<div><b>3. Чистый эффект за год</b><span>Денежный эквивалент − ежегодная эксплуатация</span></div>'+
          '<div><b>4. Простая окупаемость</b><span>Разработка / чистый годовой эффект, только если эффект положительный</span></div>'+
        '</div><div class="econ-table-scroll"><table class="econ-table"><caption>Упрощённый накопленный эффект, ₽</caption>'+
          '<thead><tr><th scope="col">Сценарий</th><th scope="col">Год 0</th><th scope="col">Год 1</th>'+
          '<th scope="col">Год 2</th><th scope="col">Год 3</th><th scope="col">Год 4</th><th scope="col">Год 5</th></tr></thead><tbody>'+totals+'</tbody></table></div>'+
        '<p class="econ-table-note">Отрицательное значение означает, что накопленный расчётный эффект ещё не покрыл разовые затраты. Не учитываются инфляция, дисконтирование и прочие издержки.</p>');
    }
    var calculationVersion=0;
    function markStale(){
      calculationVersion++;
      $("econ-result").innerHTML=placeholder;
      $("econ-results").innerHTML="";
      say("econ-msg","");
    }
    $("econ-form").addEventListener("input",function(e){
      var input=e.target;
      if(input && input.id && $(input.id+"-error")){
        input.removeAttribute("aria-invalid");
        $(input.id+"-error").textContent="";
      }
      markStale();
    });
    Array.from(root.querySelectorAll(".econ-preset")).forEach(function(button){
      button.onclick=function(){
        $("econ-count").value=button.dataset.volume;
        $("econ-count").removeAttribute("aria-invalid");
        $("econ-count-error").textContent="";
        markStale();
      };
    });
    $("econ-form").onsubmit=async function(e){
      e.preventDefault();
      var p;
      try{p=payload();}catch(err){say("econ-msg",err.message,true);return;}
      var volumes;
      try{volumes=window.SREconomics.volumes(p.workflows_per_year);}catch(err){say("econ-msg",err.message,true);return;}
      var calculation=++calculationVersion;
      var button=$("econ-submit");
      button.disabled=true;button.textContent="Рассчитываем…";
      say("econ-msg","");
      try{
        var results=await Promise.all(volumes.map(function(item){
          return api("/economics/scenario","POST",Object.assign({},p,{workflows_per_year:item.count}));
        }));
        if(calculation!==calculationVersion)return;
        var cases=volumes.map(function(item,i){return Object.assign({},item,{result:results[i]});});
        renderResult(p,cases);
        say("econ-msg","Готово. Все три сценария рассчитаны сервером по заданным предположениям.");
      }catch(err){
        if(calculation===calculationVersion)say("econ-msg",err.message,true);
      }
      finally{button.disabled=false;button.textContent="Рассчитать сценарии";}
    };
  }
  function render(){
    document.title=(ROUTES[PAGE]||"Обзор")+" — СмартРубль AI";
    Array.from(document.querySelectorAll("#navigation a")).forEach(function(a){
      if(a.dataset.page===(PAGE==="overview"?"overview":PAGE))a.setAttribute("aria-current","page");
      else a.removeAttribute("aria-current");
    });
    if(PAGE==="overview")showOverview();
    else if(PAGE==="estimates")showEstimates();
    else if(PAGE==="receipts")showReceipts();
    else if(PAGE==="history")showHistory();
    else if(PAGE==="antifraud")showAntifraud();
    else if(PAGE==="economics")showEconomics();
    else root.innerHTML=section("Раздел не найден","Вернитесь в рабочее пространство.")+link("","На главную");
  }
  $("active-grant").addEventListener("change",function(e){
    active=e.target.value;
    if(active)sessionStorage.setItem("sr-active-grant",active);else sessionStorage.removeItem("sr-active-grant");
    render();
  });
  // UI v0.4: the three workspace links and contextual tabs are always visible.
  // navigation.js reads the URL; no off-canvas drawer or stored sidebar mode.
  reloadContracts().catch(function(err){root.innerHTML=section("Ошибка подключения","Не удалось получить сведения о сметах.")+
    '<div class="notice">'+esc(err.message)+'. Убедитесь, что сервер запущен.</div>';
    toast("Сервер недоступен",true);
  });
})();
