// Removed from index.html in v27.80 (parts-diagrams). Kept so it can be revisited.
// Full working app as it was: GitHub branch archive/v27.70-before-revamp.

async function loadDiagrams(force){
  if(diagrams&&!force){renderDgmBrands();renderDiagrams();return;}
  try{diagrams=await get('parts_diagrams','?order=brand.asc,model.asc,section.asc');}
  catch(e){diagrams=[];toast('Could not load diagrams','er');}
  renderDgmBrands();renderDiagrams();
}

function renderDgmBrands(){
  var row=document.getElementById('dgmBrandRow');if(!row)return;
  var brands=['All'];(diagrams||[]).forEach(function(d){if(d.brand&&brands.indexOf(d.brand)===-1)brands.push(d.brand);});
  row.innerHTML=brands.map(function(b){
    return '<button class="ccat'+(dgmBrand===b?' on':'')+'" data-b="'+esc(b)+'" onclick="dgmBrand=this.dataset.b;renderDgmBrands();renderDiagrams()">'+esc(b)+'</button>';
  }).join('');
}

function renderDiagrams(){
  var el=document.getElementById('dgmList');if(!el)return;
  var q=((document.getElementById('dgmSearch')||{}).value||'').trim();
  var qn=pnorm(q);
  var list=(diagrams||[]).filter(function(d){
    if(dgmBrand!=='All'&&d.brand!==dgmBrand)return false;
    if(!qn)return true;
    return pnorm(d.brand+' '+d.model+' '+(d.section||'')).includes(qn);
  });
  if(!list.length){
    el.innerHTML='<div class="empty" style="padding:30px 20px"><div class="et">'+((diagrams||[]).length?'No diagrams match':'No diagrams yet')+'</div><div class="es">Tap + Add and pick one or more photos or manual pages. Claude reads each one \u2014 brand, model, section, every part number \u2014 and you just check it over before saving.</div></div>';
    return;
  }
  // group brand → model
  var byModel={};
  list.forEach(function(d){var k=d.brand+'\u0001'+d.model;(byModel[k]=byModel[k]||[]).push(d);});
  var h='';
  Object.keys(byModel).sort().forEach(function(k){
    var parts=k.split('\u0001'),ds=byModel[k];
    h+='<div class="grp-card"><div class="grp-hdr"><span class="grp-hdr-name">'+esc(parts[0])+' '+esc(parts[1])+'</span><span class="grp-hdr-tag">'+ds.length+' diagram'+(ds.length!==1?'s':'')+'</span></div>';
    ds.forEach(function(d){
      var pc=(d.parts||[]).length;
      h+='<div class="grp-row" data-id="'+d.id+'" onclick="openDiagramParts(this.dataset.id)">'
        +'<div style="flex:1;min-width:0"><div class="grp-name">'+esc(d.section||'Diagram')+'</div>'+(pc?'<div class="grp-sub">'+pc+' parts listed \u2014 tap to check stock</div>':(d.notes?'<div class="grp-sub">'+esc(d.notes)+'</div>':''))+'</div>'
        +(d.file_url?'<span style="color:var(--tx3);font-size:12px">'+((d.file_type==='pdf')?'PDF':'IMG')+'</span>':'')
        +'<span style="color:var(--tx3);font-size:14px">\u203a</span>'
        +'<button data-id="'+d.id+'" onclick="event.stopPropagation();delDiagram(this.dataset.id)" style="background:none;border:none;color:var(--tx3);font-size:15px;cursor:pointer;padding:2px 4px">\u00d7</button></div>';
    });
    h+='</div>';
  });
  el.innerHTML=h;
}

function openDiagram(url,type){
  if(type==='pdf'){window.open(url,'_blank');return;}
  openPhotoZoom(url);
}

async function delDiagram(id){
  if(!confirm('Remove this diagram?'))return;
  try{
    await fetch(SU+'/rest/v1/parts_diagrams?id=eq.'+id,{method:'DELETE',headers:{'apikey':SK,'Authorization':'Bearer '+(_sessionToken||SK)}});
    diagrams=(diagrams||[]).filter(function(d){return d.id!==id;});
    renderDgmBrands();renderDiagrams();toast('Removed','ok');
  }catch(e){toast('Delete failed','er');}
}

