// Stockage local, session, appels API et fusion des données entre appareils
export const K = "laripresa_v6";            // même clé qu'avant : les données existantes sont reprises telles quelles
export const SESSION_KEY = "laripresa_session";
export const SCHEMA = 7;

// Listes d'enregistrements (chacun avec un id) et valeurs simples synchronisées
export const COLLS = ["parcelles", "treatments", "absences", "observations", "products", "works", "projects", "tasks", "invoices", "stockCounts", "stations"];
export const SCALARS = ["user", "lang", "settings"];

export function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
export function setSession(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch {} }
export const loadStore = () => { try { return JSON.parse(localStorage.getItem(K) || "{}") || {}; } catch { return {}; } };
export const saveStore = d => { try { localStorage.setItem(K, JSON.stringify(d)); return true; } catch { return false; } };

// L'app déployée (Vercel) dispose des fonctions /api ; en local ou en aperçu, tout reste sur l'appareil.
export const isDeployed = () => { const h = window.location.hostname; return h !== "null" && h !== "" && h !== "localhost" && h !== "127.0.0.1" && !h.includes("claude.ai"); };

export async function api(path, { method = "GET", body, session } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const s = session === undefined ? getSession() : session;
  if (s?.token) headers["x-session-token"] = s.token;
  const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(d?.error?.message || d?.error || "HTTP " + r.status); e.status = r.status; e.data = d; throw e; }
  return d;
}
export const apiAuth = body => api("/api/auth", { method: "POST", body, session: null });

// ── Suivi des modifications ───────────────────────────────────────────────────
// meta[liste][id] = date de dernière modification ; tomb[liste][id] = date de suppression
export const emptyMarks = () => ({ meta: Object.fromEntries(COLLS.map(c => [c, {}])), tomb: Object.fromEntries(COLLS.map(c => [c, {}])), scalarU: {} });
export function marksOf(d) {
  const m = emptyMarks();
  for (const c of COLLS) { Object.assign(m.meta[c], d?.meta?.[c] || {}); Object.assign(m.tomb[c], d?.tomb?.[c] || {}); }
  Object.assign(m.scalarU, d?.scalarU || {});
  return m;
}
export function indexOf(data) {
  const idx = {};
  for (const c of COLLS) { idx[c] = {}; for (const r of data[c] || []) if (r && r.id != null) idx[c][r.id] = JSON.stringify(r); }
  for (const s of SCALARS) idx["$" + s] = JSON.stringify(data[s] ?? null);
  return idx;
}
// Compare l'état courant au précédent et date ce qui a changé. Renvoie {idx, marks, changed}.
export function stamp(prevIdx, data, marks, now = Date.now()) {
  const idx = indexOf(data), m = marksOf(marks);
  let changed = false;
  for (const c of COLLS) {
    const p = prevIdx[c] || {};
    for (const id in idx[c]) if (p[id] !== idx[c][id]) { m.meta[c][id] = now; delete m.tomb[c][id]; changed = true; }
    for (const id in p) if (!(id in idx[c])) { m.tomb[c][id] = now; delete m.meta[c][id]; changed = true; }
  }
  for (const s of SCALARS) if (prevIdx["$" + s] !== idx["$" + s]) { m.scalarU[s] = now; changed = true; }
  return { idx, marks: m, changed };
}

const SORT = {
  treatments: (a, b) => String(b.date).localeCompare(String(a.date)),
  observations: (a, b) => String(b.date).localeCompare(String(a.date)),
  works: (a, b) => String(b.date).localeCompare(String(a.date)),
  invoices: (a, b) => String(b.date).localeCompare(String(a.date)),
  stockCounts: (a, b) => String(b.date).localeCompare(String(a.date)),
  absences: (a, b) => String(a.start).localeCompare(String(b.start)),
};

// Fusion enregistrement par enregistrement : la version la plus récente gagne, une suppression plus récente l'emporte.
// Rien n'est écrasé en bloc : ce qui n'existe que d'un côté est conservé.
export function mergeData(local, remote) {
  const lm = marksOf(local), rm = marksOf(remote), out = { ...emptyMarks() };
  const remoteNewer = new Date(remote?.savedAt || 0).getTime() > new Date(local?.savedAt || 0).getTime();
  for (const c of COLLS) {
    const la = new Map((local?.[c] || []).filter(r => r && r.id != null).map(r => [String(r.id), r]));
    const ra = new Map((remote?.[c] || []).filter(r => r && r.id != null).map(r => [String(r.id), r]));
    const ids = [...new Set([...la.keys(), ...ra.keys()])];
    const list = [];
    const tombIds = new Set([...Object.keys(lm.tomb[c]), ...Object.keys(rm.tomb[c])]);
    for (const id of tombIds) out.tomb[c][id] = Math.max(lm.tomb[c][id] || 0, rm.tomb[c][id] || 0);
    for (const id of ids) {
      const l = la.get(id), r = ra.get(id), lu = lm.meta[c][id] || 0, ru = rm.meta[c][id] || 0;
      let rec, u;
      if (l && r) { const takeR = ru > lu || (ru === lu && remoteNewer); rec = takeR ? r : l; u = Math.max(lu, ru); }
      else if (l) { rec = l; u = lu; } else { rec = r; u = ru; }
      const dead = out.tomb[c][id] || 0;
      if (dead && dead >= u) continue;
      delete out.tomb[c][id];
      list.push(rec); if (u) out.meta[c][id] = u;
    }
    if (SORT[c]) list.sort(SORT[c]);
    out[c] = list;
  }
  for (const s of SCALARS) {
    const lu = lm.scalarU[s] || 0, ru = rm.scalarU[s] || 0;
    const hasL = local?.[s] != null, hasR = remote?.[s] != null;
    const takeR = hasR && (!hasL || ru > lu || (ru === lu && remoteNewer));
    out[s] = takeR ? remote[s] : local?.[s];
    const u = Math.max(lu, ru); if (u) out.scalarU[s] = u;
  }
  return out;
}

export const sameIdx = (a, b) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (typeof x === "string" || typeof y === "string" || x == null || y == null) { if (x !== y) return false; continue; }
    const kx = Object.keys(x), ky = Object.keys(y);
    if (kx.length !== ky.length) return false;
    for (const id of kx) if (x[id] !== y[id]) return false;
  }
  return true;
};

export const uid = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

export function downloadFile(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
