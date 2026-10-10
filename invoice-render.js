// invoice-render.js — the shop app's own invoice, for the customer portal.
// GENERATED from index.html by copying, unchanged, the app's invoice layout
// (openInvoice), its picture step (saveInvoiceAsImage) and its PDF step
// (invoicePdfBase64), so a portal download is the same invoice the shop
// saves and sends. If the invoice layout in index.html changes, regenerate
// this file (see scripts in the PR) rather than editing it by hand.

function laborAmt(l, fallbackRate){
  if(!l || l.no_charge) return 0;
  if(l.unit_price!=null) return (l.qty||1)*(l.unit_price||0);
  return (l.hours||0)*(l.rate||fallbackRate||0);
}
function esc(s){
  if(s==null)return'';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function _isStructuredRepair(desc){return /\[\[(PROBLEM|FOUND|REPAIR)\]\]/.test(desc||'');}
function _fmtLaborDesc(desc,compact){
  if(!_isStructuredRepair(desc)){
    if((desc||'').indexOf('\n')>=0){
      return '<span style="display:block;line-height:1.6">'+desc.split('\n').filter(function(s){return s.trim();}).map(function(s){return'\u2022 '+esc(s);}).join('<br>')+'</span>';
    }
    return esc(desc||'');
  }
  var labels={PROBLEM:'Reported',FOUND:'Found',REPAIR:'Repaired'};
  var order=['PROBLEM','FOUND','REPAIR'];
  var out='';
  order.forEach(function(tag){
    var re=new RegExp('\\[\\['+tag+'\\]\\]([\\s\\S]*?)(?=\\[\\[|$)');
    var m=desc.match(re);
    if(m&&m[1].trim()){
      var raw=m[1].trim();
      var lines=raw.split('\n').filter(function(s){return s.trim();});
      var body;
      if(lines.length>1){
        body='<span style="display:block;margin-top:2px;line-height:1.6">'+lines.map(function(s){return'\u2022 '+esc(s.trim());}).join('<br>')+'</span>';
      } else {
        body=esc(raw);
      }
      out+='<div style="margin-bottom:'+(compact?'5px':'7px')+'"><span style="font-weight:700;color:var(--tx2)">'+labels[tag]+':</span> '+body+'</div>';
    }
  });
  return '<div style="line-height:1.5">'+out+'</div>';
}
function _isSaleKey(k){return /^sale_/.test(k||'');}
function _saleDefLabel(t){return t==='unit'?'Equipment sold':t==='parts'?'Parts sold':'Shop supplies';}
function getInvDate(w){
  if(w&&w.invoiced_at)return new Date(w.invoiced_at);
  return w&&w.scheduled_date ? new Date(w.scheduled_date+'T12:00:00') : new Date();
}
function getInvDateFmt(w){
  return getInvDate(w).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
}
function buildPmtRow(p, woId){
  var h='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd)">';
  h+='<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">'+p.method+(p.note?' — '+p.note:'')+'</div>';
  var _pmtD=p.payment_date?new Date(p.payment_date+'T12:00:00'):new Date(p.created_at);
  h+='<div style="font-size:11px;color:var(--tx3)">'+_pmtD.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'</div></div>';
  h+='<div style="font-size:14px;font-weight:700;color:var(--grn);min-width:58px;text-align:right">$'+parseFloat(p.amount).toFixed(2)+'</div>';
  h+='<button data-pid="'+p.id+'" data-wid="'+woId+'" onclick="editPayment(this.dataset.pid,this.dataset.wid)" style="background:none;border:1px solid var(--bd2);color:var(--tx3);font-size:11px;border-radius:4px;padding:3px 7px;cursor:pointer;font-family:var(--fn)">Edit</button>';
  h+='<button data-pid="'+p.id+'" data-wid="'+woId+'" onclick="deletePayment(this.dataset.pid,this.dataset.wid)" style="background:none;border:1px solid var(--red);color:var(--red);font-size:11px;border-radius:4px;padding:3px 7px;cursor:pointer;font-family:var(--fn)">Del</button>';
  h+='</div>';
  return h;
}

function dgInvoiceHtml(w,c,eMap,pmts){
  var id=w.id;
    const biz = ['Contractor','Commercial'].includes(c.customer_type);
    // The invoice number comes from the database, off one sequence, at the
    // moment the job becomes billed. The client used to hand out its own
    // with a max()+1 loop and a retry on the unique constraint — two
    // sources for one number, and they had already drifted apart: the
    // sequence sat at 1408 while 1409 was live, which is a duplicate-key
    // failure waiting for the next work order. There is one source now.
    let assignedInvNum = w.invoice_number;
    const invNum = assignedInvNum ? ('INV-' + assignedInvNum) : ('INV-' + (w.id||'').slice(0,8).toUpperCase());
    window._printInvNum = invNum;
    window._printCustName = c ? c.name : '';
    const today = getInvDateFmt(w);
    const dueDate = biz ? 'Net 7 days' : 'Due on receipt';

    let md = {};
    try { md = JSON.parse(w.machines_data || '{}'); } catch(e) {}
    const ex = JSON.parse(w.extra_equipment_ids || '[]');
    const ids = w.equipment_id ? [w.equipment_id, ...ex] : ex;

    let parts = 0, labor = 0;
    let machinesHtml = '';
    ids.forEach(eid => {
      const eq = eMap[eid]; if (!eq) return;
      const d = md[eid] || {};
      const ps = d.parts || [], ls = d.labor || [];
      parts += ps.reduce((s,p) => s + p.qty * p.price, 0);
      labor += ls.reduce((s,l) => s + laborAmt(l), 0);
      if (!ps.length && !ls.length) return;
      var _mSvcDate=d.svcDate||w.scheduled_date||'';
      var _mSvcFmt=_mSvcDate?new Date(_mSvcDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      machinesHtml += '<div class="inv-mach"><div class="inv-mach-nm">'+eq.make+' '+(eq.model||'')+'<span style="font-size:11px;color:var(--tx3);font-family:var(--mo);font-weight:400"> · SN: '+(eq.serial||'—')+'</span>'+(_mSvcFmt?'<span style="font-size:10px;color:var(--tx3);font-family:var(--mo);font-weight:400;margin-left:8px">Service: '+_mSvcFmt+'</span>':'')+'</div>';
      if (ls.length) {
        machinesHtml += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx3);margin:6px 0 3px">Labor</div>';
        ls.forEach((l,li) => {
          if(l._adj) return; // handled in adj section below
          machinesHtml += '<div class="inv-li" style="align-items:flex-start"><div class="inv-li-d"><div>'+_fmtLaborDesc(l.desc,false)+'</div><span class="inv-li-sub">'+(l.kind==='trimmer'?l.qty+' trimmer'+(l.qty!==1?'s':'')+' × $'+parseFloat(l.unit_price).toFixed(2):l.unit_price!=null?l.qty+' blade'+(l.qty!==1?'s':'')+' × $'+parseFloat(l.unit_price).toFixed(2):l.hours+'h × $'+l.rate+'/hr')+'</span></div><span class="inv-li-a">'+(l.no_charge?'No charge':'$'+laborAmt(l).toFixed(2))+'</span></div>';
        });
      }
      if (ps.length) {
        machinesHtml += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx3);margin:6px 0 3px">Parts</div>';
        ps.forEach((p,pi) => {
          if(p._adj) return; // handled in adj section below
          machinesHtml += '<div class="inv-li"><div class="inv-li-d"><div>'+p.name+(p.partNum?' <span style="font-size:11px;color:var(--tx3)">#'+p.partNum+'</span>':'')+'</div><span class="inv-li-sub">qty '+p.qty+' &times; $'+p.price.toFixed(2)+'</span></div><span class="inv-li-a">$'+(p.qty*p.price).toFixed(2)+'</span></div>';
        });
      }
      machinesHtml += '</div>';
    });

    // Supplies, counter parts and units sold — they have no equipment
    // row, so they are not in `ids`. Without this loop they were on the
    // work order and in every total but invisible on the invoice.
    Object.keys(md).forEach(function(k){
      if (ids.indexOf(k) >= 0) return;
      const d = md[k] || {};
      if (!d.sale && !_isSaleKey(k)) return;
      const ps = d.parts || [], ls = d.labor || [];
      parts += ps.reduce(function(t,p){return t + p.qty * p.price;}, 0);
      labor += ls.reduce(function(t,l){return t + laborAmt(l);}, 0);
      if (!ps.length && !ls.length) return;
      // The customer's copy says "counter sale", not the shop's own
      // "machine not here" — the label above already says what it was for.
      machinesHtml += '<div class="inv-mach"><div class="inv-mach-nm">'+esc(d.label||_saleDefLabel(d.saleType))+
        '<span style="font-size:11px;color:var(--tx3);font-family:var(--mo);font-weight:400"> \u00b7 '+(d.saleType==='unit'?'Equipment sale':'Counter sale')+'</span></div>';
      if (ls.length) {
        machinesHtml += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx3);margin:6px 0 3px">Labor</div>';
        ls.forEach(function(l){
          if(l._adj) return;
          machinesHtml += '<div class="inv-li" style="align-items:flex-start"><div class="inv-li-d"><div>'+_fmtLaborDesc(l.desc,false)+'</div><span class="inv-li-sub">'+(l.kind==='trimmer'?l.qty+' trimmer'+(l.qty!==1?'s':'')+' \u00d7 $'+parseFloat(l.unit_price).toFixed(2):l.unit_price!=null?l.qty+' blade'+(l.qty!==1?'s':'')+' \u00d7 $'+parseFloat(l.unit_price).toFixed(2):l.hours+'h \u00d7 $'+l.rate+'/hr')+'</span></div><span class="inv-li-a">'+(l.no_charge?'No charge':'$'+laborAmt(l).toFixed(2))+'</span></div>';
        });
      }
      if (ps.length) {
        machinesHtml += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--tx3);margin:6px 0 3px">'+(d.saleType==='unit'?'Equipment':'Parts')+'</div>';
        ps.forEach(function(p){
          if(p._adj) return;
          machinesHtml += '<div class="inv-li"><div class="inv-li-d"><div>'+esc(p.name||'')+(p.partNum?' <span style="font-size:11px;color:var(--tx3)">#'+esc(p.partNum)+'</span>':'')+'</div><span class="inv-li-sub">qty '+p.qty+' &times; $'+p.price.toFixed(2)+'</span></div><span class="inv-li-a">$'+(p.qty*p.price).toFixed(2)+'</span></div>';
        });
      }
      machinesHtml += '</div>';
    });

    const sub = parts + labor;
    var _ccOn=w.cc_fee||false;
    var _taxExempt=!!(c&&c.tax_exempt);
    const finalTax = _taxExempt ? 0 : parseFloat((sub*0.08625).toFixed(2));
    var _ccAmt=_ccOn?parseFloat(((sub+finalTax)*0.03).toFixed(2)):0;
    var _ccTax=(_ccOn&&!_taxExempt)?parseFloat((_ccAmt*0.08625).toFixed(2)):0;
    // Apply adjustments from w.adjustments JSON array
    var _adjNetInv=0;
    try{var _adjsInv=JSON.parse(w.adjustments||'[]');_adjsInv.forEach(function(a){var amt=parseFloat(a.amount||0);_adjNetInv+=a.type==='discount'?-amt:amt;});}catch(e){}
    const total = sub + finalTax + _ccAmt + _ccTax + _adjNetInv;

    // payments
    const totalPaid = pmts.reduce((s,p) => s + parseFloat(p.amount), 0);
    const balance = total - totalPaid;
    // Paid means nothing is owed, or the shop said so outright.
    const isPaid = balance <= 0.01 || (w.invoice_status||'') === 'paid';
    const isPartial = !isPaid && totalPaid > 0.01;

    let pmtHtml = '';
    if (pmts.length) {
      pmtHtml += '<div class="inv-sec"><div class="inv-sec-t">Payments received</div>';
      pmts.forEach(function(p){ pmtHtml += buildPmtRow(p, id); });
      pmtHtml += '</div>';
    }

    // Build adjustment rows HTML with edit/delete controls
    let adjHtml = '';
    ids.forEach(eid => {
      const d = md[eid] || {};
      (d.labor||[]).forEach((l,li) => {
        if(!l._adj) return;
        const color = l.rate < 0 ? 'var(--red)' : 'var(--grn)';
        adjHtml += '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd);font-size:13px">' +
          '<span style="flex:1;color:var(--tx2)">' + l.desc.replace(/\n/g,' · ') + '</span>' +
          '<span style="font-family:var(--mo);font-weight:700;color:' + color + '">$' + l.rate.toFixed(2) + '</span>' +
          '<button data-wid="' + woId + '" data-eid="' + eid + '" data-type="labor" data-idx="' + li + '" onclick="removeAdj(this.dataset.wid,this.dataset.eid,this.dataset.type,parseInt(this.dataset.idx))" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:0 4px;line-height:1">&times;</button></div>';
      });
      (d.parts||[]).forEach((p,pi) => {
        if(!p._adj) return;
        const color = p.price < 0 ? 'var(--red)' : 'var(--grn)';
        adjHtml += '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--bd);font-size:13px">' +
          '<span style="flex:1;color:var(--tx2)">' + p.name + '</span>' +
          '<span style="font-family:var(--mo);font-weight:700;color:' + color + '">$' + p.price.toFixed(2) + '</span>' +
          '<button data-wid="' + woId + '" data-eid="' + eid + '" data-type="parts" data-idx="' + pi + '" onclick="removeAdj(this.dataset.wid,this.dataset.eid,this.dataset.type,parseInt(this.dataset.idx))" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:0 4px;line-height:1">&times;</button></div>';
      });
    });

    const html =
      '<div class="inv-card">' +

      // ── Header ───────────────────────────────────────────────────
      '<div class="inv-biz" style="display:flex;align-items:center;gap:14px">' +
        '<img src="data:image/jpeg;base64,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" style="height:64px;width:auto;flex-shrink:0" alt="DG Equipment">' +
        '<div class="inv-biz-mt">Oceanside, NY &nbsp;&middot;&nbsp; (516) 350-8898<br>dgequipmentservices@gmail.com</div>' +
      '</div>' +
      // ── Bill To / Invoice # row ───────────────────────────────────
      '<div style="display:flex;gap:0;border-bottom:1px solid var(--bd)">' +
        '<div style="flex:1;padding:14px 16px;border-right:1px solid var(--bd)">' +
          '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);margin-bottom:6px">Bill To</div>' +
          '<div style="font-size:15px;font-weight:800;margin-bottom:3px">'+(c.name||'Customer')+'</div>' +
          (c.phone?'<div style="font-size:12px;color:var(--tx2);margin-bottom:1px">'+c.phone+'</div>':'') +
          (c.email?'<div style="font-size:12px;color:var(--tx3)">'+c.email+'</div>':'') +
          (c.address?'<div style="font-size:12px;color:var(--tx3)">'+c.address+'</div>':'') +
          (biz?'<div style="margin-top:5px;display:inline-block;font-size:10px;font-weight:800;background:rgba(21,101,192,.12);color:var(--blu);border-radius:4px;padding:2px 6px">COMMERCIAL &middot; NET 7</div>':'') +
        '</div>' +
        '<div style="padding:14px 16px;min-width:150px;text-align:right">' +
          '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);margin-bottom:6px">Invoice</div>' +
          '<div style="font-size:15px;font-weight:800;color:var(--red);font-family:var(--mo);margin-bottom:3px">'+invNum+'</div>' +
          '<div style="font-size:12px;color:var(--tx2);cursor:pointer" onclick="openInvDatePicker(\''+ id +'\')" title="Tap to change date">'+today+' <span style="font-size:9px;color:var(--tx3);opacity:.7">✎</span></div>' +
          '<div style="font-size:11px;color:var(--tx3);margin-top:3px">'+dueDate+'</div>' +
          // Their PO number, back on the paper that goes to their
          // accounts payable — without it a commercial invoice sits.
          (w.po_number?'<div style="font-size:12px;font-weight:700;color:var(--tx2);margin-top:5px">PO #'+esc(w.po_number)+'</div>':'') +
        '</div>' +
      '</div>' +

      // ── Job description ───────────────────────────────────────────
      (w.problem ?
        '<div style="padding:10px 16px;background:var(--sf2);border-bottom:1px solid var(--bd)">' +
          '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);margin-bottom:4px">Job Description</div>' +
          '<div style="font-size:13px;color:var(--tx2);line-height:1.6;white-space:pre-line">'+w.problem+'</div>' +
        '</div>' : '') +

      // ── Line items ────────────────────────────────────────────────
      '<div style="padding:0 16px 8px">' +
        '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);padding:12px 0 8px;border-bottom:2px solid var(--bd)">Work Performed</div>' +
        (machinesHtml || '<div style="color:var(--tx3);font-size:13px;padding:12px 0">No line items recorded.</div>') +
      '</div>' +

      // ── Adjustments (editable inline) ─────────────────────────────
      (adjHtml ?
        '<div style="padding:0 16px 8px">' +
          '<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--tx3);padding:8px 0 6px;border-bottom:1px solid var(--bd)">Adjustments</div>' +
          adjHtml +
        '</div>' : '') +

            // ── Add adjustment + Round to Even Dollar ──────────────────────────────
      '<div style="padding:0 16px 12px;display:flex;gap:8px">' +
        '<button id="adjInlineBtn" style="flex:2;background:none;border:1.5px dashed var(--bd2);border-radius:var(--rs);padding:6px 10px;font-size:12px;font-weight:700;font-family:var(--fn);color:var(--tx3);cursor:pointer">+ Adjustment</button>' +
        (parseFloat(total.toFixed(2))!==Math.round(parseFloat(total.toFixed(2)))?'<button id="roundDollarBtn" style="flex:1;background:none;border:1.5px dashed var(--amb);border-radius:var(--rs);padding:6px 8px;font-size:11px;font-weight:700;font-family:var(--fn);color:var(--amb);cursor:pointer" title="Adjust to even dollar">⬤ $'+Math.round(parseFloat(total.toFixed(2)))+'.00</button>':'') +
      '</div>' +

      // ── Totals box ────────────────────────────────────────────────
      '<div style="background:var(--sf2);border-top:2px solid var(--bd);padding:14px 16px;margin-top:4px">' +
        (parts>0?'<div class="inv-trow"><span class="l">Parts</span><span class="v">$'+parts.toFixed(2)+'</span></div>':'') +
        (labor>0?'<div class="inv-trow"><span class="l">Labor</span><span class="v">$'+labor.toFixed(2)+'</span></div>':'') +
        '<div class="inv-trow"><span class="l">Subtotal</span><span class="v">$'+sub.toFixed(2)+'</span></div>' +
        (_adjNetInv!==0?'<div class="inv-trow"><span class="l">Adjustment</span><span class="v" style="color:'+(_adjNetInv<0?'var(--red)':'var(--grn)')+'">'+(_adjNetInv>0?'+':'')+_adjNetInv.toFixed(2)+'</span></div>':'')+
        (!_taxExempt?'<div class="inv-trow"><span class="l">Tax (8.625%)</span><span class="v">$'+(finalTax+(_ccTax||0)).toFixed(2)+'</span></div>':'') +
        (_ccAmt>0?'<div class="inv-trow"><span class="l">CC Fee (3%)</span><span class="v">$'+_ccAmt.toFixed(2)+'</span></div>':'') +
        '<div class="inv-trow fin"><span class="l">Total</span><span class="v">$'+total.toFixed(2)+'</span></div>' +
        (pmts.length ? '<div class="inv-trow" style="color:var(--grn)"><span class="l">Paid</span><span class="v">&minus;$'+totalPaid.toFixed(2)+'</span></div>' : '') +
        (pmts.length ? '<div class="inv-trow fin"><span class="l">Balance Due</span><span class="v" style="color:'+(isPaid?'var(--grn)':'var(--red)')+'">$'+Math.max(0,balance).toFixed(2)+'</span></div>' : '') +
      '</div>' +

      pmtHtml +
      (isPaid ? '<div class="inv-paid-stamp">PAID IN FULL</div>' : '') +
      '<div class="inv-disc">Payment due on receipt (residential) or Net 7 days (commercial/contractor). 1.5% monthly late fee after 15 days. 30-day parts &amp; labor warranty. Warranty void if equipment misused, improperly maintained, or operated with bad/contaminated fuel. Not responsible for pre-existing conditions unrelated to repairs performed. Equipment unclaimed after 30 days becomes the responsibility of the owner.</div>' +
      '</div><div style="height:24px"></div>';

  return {html:html,invNum:invNum,total:total,balance:balance};
}

