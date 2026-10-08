// Removed from index.html in v27.80 (job-templates). Kept so it can be revisited.
// Full working app as it was: GitHub branch archive/v27.70-before-revamp.

async function loadTemplates(){
  var el=document.getElementById('tmplBody');
  if(!el)return;
  try{
    _templates=await get('job_templates','?active=eq.true&order=sort_order,name');
    renderTemplates();
  }catch(e){el.innerHTML='<div class="empty"><div class="et">Could not load templates</div></div>';}
}

function renderTemplates(){
  var el=document.getElementById('tmplBody');
  var catRow=document.getElementById('tmplCatRow');
  if(!el)return;

  // Build category tabs
  var cats=['All',...new Set((_templates||[]).map(function(t){return t.category||'General';}))];
  if(catRow){
    catRow.innerHTML=cats.map(function(c){
      return '<button class="cnt-cat-btn'+(c===_tmplCat?' active':'')+'" onclick="_setTmplCat(\''+c+'\')">'+esc(c)+'</button>';
    }).join('');
  }

  var list=_tmplCat==='All'?_templates:_templates.filter(function(t){return (t.category||'General')===_tmplCat;});
  var sub=document.getElementById('tmplSub');
  if(sub)sub.textContent=list.length+' template'+(list.length!==1?'s':'');

  if(!list.length){el.innerHTML='<div class="empty"><div class="ei">&#128221;</div><div class="et">No templates</div><div class="es">Tap + New to create one</div></div>';return;}

  // Group by category if showing all
  var html='';
  if(_tmplCat==='All'){
    var byCat={};
    list.forEach(function(t){var c=t.category||'General';if(!byCat[c])byCat[c]=[];byCat[c].push(t);});
    Object.keys(byCat).forEach(function(cat){
      html+='<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--tx3);padding:12px 0 6px">'+esc(cat)+'</div>';
      byCat[cat].forEach(function(t){html+=_tmplCard(t);});
    });
  } else {
    list.forEach(function(t){html+=_tmplCard(t);});
  }
  el.innerHTML=html;
}

function _tmplCard(t){
  var labor=t.labor||[];var parts=t.parts||[];
  var lTotal=labor.reduce(function(s,l){return s+laborAmt(l,DEFAULT_RATE);},0);
  var pTotal=parts.reduce(function(s,p){return s+(p.qty||1)*(p.price||0);},0);
  var est=(lTotal+pTotal)*1.08625;
  return '<div style="background:var(--sf);border:1.5px solid var(--bd2);border-radius:var(--r);padding:12px 14px;margin-bottom:8px">'
    +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px">'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:14px;font-weight:700">'+esc(t.name)+'</div>'
    +(t.default_problem?'<div style="font-size:12px;color:var(--tx3);margin-top:2px">'+esc(t.default_problem)+'</div>':'')
    +'</div>'
    +(est>0?'<div style="text-align:right;flex-shrink:0"><div style="font-size:15px;font-weight:800;font-family:var(--mo);color:var(--grn)">~$'+Math.round(est)+'</div><div style="font-size:10px;color:var(--tx3)">est. w/tax</div></div>':'')
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'
    +(t.equipment_type?'<span style="background:var(--sf2);border:1px solid var(--bd2);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--tx3)">'+esc(t.equipment_type)+'</span>':'')
    +(labor.length?'<span style="background:rgba(58,143,232,.08);border:1px solid var(--blu);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--blu)">'+labor.length+' labor item'+(labor.length!==1?'s':'')+'</span>':'')
    +(parts.length?'<span style="background:rgba(232,168,58,.08);border:1px solid var(--amb);border-radius:12px;padding:2px 8px;font-size:11px;color:var(--amb)">'+parts.length+' part'+(parts.length!==1?'s':'')+'</span>':'')
    +'</div>'
    +'<div style="display:flex;gap:6px">'
    +'<button data-tid="'+t.id+'" onclick="useTemplate(this.dataset.tid)" style="flex:2;background:var(--red);color:#fff;border:none;border-radius:var(--rs);padding:9px;font-size:13px;font-weight:700;font-family:var(--fn);cursor:pointer">&#9889; Use Template</button>'
    +'<button data-tid="'+t.id+'" onclick="editTemplate(this.dataset.tid)" style="flex:1;background:var(--sf2);border:1.5px solid var(--bd2);border-radius:var(--rs);padding:9px;font-size:12px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--tx2)">Edit</button>'
    +'</div>'
    +'</div>';
}

