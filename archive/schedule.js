// Removed from index.html in v27.80 (schedule). Kept so it can be revisited.
// Full working app as it was: GitHub branch archive/v27.70-before-revamp.

function openSched(){
  S('S_sched');
  _schedOffset=0;
  var el=document.getElementById('schedBody');
  if(el)el.innerHTML='<div style="padding:20px;color:var(--tx3);text-align:center;font-size:13px">Loading...</div>';
  setTimeout(renderSchedList,50);
}

function getTownDays(){
  try{
    var s=localStorage.getItem('dg_town_days');
    if(s!==null){
      if(s==='')return [];
      return s.split(',').map(Number).filter(function(n){return!isNaN(n);});
    }
  } catch(e){}
  return [1,2,3,4,5];
}

function setTownDays(arr){
  try{localStorage.setItem('dg_town_days',arr.join(','));}catch(e){}
}

function toggleTownDay(dow){
  var days=getTownDays();
  var idx=days.indexOf(dow);
  if(idx>=0){days.splice(idx,1);}else{days.push(dow);}
  setTownDays(days);
  renderSchedList();
}

function renderSchedList(){
  var el=document.getElementById('schedBody');
  if(!el)return;
  try{
    var now=new Date();
    var base=new Date(now.getFullYear(),now.getMonth(),now.getDate()+_schedOffset);
    var todayStr=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toDateString();
    var days=[];
    for(var i=0;i<7;i++){days.push(new Date(base.getFullYear(),base.getMonth(),base.getDate()+i));}
    var HOURS=[6,7,8,9,10,11,12,13,14,15,16,17,18,19];
    var fmtH=function(h){return(h>12?h-12:h===0?12:h)+(h>=12?'p':'a');};
    var townDays=getTownDays();var isTown=function(dow,h){return townDays.includes(dow)&&h>=6&&h<14;};
    var isAvail=function(dow,h){return[1,3,5].includes(dow)&&((h===11||h===12)||(h===14||h===15));};
    var h='';
    h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px 4px">';
    h+='<button onclick="schedBack()" style="background:none;border:1px solid var(--bd2);border-radius:var(--rs);padding:5px 12px;font-size:13px;cursor:pointer;color:var(--tx2);font-family:var(--fn)">&#8592; Back</button>';
    h+='<span style="font-size:12px;font-weight:600;color:var(--tx2);font-family:var(--mo)">'+days[0].toLocaleDateString('en-US',{month:'short',day:'numeric'})+' \u2013 '+days[6].toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</span>';
    h+='<button onclick="schedFwd()" style="background:none;border:1px solid var(--bd2);border-radius:var(--rs);padding:5px 12px;font-size:13px;cursor:pointer;color:var(--tx2);font-family:var(--fn)">Next &#8594;</button>';
    h+='</div>';
    days.forEach(function(dt){
      var dow=dt.getDay();
      var dayStr=dt.toISOString().split('T')[0];
      var isToday=dt.toDateString()===todayStr;
      var dayLabel=dt.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
      var dayWOs=(wos||[]).filter(function(w){return w.scheduled_date===dayStr;});
      h+='<div style="padding:12px 14px 6px;border-top:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between">';
      h+='<span style="font-size:14px;font-weight:700;color:'+(isToday?'var(--red)':'var(--tx)')+'">'+dayLabel+'</span>';
      h+='<div style="display:flex;gap:5px">';
      h+='<button onclick="openAddSchedBlock(\''+dayStr+'\',8)" style="background:none;border:1px solid var(--bd2);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--tx3);cursor:pointer;font-family:var(--fn)">+ Add</button>';
      var hasTown=townDays.includes(dow);
      h+='<button onclick="toggleTownDay('+dow+')" style="background:'+(hasTown?'rgba(201,149,42,.12)':'none')+';border:1px solid '+(hasTown?'var(--amb)':'var(--bd2)')+';border-radius:6px;padding:3px 10px;font-size:11px;color:'+(hasTown?'var(--amb)':'var(--tx3)')+';cursor:pointer;font-family:var(--fn);font-weight:700">'+(hasTown?'TOH ×':'+ TOH')+'</button>';
      h+='</div>';
      h+='</div>';
      h+='<div style="display:flex;gap:5px;padding:4px 14px 10px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none">';
      var _townOv=getTownOverrides()[dayStr]||[];
      HOURS.forEach(function(hr){
        var wo=null;
        dayWOs.forEach(function(w){if(parseInt((w.scheduled_time||'99:00').split(':')[0])===hr)wo=w;});
        var townActive=isTown(dow,hr)&&!_townOv.includes(hr);
        var bg,bd,lbl,clk;
        if(wo){
          var cn=(cMap[wo.customer_id]||{}).name||'WO';
          bg='rgba(64,136,204,.18)';bd='var(--blu)';
          lbl='<div style="font-size:10px;font-weight:700;color:var(--blu);font-family:var(--mo)">'+fmtH(hr)+'</div><div style="font-size:9px;color:#93c5fd;margin-top:2px;white-space:nowrap;overflow:hidden;max-width:46px;text-overflow:ellipsis">'+cn.split(' ')[0]+'</div>';
          clk='openSchedEvDetail(\''+wo.id+'\')';
        } else if(isAvail(dow,hr)){
          bg='rgba(63,168,110,.14)';bd='var(--grn)';
          lbl='<div style="font-size:10px;font-weight:700;color:var(--grn);font-family:var(--mo)">'+fmtH(hr)+'</div><div style="font-size:8px;color:var(--grn);opacity:.8;margin-top:2px">free</div>';
          clk='openAddSchedBlock(\''+dayStr+'\','+hr+')';
        } else if(townActive){
          bg='rgba(201,149,42,.15)';bd='var(--amb)';
          lbl='<div style="font-size:11px;font-weight:700;color:var(--amb);font-family:var(--mo)">'+fmtH(hr)+'</div><div style="font-size:8px;color:var(--amb);margin-top:2px;font-weight:600">TOH</div>';
          clk='removeTownSlot(\''+dayStr+'\','+hr+')';
        } else {
          bg='var(--sf)';bd='var(--bd)';
          lbl='<div style="font-size:10px;color:var(--tx3);font-family:var(--mo)">'+fmtH(hr)+'</div>';
          clk='openAddSchedBlock(\''+dayStr+'\','+hr+')';
        }
        var isTownSlot=townActive&&!wo;
        var slotW=isTownSlot?'56px':'50px';
        var slotH=isTownSlot?'54px':'46px';
        h+='<div onclick="'+clk+'" style="flex-shrink:0;width:'+slotW+';min-height:'+slotH+';border-radius:8px;padding:6px 3px;text-align:center;cursor:pointer;background:'+bg+';border:1.5px solid '+bd+'">'+lbl+'</div>';
      });
      h+='</div>';
      dayWOs.forEach(function(w){
        var c=cMap[w.customer_id]||{};var eq=eMap[w.equipment_id]||{};
        var sc_={New:'var(--bd2)','Looked At':'var(--blu)','Parts Ordered':'var(--amb)','In Progress':'var(--grn)',Done:'var(--tx3)',Invoiced:'var(--blu)',Backlog:'var(--tx3)'}[w.status]||'var(--bd2)';
        var wh=w.scheduled_time?parseInt(w.scheduled_time.split(':')[0]):null;
        var wm=w.scheduled_time?w.scheduled_time.split(':')[1]:'00';
        var tl=wh!==null?(wh>12?wh-12:wh===0?12:wh)+':'+wm+(wh>=12?'pm':'am'):'';
        h+='<div onclick="openSchedEvDetail(\''+w.id+'\')" style="margin:0 14px 6px;background:var(--sf);border:1.5px solid var(--bd2);border-left:4px solid var(--blu);border-radius:var(--r);padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:10px">';
        h+='<div style="font-size:12px;font-weight:700;color:var(--blu);font-family:var(--mo);flex-shrink:0;min-width:32px">'+tl+'</div>';
        h+='<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(c.name||'Walk-in')+'</div>';
        if(eq.make)h+='<div style="font-size:11px;color:var(--tx3)">'+esc(eq.make+' '+(eq.model||''))+'</div>';
        if(w.problem)h+='<div style="font-size:11px;color:var(--tx2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(w.problem)+'</div>';
        h+='</div><span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;border:1.5px solid '+sc_+';color:'+sc_+';flex-shrink:0">'+(w.status||'New')+'</span></div>';
      });
    });
    var unsched=(wos||[]).filter(function(w){return !w.scheduled_date&&w.status!=='Closed'&&w.status!=='Cancelled'&&!isPaidOff(w);});
    if(unsched.length){
      h+='<div style="padding:12px 14px 6px;border-top:1px solid var(--bd)"><span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--tx3)">Unscheduled ('+unsched.length+')</span></div>';
      unsched.forEach(function(w){
        var c=cMap[w.customer_id]||{};var eq=eMap[w.equipment_id]||{};
        var sc_={New:'var(--bd2)','Looked At':'var(--blu)','Parts Ordered':'var(--amb)','In Progress':'var(--grn)',Done:'var(--tx3)',Invoiced:'var(--blu)',Backlog:'var(--tx3)'}[w.status]||'var(--bd2)';
        h+='<div style="margin:0 14px 6px;background:var(--sf);border:1.5px solid var(--bd2);border-left:4px solid '+sc_+';border-radius:var(--r);padding:9px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">';
        h+='<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(c.name||'Walk-in')+'</div>';
        if(eq.make)h+='<div style="font-size:11px;color:var(--tx3)">'+esc(eq.make+' '+(eq.model||''))+'</div>';
        if(w.problem)h+='<div style="font-size:11px;color:var(--tx2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(w.problem)+'</div>';
        h+='</div><button onclick="openSchedEvDetail(\''+w.id+'\')" style="background:none;border:1px solid var(--bd2);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--tx2);cursor:pointer;font-family:var(--fn);flex-shrink:0">Schedule</button></div>';
      });
    }
    h+='<div style="height:40px"></div>';
    el.innerHTML=h;
  }catch(e){el.innerHTML='<div style="padding:20px;color:var(--red);font-size:13px">Error: '+e.message+'</div>';console.error(e);}
}

