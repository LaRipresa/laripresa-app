// Stock des produits : entrées par facture, sorties par traitement, recalage par inventaire
const prodOf = t => String(t.productId || t.product || "");

export function stockOf(product, invoices = [], treatments = [], counts = []) {
  const pid = String(product.id);
  const myCounts = counts.filter(c => String(c.productId) === pid).sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.id - a.id));
  const base = myCounts[0] || null;
  const ins = [];
  for (const inv of invoices) for (const l of inv.lines || []) if (String(l.productId) === pid && Number(l.qty) > 0) ins.push({ kind: "in", date: inv.date, qty: Number(l.qty), ref: inv.number || inv.supplier || "", lot: l.lot || "", invoiceId: inv.id });
  const firstIn = ins.map(i => i.date).sort()[0] || null;
  if (!base && !firstIn) return { tracked: false, qty: null, moves: [], base: null, low: false };
  const from = base ? base.date : null;
  const outs = treatments.filter(t => prodOf(t) === pid && Number(t.dose) > 0)
    .filter(t => (from ? t.date > from : t.date >= firstIn))
    .map(t => ({ kind: "out", date: t.date, qty: Number(t.dose) * (Number(t.superficie) || 1), ref: String(t.parcelleId), treatmentId: t.id }));
  const kept = ins.filter(i => !from || i.date > from);
  const qty = (base ? Number(base.qty) || 0 : 0) + kept.reduce((s, m) => s + m.qty, 0) - outs.reduce((s, m) => s + m.qty, 0);
  const moves = [...kept, ...outs, ...(base ? [{ kind: "count", date: base.date, qty: Number(base.qty) || 0 }] : [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const min = Number(product.minStock) || 0;
  const r = Math.round(qty * 1000) / 1000;
  return { tracked: true, qty: r, moves, base, low: min > 0 ? r <= min : r <= 0, lastIn: ins.map(i => i.date).sort().pop() || null };
}

export const lowStock = (products, invoices, treatments, counts) => products.map(p => ({ p, s: stockOf(p, invoices, treatments, counts) })).filter(x => x.s.tracked && x.s.low);

export const invoiceTotal = inv => Number(inv.total) || (inv.lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);

// Rapprochement d'un libellé de facture avec un produit connu
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function matchProduct(label, products) {
  const n = norm(label); if (!n) return null;
  let best = null, score = 0;
  for (const p of products) {
    const pn = norm(p.name); if (!pn) continue;
    let s = 0;
    if (n.includes(pn) || pn.includes(n)) s = pn.length;
    else { const w = pn.split(" ").filter(x => x.length > 3 && n.includes(x)); s = w.join("").length * 0.6; }
    if (s > score) { score = s; best = p; }
  }
  return score >= 4 ? best : null;
}