function _setTmplCat(cat){_tmplCat=cat;renderTemplates();}

function useTemplate(tid){
  var t=_templates.find(function(x){return x.id===tid;});
  if(!t)return;
  // Navigate to new WO and apply template after a brief delay for WO screen to render
  openWO(null);
  setTimeout(function(){_applyTemplate(t);},200);
}

function openTemplatePicker(){
  // Quick picker modal from within a new WO
  if(!_templates.length){
    toast('Loading templates…','');
    loadTemplates().then(function(){_showTemplatePicker();});
    return;
  }
  _showTemplatePicker();
}

function _showTemplatePicker(){
  var cats=['All',...new Set(_templates.map(function(t){return t.category||'General';}))];
  var rows=_templates.map(function(t){
    var labor=t.labor||[];var parts=t.parts||[];
    var lTotal=labor.reduce(function(s,l){return s+laborAmt(l,DEFAULT_RATE);},0);
    var pTotal=parts.reduce(function(s,p){return s+(p.qty||1)*(p.price||0);},0);
    var est=(lTotal+pTotal)*1.08625;
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd);cursor:pointer" data-tid="'+t.id+'" onclick="_pickTemplate(this.dataset.tid)">'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700">'+esc(t.name)+'</div>'
      +(t.equipment_type?'<div style="font-size:11px;color:var(--tx3)">'+esc(t.equipment_type)+'</div>':'')
      +'</div>'
      +(est>0?'<div style="font-size:13px;font-weight:700;font-family:var(--mo);color:var(--grn);white-space:nowrap">~$'+Math.round(est)+'</div>':'')
      +'</div>';
  }).join('');
  openM('<div class="mt">Use Template</div>'
    +'<div style="max-height:60vh;overflow-y:auto;padding:0 2px">'+rows+'</div>'
    +'<div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button></div>');
}

function _pickTemplate(tid){
  var t=_templates.find(function(x){return x.id===tid;});
  if(!t)return;
  closeM();
  // If template has a checklist, show it first
  if(t.checklist_items&&t.checklist_items.length){
    _showChecklist(t);
  } else {
    _applyTemplate(t,null);
  }
}

function _checklistSelectAll(){
  document.querySelectorAll('#checklistForm input[type=checkbox]').forEach(function(cb){cb.checked=true;});
}

function _checklistClearAll(){
  document.querySelectorAll('#checklistForm input[type=checkbox]').forEach(function(cb){cb.checked=false;});
}

function _showChecklist(t){
  window._checklistTemplate=t;
  var items=t.checklist_items||[];
  if(typeof items==='string'){try{items=JSON.parse(items);}catch(e){items=[];}}
  if(!Array.isArray(items))items=[];
  var laborHrs=(t.labor&&t.labor[0])?t.labor[0].hours:0;
  var laborAmt=laborHrs*DEFAULT_RATE;
  var subtitle=laborHrs+'h · $'+Math.round(laborAmt)+' labor — uncheck anything not done';
  var rows=items.map(function(item){
    return '<label style="display:flex;align-items:center;gap:12px;padding:11px 4px;border-bottom:1px solid var(--bd);cursor:pointer;-webkit-tap-highlight-color:transparent">'
      +'<input type="checkbox" data-cid="'+esc(item.id)+'" checked style="width:22px;height:22px;accent-color:var(--red);flex-shrink:0;cursor:pointer">'
      +'<span style="font-size:14px;font-weight:500;color:var(--tx1);line-height:1.4">'+esc(item.label)+'</span>'
      +'</label>';
  }).join('');

  openM('<div class="mt" style="font-size:15px">'+esc(t.name)+'</div>'
    +'<div style="font-size:12px;color:var(--tx3);margin:-4px 0 10px">'+subtitle+'</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:8px">'
    +'<button onclick="_checklistSelectAll()" style="flex:1;background:var(--sf2);border:1.5px solid var(--bd2);border-radius:var(--rs);padding:10px;font-size:13px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--tx1)">✓ All</button>'
    +'<button onclick="_checklistClearAll()" style="flex:1;background:var(--sf2);border:1.5px solid var(--bd2);border-radius:var(--rs);padding:10px;font-size:13px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--tx3)">Clear</button>'
    +'</div>'
    +'<div id="checklistForm" style="overflow-y:auto;padding:0 4px;margin:0 -4px;max-height:44vh">'+rows+'</div>'
    +'<button onclick="_applyChecklist()" style="width:100%;margin-top:12px;background:var(--red);color:#fff;border:none;border-radius:var(--rs);padding:14px;font-size:15px;font-weight:700;font-family:var(--fn);cursor:pointer">Add to WO</button>'
    +'<button onclick="closeM()" style="width:100%;margin-top:8px;background:var(--sf2);border:1.5px solid var(--bd2);color:var(--tx2);border-radius:var(--rs);padding:11px;font-size:14px;font-weight:600;font-family:var(--fn);cursor:pointer">Cancel</button>');
}

