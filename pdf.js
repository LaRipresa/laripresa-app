import { LAT, LON, COPPER_LIMIT, computeRisk, lv } from "./risk.js";

export function pdfStyles(){
  return `<style>
    *{box-sizing:border-box}body{font-family:Georgia,serif;margin:32px;color:#1C1A17;font-size:11px;line-height:1.5}
    h1{font-size:18px;font-weight:400;border-bottom:1px solid #5C3D1E;padding-bottom:6px;color:#5C3D1E;margin-bottom:4px}
    h2{font-size:13px;font-weight:600;margin:18px 0 4px;color:#1C1A17}
    h3{font-size:11px;font-weight:500;margin:12px 0 3px;color:#5C3D1E}
    .sub{color:#9A8070;font-size:9px;margin:0 0 10px}.totals{font-size:10px;color:#5C3D1E;margin:5px 0}
    table{width:100%;border-collapse:collapse;font-size:9px;margin:6px 0}
    th{background:#1C1A17;color:#F4F0E8;padding:4px 6px;font-weight:400;text-align:left}
    td{border:1px solid #EDE8DE;padding:3px 6px}tr:nth-child(even)td{background:#FAF7F2}
    .empty{text-align:center;color:#C0A882;font-style:italic}
    hr{border:none;border-top:1px solid #EDE8DE;margin:20px 0}
    .obs{padding:4px 8px;background:#FAF7F2;border-left:2px solid #2ABFAA;margin:4px 0;font-size:9px}
    footer{margin-top:24px;font-size:8px;color:#C0A882;border-top:1px solid #EDE8DE;padding-top:6px}
    .badge{display:inline-block;padding:1px 6px;border-radius:2px;font-size:8px;font-weight:500}
  </style>`;
}

export function exportParcelPDF(parc, treatments, observations, lang="fr"){
  const win=window.open("","_blank");
  const ts=treatments.filter(t=>String(t.parcelleId)===String(parc.id)).sort((a,b)=>b.date.localeCompare(a.date));
  const obs=observations.filter(o=>String(o.parcelleId)===String(parc.id)).sort((a,b)=>b.date.localeCompare(a.date));
  const totalCu=ts.reduce((s,t)=>s+(t.cu_applied||0),0);
  const totalS=ts.reduce((s,t)=>s+(t.s_applied||0),0);
  const byYear={};ts.forEach(t=>{const y=String(t.date).slice(0,4);byYear[y]=byYear[y]||{cu:0,s:0};byYear[y].cu+=t.cu_applied||0;byYear[y].s+=t.s_applied||0;});
  const rows=ts.map(t=>`<tr>
    <td>${new Date(t.date).toLocaleDateString("fr-FR")}</td>
    <td>${t.disease}</td><td>${t.productName||t.product}</td>
    <td>${t.dose} ${t.unit||""}/ha</td><td>${t.superficie||1}ha</td>
    <td>${(t.cu_applied||0).toFixed(3)}kg</td><td>${(t.s_applied||0).toFixed(3)}kg</td>
    <td>${t.notes||"–"}</td></tr>`).join("");
  const obsHtml=obs.map(o=>`<div class="obs"><strong>${new Date(o.date).toLocaleDateString("fr-FR")}</strong> · ${o.stage||""}<br/>${o.text}</div>`).join("");
  const parcelCloseBar = `<div style="position:fixed;top:0;left:0;right:0;background:#1C1A17;color:#F4F0E8;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-family:Georgia,serif"><span style="font-size:12px;letter-spacing:2px">${parc.name.toUpperCase()}</span><div style="display:flex;gap:8px"><button onclick="window.print()" style="background:#2ABFAA;color:white;border:none;padding:13px 26px;border-radius:3px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px">⎙ Imprimer / PDF</button><button onclick="window.close()" style="background:#F4F0E8;color:#1C1A17;border:none;padding:13px 26px;border-radius:3px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px">✕ Fermer</button></div></div>`;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${parc.name}</title>${pdfStyles()}<style>body{padding-top:52px}@media print{body{padding-top:0}.no-print{display:none}}</style></head><body>
    <div class="no-print">${parcelCloseBar}</div>
    <h1>${parc.name} — Historique Phytosanitaire & Phénologique</h1>
    <p class="sub">${parc.superficie}ha · ${(parc.cepages||[]).join(", ")||"–"} · Lat ${parc.lat||LAT} · Lon ${parc.lon||LON}<br>
    Généré le ${new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    <h2>Traitements</h2>
    <table><thead><tr><th>Date</th><th>Maladie</th><th>Produit</th><th>Dose</th><th>Surface</th><th>Cu</th><th>S</th><th>Notes</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="8" class="empty">Aucun traitement</td></tr>`}</tbody></table>
    ${Object.keys(byYear).sort().reverse().map(y=>`<p class="totals">${y} — Cu : <strong>${byYear[y].cu.toFixed(3)} kg</strong> · S : <strong>${byYear[y].s.toFixed(3)} kg</strong> · Solde Cu : <strong>${(COPPER_LIMIT*parc.superficie-byYear[y].cu).toFixed(3)} kg</strong></p>`).join("")}
    ${obs.length?`<h2>Observations phénologiques</h2>${obsHtml}`:""}
    <footer>Règlement UE 834/2007 & 2021/2279 · Limite Cu : ${COPPER_LIMIT} kg/ha/an · La Ripresa · Etna DOC</footer>
    </body></html>`);
  win.document.close(); setTimeout(()=>{win.print();},500);
}