function getTownOverrides(){try{return JSON.parse(localStorage.getItem('_townOv')||'{}');}catch(e){return {};}}

function saveTownOverrides(obj){try{localStorage.setItem('_townOv',JSON.stringify(obj));}catch(e){}}

function toggleTownSlot(dayStr,hr){
  var ov=getTownOverrides();
  var key=dayStr;
  if(!ov[key])ov[key]=[];
  var idx=ov[key].indexOf(hr);
  if(idx>=0){
    // Restore — remove from overrides
    ov[key].splice(idx,1);
    if(!ov[key].length)delete ov[key];
    saveTownOverrides(ov);
    toast('Town hour restored','ok');
  } else {
    // Remove this town slot
    openM('<div class="mt">Remove Town Slot?</div>'+
      '<div class="ms">Remove '+fmtHGlobal(hr)+' on '+dayStr+' from your Town schedule? Tap again to restore.</div>'+
      '<div class="mb">'+
        '<button class="mc-btn" onclick="closeM()">Cancel</button>'+
        '<button class="mo-btn" style="background:var(--red);border-color:var(--red)" onclick="closeM();removeTownSlot(\''+dayStr+'\','+hr+')">Remove</button>'+
      '</div>');
  }
}

function removeTownSlot(dayStr,hr){
  var ov=getTownOverrides();
  if(!ov[dayStr])ov[dayStr]=[];
  if(!ov[dayStr].includes(hr))ov[dayStr].push(hr);
  saveTownOverrides(ov);
  toast('Town slot removed','ok');
  renderSchedList();
}