function pfOpenDiagram(id){
  var d=(diagrams||[]).find(function(x){return x.id===id;});
  if(!d)return;
  go('S_dgmParts');
  openDiagramParts(id);
}

function openDiagramParts(id){
  var d=(diagrams||[]).find(function(x){return x.id===id;});
  if(!d)return;
  curDgm=d;
  document.getElementById('dgmPartsTitle').textContent=d.model+' \u2014 '+(d.section||'Diagram');
  document.getElementById('dgmPartsSub').textContent=d.brand+' \u00b7 '+(d.parts||[]).length+' parts';
  document.getElementById('dgmImgBtn').style.display=d.file_url?'flex':'none';
  var s=document.getElementById('dgmPartsSearch');if(s)s.value='';
  navTo('S_dgmParts');
  renderDiagramParts();
}

function openDiagramImage(){
  if(!curDgm||!curDgm.file_url)return;
  if(curDgm.file_type==='pdf'){window.open(curDgm.file_url,'_blank');return;}
  openPhotoZoom(curDgm.file_url);
}

function renderDiagramParts(){
  var el=document.getElementById('dgmPartsList');if(!el||!curDgm)return;
  var q=((document.getElementById('dgmPartsSearch')||{}).value||'').trim();
  var qn=pnorm(q);
  var rows=(curDgm.parts||[]).filter(function(p){
    if(!qn)return true;
    return pnorm((p.ref||'')+' '+(p.desc||'')).includes(qn);
  });
  if(!rows.length){el.innerHTML='<div class="empty" style="padding:26px 20px"><div class="et">No matching parts</div></div>';return;}
  var h='';
  rows.forEach(function(p){
    var hit=inv.find(function(x){return invMatchesQ(x,p.ref);});
    var qty=hit?parseFloat(hit.qty_on_hand||0):null;
    var statusHtml;
    if(hit){
      var c=qty>0?'ok':'ou';
      statusHtml='<span class="qb '+c+'">'+(qty%1===0?qty:qty.toFixed(1))+' on hand</span>';
    } else {
      statusHtml='<button class="wo-badge wb-tx" data-ref="'+esc(p.ref)+'" data-desc="'+esc(p.desc||'')+'" onclick="event.stopPropagation();dgmAttachOrAdd(this.dataset.ref,this.dataset.desc)" style="border:none;cursor:pointer;font-family:var(--fn)">not stocked \u00b7 add</button>';
    }
    h+='<div class="grp-row" style="cursor:'+(hit?'pointer':'default')+'" data-ref="'+esc(p.ref)+'"'+(hit?' onclick="openInvItemByRef(this.dataset.ref)"':'')+'>'
      +'<div style="flex:1;min-width:0">'
      +'<div class="grp-name" style="font-family:var(--mo);font-size:13px">#'+esc(p.ref)+'</div>'
      +'<div class="grp-sub" style="white-space:normal">'+esc(p.desc||'')+(p.qty&&p.qty>1?' \u00d7'+p.qty+' per unit':'')+'</div>'
      +'</div>'+statusHtml+'</div>';
  });
  el.innerHTML=h;
}

async function dgmAttachOrAdd(ref,desc){
  var h='<div class="mt">#'+esc(ref)+'</div><div class="ms">'+esc(desc||'')+'</div>';
  h+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">';
  h+='<button class="mo-btn" style="flex:none" data-ref="'+esc(ref)+'" onclick="dgmCrossRefFlow(this.dataset.ref)">Attach to a part I already stock</button>';
  h+='<button class="mc-btn" style="flex:none" data-ref="'+esc(ref)+'" data-desc="'+esc(desc||'')+'" onclick="dgmNewPartFlow(this.dataset.ref,this.dataset.desc)">+ New inventory item</button>';
  h+='</div><div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button></div>';
  openM(h);
}

