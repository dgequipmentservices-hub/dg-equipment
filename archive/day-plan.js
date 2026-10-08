// Removed from index.html in v27.80 (day-plan). Kept so it can be revisited.
// Full working app as it was: GitHub branch archive/v27.70-before-revamp.

function openDayPlan(){
  S('S_dayplan');
  _dpDate = _dpDate || new Date().toISOString().split('T')[0];
  dpRenderDate();
  dpLoad();
}

function dpPickDate(){
  var inp = document.getElementById('dpDateInput');
  if(inp){ inp.value = _dpDate; inp.click(); }
}

function dpDateChanged(val){
  if(!val) return;
  _dpDate = val;
  dpRenderDate();
  dpLoad();
}

function dpRenderDate(){
  var d = new Date(_dpDate + 'T12:00:00');
  var today = new Date().toISOString().split('T')[0];
  var label = _dpDate === today ? 'Today — ' : '';
  label += d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  document.getElementById('dpDateLabel').textContent = label;
}

async function dpLoad(){
  var el = document.getElementById('dpBody');
  el.innerHTML = '<div class="loading"><div class="spin"></div><br>Loading…</div>';
  try{
    _dpStops = await get('day_plans','?plan_date=eq.'+_dpDate+'&order=sort_order');
    dpRender();
  }catch(e){ el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tx3)">Failed to load</div>'; }
}

function dpRender(){
  var el = document.getElementById('dpBody');
  if(!_dpStops.length){
    el.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--tx3)">'
      +'<div style="font-size:32px;margin-bottom:10px">📋</div>'
      +'<div style="font-weight:700;margin-bottom:6px">No stops planned</div>'
      +'<div style="font-size:13px">Tap + Stop to add your first job site</div>'
      +'</div>';
    return;
  }
  var total = 0, done = 0;
  _dpStops.forEach(function(s){ var jobs=s.jobs||[]; total+=jobs.length; done+=jobs.filter(function(j){return j.done;}).length; });
  var pct = total ? Math.round(done/total*100) : 0;

  var h = '';
  // Progress bar
  if(total > 0){
    h += '<div style="background:var(--sf2);border-radius:var(--r);padding:12px 14px;margin-bottom:14px">'
      +'<div style="display:flex;justify-content:space-between;margin-bottom:6px">'
      +'<span style="font-size:12px;font-weight:700;color:var(--tx2)">Day Progress</span>'
      +'<span style="font-size:12px;font-weight:700;color:'+(pct===100?'var(--grn)':'var(--tx2)')+'">'+done+'/'+total+' jobs</span>'
      +'</div>'
      +'<div style="background:var(--bd);border-radius:4px;height:6px">'
      +'<div style="background:'+(pct===100?'var(--grn)':'var(--red)')+';width:'+pct+'%;height:6px;border-radius:4px;transition:width .3s"></div>'
      +'</div></div>';
  }

  _dpStops.forEach(function(stop, si){
    var jobs = stop.jobs || [];
    var stopDone = jobs.filter(function(j){return j.done;}).length;
    var allDone = jobs.length > 0 && stopDone === jobs.length;
    h += '<div style="background:var(--sf);border:1.5px solid '+(allDone?'var(--grn)':'var(--bd2)')+';border-radius:var(--r);margin-bottom:12px;overflow:hidden">';
    // Stop header
    h += '<div style="padding:12px 14px;display:flex;align-items:center;gap:10px">'
      +'<div style="width:28px;height:28px;background:var(--red);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">'+(si+1)+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:15px;font-weight:700">'+esc(stop.customer_name||'No customer')+'</div>'
      +(stop.notes?'<div style="font-size:12px;color:var(--tx3);margin-top:1px">'+esc(stop.notes)+'</div>':'')
      +'</div>'
      +'<div style="display:flex;gap:6px">'
      +'<button data-sid="'+stop.id+'" data-si="'+si+'" onclick="dpAddJob(this.dataset.sid)" style="background:var(--sf3);border:1px solid var(--bd2);border-radius:6px;padding:5px 9px;font-size:12px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--tx2)">+ Job</button>'
      +'<button data-sid="'+stop.id+'" onclick="dpDeleteStop(this.dataset.sid)" style="background:none;border:1px solid var(--bd);border-radius:6px;padding:5px 8px;font-size:12px;cursor:pointer;color:var(--tx3)">✕</button>'
      +'</div>'
      +'</div>';
    // Jobs list
    if(jobs.length){
      h += '<div style="border-top:1px solid var(--bd)">';
      jobs.forEach(function(job, ji){
        var linked = job.wo_id ? wos.find(function(w){return w.id===job.wo_id;}) : null;
        h += '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bd);'+(job.done?'opacity:.5':'') +'">'
          +'<button data-sid="'+stop.id+'" data-ji="'+ji+'" onclick="dpToggleJob(this.dataset.sid,parseInt(this.dataset.ji))" style="width:24px;height:24px;border-radius:6px;border:2px solid '+(job.done?'var(--grn)':'var(--bd2)')+';background:'+(job.done?'var(--grn)':'transparent')+';cursor:pointer;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px">'+(job.done?'✓':'')+'</button>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:14px;font-weight:600;'+(job.done?'text-decoration:line-through':'')+'">'+esc(job.desc)+'</div>'
          +(linked?'<div style="font-size:11px;color:var(--blu);margin-top:2px">WO #'+linked.invoice_number+'→ '+linked.status+'</div>':'')
          +'</div>'
          +'<div style="display:flex;gap:5px;flex-shrink:0">'
          +(job.wo_id
            ?'<button data-wid="'+job.wo_id+'" onclick="openWO(this.dataset.wid)" style="background:var(--sf3);border:1px solid var(--bd2);border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--blu)">Open WO</button>'
            :'<button data-sid="'+stop.id+'" data-ji="'+ji+'" data-cid="'+esc(stop.customer_id||'')+'" onclick="dpLinkJob(this.dataset.sid,parseInt(this.dataset.ji),this.dataset.cid)" style="background:var(--sf3);border:1px solid var(--bd2);border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;font-family:var(--fn);cursor:pointer;color:var(--tx3)">→ WO</button>'
          )
          +'<button data-sid="'+stop.id+'" data-ji="'+ji+'" onclick="dpDeleteJob(this.dataset.sid,parseInt(this.dataset.ji))" style="background:none;border:none;padding:4px 6px;cursor:pointer;color:var(--tx3);font-size:13px">✕</button>'
          +'</div>'
          +'</div>';
      });
      h += '</div>';
    } else {
      h += '<div style="padding:12px 14px;font-size:13px;color:var(--tx3);border-top:1px solid var(--bd)">No jobs yet — tap + Job</div>';
    }
    h += '</div>';
  });
  el.innerHTML = h;
}