function fmtHGlobal(h){return(h>12?h-12:h===0?12:h)+(h>=12?'pm':'am');}

function schedBack(){_schedOffset-=7;renderSchedList();}

function schedFwd(){_schedOffset+=7;renderSchedList();}

function openSchedEvDetail(woId){
  var w=(wos||[]).find(function(x){return x.id===woId;});if(!w)return;
  var c=cMap[w.customer_id]||{};var eq=eMap[w.equipment_id]||{};
  openM('<div class="mt">'+esc(c.name||'Walk-in')+'</div>'+
    '<div class="mf">'+
    (eq.make?'<div style="font-size:13px;color:var(--tx2);margin-bottom:8px">'+esc(eq.make+' '+(eq.model||''))+'</div>':'')+
    '<div><div class="mlbl">Description</div><input class="mi" id="sced_prob" value="'+(w.problem||'').replace(/"/g,'&quot;')+'"></div>'+
    '<div class="mr"><div style="flex:1"><div class="mlbl">Date</div><input class="mi" type="date" id="sced_date" value="'+(w.scheduled_date||'')+'"></div>'+
    '<div style="flex:1"><div class="mlbl">Time</div><input class="mi" type="time" id="sced_time" value="'+(w.scheduled_time?w.scheduled_time.slice(0,5):'')+'"></div></div>'+
    '</div>'+
    '<div class="mb" style="flex-wrap:wrap;gap:6px">'+
    '<button class="mc-btn" onclick="closeM()">Cancel</button>'+
    '<button class="mo-btn" style="background:none;border:1.5px solid var(--red);color:var(--red)" onclick="closeM();schedClearDate(\''+woId+'\')">Clear</button>'+
    '<button class="mo-btn" data-wid="'+woId+'" onclick="saveSchedDetail(this.dataset.wid)">Save &#10003;</button>'+
    '<button class="mo-btn" style="background:var(--sf2);border:1.5px solid var(--bd2);color:var(--tx2)" onclick="closeM();openWO(\''+woId+'\')">Open WO &#8594;</button>'+
    '</div>');
}

async function saveSchedDetail(woId){
  var date=document.getElementById('sced_date').value||null;
  var time=document.getElementById('sced_time').value||null;
  var prob=(document.getElementById('sced_prob').value||'').trim()||null;
  try{
    await patch('work_orders',{scheduled_date:date,scheduled_time:time,problem:prob},'?id=eq.'+woId);
    var w=(wos||[]).find(function(x){return x.id===woId;});
    if(w){w.scheduled_date=date;w.scheduled_time=time;w.problem=prob;}
    closeM();toast('Saved','ok');renderSchedList();
  }catch(e){toast('Failed: '+e.message,'er');}
}

async function schedClearDate(woId){
  try{
    await patch('work_orders',{scheduled_date:null,scheduled_time:null},'?id=eq.'+woId);
    var w=(wos||[]).find(function(x){return x.id===woId;});
    if(w){w.scheduled_date=null;w.scheduled_time=null;}
    toast('Cleared','ok');renderSchedList();
  }catch(e){toast('Failed','er');}
}

function openAddSchedBlock(dayStr,hr){
  var woOpts='<option value="">-- Free label only --</option>';
  (wos||[]).filter(function(w){return w.status!=='Closed'&&w.status!=='Cancelled'&&!isPaidOff(w);})
    .sort(function(a,b){return((cMap[a.customer_id]||{}).name||'').localeCompare((cMap[b.customer_id]||{}).name||'');})
    .forEach(function(w){
      var c=(cMap[w.customer_id]||{}).name||'Unknown';
      var eq=eMap[w.equipment_id];var m=eq?(eq.make+' '+(eq.model||'')).trim():'';
      woOpts+='<option value="'+w.id+'">'+esc(c)+(m?' - '+m:'')+(w.scheduled_date?' ('+w.scheduled_date+')':'')+'</option>';
    });
  var hStr=String(hr).padStart(2,'0')+':00';
  openM('<div class="mt">Schedule Slot</div><div class="mf">'+
    '<div><div class="mlbl">Work Order</div><select class="mi" id="asb_wo">'+woOpts+'</select></div>'+
    '<div><div class="mlbl">Or free label</div><input class="mi" id="asb_label" placeholder="Estimate, errand..."></div>'+
    '<div class="mr"><div style="flex:1"><div class="mlbl">Date</div><input class="mi" type="date" id="asb_date" value="'+dayStr+'"></div>'+
    '<div style="flex:1"><div class="mlbl">Time</div><input class="mi" type="time" id="asb_time" value="'+hStr+'"></div></div>'+
    '</div><div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button>'+
    '<button class="mo-btn" id="asbOk" onclick="saveSchedBlock()">Save</button></div>');
}

async function saveSchedBlock(){
  var btn=document.getElementById('asbOk');btn.disabled=true;btn.textContent='Saving...';
  var woId=(document.getElementById('asb_wo')||{}).value||null;
  var label=((document.getElementById('asb_label')||{}).value||'').trim();
  var date=(document.getElementById('asb_date')||{}).value||null;
  var time=(document.getElementById('asb_time')||{}).value||null;
  if(!date){toast('Date required','er');btn.disabled=false;btn.textContent='Save';return;}
  try{
    if(woId){
      await patch('work_orders',{scheduled_date:date,scheduled_time:time||null},'?id=eq.'+woId);
      var w=(wos||[]).find(function(x){return x.id===woId;});
      if(w){w.scheduled_date=date;w.scheduled_time=time||null;}
    } else {
      if(!label){toast('Enter a label','er');btn.disabled=false;btn.textContent='Save';return;}
      var newWO=await post('work_orders',{problem:label,status:'New',scheduled_date:date,scheduled_time:time||null});
      if(newWO&&newWO[0])wos.unshift(newWO[0]);
    }
    closeM();toast('Scheduled','ok');renderSchedList();
  }catch(e){toast('Failed: '+e.message,'er');btn.disabled=false;btn.textContent='Save';}
}