async function dgInvoiceCanvas(inner,invNum){
  var _returnCanvas=true,_silent=true;
  if(!_silent)toast('Generating image…','');
  try{
    // Build the same clean white HTML that printInvoiceClean uses

    // The ✎ edit marks are for the screen, not the customer's copy.
    inner=inner.replace(/<span[^>]*>\s*\u270e\s*<\/span>/g,'').replace(/\u270e/g,'');
    // Replace CSS variables with plain values
    inner=inner.replace(/color:var\(--tx3\)/g,'color:#888');
    inner=inner.replace(/color:var\(--tx2\)/g,'color:#444');
    inner=inner.replace(/color:var\(--tx[^)]*\)/g,'color:#111');
    inner=inner.replace(/color:var\(--grn\)/g,'color:#2e7d32');
    inner=inner.replace(/color:var\(--red\)/g,'color:#c62828');
    inner=inner.replace(/color:var\(--amb\)/g,'color:#f57c00');
    inner=inner.replace(/color:var\(--blu\)/g,'color:#1565c0');
    inner=inner.replace(/color:var\(--pur\)/g,'color:#6a1b9a');
    inner=inner.replace(/color:var\(--ac\)/g,'color:#e85d3a');
    inner=inner.replace(/background:var\([^)]+\)/g,'background:#fff');
    inner=inner.replace(/background-color:var\([^)]+\)/g,'background:#fff');
    inner=inner.replace(/border:[^;"]*var\([^)]+\)[^;"']*/g,'border:1px solid #ddd');
    inner=inner.replace(/border-color:var\([^)]+\)/g,'border-color:#ddd');
    inner=inner.replace(/font-family:var\(--fn\)/g,'font-family:Arial,sans-serif');
    inner=inner.replace(/font-family:var\(--mo\)/g,'font-family:monospace');

    var html='<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+
      '*{margin:0;padding:0;box-sizing:border-box}'+
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:32px;width:680px}'+
      '.inv-biz{border-bottom:2px solid #e85d3a;padding-bottom:12px;margin-bottom:16px}'+
      '.inv-biz-nm{font-size:20px;font-weight:800;color:#111}'+
      '.inv-biz-mt{font-size:12px;color:#555;margin-top:3px}'+
      '.inv-meta{display:flex;justify-content:space-between;margin-bottom:16px;gap:20px}'+
      '.inv-num{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:3px}'+
      '.inv-val{font-size:15px;font-weight:700;color:#111}'+
      '.inv-sec{margin-bottom:14px}'+
      '.inv-sec-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px}'+
      '.inv-mach{margin-bottom:12px}'+
      '.inv-mach-nm{font-size:13px;font-weight:700;margin-bottom:4px;color:#111}'+
      '.inv-li{display:flex;align-items:flex-start;gap:8px;padding:3px 0;font-size:12px;border-bottom:1px solid #f0f0f0}'+
      '.inv-li-d{flex:1;color:#111}'+
      '.inv-li-sub{color:#888;font-size:11px;white-space:nowrap}'+
      '.inv-li-a{font-weight:600;white-space:nowrap;min-width:60px;text-align:right}'+
      'ul{margin:0;padding-left:16px;list-style:disc}'+
      'li{padding:1px 0;list-style:disc;display:list-item}'+
      '.inv-totals{margin-top:16px;border-top:1px solid #ddd;padding-top:10px}'+
      '.inv-trow{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}'+
      '.inv-trow.fin{font-weight:800;font-size:15px;border-top:1px solid #ddd;margin-top:6px;padding-top:6px}'+
      '.inv-paid-stamp{text-align:center;font-size:28px;font-weight:900;color:#e85d3a;border:3px solid #e85d3a;border-radius:6px;padding:8px 20px;display:inline-block;transform:rotate(-3deg);margin:16px auto;letter-spacing:.1em}'+
      '.inv-disc{font-size:10px;color:#999;margin-top:20px;line-height:1.6;border-top:1px solid #eee;padding-top:10px}'+
      '.wb{display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700}'+
      '.sN{background:#fde8e8;color:#c62828}.sL{background:#e3f2fd;color:#1565c0}'+
      '.sD{background:#e8f5e9;color:#2e7d32}.sI{background:#e8f5e9;color:#2e7d32}'+
      '.sPO{background:#fff8e1;color:#f57c00}.sPI{background:#f3e5f5;color:#6a1b9a}'+
      'button{display:none}'+
      '</style></head><body>'+inner+'</body></html>';

    // Render in a hidden iframe, then capture with html2canvas
    var iframe=document.createElement('iframe');
    iframe.style.cssText='position:fixed;left:-9999px;top:0;width:712px;height:1px;border:none;visibility:hidden';
    document.body.appendChild(iframe);

    await new Promise(function(resolve){
      iframe.onload=resolve;
      iframe.srcdoc=html;
    });

    // Let layout settle
    await new Promise(function(r){setTimeout(r,300);});

    // Size iframe to full content height
    var iDoc=iframe.contentDocument||iframe.contentWindow.document;
    var fullH=iDoc.body.scrollHeight;
    iframe.style.height=fullH+'px';
    iframe.style.visibility='visible';
    await new Promise(function(r){setTimeout(r,100);});

    // Load html2canvas if needed
    if(!window.html2canvas){
      await new Promise(function(resolve,reject){
        var s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload=resolve;s.onerror=reject;
        document.head.appendChild(s);
      });
    }

    var canvas=await html2canvas(iDoc.body,{
      backgroundColor:'#ffffff',
      scale:2,
      useCORS:true,
      logging:false,
      windowWidth:712,
      windowHeight:fullH
    });

    document.body.removeChild(iframe);

    // The PDF path needs the same pixels, so hand the canvas back instead of
    // downloading it rather than rendering the invoice twice.
    if(_returnCanvas)return {canvas:canvas,invNum:invNum};

    var link=document.createElement('a');
    link.download=invNum+'.jpg';
    link.href=canvas.toDataURL('image/jpeg',0.95);
    link.click();
    toast('Saved '+invNum+'.jpg ✓','ok');
  }catch(e){
    // Callers building a PDF need the failure, not a print dialog.
    if(_returnCanvas)throw e;
    toast('JPG failed: '+e.message,'er');
    // fallback: just open print window
    printInvoiceClean();
  }
}

