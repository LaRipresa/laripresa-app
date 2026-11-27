// Factures de produits phytosanitaires : lecture par IA, stock, registre exportable
import { useState, useRef } from "react";
import { css, TEAL, TEAL_D, INK, PARCH, STONE, MID, WARM } from "./theme.js";
import { Col, Box, Info, F, TxtBtn, PriBtn, SecBtn, Seg, SeasonPick, Row, fmtDate, yearsOf } from "./ui.jsx";
import { api, isDeployed, uid, downloadFile } from "./store.js";
import { stockOf, invoiceTotal, matchProduct } from "./stock.js";
import { exportPurchasesPDF } from "./pdf.js";

const today = () => new Date().toISOString().slice(0, 10);
const q3 = n => (Math.round(n * 1000) / 1000).toString();
const eur = n => (Number(n) || 0).toFixed(2) + " €";

// Réduit une photo avant envoi (lisible par l'IA, légère à stocker)
export function shrinkImage(file, max = 1500, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
const readDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export function invoicePrompt(products) {
  return `Tu lis une facture ou un bon de livraison d'un fournisseur agricole (Italie ou France) pour un vignoble biologique.
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{"supplier":"","number":"","date":"AAAA-MM-JJ","total":0,"currency":"EUR","lines":[{"label":"","productId":null,"qty":0,"unit":"L","unitPrice":0,"lot":"","expiry":"","cu_g_per_unit":null,"s_g_per_unit":null,"phyto":true}]}
Règles :
- "total" = montant TTC de la facture.
- Une ligne par produit. "qty" = quantité TOTALE dans l'unité "L" ou "kg" (nombre de conditionnements × contenance ; ex. 2 bidons de 5 L → 10). Si l'article n'est ni un liquide ni un poids, unit = "pz" et qty = nombre de pièces.
- "unitPrice" = prix HT par L ou par kg (montant HT de la ligne ÷ qty).
- "lot" et "expiry" (AAAA-MM-JJ) seulement s'ils sont écrits, sinon "".
- "phyto" = true pour un produit de protection des plantes ou un fertilisant, false pour le reste (matériel, transport…).
- "cu_g_per_unit" / "s_g_per_unit" = grammes de cuivre métal / de soufre par L ou kg UNIQUEMENT si la teneur est écrite sur le document, sinon null.
- "productId" = l'identifiant du produit connu correspondant, sinon null. Produits connus : ${products.map(p => `${p.id} = ${p.name}`).join(" ; ") || "aucun"}.
- N'invente rien : champ illisible → "" ou 0.`;
}
export function parseInvoiceJSON(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/); if (!m) throw new Error("format");
  const d = JSON.parse(m[0]);
  return { supplier: String(d.supplier || ""), number: String(d.number || ""), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : "", total: Number(d.total) || 0, lines: Array.isArray(d.lines) ? d.lines : [] };
}

export default function Achats({ T, lang, parcelles, products, setProducts, treatments, invoices, setInvoices, stockCounts, setStockCounts, season, setSeason, notify }) {
  const [view, setView] = useState("invoices");
  const years = yearsOf(invoices, treatments);
  return (<Col>
    <Seg value={view} onChange={setView} options={[["invoices", T("invoices")], ["stock", T("stock")], ["register", T("register")]]} />
    {view === "invoices" && <Factures {...{ T, lang, products, setProducts, invoices, setInvoices, season, setSeason, years, notify }} />}
    {view === "stock" && <Stock {...{ T, lang, parcelles, products, setProducts, treatments, invoices, stockCounts, setStockCounts, notify }} />}
    {view === "register" && <Registre {...{ T, lang, products, treatments, invoices, stockCounts, season, setSeason, years }} />}
  </Col>);
}

const blankLine = () => ({ id: uid(), label: "", productId: "", qty: "", unit: "L", unitPrice: "", lot: "", expiry: "", cu: "", s: "" });