function dgmCrossRefFlow(ref){
  _crossRefPending=ref;
  var opts=inv.slice().sort(function(a,b){return(a.name||'').localeCompare(b.name||'');});
  var h='<div class="mt">Attach #'+esc(ref)+'</div><div class="ms">Pick the part you already stock.</div>';
  h+='<input class="mi" id="crossRefSrch" placeholder="Search your parts&hellip;" oninput="countCrossRefFilter()" style="margin-bottom:10px">';
  h+='<div id="crossRefList" style="max-height:44vh;overflow-y:auto"></div>';
  h+='<div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button></div>';
  openM(h);setTimeout(countCrossRefFilter,50);
}

function dgmNewPartFlow(ref,desc){
  addInvItem();
  setTimeout(function(){
    var n=document.getElementById('ai_nm');if(n)n.value=desc||('Part #'+ref);
    var om=document.getElementById('ai_om');if(om)om.value=ref;
    aiToggleOemXref();
    var w=document.getElementById('ai_wr');if(w)w.value=ref;
  },120);
}

function dgmUploadStart(){
  var inp=document.createElement('input');
  inp.type='file';inp.accept='image/*,application/pdf';inp.multiple=true;
  inp.onchange=function(){
    if(!inp.files||!inp.files.length)return;
    dgmProcessFiles(Array.prototype.slice.call(inp.files));
  };
  inp.click();
}

async function dgmProcessFiles(files){
  _dgmPending=[];
  var known=[];(diagrams||[]).forEach(function(d){if(d.brand&&known.indexOf(d.brand)===-1)known.push(d.brand);});
  var h='<div class="mt">Reading diagrams\u2026</div><div class="ms" id="dgmProgTxt">Starting</div>';
  h+='<div style="display:flex;justify-content:center;padding:20px 0"><div class="spin"></div></div>';
  openM(h);
  for(var i=0;i<files.length;i++){
    var f=files[i];
    var pt=document.getElementById('dgmProgTxt');if(pt)pt.textContent='Analyzing '+(i+1)+' of '+files.length+': '+f.name;
    var isPdf=/pdf$/i.test(f.type)||/\.pdf$/i.test(f.name);
    var entry={file:f,previewUrl:isPdf?null:URL.createObjectURL(f),brand:'',model:'',section:'',parts:[],file_type:isPdf?'pdf':'image',error:null};
    try{
      // PDFs read directly now — the same document block the bill
      // scanner uses. A parts manual page is often a PDF, and refusing
      // them meant retyping numbers off the screen.
      var _blk=await aiFileBlock(f);
      var resp=await fetch('https://ddxjszzceaullxheejnq.supabase.co/functions/v1/ai-proxy',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+_sessionToken},
        body:JSON.stringify({
          model:'claude-sonnet-4-6',max_tokens:4000,
          messages:[{role:'user',content:[
            _blk,
            {type:'text',text:'This is a page from an outdoor power equipment (OPE) parts manual, illustrated parts list (IPL), or a parts-lookup screenshot (e.g. PartsTree). It may show an exploded-view diagram with reference numbers, and/or a table listing part numbers with descriptions and quantities.\n\nExtract:\n- brand: the manufacturer (Wright, Scag, Echo, RedMax, Husqvarna, Toro, Exmark, Stihl, Honda, Kawasaki, Briggs & Stratton, Kohler, etc.)\n- model: the specific machine or engine model this page is for, exactly as printed (e.g. "WS36FS600RE", "SRM-225", "FX730V"). If the page covers a modular assembly that fits several models, use the broadest model family name shown.\n- section: short name for what this specific page/assembly shows (e.g. "Deck & belts", "Carburetor", "Rear drive, left", "Engine")\n- parts: array of every part visible with a part/reference number, each as {"ref":"<part number exactly as printed>","desc":"<description exactly as printed, plain text, no quotes>","qty":<quantity as a number, default 1 if not shown>}\n\nRules:\n- Read every row of any parts table completely \u2014 do not skip or truncate\n- Use the manufacturer\'s exact part number as ref, not a reference/balloon number if a real part number is also shown\n- If brand or model is not visible or not confidently identifiable, leave that field as an empty string \u2014 never guess\n- If no parts table or numbers are visible at all, return an empty parts array\n\nReply ONLY with valid JSON, no markdown, no explanation:\n{"brand":"","model":"","section":"","parts":[]}'}
          ]}]
        })
      });
      var data=await resp.json();
      if(data.error)throw new Error(data.error);
      var txt=(data.content&&data.content[0]&&data.content[0].text)||'{}';
      var clean=txt.replace(/```json|```/g,'').trim();
      var result=JSON.parse(clean);
      entry.brand=result.brand||'';entry.model=result.model||'';entry.section=result.section||'';
      entry.parts=(Array.isArray(result.parts)?result.parts:[]).map(function(p){return {ref:String(p.ref||'').trim(),desc:String(p.desc||'').trim(),qty:parseFloat(p.qty)||1};}).filter(function(p){return p.ref;});
      if(!entry.parts.length)entry.error='No part numbers found on this page \u2014 you can still save it as a reference image.';
    }catch(procErr){
      entry.error='Couldn\'t read this one automatically ('+procErr.message+') \u2014 fill in details below.';
    }
    _dgmPending.push(entry);
  }
  closeM();
  renderDgmReview();
}