function dpAddStop(){
  // Customer picker
  var opts = custs.map(function(c){
    return '<div style="padding:10px 4px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:14px;font-weight:500" data-cid="'+c.id+'" data-cname="'+esc(c.name)+'" onclick="dpCreateStop(this.dataset.cid,this.dataset.cname)">'+esc(c.name)+'<span style="font-size:11px;color:var(--tx3);margin-left:6px">'+( c.customer_type||'')+'</span></div>';
  }).join('');
  openM('<div class="mt">Add Stop</div>'
    +'<div class="mlbl" style="margin-bottom:6px">Search customer</div>'
    +'<input class="mi" id="dpCustQ" placeholder="Name..." oninput="dpFilterCusts(this.value)" autocomplete="off">'
    +'<div id="dpCustList" style="max-height:50vh;overflow-y:auto;margin-top:4px">'+opts+'</div>'
    +'<div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button></div>');
}

function dpFilterCusts(q){
  var lq = q.toLowerCase();
  var el = document.getElementById('dpCustList');
  if(!el) return;
  var filtered = q ? custs.filter(function(c){return c.name.toLowerCase().includes(lq);}) : custs;
  el.innerHTML = filtered.map(function(c){
    return '<div style="padding:10px 4px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:14px;font-weight:500" data-cid="'+c.id+'" data-cname="'+esc(c.name)+'" onclick="dpCreateStop(this.dataset.cid,this.dataset.cname)">'+esc(c.name)+'<span style="font-size:11px;color:var(--tx3);margin-left:6px">'+( c.customer_type||'')+'</span></div>';
  }).join('');
}

async function dpCreateStop(custId, custName){
  closeM();
  try{
    var newStop = await post('day_plans',{
      plan_date: _dpDate,
      customer_id: custId||null,
      customer_name: custName||'',
      sort_order: _dpStops.length,
      jobs: []
    });
    if(newStop&&newStop[0]) _dpStops.push(newStop[0]);
    dpRender();
  }catch(e){ toast('Failed: '+e.message,'er'); }
}

function dpAddJob(stopId){
  var stop = _dpStops.find(function(s){return s.id===stopId;});
  if(!stop) return;
  window._dpJobStop = stop;
  openM('<div class="mt">Add Job — '+esc(stop.customer_name)+'</div>'
    +'<div class="mf">'
    +'<div><div class="mlbl">Job description *</div><input class="mi" id="dpJobDesc" placeholder="e.g. Stander full service" autocomplete="off"></div>'
    +'</div>'
    +'<div class="mb">'
    +'<button class="mc-btn" onclick="closeM()">Cancel</button>'
    +'<button class="mo-btn" onclick="dpSaveJob()">Add Job</button>'
    +'</div>');
  setTimeout(function(){var el=document.getElementById('dpJobDesc');if(el)el.focus();},150);
}

async function dpSaveJob(){
  var stop = window._dpJobStop;
  if(!stop) return;
  var desc = (document.getElementById('dpJobDesc').value||'').trim();
  if(!desc){toast('Enter a description','er');return;}
  var jobs = stop.jobs ? stop.jobs.slice() : [];
  jobs.push({desc:desc, done:false, wo_id:null});
  try{
    await patch('day_plans',{jobs:jobs,updated_at:new Date().toISOString()},'?id=eq.'+stop.id);
    stop.jobs = jobs;
    closeM(); dpRender();
  }catch(e){toast('Failed: '+e.message,'er');}
}