function Factures({ T, lang, products, setProducts, invoices, setInvoices, season, setSeason, years, notify }) {
  const [form, setForm] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [open, setOpen] = useState(null);
  const docRef = useRef(null), fileRef = useRef(null);
  const deployed = isDeployed();
  const list = invoices.filter(i => String(i.date).startsWith(String(season)));
  const setLine = (id, patch) => setForm(f => ({ ...f, lines: f.lines.map(l => l.id === id ? { ...l, ...patch } : l) }));

  const startManual = () => { docRef.current = null; setErr(""); setForm({ supplier: "", number: "", date: today(), total: "", notes: "", lines: [blankLine()] }); };
  const onFile = async e => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setErr(""); setBusy(true);
    try {
      const isPdf = file.type === "application/pdf";
      if (isPdf && file.size > 2_800_000) throw new Error(T("file_too_big"));
      const dataUrl = isPdf ? await readDataUrl(file) : await shrinkImage(file);
      const b64 = dataUrl.split(",")[1];
      docRef.current = isPdf ? (dataUrl.length < 1_100_000 ? dataUrl : null) : await shrinkImage(file, 1200, 0.6);
      const block = isPdf ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } };
      const out = await api("/api/analyze", { method: "POST", body: { max_tokens: 2000, messages: [{ role: "user", content: [block, { type: "text", text: invoicePrompt(products) }] }] } });
      const d = parseInvoiceJSON(out.content?.find(b => b.type === "text")?.text);
      setForm({ supplier: d.supplier, number: d.number, date: d.date || today(), total: d.total ? String(d.total) : "", notes: "", scanned: true,
        lines: (d.lines.length ? d.lines : [{}]).map(l => {
          const known = products.find(p => String(p.id) === String(l.productId)) || matchProduct(l.label, products);
          return { id: uid(), label: String(l.label || ""), productId: known ? String(known.id) : (l.phyto === false ? "none" : "new"), qty: l.qty ? String(l.qty) : "", unit: known ? known.unit : (["L", "kg", "pz"].includes(l.unit) ? l.unit : "L"),
            unitPrice: l.unitPrice ? String(l.unitPrice) : "", lot: String(l.lot || ""), expiry: /^\d{4}-\d{2}-\d{2}$/.test(l.expiry) ? l.expiry : "", cu: l.cu_g_per_unit ? String(l.cu_g_per_unit) : "", s: l.s_g_per_unit ? String(l.s_g_per_unit) : "" };
        }) });
    } catch (e2) {
      setErr(T("scan_failed") + (e2.message && e2.message !== "format" ? ` (${e2.message})` : ""));
      if (!form) setForm({ supplier: "", number: "", date: today(), total: "", notes: "", lines: [blankLine()] });
    }
    setBusy(false);
  };

  const save = async () => {
    if (!form.supplier.trim() && !form.number.trim()) { setErr(T("invoice_need")); return; }
    const id = uid(), created = [];
    const lines = form.lines.filter(l => l.label.trim() || l.productId).map(l => {
      let productId = l.productId;
      if (productId === "new") {
        if (!l.label.trim()) { productId = "none"; }
        else { const p = { id: "custom_" + uid(), name: l.label.trim().slice(0, 60), unit: l.unit === "kg" ? "kg" : "L", cu: (parseFloat(l.cu) || 0) / 1000, s: (parseFloat(l.s) || 0) / 1000, col: TEAL, editable: true }; created.push(p); productId = p.id; }
      }
      return { id: l.id, label: l.label.trim(), productId: productId === "none" ? "" : productId, qty: parseFloat(l.qty) || 0, unit: l.unit, unitPrice: parseFloat(l.unitPrice) || 0, lot: l.lot.trim(), expiry: l.expiry };
    });
    let hasDoc = false;
    if (docRef.current && deployed) { try { await api("/api/docs?id=" + id, { method: "POST", body: { dataUrl: docRef.current } }); hasDoc = true; } catch { notify(T("doc_not_saved")); } }
    if (created.length) setProducts(prev => [...prev, ...created]);
    setInvoices(prev => [...prev, { id, date: form.date || today(), supplier: form.supplier.trim(), number: form.number.trim(), total: parseFloat(form.total) || 0, notes: form.notes || "", lines, hasDoc }].sort((a, b) => String(b.date).localeCompare(String(a.date))));
    setSeason(parseInt((form.date || today()).slice(0, 4)));
    docRef.current = null; setForm(null); setErr(""); notify(T("invoice_saved"));
  };
  const remove = async inv => {
    if (!window.confirm(T("confirm_delete"))) return;
    setInvoices(prev => prev.filter(x => x.id !== inv.id));
    if (inv.hasDoc && deployed) api("/api/docs?id=" + inv.id, { method: "DELETE" }).catch(() => {});
  };
  const showDoc = async inv => {
    const w = window.open("", "_blank");
    try {
      const d = await api("/api/docs?id=" + inv.id);
      if (!w) return;
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${inv.supplier} ${inv.number}</title></head><body style="margin:0;background:#1C1A17">${d.dataUrl.startsWith("data:application/pdf") ? `<iframe src="${d.dataUrl}" style="border:0;width:100vw;height:100vh"></iframe>` : `<img src="${d.dataUrl}" style="max-width:100%;display:block;margin:0 auto"/>`}</body></html>`);
      w.document.close();
    } catch { w?.close(); notify(T("doc_missing")); }
  };

  return (<>
    <SeasonPick value={season} onChange={setSeason} years={years} label={T("season")} />
    <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: "none" }} />
    {!form && (<div style={{ display: "flex", gap: 8 }}>
      <PriBtn disabled={busy || !deployed} onClick={() => fileRef.current?.click()}>{busy ? T("scanning") : T("scan_invoice")}</PriBtn>
      <SecBtn onClick={startManual}>{T("manual_entry")}</SecBtn>
    </div>)}
    {!deployed && !form && <Info>{T("scan_needs_cloud")}</Info>}
    {err && <Info warn>{err}</Info>}

    {form && (<Box title={form.scanned ? T("check_invoice") : T("new_invoice")} sub={form.scanned ? T("check_invoice_sub") : null}><Col>
      <F label={T("supplier")}><input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} style={css.inp} /></F>
      <Row>
        <F label={T("invoice_no")}><input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} style={css.inp} /></F>
        <F label={T("date")}><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={css.dateInp} /></F>
      </Row>
      <F label={T("total_ttc")}><input type="number" inputMode="decimal" step="0.01" value={form.total} onChange={e => setForm(f => ({ ...f, total: e.target.value }))} style={css.inp} /></F>
      {form.lines.map((l, i) => (<div key={l.id} style={{ ...css.calcBox, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={css.fieldLabel}>{T("line")} {i + 1}</span>{form.lines.length > 1 && <button style={css.del} onClick={() => setForm(f => ({ ...f, lines: f.lines.filter(x => x.id !== l.id) }))}>{T("delete")}</button>}</div>
        <F label={T("label_on_invoice")}><input value={l.label} onChange={e => setLine(l.id, { label: e.target.value })} style={css.inp} /></F>
        <F label={T("product")}><select value={l.productId} onChange={e => { const p = products.find(x => String(x.id) === e.target.value); setLine(l.id, { productId: e.target.value, ...(p ? { unit: p.unit } : {}) }); }} style={css.inp}>
          <option value="">{T("choose")}</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
          <option value="new">{T("create_product")}</option><option value="none">{T("not_stocked")}</option></select></F>
        <Row>
          <F label={T("qty_total")}><input type="number" inputMode="decimal" step="0.1" value={l.qty} onChange={e => setLine(l.id, { qty: e.target.value })} style={css.inp} /></F>
          <F label={T("unit")}><select value={l.unit} onChange={e => setLine(l.id, { unit: e.target.value })} style={css.inp} disabled={!!products.find(x => String(x.id) === l.productId)}><option>L</option><option>kg</option><option>pz</option></select></F>
          <F label={`€ HT / ${l.unit}`}><input type="number" inputMode="decimal" step="0.01" value={l.unitPrice} onChange={e => setLine(l.id, { unitPrice: e.target.value })} style={css.inp} /></F>
        </Row>
        <Row>
          <F label={T("lot")}><input value={l.lot} onChange={e => setLine(l.id, { lot: e.target.value })} style={css.inp} /></F>
          <F label={T("expiry")}><input type="date" value={l.expiry} onChange={e => setLine(l.id, { expiry: e.target.value })} style={css.dateInp} /></F>
        </Row>
        {l.productId === "new" && (<Row>
          <F label={`Cu (g/${l.unit})`}><input type="number" inputMode="decimal" value={l.cu} onChange={e => setLine(l.id, { cu: e.target.value })} style={css.inp} placeholder="0" /></F>
          <F label={`S (g/${l.unit})`}><input type="number" inputMode="decimal" value={l.s} onChange={e => setLine(l.id, { s: e.target.value })} style={css.inp} placeholder="0" /></F>
        </Row>)}
      </div>))}
      <TxtBtn onClick={() => setForm(f => ({ ...f, lines: [...f.lines, blankLine()] }))}>{T("add_line")}</TxtBtn>
      <F label={T("notes")}><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={css.inp} /></F>
      <PriBtn onClick={save}>{T("save")}</PriBtn>
      <SecBtn onClick={() => { setForm(null); setErr(""); docRef.current = null; }}>{T("cancel")}</SecBtn>
    </Col></Box>)}

    {list.length > 0 && <div style={{ fontSize: 11, color: MID, textAlign: "right" }}>{list.length} {T("invoices").toLowerCase()} · {eur(list.reduce((s, i) => s + invoiceTotal(i), 0))}</div>}
    {list.map(inv => { const isO = open === inv.id; return (<Box key={inv.id} title={fmtDate(inv.date, lang)} sub={inv.supplier || "—"} action={<span style={{ fontSize: 12, color: WARM, fontFamily: "DM Serif Display,serif" }}>{eur(invoiceTotal(inv))}</span>}>
      <div style={{ fontSize: 10, color: MID }}>{inv.number ? `N° ${inv.number} · ` : ""}{(inv.lines || []).length} {T("lines").toLowerCase()}{inv.hasDoc ? " · 📎" : ""}</div>
      <button onClick={() => setOpen(isO ? null : inv.id)} style={css.toggleBtn}>{isO ? "▲ " + T("close") : "▼ " + T("details")}</button>
      {isO && (<div style={{ borderTop: `1px solid ${STONE}`, paddingTop: 6 }}>
        {(inv.lines || []).map(l => (<div key={l.id} style={{ padding: "5px 0", borderBottom: `1px solid ${STONE}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: INK }}><span style={{ minWidth: 0 }}>{products.find(p => String(p.id) === String(l.productId))?.name || l.label}</span><span style={{ flexShrink: 0, color: WARM }}>{q3(l.qty)} {l.unit}</span></div>
          <div style={{ fontSize: 9, color: MID }}>{l.unitPrice ? `${eur(l.unitPrice)}/${l.unit}` : ""}{l.lot ? ` · ${T("lot")} ${l.lot}` : ""}{l.expiry ? ` · ${T("expiry").toLowerCase()} ${fmtDate(l.expiry, lang)}` : ""}{!l.productId ? ` · ${T("not_stocked").toLowerCase()}` : ""}</div>
        </div>))}
        {inv.notes && <div style={{ fontSize: 10, color: MID, fontStyle: "italic", marginTop: 4 }}>{inv.notes}</div>}
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          {inv.hasDoc && <button style={{ ...css.del, color: TEAL_D }} onClick={() => showDoc(inv)}>{T("view_doc")}</button>}
          <button style={css.del} onClick={() => remove(inv)}>{T("delete")}</button>
        </div>
      </div>)}
    </Box>); })}
    {!list.length && !form && <Info>{T("no_invoice")}</Info>}
  </>);
}