function renderDgmReview(){
  if(!_dgmPending.length){toast('Nothing to review','er');return;}
  var h='<div class="mt">Review '+_dgmPending.length+' diagram'+(_dgmPending.length!==1?'s':'')+'</div><div class="ms">Claude read these automatically \u2014 fix anything before saving.</div>';
  h+='<div id="dgmReviewCards" style="display:flex;flex-direction:column;gap:12px;max-height:56vh;overflow-y:auto;margin-bottom:14px">';
  _dgmPending.forEach(function(e,idx){
    h+='<div class="mc" style="padding:12px">';
    if(e.previewUrl)h+='<img src="'+e.previewUrl+'" style="width:100%;max-height:140px;object-fit:contain;border-radius:var(--rs);background:var(--sf2);margin-bottom:10px">';
    if(e.error)h+='<div style="font-size:12px;color:var(--amb);margin-bottom:8px">'+esc(e.error)+'</div>';
    h+='<div class="mr" style="margin-bottom:8px">'
      +'<div style="flex:1"><div class="mlbl">Brand</div><input class="mi" data-idx="'+idx+'" data-f="brand" value="'+esc(e.brand)+'" oninput="dgmPendingEdit(this)"></div>'
      +'<div style="flex:1"><div class="mlbl">Model</div><input class="mi" data-idx="'+idx+'" data-f="model" value="'+esc(e.model)+'" oninput="dgmPendingEdit(this)"></div></div>';
    h+='<div style="margin-bottom:4px"><div class="mlbl">Section</div><input class="mi" data-idx="'+idx+'" data-f="section" value="'+esc(e.section)+'" oninput="dgmPendingEdit(this)"></div>';
    h+='<div style="font-size:12px;color:var(--tx3);margin-top:6px">'+e.parts.length+' part'+(e.parts.length!==1?'s':'')+' found'+(e.parts.length?' \u2014 <span style="color:var(--blu);cursor:pointer" data-idx="'+idx+'" onclick="dgmReviewParts(this.dataset.idx)">view/edit</span>':'')+'</div>';
    h+='<button class="mc-btn" style="margin-top:8px;padding:7px;font-size:12px" data-idx="'+idx+'" onclick="dgmPendingRemove(this.dataset.idx)">Remove this one</button>';
    h+='</div>';
  });
  h+='</div><div class="mb"><button class="mc-btn" onclick="_dgmPending=[];closeM()">Cancel all</button><button class="mo-btn" onclick="dgmSaveAllPending()">Save all</button></div>';
  openM(h);
}

function dgmPendingEdit(el){
  var idx=parseInt(el.dataset.idx,10),f=el.dataset.f;
  if(_dgmPending[idx])_dgmPending[idx][f]=el.value;
}

function dgmPendingRemove(idxStr){
  var idx=parseInt(idxStr,10);
  _dgmPending.splice(idx,1);
  if(!_dgmPending.length){closeM();toast('Nothing left to save','');return;}
  renderDgmReview();
}