async function dgInvoicePdfBlob(r,num,bal,link,zelle){
  if(!window.jspdf){
    await new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=resolve;s.onerror=function(){reject(new Error('Could not load PDF library'));};
      document.head.appendChild(s);
    });
  }
  if(!window.jspdf||!window.jspdf.jsPDF)throw new Error('PDF library unavailable');
  var _w={invoice_number:num},_bal=bal,_link=(bal>0.01&&link)?link:'',_z=(bal>0.01&&zelle)?zelle:'';
  var pw=595.28;                                  // A4 width in points
  var hpt=r.canvas.height*(pw/r.canvas.width);    // keep the aspect ratio
  // v27.84: when money is owed and QuickBooks gave a pay link, the PDF ends
  // with a real, clickable "Pay online" line.
  var extra=(_z||_link)?(22+(_z?42:0)+(_link?42:0)):0;
  var doc=new window.jspdf.jsPDF({unit:'pt',format:[pw,hpt+extra]});
  doc.addImage(r.canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,pw,hpt);
  var y=hpt+6;
  if(_z||_link){
    doc.setTextColor(17,17,17);doc.setFont('helvetica','bold');doc.setFontSize(11);
    doc.text('HOW TO PAY  \u2014  $'+_bal.toFixed(2)+' due',30,y+10);y+=18;
  }
  if(_z){
    doc.setFillColor(237,231,246);doc.rect(28,y,pw-56,36,'F');
    doc.setTextColor(106,27,154);doc.setFont('helvetica','bold');doc.setFontSize(12);
    doc.text('1)  Zelle (preferred):  '+_z,40,y+15);
    doc.setFont('helvetica','normal');doc.setFontSize(10);
    doc.text('Memo: Invoice '+(_w.invoice_number||''),58,y+29);
    y+=42;
  }
  if(_link){
    doc.setFillColor(232,245,233);doc.rect(28,y,pw-56,36,'F');
    doc.setTextColor(46,125,50);doc.setFont('helvetica','bold');doc.setFontSize(12);
    doc.text((_z?'2)':'1)')+'  Credit card',40,y+15);
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(21,101,192);
    doc.textWithLink('Tap or click here to pay securely online',58,y+29,{url:_link});
    doc.link(28,y,pw-56,36,{url:_link});
  }
  return doc.output('blob');
}
