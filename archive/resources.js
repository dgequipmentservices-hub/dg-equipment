// Removed from index.html in v27.80 (resources). Kept so it can be revisited.
// Full working app as it was: GitHub branch archive/v27.70-before-revamp.

async function loadResources(){
  if(_resources.length){renderResources();return;}
  try{
    var data=await get('resources','?order=category,title');
    _resources=data||[];
    renderResources();
  }catch(e){
    var el=document.getElementById('resourcesBody');
    if(el)el.innerHTML='<div style="padding:20px;color:var(--red)">Error: '+e.message+'</div>';
  }
}

function setResCat(btn){
  document.querySelectorAll('#resCatRow .ccat').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');
  _resCat=btn.dataset.rc;
  renderResources();
}

function formatResContent(body){
  var lines=body.split('\n');
  var specLines=lines.filter(function(l){return l.includes('|')&&(l.includes('Gap')||l.includes('NGK')||l.includes('Champion')||l.includes('Stens')||l.includes('Rotary')||l.includes('Autolite'));});
  if(specLines.length<2){
    return '<div style="font-size:14px;color:var(--tx2);line-height:1.7;white-space:pre-wrap;padding-top:10px">'+esc(body)+'</div>';
  }
  var h='<div style="padding-top:8px">';
  lines.forEach(function(line){
    if(!line.trim())return;
    var t=line.trim();
    // Section header: ALL CAPS or ends with — or is a header label line
    if(!t.includes('|')&&(t===t.toUpperCase()||/^[A-Z &\/\-]+$/.test(t)||t.endsWith('—')||t.endsWith(':'))){
      h+='<div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--tx3);padding:10px 0 5px;margin-top:2px">'+esc(t.replace(/[:\u2014]$/,'').trim())+'</div>';
      return;
    }
    if(!t.includes('|')){
      h+='<div style="font-size:13px;color:var(--tx2);padding:3px 0;line-height:1.5">'+esc(t)+'</div>';
      return;
    }
    // Parse spec line
    var gapMatch=t.match(/Gap\s+([\d.]+)/i);
    var gap=gapMatch?gapMatch[1]:null;
    // Engine label = text before "Gap" or before first |, strip trailing colon/pipe
    var enginePart=t.split(/\s*Gap\s*[\d.]+/i)[0].replace(/\|\s*$/,'').replace(/:\s*$/,'').trim();
    if(!enginePart)enginePart=t.split('|')[0].trim();
    // Parts string = after Gap chunk or after first |
    var afterGap=gap?t.replace(/^.*?Gap\s*[\d.]+\s*\|?\s*/i,''):t.replace(/^[^|]+\|\s*/,'');
    var parts=afterGap.split(/\s*\|\s*/).map(function(p){return p.trim();}).filter(Boolean);

    h+='<div style="border:1px solid var(--bd);border-radius:var(--rs);padding:10px 11px;margin-bottom:6px;background:var(--sf2)">';
    h+='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">';
    h+='<div style="font-size:13px;font-weight:700;color:var(--tx);flex:1;min-width:0;line-height:1.4">'+esc(enginePart)+'</div>';
    if(gap)h+='<div style="font-size:11px;font-weight:800;color:var(--amb);flex-shrink:0;font-family:var(--mo);background:rgba(201,149,42,.12);border:1px solid rgba(201,149,42,.3);border-radius:5px;padding:2px 7px;white-space:nowrap">GAP&nbsp;'+esc(gap)+'&quot;</div>';
    h+='</div>';
    if(parts.length){
      h+='<div style="display:flex;flex-wrap:wrap;gap:5px">';
      parts.forEach(function(p){
        var bm=p.match(/^([A-Za-z][\w\-\/]*):\s*(.+)$/);
        if(bm){
          var brand=bm[1].toUpperCase(),pnum=bm[2];
          var col='var(--tx3)',bg='var(--sf3)';
          if(/NGK/.test(brand)){col='#e05252';bg='rgba(224,82,82,.08)';}
          else if(/CHAMPION/.test(brand)){col='var(--blu)';bg='rgba(64,136,204,.08)';}
          else if(/MEGA.?FIRE/.test(brand)){col='var(--grn)';bg='rgba(63,168,110,.08)';}
          else if(/AUTOLITE/.test(brand)){col='var(--pur)';bg='rgba(128,96,220,.08)';}
          else if(/BOSCH/.test(brand)){col='var(--amb)';bg='rgba(201,149,42,.08)';}
          else if(/TORCH/.test(brand)){col='#6ba8a0';bg='rgba(107,168,160,.08)';}
          else if(/DENSO/.test(brand)){col='#c47db5';bg='rgba(196,125,181,.08)';}
          h+='<span style="display:inline-flex;align-items:center;gap:4px;background:'+bg+';border:1px solid var(--bd2);border-radius:6px;padding:3px 8px;white-space:nowrap">';
          h+='<span style="font-size:10px;font-weight:800;color:'+col+';text-transform:uppercase;letter-spacing:.03em">'+esc(brand)+'</span>';
          h+='<span style="font-size:12px;font-weight:600;color:var(--tx2);font-family:var(--mo)">'+esc(pnum)+'</span>';
          h+='</span>';
        } else {
          h+='<span style="font-size:12px;color:var(--tx2);font-family:var(--mo);background:var(--sf3);border:1px solid var(--bd2);border-radius:6px;padding:3px 8px">'+esc(p)+'</span>';
        }
      });
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  return h;
}

function renderResources(){
  var el=document.getElementById('resourcesBody');if(!el)return;
  var q=(document.getElementById('resQ')||{value:''}).value.trim().toLowerCase();
  var list=(_resources||[]).slice();
  if(_resCat!=='All')list=list.filter(function(r){return r.category===_resCat;});
  if(q)list=list.filter(function(r){
    return(r.title||'').toLowerCase().includes(q)||(r.content||'').toLowerCase().includes(q)||(r.tags||'').toLowerCase().includes(q)||(r.source||'').toLowerCase().includes(q)||(r.notes||'').toLowerCase().includes(q);
  });
  if(!list.length){
    el.innerHTML='<div class="empty"><div class="et">'+(q||_resCat!=='All'?'No matches':'No resources yet')+'</div>'+(q||_resCat!=='All'?'':'<div class="es">Tap + to add belt specs, cross references, notes</div>')+'</div>';
    return;
  }
  var h='';
  list.forEach(function(r){
    var body=r.content||r.notes||'';
    h+='<div style="background:var(--sf);border:1.5px solid var(--bd2);border-radius:var(--r);margin-bottom:10px;overflow:hidden">';
    h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 14px;cursor:pointer" onclick="togRes(\''+r.id+'\')">';
    h+='<div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:var(--tx)">'+esc(r.title||'')+'</div>';
    h+='<div style="font-size:12px;color:var(--tx3);margin-top:3px">'+esc(r.category||'General')+(r.source?' \xb7 '+esc(r.source):'')+'</div></div>';
    h+='<span style="font-size:18px;color:var(--tx3);transition:transform .2s;flex-shrink:0;margin-left:8px" id="resChev_'+r.id+'">\u25bc</span>';
    h+='</div>';
    h+='<div id="resBody_'+r.id+'" style="display:none;padding:0 12px 14px;border-top:1px solid var(--bd)">';
    if(body)h+=formatResContent(body);
    var _rWords=(body).match(/\b\d{3}-\d{3,4}\b/g)||[];
    var _rMatches=(inv||[]).filter(function(p){return _rWords.some(function(w){return(p.part||'').includes(w)||(p.name||'').includes(w)||(p.oem||'').includes(w)||(p.stens_num||'').includes(w);});});
    if(_rMatches.length){
      h+='<div style="margin-top:10px;padding:8px 10px;background:rgba(63,168,110,.08);border:1.5px solid var(--grn);border-radius:var(--rs)">';
      h+='<div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--grn);margin-bottom:4px">In Your Inventory</div>';
      _rMatches.forEach(function(p){
        h+='<div style="font-size:12px;color:var(--tx2);padding:2px 0">&#x2713; '+(p.name||'Part')+(p.part?' #'+p.part:'')+(p.qty_on_hand!=null?' &middot; Qty: '+p.qty_on_hand:'')+'</div>';
      });
      h+='</div>';
    }
    if(r.url)h+='<a href="'+r.url+'" target="_blank" style="display:inline-block;margin-top:10px;font-size:13px;color:var(--blu);text-decoration:none;font-weight:600">Open link &#8599;</a>';
    h+='<div style="display:flex;gap:8px;margin-top:12px">';
    h+='<button onclick="editResource(\''+r.id+'\')" style="flex:1;background:var(--sf2);border:1.5px solid var(--bd2);border-radius:var(--rs);padding:9px;font-size:13px;font-weight:700;font-family:var(--fn);color:var(--tx2);cursor:pointer">Edit</button>';
    h+='<button onclick="deleteResource(\''+r.id+'\')" style="background:var(--sf2);border:1.5px solid var(--red);border-radius:var(--rs);padding:9px 14px;font-size:13px;font-weight:700;font-family:var(--fn);color:var(--red);cursor:pointer">Del</button>';
    h+='</div></div></div>';
  });
  el.innerHTML=h;
}

function togRes(id){
  var body=document.getElementById('resBody_'+id);
  var chev=document.getElementById('resChev_'+id);
  if(!body)return;
  var open=body.style.display==='none';
  body.style.display=open?'block':'none';
  if(chev)chev.style.transform=open?'rotate(180deg)':'';
}

function openAddResource(){
  var catOpts=['Belts','Spark Plugs','Carburetor','Fuel System','Blades','Engine Oil','Electrical','Tires','General'].map(function(c){return '<option>'+c+'</option>';}).join('');
  openM('<div class="mt">Add Resource</div><div class="mf">'+
    '<div><div class="mlbl">Title *</div><input class="mi" id="res_title" placeholder="e.g. Belt 265-080 specs"></div>'+
    '<div class="mr"><div style="flex:1"><div class="mlbl">Category</div><select class="mi" id="res_cat">'+catOpts+'</select></div>'+
    '<div style="flex:1"><div class="mlbl">Source</div><input class="mi" id="res_src" placeholder="Stens, Rotary, OEM..."></div></div>'+
    '<div><div class="mlbl">Content / Notes</div><textarea class="mi" id="res_content" rows="6" placeholder="Specs, cross refs, sizes, tips..." style="resize:none"></textarea></div>'+
    '<div><div class="mlbl">Tags</div><input class="mi" id="res_tags" placeholder="belt stens size width"></div>'+
    '<div><div class="mlbl">URL <span style="font-weight:400;color:var(--tx3)">optional</span></div><input class="mi" id="res_url" type="url" placeholder="https://"></div>'+
    '</div><div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button><button class="mo-btn" onclick="saveResource(null)">Save</button></div>');
}

function editResource(id){
  var r=(_resources||[]).find(function(x){return x.id===id;});if(!r)return;
  var catOpts=['Belts','Spark Plugs','Carburetor','Fuel System','Blades','Engine Oil','Electrical','Tires','General'].map(function(c){return '<option'+(c===r.category?' selected':'')+'>'+c+'</option>';}).join('');
  openM('<div class="mt">Edit Resource</div><div class="mf">'+
    '<div><div class="mlbl">Title</div><input class="mi" id="res_title" value="'+esc(r.title||'')+'"></div>'+
    '<div class="mr"><div style="flex:1"><div class="mlbl">Category</div><select class="mi" id="res_cat">'+catOpts+'</select></div>'+
    '<div style="flex:1"><div class="mlbl">Source</div><input class="mi" id="res_src" value="'+esc(r.source||'')+'"></div></div>'+
    '<div><div class="mlbl">Content</div><textarea class="mi" id="res_content" rows="6" style="resize:none">'+esc(r.content||r.notes||'')+'</textarea></div>'+
    '<div><div class="mlbl">Tags</div><input class="mi" id="res_tags" value="'+esc(r.tags||'')+'"></div>'+
    '<div><div class="mlbl">URL</div><input class="mi" id="res_url" type="url" value="'+esc(r.url||'')+'"></div>'+
    '</div><div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button><button class="mo-btn" onclick="saveResource(\''+id+'\')">Save</button></div>');
}

async function saveResource(id){
  if(!_lock('saveResource_'+id))return;
  var title=(document.getElementById('res_title').value||'').trim();
  if(!title){_unlock('saveResource_'+id);toast('Enter a title','er');return;}
  var data={title:title,category:document.getElementById('res_cat').value||'General',content:(document.getElementById('res_content').value||'').trim(),tags:(document.getElementById('res_tags').value||'').trim()||null,source:(document.getElementById('res_src').value||'').trim()||null,url:(document.getElementById('res_url').value||'').trim()||null};
  try{
    if(id){
      await patch('resources',data,'?id=eq.'+id);
      var idx=(_resources||[]).findIndex(function(x){return x.id===id;});
      if(idx>=0)Object.assign(_resources[idx],data);
      toast('Updated \u2713','ok');
    } else {
      var result=await post('resources',data);
      var r=Array.isArray(result)?result[0]:result;
      if(r)(_resources=_resources||[]).unshift(r);
      toast('Saved \u2713','ok');
    }
    closeM();renderResources();
  }catch(e){_unlock('saveResource_'+id);toast('Error: '+e.message,'er');}
}

async function deleteResource(id){
  if(!confirm('Delete this resource?'))return;
  try{
    await del('resources','?id=eq.'+id);
    _resources=(_resources||[]).filter(function(x){return x.id!==id;});
    toast('Deleted','ok');renderResources();
  }catch(e){toast('Error: '+e.message,'er');}
}