function Stock({ T, lang, parcelles, products, setProducts, treatments, invoices, stockCounts, setStockCounts, notify }) {
  const [open, setOpen] = useState(null), [count, setCount] = useState({}), [min, setMin] = useState({});
  const pName = id => parcelles.find(p => String(p.id) === String(id))?.name || "—";
  return (<>
    <Info>{T("stock_help")}</Info>
    {products.map(p => {
      const s = stockOf(p, invoices, treatments, stockCounts), isO = open === p.id;
      return (<Box key={p.id} title={p.name} sub={s.tracked ? `${q3(s.qty)} ${p.unit}` : T("not_tracked")}
        action={s.tracked && s.low ? <span style={{ ...css.pill, background: "rgba(184,50,50,.1)", color: "#B83232" }}>{s.qty < 0 ? T("stock_negative") : T("stock_low")}</span> : null}>
        <div style={{ fontSize: 10, color: MID }}>
          {s.base ? `${T("inventory")} ${fmtDate(s.base.date, lang)} : ${q3(s.base.qty)} ${p.unit}` : s.tracked ? T("since_first_invoice") : T("stock_start_hint")}
          {p.minStock ? ` · ${T("threshold")} ${p.minStock} ${p.unit}` : ""}
        </div>
        <button onClick={() => setOpen(isO ? null : p.id)} style={css.toggleBtn}>{isO ? "▲ " + T("close") : "▼ " + T("details")}</button>
        {isO && (<div style={{ borderTop: `1px solid ${STONE}`, paddingTop: 8 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 0 }}><F label={`${T("counted_qty")} (${p.unit})`}><input type="number" inputMode="decimal" step="0.1" value={count[p.id] ?? ""} onChange={e => setCount(c => ({ ...c, [p.id]: e.target.value }))} style={css.inp} /></F></div>
            <button style={{ ...css.sec, padding: "10px 12px" }} onClick={() => { const v = parseFloat(count[p.id]); if (!Number.isFinite(v) || v < 0) return; setStockCounts(prev => [...prev, { id: uid(), productId: p.id, date: today(), qty: v }]); setCount(c => ({ ...c, [p.id]: "" })); notify(T("inventory_saved")); }}>{T("inventory")}</button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><F label={`${T("threshold")} (${p.unit})`}><input type="number" inputMode="decimal" step="0.1" value={min[p.id] ?? (p.minStock ?? "")} onChange={e => setMin(c => ({ ...c, [p.id]: e.target.value }))} style={css.inp} /></F></div>
            <button style={{ ...css.sec, padding: "10px 12px" }} onClick={() => { const v = parseFloat(min[p.id]); setProducts(prev => prev.map(x => x.id === p.id ? { ...x, minStock: Number.isFinite(v) && v > 0 ? v : 0 } : x)); notify(T("saved")); }}>OK</button>
          </div>
          {s.moves.length > 0 && <div style={{ ...css.fieldLabel, marginTop: 12 }}>{T("movements")}</div>}
          {s.moves.slice(0, 40).map((m, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${STONE}` }}>
            <span style={{ color: MID, flexShrink: 0 }}>{fmtDate(m.date, lang)}</span>
            <span style={{ flex: 1, minWidth: 0, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.kind === "in" ? `${T("purchase")} ${m.ref}` : m.kind === "out" ? `${T("treatment")} · ${pName(m.ref)}` : T("inventory")}</span>
            <span style={{ flexShrink: 0, color: m.kind === "out" ? "#B83232" : m.kind === "in" ? TEAL_D : WARM }}>{m.kind === "out" ? "−" : m.kind === "in" ? "+" : "="}{q3(m.qty)}</span>
          </div>))}
        </div>)}
      </Box>);
    })}
  </>);
}

export function purchaseRows(invoices, products) {
  const rows = [];
  for (const inv of [...invoices].sort((a, b) => String(a.date).localeCompare(String(b.date)))) for (const l of inv.lines || [])
    rows.push({ date: inv.date, supplier: inv.supplier, number: inv.number, product: products.find(p => String(p.id) === String(l.productId))?.name || l.label, label: l.label, qty: l.qty, unit: l.unit, unitPrice: l.unitPrice, amount: (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), lot: l.lot, expiry: l.expiry, stocked: !!l.productId });
  return rows;
}
const csvCell = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function Registre({ T, lang, products, treatments, invoices, stockCounts, season, setSeason, years }) {
  const list = invoices.filter(i => String(i.date).startsWith(String(season)));
  const rows = purchaseRows(list, products);
  const stock = products.map(p => ({ p, s: stockOf(p, invoices, treatments, stockCounts) })).filter(x => x.s.tracked);
  const csv = () => {
    const head = [T("date"), T("supplier"), T("invoice_no"), T("product"), T("label_on_invoice"), T("qty_total"), T("unit"), "EUR HT/" + T("unit"), "EUR HT", T("lot"), T("expiry")];
    const num = n => String(n ?? "").replace(".", ",");
    const body = rows.map(r => [r.date, r.supplier, r.number, r.product, r.label, num(r.qty), r.unit, num(r.unitPrice), num(r.amount.toFixed(2)), r.lot, r.expiry]);
    downloadFile(`la-ripresa-achats-${season}.csv`, "﻿" + [head, ...body].map(l => l.map(csvCell).join(";")).join("\r\n"), "text/csv;charset=utf-8");
  };
  return (<>
    <SeasonPick value={season} onChange={setSeason} years={years} label={T("season")} />
    <div style={{ display: "flex", gap: 8 }}>
      <PriBtn disabled={!rows.length} onClick={() => exportPurchasesPDF({ season, invoices: list, rows, stock, T, lang })}>{T("export_pdf")}</PriBtn>
      <SecBtn onClick={csv}>CSV</SecBtn>
    </div>
    <Box title={T("purchase_register")} sub={`${rows.length} ${T("lines").toLowerCase()} · ${eur(list.reduce((s, i) => s + invoiceTotal(i), 0))}`}>
      {rows.map((r, i) => (<div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${STONE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: INK }}><span style={{ minWidth: 0 }}>{r.product}</span><span style={{ flexShrink: 0, color: WARM }}>{q3(r.qty)} {r.unit}</span></div>
        <div style={{ fontSize: 9, color: MID }}>{fmtDate(r.date, lang)} · {r.supplier || "—"}{r.number ? ` · N° ${r.number}` : ""}{r.lot ? ` · ${T("lot")} ${r.lot}` : ""}</div>
      </div>))}
      {!rows.length && <div style={{ fontSize: 11, color: MID, fontStyle: "italic" }}>{T("no_invoice")}</div>}
    </Box>
  </>);
}