function _applyChecklist(){
  var t=window._checklistTemplate;
  if(!t)return;
  // Collect checked items
  var checked=[];
  var allItems=t.checklist_items||[];
  if(typeof allItems==='string'){try{allItems=JSON.parse(allItems);}catch(e){allItems=[];}}
  document.querySelectorAll('#checklistForm input[type=checkbox]:checked').forEach(function(cb){
    var item=allItems.find(function(x){return x.id===cb.dataset.cid;});
    if(item)checked.push(item.label);
  });
  closeM();
  _applyTemplate(t, checked.length ? checked : null);
}

function _applyTemplate(t, checkedItems){
  // Set problem description
  if(t.default_problem){
    var probEl=document.getElementById('probDesc');
    if(probEl&&!probEl.value)probEl.value=t.default_problem;
  }
  // Set notes
  if(t.default_notes){
    var notesEl=document.getElementById('woNotes');
    if(notesEl&&!notesEl.value)notesEl.value=t.default_notes;
  }

  // Build labor — if checkedItems provided, build description from the checklist
  var laborToAdd=[];
  if(t.labor&&t.labor.length){
    t.labor.forEach(function(l){
      var desc=l.desc||'Labor';
      // If we have specific checked items, build a clean description from them
      if(checkedItems&&checkedItems.length){
        desc=checkedItems.join('\n');
      }
      laborToAdd.push({desc:desc,hours:parseFloat(l.hours)||1,rate:parseFloat(l.rate)||DEFAULT_RATE});
    });
  }

  if(mcs.length>0){
    var m=mcs[0];
    laborToAdd.forEach(function(l){m.labor.push(l);});
    (t.parts||[]).forEach(function(p){
      m.parts.push({name:p.name||'Part',partNum:p.partNum||'',qty:parseFloat(p.qty)||1,price:parseFloat(p.price)||0,inv_id:null});
    });
    m.open=true;
    renderMcs();recalc();
    toast('Template applied ✓','ok');
  } else {
    window._pendingTemplate={t:t,checkedItems:checkedItems};
    toast('Template ready — add a machine to apply','ok');
  }
}

function _checkPendingTemplate(){
  if(!window._pendingTemplate)return;
  var pending=window._pendingTemplate;
  window._pendingTemplate=null;
  var t=pending.t||pending; // handle both old and new format
  var checkedItems=pending.checkedItems||null;
  if(mcs.length>0){
    var m=mcs[mcs.length-1];
    var laborToAdd=[];
    if(t.labor&&t.labor.length){
      t.labor.forEach(function(l){
        var desc=l.desc||'Labor';
        if(checkedItems&&checkedItems.length)desc=checkedItems.join('\n');
        laborToAdd.push({desc:desc,hours:parseFloat(l.hours)||1,rate:parseFloat(l.rate)||DEFAULT_RATE});
      });
    }
    laborToAdd.forEach(function(l){m.labor.push(l);});
    (t.parts||[]).forEach(function(p){m.parts.push({name:p.name||'Part',partNum:p.partNum||'',qty:parseFloat(p.qty)||1,price:parseFloat(p.price)||0,inv_id:null});});
    m.open=true;
    renderMcs();recalc();
    toast('Template applied ✓','ok');
  }
}

function openAddTemplate(){
  _openTemplateForm(null);
}

function editTemplate(tid){
  var t=_templates.find(function(x){return x.id===tid;});
  if(t)_openTemplateForm(t);
}