function dgmReviewParts(idxStr){
  var idx=parseInt(idxStr,10),e=_dgmPending[idx];if(!e)return;
  var h='<div class="mt">Parts on this page</div><div class="ms">Edit or remove anything Claude misread.</div>';
  h+='<div id="dgmPartsEditList" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;margin-bottom:12px">';
  e.parts.forEach(function(p,pi){
    h+='<div class="mr" data-pi="'+pi+'">'
      +'<input class="mi" style="flex:1;font-family:var(--mo)" value="'+esc(p.ref)+'" data-pidx="'+idx+'" data-pi="'+pi+'" data-pf="ref" oninput="dgmPartEdit(this)">'
      +'<input class="mi" style="flex:2" value="'+esc(p.desc)+'" data-pidx="'+idx+'" data-pi="'+pi+'" data-pf="desc" oninput="dgmPartEdit(this)">'
      +'<button style="background:none;border:none;color:var(--tx3);font-size:16px;padding:0 4px" data-pidx="'+idx+'" data-pi="'+pi+'" onclick="dgmPartRemove(this.dataset.pidx,this.dataset.pi)">\u00d7</button></div>';
  });
  h+='</div><div class="mb"><button class="mc-btn" data-idx="'+idx+'" onclick="renderDgmReview()">Done</button></div>';
  openM(h);
}

function dgmPartEdit(el){
  var idx=parseInt(el.dataset.pidx,10),pi=parseInt(el.dataset.pi,10),f=el.dataset.pf;
  if(_dgmPending[idx]&&_dgmPending[idx].parts[pi])_dgmPending[idx].parts[pi][f]=el.value;
}

function dgmPartRemove(idxStr,piStr){
  var idx=parseInt(idxStr,10),pi=parseInt(piStr,10);
  if(_dgmPending[idx])_dgmPending[idx].parts.splice(pi,1);
  dgmReviewParts(idx);
}

async function dgmSaveAllPending(){
  var bad=_dgmPending.find(function(e){return !e.brand.trim()||!e.model.trim();});
  if(bad){toast('Every diagram needs a brand and model','er');return;}
  closeM();
  toast('Saving '+_dgmPending.length+' diagram'+(_dgmPending.length!==1?'s':'')+'\u2026','');
  var saved=0,failed=0;
  for(var i=0;i<_dgmPending.length;i++){
    var e=_dgmPending[i];
    try{
      var ext=e.file_type==='pdf'?'pdf':((e.file.name.split('.').pop())||'jpg').toLowerCase();
      var path=(pnorm(e.brand)||'x')+'/'+(pnorm(e.model)||'x')+'-'+Date.now()+'-'+i+'.'+ext;
      var pr=await fetch(SU+'/storage/v1/object/parts-diagrams/'+path,{method:'POST',headers:{'apikey':SK,'Authorization':'Bearer '+(_sessionToken||SK)},body:e.file});
      if(!pr.ok)throw new Error('upload '+pr.status);
      var url=SU+'/storage/v1/object/public/parts-diagrams/'+path;
      var _dc=canonMachine(e.brand.trim(),e.model.trim(),'');
      mcatLearn(_dc.make,_dc.model,_dc.equipment_type);
      var row={brand:_dc.make,model:_dc.model,section:e.section.trim()||'Diagram',file_url:url,file_type:e.file_type,parts:e.parts};
      var ins=await post('parts_diagrams',row);
      diagrams=diagrams||[];diagrams.push((ins&&ins[0])||row);
      saved++;
    }catch(saveErr){failed++;}
  }
  _dgmPending=[];
  renderDgmBrands();renderDiagrams();
  toast(saved+' saved'+(failed?', '+failed+' failed':''),failed?'er':'ok');
}