async function dpToggleJob(stopId, ji){
  var stop = _dpStops.find(function(s){return s.id===stopId;});
  if(!stop||!stop.jobs[ji]) return;
  var jobs = stop.jobs.slice();
  jobs[ji] = Object.assign({},jobs[ji],{done:!jobs[ji].done});
  try{
    await patch('day_plans',{jobs:jobs,updated_at:new Date().toISOString()},'?id=eq.'+stop.id);
    stop.jobs = jobs; dpRender();
  }catch(e){toast('Failed','er');}
}

async function dpDeleteJob(stopId, ji){
  var stop = _dpStops.find(function(s){return s.id===stopId;});
  if(!stop) return;
  var jobs = stop.jobs.slice();
  jobs.splice(ji,1);
  try{
    await patch('day_plans',{jobs:jobs,updated_at:new Date().toISOString()},'?id=eq.'+stop.id);
    stop.jobs = jobs; dpRender();
  }catch(e){toast('Failed','er');}
}

async function dpDeleteStop(stopId){
  openM('<div class="mt" style="color:var(--red)">Remove this stop?</div>'
    +'<div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button>'
    +'<button class="mo-btn danger" data-sid="'+stopId+'" onclick="dpConfirmDeleteStop(this.dataset.sid)">Remove</button></div>');
}

async function dpConfirmDeleteStop(stopId){
  closeM();
  try{
    await del('day_plans','?id=eq.'+stopId);
    _dpStops = _dpStops.filter(function(s){return s.id!==stopId;});
    dpRender();
  }catch(e){toast('Failed','er');}
}

function dpLinkJob(stopId, ji, custId){
  var stop = _dpStops.find(function(s){return s.id===stopId;});
  if(!stop) return;
  var job = stop.jobs[ji];
  // Show options: link existing WO or create new
  var custWOs = wos.filter(function(w){return w.customer_id===custId && w.status!=='Invoiced';}).slice(0,20);
  var woRows = custWOs.map(function(w){
    var eq = eMap[w.equipment_id];
    var label = (w.invoice_number?'#'+w.invoice_number+' ':'')+(eq?eq.make+' '+(eq.model||''):'WO')+' — '+w.status;
    return '<div style="padding:10px 4px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:13px" data-wid="'+w.id+'" data-sid="'+stopId+'" data-ji="'+ji+'" onclick="dpAttachWO(this.dataset.sid,parseInt(this.dataset.ji),this.dataset.wid)">'+esc(label)+'</div>';
  }).join('');

  openM('<div class="mt">Link to Work Order</div>'
    +(woRows?'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--tx3);margin-bottom:6px">Existing open WOs</div><div style="max-height:35vh;overflow-y:auto">'+woRows+'</div>':'<div style="font-size:13px;color:var(--tx3);margin-bottom:12px">No open WOs for this customer</div>')
    +'<div class="mb">'
    +'<button class="mc-btn" onclick="closeM()">Cancel</button>'
    +'<button class="mo-btn" data-sid="'+stopId+'" data-ji="'+ji+'" data-cid="'+custId+'" onclick="dpCreateWOForJob(this.dataset.sid,parseInt(this.dataset.ji),this.dataset.cid)">+ Create New WO</button>'
    +'</div>');
}

async function dpAttachWO(stopId, ji, woId){
  closeM();
  var stop = _dpStops.find(function(s){return s.id===stopId;});
  if(!stop) return;
  var jobs = stop.jobs.slice();
  jobs[ji] = Object.assign({},jobs[ji],{wo_id:woId});
  try{
    await patch('day_plans',{jobs:jobs,updated_at:new Date().toISOString()},'?id=eq.'+stop.id);
    stop.jobs = jobs; dpRender(); toast('WO linked ✓','ok');
  }catch(e){toast('Failed','er');}
}

function dpCreateWOForJob(stopId, ji, custId){
  closeM();
  // Open a new WO pre-filled with this customer
  var cust = custs.find(function(c){return c.id===custId;});
  openWO(null, custId);
  // After WO is opened, store context so we can link it back when saved
  window._dpPendingLink = {stopId:stopId, ji:ji};
  toast('Save the WO — it will auto-link to your day plan','ok');
}

async function dpLinkAfterWOSave(woId){
  if(!window._dpPendingLink) return;
  var ref = window._dpPendingLink;
  window._dpPendingLink = null;
  var stop = _dpStops.find(function(s){return s.id===ref.stopId;});
  if(!stop||!stop.jobs[ref.ji]) return;
  var jobs = stop.jobs.slice();
  jobs[ref.ji] = Object.assign({},jobs[ref.ji],{wo_id:woId});
  try{
    await patch('day_plans',{jobs:jobs,updated_at:new Date().toISOString()},'?id=eq.'+stop.id);
    stop.jobs = jobs; toast('Linked to day plan ✓','ok');
  }catch(e){}
}
