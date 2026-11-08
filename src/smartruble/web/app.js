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
  var statusTitle={APPROVED:"Одобрено",PARTIAL:"Частично",NEEDS_REVIEW:"На проверке",APPROVE:"Одобрено",REVIEW:"На проверке",REJECT:"Отклонено"};
  var statusClass={APPROVED:"ok",PARTIAL:"warn",NEEDS_REVIEW:"warn",APPROVE:"ok",REVIEW:"warn",REJECT:"bad"};
  function badge(s){return '<span class="status '+(statusClass[s]||"muted")+'">'+esc(statusTitle[s]||s)+'</span>';}
  function section(title,desc,actions){return '<div class="page-head"><div><div class="eyebrow">Контроль целевых средств</div><h1>'+title+'</h1><p class="page-description">'+desc+'</p></div>'+(actions?'<div class="page-actions">'+actions+'</div>':"")+'</div>';}
  function panel(title,content,right){return '<section class="panel"><div class="panel-head"><h2>'+title+'</h2>'+(right||"")+'</div>'+content+'</section>';}
  function empty(title,help){return '<div class="empty"><strong>'+title+'</strong>'+help+'</div>';}
  function notice(){return '<div class="inline-note"><strong>Демонстрационная версия.</strong> Все операции выполняются на синтетических данных. Средства не списываются, интеграции с платёжными системами нет.</div>';}
  function table(head,rows,emptyText){return '<div class="table-wrap"><table><thead><tr>'+head.map(function(h){return '<th'+(h.num?' class="number"':'')+'>'+esc(h.title||h)+'</th>';}).join("")+'</tr></thead><tbody>'+(rows.length?rows.join(""):'<tr><td colspan="'+head.length+'" class="table-empty">'+esc(emptyText||"Нет данных")+'</td></tr>')+'</tbody></table></div>';}
  function tr(cells){return '<tr>'+cells.map(function(v){return '<td>'+v+'</td>';}).join("")+'</tr>';}
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
  function showOverview(){
    var c=current();
    var budget=contracts.reduce(function(t,x){return t+sum(x.limits);},0);
    var spent=contracts.reduce(function(t,x){return t+sum(x.spent);},0);
    root.innerHTML=section("Обзор","Состояние смет, расходы и операции, требующие внимания.",link("receipts","Проверить чек")+'<a class="btn primary" href="/app/estimates">Новая смета</a>')+
      notice()+'<div class="metric-grid">'+
      metaCard("Смет в системе",number(contracts.length),"Создано в текущем сеансе сервера")+
      metaCard("Общий лимит",cash(budget),"По всем сметам")+
      metaCard("Одобрено",cash(spent),"Условные операции")+
      metaCard("Доступно",cash(budget-spent),"Остаток лимитов")+'</div>'+
      '<div class="columns wide-first">'+
      panel("Сметы",table(["Идентификатор",{title:"Лимит",num:true},{title:"Одобрено",num:true},"Чеков"],contracts.map(function(x){return tr(['<span class="emphasis">'+esc(x.grant_id)+'</span>','<span class="number">'+cash(sum(x.limits))+'</span>','<span class="number">'+cash(sum(x.spent))+'</span>',number(x.transactions)]);}),"Пока нет созданных смет"),'<a href="/app/estimates" class="tiny-action">Все сметы</a>')+
      panel("Быстрые действия",'<div class="panel-body"><div class="grid-list"><a href="/app/estimates">Создать смету<span>›</span></a><a href="/app/receipts">Проверить покупку<span>›</span></a><a href="/app/history">Посмотреть историю<span>›</span></a><a href="/app/antifraud">Проверить аномалии<span>›</span></a></div></div>')+
      '</div>';
  }
  function showEstimates(){
    root.innerHTML=section("Сметы и лимиты","Создание и просмотр условий целевого расходования средств.")+
      '<div class="columns wide-first">'+
      panel("Реестр смет",table(["Идентификатор",{title:"Лимит",num:true},{title:"Израсходовано",num:true},{title:"Остаток",num:true},"Чеков"],contracts.map(function(c){return tr(['<strong>'+esc(c.grant_id)+'</strong>',cash(sum(c.limits)),cash(sum(c.spent)),cash(sum(c.limits)-sum(c.spent)),number(c.transactions)]);}),"Сметы ещё не созданы"))+
      panel("Новая смета",'<div class="panel-body"><form id="estimate-form">'+field("grant-name","Идентификатор сметы","грант-2026")+
      '<div class="field" style="margin-top:15px"><label for="estimate-text">Статьи расходов</label><textarea id="estimate-text" rows="6">Расходные материалы — 50 000 ₽\nОборудование — 120 000 ₽\nУслуги хостинга — 10 000 ₽</textarea><div class="field-help">По одной статье и сумме в каждой строке. Нераспознанные строки нужно проверить вручную.</div></div>'+
      '<div class="form-actions"><button class="btn primary" type="submit">Создать смету</button><button class="btn secondary" type="button" id="new-example">Пример</button></div>'+formMessage("estimate-msg")+'</form></div>')+
      '</div><div class="stack" id="estimate-details" style="margin-top:18px"></div>';
    $("estimate-form").onsubmit=async function(e){
      e.preventDefault();
      var id=$("grant-name").value.trim();
      if(!id){say("estimate-msg","Введите идентификатор",true);return;}
      try{
        var x=await api("/contracts","POST",{grant_id:id,text:$("estimate-text").value});
        active=x.grant_id;sessionStorage.setItem("sr-active-grant",active);
        await reloadContracts();toast(x.unparsed.length?"Смета создана. Не распознано строк: "+x.unparsed.length:"Смета создана");
      }catch(e){say("estimate-msg",e.message,true);}
    };
    $("new-example").onclick=function(){
      $("grant-name").value="грант-"+Date.now().toString().slice(-6);
      $("estimate-text").value="Расходные материалы — 50 000 ₽\nОборудование — 120 000 ₽\nУслуги хостинга — 10 000 ₽";
    };
    var c=current();
    if(c){
      var rows=Object.keys(c.limits).map(function(cat){return tr([esc(labels[cat]||cat),cash(c.limits[cat]),cash(c.spent[cat]||0),cash(c.limits[cat]-(c.spent[cat]||0))]);});
      $("estimate-details").innerHTML=panel("Статьи активной сметы: "+esc(c.grant_id),table(["Статья",{title:"Лимит",num:true},{title:"Одобрено",num:true},{title:"Остаток",num:true}],rows));
    }
  }
  var demoItems=[{name:"Микроконтроллер Arduino Uno R3",qty:1,price:2500},{name:"Шоколад Аленка молочный",qty:1,price:240}];
  function receiptRow(item){
    var index=Math.random().toString(36).slice(2);
    return '<div class="receipt-row" data-row="'+index+'">'+
      '<input class="input item-name" aria-label="Название товара" placeholder="Название товара" maxlength="250" value="'+esc(item.name||"")+'">'+
      '<input class="input item-qty" type="number" min="0.01" step="0.01" aria-label="Количество" value="'+esc(item.qty||1)+'">'+
      '<input class="input item-price" type="number" min="0.01" step="0.01" aria-label="Цена, ₽" value="'+esc(item.price||"")+'">'+
      '<button class="remove-item" type="button" title="Удалить строку" aria-label="Удалить строку">×</button></div>';
  }
  function showReceipts(){
    root.innerHTML=section("Проверка чеков","Проверяйте каждую позицию по лимитам выбранной сметы.")+
      (!current()?grantNeeded():'<div class="columns wide-first">'+
      panel("Новый чек",'<div class="panel-body"><form id="receipt-form">'+
        '<div class="field"><label for="merchant">Продавец</label><input class="input" id="merchant" value="ООО Электроника" maxlength="200" required></div>'+
        '<div class="sep"></div><h3 style="margin-bottom:12px">Состав покупки</h3>'+
        '<div class="receipt-row receipt-columns"><span>Наименование</span><span>Количество</span><span>Цена, ₽</span><span></span></div>'+
        '<div id="receipt-lines">'+demoItems.map(receiptRow).join("")+'</div>'+
        '<div class="form-actions"><button class="btn secondary btn-sm" type="button" id="add-item">+ Добавить позицию</button></div>'+
        '<div class="sep"></div><div class="form-actions"><button class="btn primary" type="submit">Проверить чек</button><button class="btn secondary" type="button" id="receipt-example">Заполнить пример</button></div>'+
        formMessage("receipt-msg")+'</form></div>')+
      panel("Результат проверки",'<div id="receipt-result">'+empty("Результат ещё не получен","После проверки здесь появятся решения по каждой позиции.")+'</div>')+
      '</div>');
    if(!current())return;
    $("add-item").onclick=function(){$("receipt-lines").insertAdjacentHTML("beforeend",receiptRow({qty:1}));};
    $("receipt-example").onclick=function(){$("merchant").value="ООО Электроника";$("receipt-lines").innerHTML=demoItems.map(receiptRow).join("");};
    $("receipt-lines").onclick=function(e){
      var btn=e.target.closest(".remove-item");if(!btn)return;
      if($("receipt-lines").querySelectorAll(".receipt-row").length<=1){toast("В чеке должна остаться хотя бы одна позиция",true);return;}
      btn.closest(".receipt-row").remove();
    };
    $("receipt-form").onsubmit=async function(e){
      e.preventDefault();
      var id=active;
      var items=Array.from($("receipt-lines").querySelectorAll(".receipt-row")).map(function(row){
        return {name:row.querySelector(".item-name").value.trim(),qty:Number(row.querySelector(".item-qty").value),price:Number(row.querySelector(".item-price").value)};
      });
      if(items.some(function(x){return !x.name||!Number.isFinite(x.price)||x.price<=0||!Number.isFinite(x.qty)||x.qty<=0;})){
        say("receipt-msg","Заполните все позиции: название, положительное количество и цену.",true);return;
      }
      var key=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2));
      var payload={id:"demo-"+key,merchant:$("merchant").value.trim(),items:items};
      var button=$("receipt-form").querySelector("button[type=submit]");button.disabled=true;
      try{
        var result=await api("/contracts/"+encodeURIComponent(id)+"/validate","POST",payload);
        say("receipt-msg","Проверка завершена. Сведения сохранены в журнал.");
        var totals='<div class="summary-inline"><div>Одобрено<b>'+cash(result.approved)+'</b></div><div>На проверке<b>'+cash(result.review)+'</b></div><div>Отклонено<b>'+cash(result.personal_pay)+'</b></div></div>';
        var rows=result.items.map(function(x){return tr([esc(x.name)+'<small>'+esc(x.reason)+'</small>',badge(x.decision),cash(x.amount)]);});
        $("receipt-result").innerHTML='<div class="panel-body"><div class="small-data">Чек '+esc(result.receipt_id)+'</div><div style="margin-top:8px">'+badge(result.status)+'</div>'+totals+'</div>'+
        table(["Товар","Решение",{title:"Сумма",num:true}],rows);
        await reloadContracts(false);
      }catch(err){say("receipt-msg",err.message,true);}finally{button.disabled=false;}
    };
  }
  function dateLabel(timestamp){
    try{return new Date(timestamp*1000).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return "—";}
  }
  async function showHistory(){
    root.innerHTML=section("История операций","Проверенные чеки, причины решений и контроль целостности журнала.")+
      (!current()?grantNeeded():panel("Операции по смете: "+esc(active),'<div class="toolbar"><div class="left"><input id="history-search" class="input" placeholder="Поиск по чеку или продавцу" aria-label="Поиск по чеку или продавцу"><select id="history-status" aria-label="Фильтр по результату"><option value="">Все решения</option><option value="APPROVED">Одобрено</option><option value="NEEDS_REVIEW">На проверке</option><option value="PARTIAL">Частично</option></select></div><div class="right"><span id="audit-state" class="status muted">Проверка журнала…</span><button id="history-reload" class="btn secondary btn-sm">Обновить</button></div></div><div id="history-table">'+empty("Загрузка","Получаем историю операций.")+'</div><div id="history-count" class="filter-result"></div>'));
    if(!current())return;
    var entries=[];
    function display(){
      var q=$("history-search").value.toLowerCase().trim();
      var filter=$("history-status").value;
      var subset=entries.filter(function(e){
        var r=e.record;
        return (!filter||r.status===filter)&&(!q||txt(r.receipt_id).toLowerCase().includes(q)||txt(r.merchant).toLowerCase().includes(q));
      });
      var rows=subset.map(function(e){var r=e.record;return tr([dateLabel(e.ts),'<strong>'+esc(r.receipt_id)+'</strong>',esc(r.merchant),badge(r.status),cash(r.approved),cash(r.review),cash(r.personal_pay)]);});
      $("history-table").innerHTML=table(["Дата","Чек","Продавец","Результат",{title:"Одобрено",num:true},{title:"Проверка",num:true},{title:"Отклонено",num:true}],rows,"Подходящих операций нет");
      $("history-count").textContent="Показано записей: "+subset.length+" из "+entries.length;
    }
    async function load(){
      try{
        var result=await api("/contracts/"+encodeURIComponent(active)+"/history");
        entries=(result.entries||[]).slice().reverse();
        $("audit-state").textContent=result.chain_valid?"Журнал цел": "Нарушена целостность журнала";
        $("audit-state").className="status "+(result.chain_valid?"ok":"bad");
        display();
      }catch(err){$("history-table").innerHTML=empty("Не удалось загрузить историю",esc(err.message));}
    }
    $("history-search").oninput=display;$("history-status").onchange=display;$("history-reload").onclick=load;
    await load();
  }
  function showAntifraud(){
    root.innerHTML=section("Проверка аномалий","Анализ подозрительных связей между получателями и продавцами на искусственных данных.")+
      '<div class="notice">Антифрод работает как отдельный исследовательский модуль. Найденные аномалии не доказывают мошенничество и не являются результатом проверки реальных операций.</div>'+
      panel("Исследование синтетических операций",'<div class="panel-body"><div class="form-grid"><div class="field"><label for="fraud-seed">Номер набора данных</label><input class="input" id="fraud-seed" type="number" min="0" max="10000" step="1" value="3"><div class="field-help">Одинаковый номер даёт воспроизводимый набор.</div></div></div><div class="form-actions"><button id="fraud-run" class="btn primary">Выполнить анализ</button></div>'+formMessage("fraud-msg")+'</div><div id="fraud-table">'+empty("Анализ не проводился","Запустите исследование для просмотра рейтинга аномалий.")+'</div>')+
      '<div class="caption">Алгоритмы: граф связей и Isolation Forest. Результаты требуют проверки специалистом.</div>';
    $("fraud-run").onclick=async function(){
      var seed=Number($("fraud-seed").value);
      if(!Number.isInteger(seed)||seed<0||seed>10000){say("fraud-msg","Введите целое число от 0 до 10000.",true);return;}
      var btn=$("fraud-run");btn.disabled=true;
      try{
        var result=await api("/antifraud/demo?seed="+seed);
        say("fraud-msg","Проанализировано операций: "+number(result.transactions)+". Продавцов: "+number(result.merchant_count)+".");
        var rows=result.top.map(function(v,i){return tr([number(i+1),'<strong>'+esc(v.merchant)+'</strong>',esc(Number(v.anomaly_score).toFixed(4).replace(".",",")),v.planted_anomaly?'<span class="status warn">Искусственно заложенная аномалия</span>':'<span class="status muted">Обычный сценарий</span>']);});
        $("fraud-table").innerHTML=table(["№","Продавец","Оценка модели","Тип в тестовом наборе"],rows);
      }catch(e){say("fraud-msg",e.message,true);}finally{btn.disabled=false;}
    };
  }
  function showEconomics(){
    root.innerHTML=section("Экономическая оценка","Сравните возможный эффект автоматизации при разных исходных предположениях.")+
      '<div class="notice">Расчёт — иллюстративный сценарий, а не подтверждённая экономия организации. Для оценки внедрения нужны реальные замеры времени и расходов.</div>'+
      '<div class="columns wide-first">'+
      panel("Параметры расчёта",'<div class="panel-body"><form id="econ-form"><div class="form-grid">'+
      field("econ-count","Отчётов в год","5000","number")+
      field("econ-before","Проверка вручную, мин","20","number")+
      field("econ-after","С системой, мин","8","number")+
      field("econ-hour","Стоимость рабочего часа, ₽","450","number")+
      field("econ-maint","Эксплуатация в год, ₽","200000","number")+
      field("econ-dev","Затраты на разработку, ₽","1018000","number")+
      '</div><div class="form-actions"><button type="submit" class="btn primary">Рассчитать</button></div>'+formMessage("econ-msg")+'</form></div>')+
      panel("Расчётный результат",'<div id="econ-result">'+empty("Нет результатов","Введите параметры и выполните расчёт.")+'</div>')+
      '</div>';
    $("econ-form").onsubmit=async function(e){
      e.preventDefault();
      var payload={workflows_per_year:Number($("econ-count").value),manual_minutes:Number($("econ-before").value),
        automated_minutes:Number($("econ-after").value),hourly_cost_rub:Number($("econ-hour").value),
        maintenance_rub_year:Number($("econ-maint").value),development_rub:Number($("econ-dev").value)};
      try{
        var d=await api("/economics/scenario","POST",payload);
        say("econ-msg","Расчёт выполнен по заданным предположениям.");
        $("econ-result").innerHTML='<div class="panel-body"><dl class="keyvalue"><dt>Высвобождение времени в год</dt><dd>'+number(d.hours_saved_per_year)+' ч</dd>'+
          '<dt>Денежный эквивалент труда</dt><dd>'+cash(d.gross_labor_value_rub_year)+'</dd>'+
          '<dt>Эксплуатация в год</dt><dd>'+cash(d.maintenance_rub_year)+'</dd>'+
          '<dt>Чистый годовой эффект</dt><dd>'+cash(d.net_effect_rub_year)+'</dd>'+
          '<dt>Простая окупаемость</dt><dd>'+(d.payback_years===null?'Не достигается':number(d.payback_years)+' года')+'</dd>'+
          '<dt>Минимум отчётов для покрытия эксплуатации</dt><dd>'+(d.breakeven_workflows_per_year===null?'Не достигается':number(d.breakeven_workflows_per_year))+'</dd>'+
          '</dl><div class="sep"></div><p class="panel-note">Без дисконтирования, налогов, рисков и затрат на реальную интеграцию.</p></div>';
      }catch(err){say("econ-msg",err.message,true);}
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
  $("menu-toggle").onclick=function(){
    var shown=document.body.classList.toggle("menu-open");
    $("menu-toggle").setAttribute("aria-expanded",shown?"true":"false");
  };
  document.addEventListener("keydown",function(e){if(e.key==="Escape")document.body.classList.remove("menu-open");});
  reloadContracts().catch(function(err){root.innerHTML=section("Ошибка подключения","Не удалось получить сведения о сметах.")+
    '<div class="notice">'+esc(err.message)+'. Убедитесь, что сервер запущен.</div>';
    toast("Сервер недоступен",true);
  });
})();