export function exportWeeklyPDF(parcelles, treatments, observations, weather, risks, forecast, lang="fr"){
  const win=window.open("","_blank");
  const now=new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const sections=parcelles.map(p=>{
    const ts=treatments.filter(t=>String(t.parcelleId)===String(p.id)).sort((a,b)=>b.date.localeCompare(a.date));
    const last=ts[0]; const yr=String(new Date().getFullYear()); const cu={total:ts.filter(t=>String(t.date).startsWith(yr)).reduce((s,t)=>s+(t.cu_applied||0),0),limit:p.superficie*COPPER_LIMIT};
    const obs=observations.filter(o=>String(o.parcelleId)===String(p.id)&&o.date>=new Date(Date.now()-7*86400000).toISOString().slice(0,10));
    return `<h2>${p.name} — ${p.superficie}ha</h2>
      <p class="sub">${(p.cepages||[]).join(", ")||"–"}</p>
      ${last?`<p><strong>Dernier traitement :</strong> ${new Date(last.date).toLocaleDateString("fr-FR")} / ${last.productName||last.product} · Cu appliqué cette année : ${cu.total.toFixed(3)}/${cu.limit.toFixed(1)} kg</p>`:"<p><em>Aucun traitement</em></p>"}
      ${obs.map(o=>`<div class="obs">${new Date(o.date).toLocaleDateString("fr-FR")} — ${o.stage||""} — ${o.text}</div>`).join("")}`;
  }).join("<hr/>");
  const foreRows=forecast.slice(0,7).map((d,i)=>{
    const fw={temp:(d.tmax+d.tmin)/2,rh:d.rh,rain3d:d.rain*1.5,dewpoint:(d.tmax+d.tmin)/2-5,wind:0};
    const r=computeRisk(fw); const max=r?Math.max(r.peronospora,r.mildew,r.botrytis):0;
    const v=lv(max);
    const lbl=i===0?"Aujourd'hui":i===1?"Demain":new Date(d.date).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric"});
    return `<tr><td>${lbl}</td><td>${d.tmin}°/${d.tmax}°C</td><td>${d.rain>0.5?d.rain+"mm":"—"}</td><td style="color:${v.c}">${v.label}</td></tr>`;
  }).join("");
  const weeklyCloseBar = `<div style="position:fixed;top:0;left:0;right:0;background:#1C1A17;color:#F4F0E8;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-family:Georgia,serif"><span style="font-size:12px;letter-spacing:2px">LA RIPRESA · BILAN HEBDOMADAIRE</span><div style="display:flex;gap:8px"><button onclick="window.print()" style="background:#2ABFAA;color:white;border:none;padding:13px 26px;border-radius:3px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px">⎙ Imprimer / PDF</button><button onclick="window.close()" style="background:#F4F0E8;color:#1C1A17;border:none;padding:13px 26px;border-radius:3px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:1px">✕ Fermer</button></div></div>`;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>La Ripresa — Bilan Hebdomadaire</title>${pdfStyles()}<style>body{padding-top:52px}@media print{body{padding-top:0}.no-print{display:none}}</style></head><body>
    <div class="no-print">${weeklyCloseBar}</div>
    <h1>La Ripresa · Bilan Hebdomadaire</h1>
    <p class="sub">Vignoble Etna · Agriculture Biologique · ${now}</p>
    <h2>Météo & Risques actuels</h2>
    <p>T=${weather?.temp||"–"}°C · HR=${weather?.rh||"–"}% · Pluies 3j=${weather?.rain3d||"–"}mm · Vent=${weather?.wind||"–"}km/h</p>
    <p>Péronospora <strong>${((risks?.peronospora||0)*100).toFixed(0)}%</strong> · Oïdium <strong>${((risks?.mildew||0)*100).toFixed(0)}%</strong> · Botrytis <strong>${((risks?.botrytis||0)*100).toFixed(0)}%</strong></p>
    <h2>Prévisions 7 jours</h2>
    <table><thead><tr><th>Jour</th><th>T°C</th><th>Pluie</th><th>Risque</th></tr></thead><tbody>${foreRows}</tbody></table>
    <h2>État des parcelles</h2>${sections}
    <footer>Rapport généré automatiquement · La Ripresa · Etna DOC · Règlement UE 834/2007</footer>
    </body></html>`);
  win.document.close(); setTimeout(()=>win.print(),500);
}

// ── Treatment list PDF ───────────────────────────────────────────────────────
export function exportAllTreatmentsPDF(parcelles, treatments, season){
  const win = window.open("","_blank");
  if(!win){ alert("Autorisez les popups pour exporter en PDF"); return; }
  const closeBarHtml = `<div style="position:fixed;top:0;left:0;right:0;background:#1C1A17;color:#F4F0E8;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-family:Georgia,serif;box-shadow:0 2px 8px rgba(0,0,0,.3)">
    <span style="font-size:13px;letter-spacing:2px">LA RIPRESA &middot; REGISTRE TRAITEMENTS</span>
    <div style="display:flex;gap:10px">
      <button onclick="window.print()" style="background:#2ABFAA;color:white;border:none;padding:12px 28px;border-radius:4px;font-size:15px;cursor:pointer;font-weight:700;letter-spacing:.5px">&#x2399; Imprimer / PDF</button>
      <button onclick="window.close()" style="background:#F4F0E8;color:#1C1A17;border:none;padding:12px 28px;border-radius:4px;font-size:15px;cursor:pointer;font-weight:700;letter-spacing:.5px">&#x2715; Fermer</button>
    </div>
  </div>`;
  const year = season || new Date().getFullYear();
  treatments = treatments.filter(t=>String(t.date).startsWith(String(year)));
  const sections = parcelles.map(p => {
    const ts = treatments.filter(t=>String(t.parcelleId)===String(p.id)).sort((a,b)=>b.date.localeCompare(a.date));
    if(!ts.length) return "";
    const totalCu = ts.reduce((s,t)=>s+(t.cu_applied||0),0);
    const totalS  = ts.reduce((s,t)=>s+(t.s_applied||0),0);
    const rows = ts.map(t=>`<tr>
      <td>${new Date(t.date).toLocaleDateString("fr-FR")}</td>
      <td>${t.disease}</td>
      <td>${t.productName||t.product||"–"}</td>
      <td>${t.dose||"–"} ${t.unit||""}/ha</td>
      <td>${t.superficie||1} ha</td>
      <td>${(t.cu_applied||0).toFixed(3)} kg</td>
      <td>${(t.s_applied||0).toFixed(3)} kg</td>
      <td>${t.notes||"–"}</td>
    </tr>`).join("");
    return `
      <h2>${p.name} &mdash; ${p.superficie} ha</h2>
      <p class="sub">${(p.cepages||[]).join(", ")||"&ndash;"}</p>
      <table>
        <thead><tr><th>Date</th><th>Maladie</th><th>Produit</th><th>Dose</th><th>Surface</th><th>Cu</th><th>S</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="totals">Cu total&nbsp;: <strong>${totalCu.toFixed(3)} kg</strong> &nbsp;&middot;&nbsp; S total&nbsp;: <strong>${totalS.toFixed(3)} kg</strong> &nbsp;&middot;&nbsp; Solde Cu&nbsp;: <strong>${(COPPER_LIMIT*p.superficie-totalCu).toFixed(3)} kg</strong></p><hr/>`;
  }).filter(Boolean).join("");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>La Ripresa &mdash; Traitements ${year}</title>${pdfStyles()}
    <style>body{padding-top:60px}@media print{.no-print{display:none}body{padding-top:0}}</style>
    </head><body>
    <div class="no-print">${closeBarHtml}</div>
    <h1>La Ripresa &middot; Registre des Traitements ${year}</h1>
    <p class="sub">Vignoble Etna &middot; Agriculture Biologique &middot; ${new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    ${sections||"<p style='color:#aaa;font-style:italic'>Aucun traitement enregistré.</p>"}
    <footer>Règlement UE 834/2007 &amp; 2021/2279 &middot; Limite Cu : 4 kg/ha/an (28 kg/ha sur 7 ans) &middot; La Ripresa &middot; Etna DOC</footer>
    </body></html>`);
  win.document.close();
}