function _openTemplateForm(t){
  var isNew=!t;
  var cats=['Seasonal Service','Maintenance','Repair','Diagnostic','General'];
  var eqTypes=['Walk-behind Mower','Riding Mower','Zero Turn Mower','Snow Blower','Chainsaw','Blower','Trimmer','Generator','Pressure Washer','Other'];
  openM('<div class="mt">'+(isNew?'New Template':'Edit Template')+'</div>'
    +'<div class="mf" style="max-height:60vh;overflow-y:auto">'
    +'<div><div class="mlbl">Template Name *</div><input class="mi" id="tName" value="'+esc(t?t.name:'')+'"></div>'
    +'<div style="display:flex;gap:8px">'
    +'<div style="flex:1"><div class="mlbl">Category</div><select class="mi" id="tCat">'+cats.map(function(c){return'<option'+(t&&t.category===c?' selected':(!t&&c==='General'?' selected':''))+'>'+c+'</option>';}).join('')+'</select></div>'
    +'<div style="flex:1"><div class="mlbl">Equipment Type</div><select class="mi" id="tEqType"><option value="">Any</option>'+eqTypes.map(function(e){return'<option'+(t&&t.equipment_type===e?' selected':'')+'>'+e+'</option>';}).join('')+'</select></div>'
    +'</div>'
    +'<div><div class="mlbl">Default Problem Description</div><input class="mi" id="tProblem" value="'+esc(t?t.default_problem||'':'')+'"></div>'
    +'<div><div class="mlbl">Labor (one line per item: desc | hours | rate)</div>'
    +'<textarea class="mi" id="tLabor" rows="3" style="font-size:12px;font-family:var(--mo);resize:none">'+((t&&t.labor)?t.labor.map(function(l){return l.desc+'|'+l.hours+'|'+l.rate;}).join('\n'):'')+'</textarea>'
    +'<div style="font-size:10px;color:var(--tx3);margin-top:2px">Example: Tune-up and oil change|1.5|135 (use your current rate)</div></div>'
    +'<div><div class="mlbl">Parts (one line per item: name | qty | price)</div>'
    +'<textarea class="mi" id="tParts" rows="3" style="font-size:12px;font-family:var(--mo);resize:none">'+((t&&t.parts)?t.parts.map(function(p){return p.name+'|'+p.qty+'|'+p.price;}).join('\n'):'')+'</textarea>'
    +'<div style="font-size:10px;color:var(--tx3);margin-top:2px">Example: Spark Plug|1|8.00</div></div>'
    +'</div>'
    +'<div class="mb">'
    +(t?'<button style="background:var(--red);color:#fff;border:none;border-radius:var(--rs);padding:10px 16px;font-size:13px;font-weight:700;font-family:var(--fn);cursor:pointer" data-tid="'+t.id+'" onclick="deleteTemplate(this.dataset.tid)">Delete</button>':'')
    +'<button class="mc-btn" onclick="closeM()">Cancel</button>'
    +'<button class="mo-btn" data-tid="'+(t?t.id:'')+'" onclick="saveTemplate(this.dataset.tid)">Save</button>'
    +'</div>');
}

async function saveTemplate(tid){
  if(!_lock('saveTemplate'))return;
  var name=(document.getElementById('tName').value||'').trim();
  if(!name){_unlock('saveTemplate');toast('Name required','er');return;}
  var laborRaw=(document.getElementById('tLabor').value||'').trim();
  var partsRaw=(document.getElementById('tParts').value||'').trim();
  var labor=laborRaw?laborRaw.split('\n').filter(Boolean).map(function(line){
    var p=line.split('|');return{desc:(p[0]||'').trim(),hours:parseFloat(p[1])||1,rate:parseFloat(p[2])||DEFAULT_RATE};
  }):[];
  var parts=partsRaw?partsRaw.split('\n').filter(Boolean).map(function(line){
    var p=line.split('|');return{name:(p[0]||'').trim(),qty:parseFloat(p[1])||1,price:parseFloat(p[2])||0};
  }):[];
  var payload={
    name:name,
    category:document.getElementById('tCat').value||'General',
    equipment_type:document.getElementById('tEqType').value||null,
    default_problem:document.getElementById('tProblem').value||null,
    labor:labor,parts:parts,active:true,updated_at:new Date().toISOString()
  };
  try{
    if(tid){
      await patch('job_templates',payload,'?id=eq.'+tid);
      var idx=_templates.findIndex(function(x){return x.id===tid;});
      if(idx>=0)Object.assign(_templates[idx],payload);
    } else {
      var res=await post('job_templates',payload);
      if(res&&res[0])_templates.push(res[0]);
    }
    closeM();renderTemplates();toast('Saved ✓','ok');
  }catch(e){toast('Save failed: '+e.message,'er');}
}

async function deleteTemplate(tid){
  if(!confirm('Delete this template?'))return;
  try{
    await del('job_templates','?id=eq.'+tid);
    _templates=_templates.filter(function(x){return x.id!==tid;});
    closeM();renderTemplates();toast('Deleted','ok');
  }catch(e){toast('Delete failed','er');}
}
