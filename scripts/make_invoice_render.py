# Regenerates invoice-render.js from index.html (run from the repo root: python3 scripts/make_invoice_render.py).
# Copies the app's own invoice layout, picture and PDF code so the customer portal draws the same invoice.
import re
s=open('index.html',encoding='utf-8').read()
def grab(sig):
    i=s.index(sig); j=s.index('{',i); d=0
    for k in range(j,len(s)):
        if s[k]=='{': d+=1
        elif s[k]=='}':
            d-=1
            if d==0: return s[i:k+1]
    raise Exception(sig)
helpers=[grab('function '+n+'(') for n in ['laborAmt','esc','_isStructuredRepair','_fmtLaborDesc','_isSaleKey','_saleDefLabel','getInvDate','getInvDateFmt','buildPmtRow']]
# invoice layout block from openInvoice
o=s.index('async function openInvoice(')
a=s.index("    const c = cMap[w.customer_id] || {};",o)
b=s.index("    document.getElementById('invViewBody').innerHTML = html;",o)
blk=s[a:b]
blk=blk.replace("    const c = cMap[w.customer_id] || {};\n","",1)
f0=blk.index("    let assignedInvNum = w.invoice_number;")
f1=blk.index("    const invNum =")
blk=blk[:f0]+"    let assignedInvNum = w.invoice_number;\n"+blk[f1:]
assert 'await ' not in blk and 'cMap' not in blk and 'wos' not in blk, [x for x in ['await ','cMap','wos'] if x in blk]
layout="function dgInvoiceHtml(w,c,eMap,pmts){\n  var id=w.id;\n"+blk+"  return {html:html,invNum:invNum,total:total,balance:balance};\n}"
# image pipeline from saveInvoiceAsImage
img=grab('async function saveInvoiceAsImage(')
img=img.replace("async function saveInvoiceAsImage(woId,_returnCanvas,_silent){","async function dgInvoiceCanvas(inner,invNum){\n  var _returnCanvas=true,_silent=true;",1)
i0=img.index("    var content=document.getElementById('invViewBody');")
i1=img.index("    var inner=content.innerHTML;")
img=img[:i0]+img[i1+len("    var inner=content.innerHTML;"):]
assert 'invViewBody' not in img and 'wos' not in img
# PDF composition from invoicePdfBase64
pdf=grab('async function invoicePdfBase64(')
p0=pdf.index("  var pw=595.28;"); p1=pdf.index("  var uri=doc.output('datauristring');")
body=pdf[p0:p1]
c0=body.index("  var _w=(wos||[])"); c1=body.index("  var extra=")
body=body[:c0]+body[c1:]
loadjs=pdf[pdf.index("  if(!window.jspdf){"):pdf.index("  var pw=595.28;")]
pdffn=("async function dgInvoicePdfBlob(r,num,bal,link,zelle){\n"+loadjs+
  "  var _w={invoice_number:num},_bal=bal,_link=(bal>0.01&&link)?link:'',_z=(bal>0.01&&zelle)?zelle:'';\n"+body+
  "  return doc.output('blob');\n}")
out=("// invoice-render.js — the shop app's own invoice, for the customer portal.\n"
"// GENERATED from index.html by copying, unchanged, the app's invoice layout\n"
"// (openInvoice), its picture step (saveInvoiceAsImage) and its PDF step\n"
"// (invoicePdfBase64), so a portal download is the same invoice the shop\n"
"// saves and sends. If the invoice layout in index.html changes, regenerate\n"
"// this file (see scripts in the PR) rather than editing it by hand.\n\n"
+"\n".join(helpers)+"\n\n"+layout+"\n\n"+img+"\n\n"+pdffn+"\n")
open('invoice-render.js','w',encoding='utf-8').write(out)
print(len(out))