function dgmEditDiagram(){
  if(!curDgm)return;
  var d=curDgm;
  var h='<div class="mt">Edit diagram</div>';
  h+='<div class="mr" style="margin-bottom:8px">'
    +'<div style="flex:1"><div class="mlbl">Brand</div><input class="mi" id="dgmEd_brand" value="'+esc(d.brand)+'"></div>'
    +'<div style="flex:1"><div class="mlbl">Model</div><input class="mi" id="dgmEd_model" value="'+esc(d.model)+'"></div></div>';
  h+='<div style="margin-bottom:10px"><div class="mlbl">Section</div><input class="mi" id="dgmEd_section" value="'+esc(d.section)+'"></div>';
  h+='<div class="mlbl" style="margin-bottom:6px">Parts ('+(d.parts||[]).length+')</div>';
  h+='<div id="dgmEdPartsList" style="display:flex;flex-direction:column;gap:6px;max-height:38vh;overflow-y:auto;margin-bottom:10px">';
  (d.parts||[]).forEach(function(p,pi){
    h+='<div class="mr">'
      +'<input class="mi" style="flex:1;font-family:var(--mo)" value="'+esc(p.ref)+'" data-pi="'+pi+'" data-pf="ref" onchange="dgmEdPartChange(this)">'
      +'<input class="mi" style="flex:2" value="'+esc(p.desc)+'" data-pi="'+pi+'" data-pf="desc" onchange="dgmEdPartChange(this)">'
      +'<button style="background:none;border:none;color:var(--tx3);font-size:16px;padding:0 4px" data-pi="'+pi+'" onclick="dgmEdPartRemove(this.dataset.pi)">\u00d7</button></div>';
  });
  h+='</div><button class="mc-btn" style="margin-bottom:10px" onclick="dgmEdPartAdd()">+ Add part row</button>';
  h+='<div class="mb"><button class="mc-btn" onclick="closeM()">Cancel</button><button class="mo-btn" onclick="dgmEdSave()">Save changes</button></div>';
  openM(h);
}

function dgmEdPartChange(el){
  var pi=parseInt(el.dataset.pi,10),f=el.dataset.pf;
  if(curDgm&&curDgm.parts&&curDgm.parts[pi])curDgm.parts[pi][f]=el.value;
}

function dgmEdPartRemove(piStr){
  var pi=parseInt(piStr,10);
  if(curDgm&&curDgm.parts)curDgm.parts.splice(pi,1);
  dgmEditDiagram();
}

function dgmEdPartAdd(){
  if(!curDgm)return;
  curDgm.parts=curDgm.parts||[];
  curDgm.parts.push({ref:'',desc:'',qty:1});
  dgmEditDiagram();
}

async function dgmEdSave(){
  if(!curDgm)return;
  var brand=(document.getElementById('dgmEd_brand').value||'').trim();
  var model=(document.getElementById('dgmEd_model').value||'').trim();
  var section=(document.getElementById('dgmEd_section').value||'').trim();
  if(!brand||!model){toast('Brand and model required','er');return;}
  var parts=(curDgm.parts||[]).filter(function(p){return (p.ref||'').trim();});
  try{
    var _ec=canonMachine(brand,model,'');
    brand=_ec.make;model=_ec.model;
    await patch('parts_diagrams',{brand:brand,model:model,section:section,parts:parts},'?id=eq.'+curDgm.id);
    curDgm.brand=brand;curDgm.model=model;curDgm.section=section;curDgm.parts=parts;
    var idx=(diagrams||[]).findIndex(function(x){return x.id===curDgm.id;});
    if(idx>=0)diagrams[idx]=curDgm;
    closeM();
    document.getElementById('dgmPartsTitle').textContent=model+' \u2014 '+(section||'Diagram');
    document.getElementById('dgmPartsSub').textContent=brand+' \u00b7 '+parts.length+' parts';
    renderDiagramParts();renderDgmBrands();renderDiagrams();
    toast('Updated','ok');
  }catch(edSaveErr){toast('Save failed: '+edSaveErr.message,'er');}
}

function diagramsForMachine(mk,md){
  var mn=pnorm(md||''),kn=pnorm(mk||'');
  if(!diagrams)return null; // not loaded yet
  return diagrams.filter(function(d){
    var dm=pnorm(d.model),db=pnorm(d.brand);
    var modelHit=mn&&dm&&(mn.includes(dm)||dm.includes(mn));
    var brandHit=!kn||!db||kn.includes(db)||db.includes(kn);
    return modelHit&&brandHit;
  });
}