export function exportAIAnalysisPDF(aiText,weather,risks,parcelles){
  const win=window.open("","_blank");
  if(!win){alert("Autorisez les popups");return;}
  const bar=`<div style="position:fixed;top:0;left:0;right:0;background:#1C1A17;color:#F4F0E8;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-family:Georgia,serif">
    <span style="font-size:12px;letter-spacing:2px">LA RIPRESA &middot; RAPPORT AGRONOMIQUE</span>
    <div style="display:flex;gap:10px">
      <button onclick="window.print()" style="background:#2ABFAA;color:white;border:none;padding:11px 24px;border-radius:3px;font-size:14px;font-weight:700;cursor:pointer">&#x2399; Imprimer</button>
      <button onclick="window.close()" style="background:#F4F0E8;color:#1C1A17;border:none;padding:11px 24px;border-radius:3px;font-size:14px;font-weight:700;cursor:pointer">&#x2715; Fermer</button>
    </div></div>`;
  const parcsInfo=parcelles.map(p=>`${p.name} (${p.superficie}ha)`).join(" · ");
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport Agronomique</title>${pdfStyles()}
    <style>body{padding-top:58px}.ai-body{font-size:13px;line-height:1.95;color:#1C1A17;white-space:pre-wrap;margin-top:12px}
    .wg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
    .wc{background:#FAF7F2;border:1px solid #EDE8DE;border-radius:3px;padding:10px;text-align:center}
    .wv{font-size:18px;font-weight:300;color:#5C3D1E}.wl{font-size:9px;color:#9A8070;text-transform:uppercase;letter-spacing:1px;margin-top:2px}
    .rr{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #EDE8DE}
    @media print{.no-print{display:none}body{padding-top:0}}</style></head><body>
    <div class="no-print">${bar}</div>
    <h1>La Ripresa &middot; Rapport Agronomique Expert</h1>
    <p class="sub">${new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p>
    ${parcsInfo?`<p class="sub" style="margin-bottom:14px">Parcelles: ${parcsInfo}</p>`:""}
    ${weather?`<h2>Conditions météo</h2><div class="wg">
      <div class="wc"><div class="wv">${weather.temp}°C</div><div class="wl">Température</div></div>
      <div class="wc"><div class="wv">${weather.rh}%</div><div class="wl">Humidité</div></div>
      <div class="wc"><div class="wv">${weather.rain3d}mm</div><div class="wl">Pluies 3j</div></div>
      <div class="wc"><div class="wv">${weather.wind}km/h</div><div class="wl">Vent</div></div></div>`:""}
    ${risks?`<h2>Niveaux de risque</h2>
      ${[["Péronospora",risks.peronospora,"#4A6E8A"],["Oïdium",risks.mildew,"#A08010"],["Botrytis",risks.botrytis,"#B83232"]].map(([l,s,c])=>`
      <div class="rr"><span style="width:90px;font-size:11px;color:#5C3D1E">${l}</span>
      <div style="flex:1;height:4px;background:#EDE8DE;border-radius:2px"><div style="width:${(s*100).toFixed(0)}%;height:100%;background:${c};border-radius:2px"></div></div>
      <span style="font-size:11px;font-weight:700;color:${c};width:34px;text-align:right">${(s*100).toFixed(0)}%</span></div>`).join("")}`:""}
    <h2>Analyse et Recommandations</h2>
    <div class="ai-body">${aiText||""}</div>
    <footer>La Ripresa &middot; Etna DOC &middot; ${new Date().toLocaleDateString("fr-FR")}</footer></body></html>`);
  win.document.close();
}

// ── Documents ajoutés : journal des travaux, registre des achats ──────────────
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function openDoc(title,barLabel,body,footer){
  const win=window.open("","_blank");
  if(!win){alert("Autorisez les popups pour exporter en PDF");return;}
  const bar=`<div style="position:fixed;top:0;left:0;right:0;background:#1C1A17;color:#F4F0E8;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;z-index:999;font-family:Georgia,serif">
    <span style="font-size:12px;letter-spacing:2px">${esc(barLabel)}</span>
    <div style="display:flex;gap:10px">
      <button onclick="window.print()" style="background:#2ABFAA;color:white;border:none;padding:11px 24px;border-radius:3px;font-size:14px;font-weight:700;cursor:pointer">&#x2399; Imprimer / PDF</button>
      <button onclick="window.close()" style="background:#F4F0E8;color:#1C1A17;border:none;padding:11px 24px;border-radius:3px;font-size:14px;font-weight:700;cursor:pointer">&#x2715; Fermer</button>
    </div></div>`;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${pdfStyles()}
    <style>body{padding-top:60px}td.r,th.r{text-align:right}@media print{.no-print{display:none}body{padding-top:0}}</style></head><body>
    <div class="no-print">${bar}</div>${body}<footer>${footer}</footer></body></html>`);
  win.document.close();
}
const dfr=(d,lang)=>new Date(d).toLocaleDateString(lang==="it"?"it-IT":lang==="en"?"en-GB":"fr-FR");

export function exportWorksPDF({season,works,parcelles,projects,T,lang}){
  const pn=id=>parcelles.find(p=>String(p.id)===String(id))?.name||T("whole_estate");
  const ph=w=>(Number(w.hours)||0)*(Number(w.workers)||1);
  const total=works.reduce((s,w)=>s+ph(w),0);
  const types=[...new Set(works.map(w=>w.type))].map(k=>[k,works.filter(w=>w.type===k).reduce((s,w)=>s+ph(w),0)]).sort((a,b)=>b[1]-a[1]);
  const rows=[...works].sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(w=>`<tr><td>${dfr(w.date,lang)}</td><td>${esc(pn(w.parcelleId))}</td><td>${esc(T("wt_"+w.type))}</td><td class="r">${w.hours||"–"}</td><td class="r">${w.workers||1}</td><td class="r">${ph(w)?ph(w).toFixed(1):"–"}</td><td>${esc(projects.find(p=>String(p.id)===String(w.projectId))?.name||"")}</td><td>${esc(w.notes||"")}</td></tr>`).join("");
  openDoc(`La Ripresa — ${T("journal")} ${season}`,`LA RIPRESA · ${T("journal").toUpperCase()}`,
    `<h1>La Ripresa &middot; ${esc(T("journal"))} ${season}</h1>
     <p class="sub">${esc(T("generated_on"))} ${dfr(new Date(),lang)} &middot; ${works.length} ${esc(T("entries"))} &middot; ${total.toFixed(1)} ${esc(T("person_hours"))}</p>
     <h2>${esc(T("work_summary"))}</h2>
     <table><thead><tr><th>${esc(T("work_type"))}</th><th class="r">${esc(T("person_hours"))}</th></tr></thead><tbody>${types.map(([k,v])=>`<tr><td>${esc(T("wt_"+k))}</td><td class="r">${v.toFixed(1)}</td></tr>`).join("")||`<tr><td colspan="2" class="empty">–</td></tr>`}</tbody></table>
     <h2>${esc(T("journal"))}</h2>
     <table><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("parcel"))}</th><th>${esc(T("work_type"))}</th><th class="r">h</th><th class="r">${esc(T("workers"))}</th><th class="r">${esc(T("person_hours"))}</th><th>${esc(T("linked_project"))}</th><th>${esc(T("notes"))}</th></tr></thead>
     <tbody>${rows||`<tr><td colspan="8" class="empty">–</td></tr>`}</tbody></table>`,
    `La Ripresa &middot; Etna DOC &middot; ${dfr(new Date(),lang)}`);
}

export function exportPurchasesPDF({season,invoices,rows,stock,T,lang}){
  const total=invoices.reduce((s,i)=>s+(Number(i.total)||(i.lines||[]).reduce((a,l)=>a+(Number(l.qty)||0)*(Number(l.unitPrice)||0),0)),0);
  const body=rows.map(r=>`<tr><td>${dfr(r.date,lang)}</td><td>${esc(r.supplier)}</td><td>${esc(r.number)}</td><td>${esc(r.product)}</td><td class="r">${r.qty} ${esc(r.unit)}</td><td class="r">${r.unitPrice?Number(r.unitPrice).toFixed(2):"–"}</td><td class="r">${r.amount?r.amount.toFixed(2):"–"}</td><td>${esc(r.lot||"")}</td><td>${r.expiry?dfr(r.expiry,lang):""}</td></tr>`).join("");
  const st=stock.map(({p,s})=>`<tr><td>${esc(p.name)}</td><td class="r">${s.qty} ${esc(p.unit)}</td><td>${s.base?dfr(s.base.date,lang):"–"}</td><td>${s.lastIn?dfr(s.lastIn,lang):"–"}</td></tr>`).join("");
  openDoc(`La Ripresa — ${T("purchase_register")} ${season}`,`LA RIPRESA · ${T("purchase_register").toUpperCase()}`,
    `<h1>La Ripresa &middot; ${esc(T("purchase_register"))} ${season}</h1>
     <p class="sub">${esc(T("generated_on"))} ${dfr(new Date(),lang)} &middot; ${invoices.length} ${esc(T("invoices").toLowerCase())} &middot; ${total.toFixed(2)} € TTC</p>
     <table><thead><tr><th>${esc(T("date"))}</th><th>${esc(T("supplier"))}</th><th>${esc(T("invoice_no"))}</th><th>${esc(T("product"))}</th><th class="r">${esc(T("qty_total"))}</th><th class="r">€ HT/u</th><th class="r">€ HT</th><th>${esc(T("lot"))}</th><th>${esc(T("expiry"))}</th></tr></thead>
     <tbody>${body||`<tr><td colspan="9" class="empty">–</td></tr>`}</tbody></table>
     ${st?`<h2>${esc(T("stock_on"))} ${dfr(new Date(),lang)}</h2><table><thead><tr><th>${esc(T("product"))}</th><th class="r">${esc(T("stock"))}</th><th>${esc(T("inventory"))}</th><th>${esc(T("last_purchase"))}</th></tr></thead><tbody>${st}</tbody></table>`:""}`,
    `R&egrave;glement (UE) 2018/848 &middot; La Ripresa &middot; Etna DOC &middot; ${dfr(new Date(),lang)}`);
}
