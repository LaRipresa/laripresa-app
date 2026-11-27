// Synchronisation cloud rattachée à l'utilisateur connecté.
// Chaque modification est enregistrée sur l'appareil, puis envoyée ; en cas d'écart avec le cloud, les deux côtés sont fusionnés.
import { useEffect, useRef, useState, useCallback } from "react";
import { COLLS, SCALARS, SCHEMA, loadStore, saveStore, isDeployed, api, indexOf, stamp, marksOf, mergeData, sameIdx } from "./store.js";

const pick = d => { const o = {}; for (const k of [...COLLS, ...SCALARS]) o[k] = d[k]; return o; };

export function useSync({ session, data, apply, onAuthLost }) {
  const [status, setStatus] = useState("local"); // local | syncing | ok | offline | error
  const [lastSync, setLastSync] = useState(null);
  const first = useRef(null);
  if (!first.current) {
    const s = loadStore();
    first.current = { data: pick(data), idx: indexOf(pick(data)), marks: marksOf(s), rev: Number.isInteger(s.rev) ? s.rev : 0, dirty: !!s.dirty, changedAt: s.savedAt || null, owner: s.owner || null, pulled: false, busy: false, again: false, timer: null };
  }
  const st = first.current;
  const sessRef = useRef(session); sessRef.current = session;
  const applyRef = useRef(apply); applyRef.current = apply;
  const authLostRef = useRef(onAuthLost); authLostRef.current = onAuthLost;

  const snapshot = (d = st.data) => ({ ...pick(d), ...st.marks, schema: SCHEMA, rev: st.rev, dirty: st.dirty, owner: sessRef.current?.email || st.owner || null, savedAt: st.changedAt || new Date(0).toISOString() });
  const persist = d => saveStore(snapshot(d));

  const adopt = merged => {            // applique un état fusionné sans le compter comme une modification locale
    st.data = pick(merged);
    st.idx = indexOf(st.data);
    st.marks = marksOf(merged);
    applyRef.current(st.data);
  };

  const run = useCallback(async (opts = {}) => {
    const sess = sessRef.current;
    if (!sess?.token || !isDeployed()) { setStatus("local"); return false; }
    if (st.busy) { st.again = true; return false; }
    st.busy = true; setStatus("syncing");
    try {
      if (!st.pulled || opts.pull) {
        let remote = null;
        try { remote = await api("/api/data", { session: sess }); } catch (e) { if (e.status !== 404) throw e; }
        if (remote) {
          const local = snapshot();
          const merged = mergeData(local, remote);
          st.rev = remote.rev || 0;
          if (!sameIdx(indexOf(pick(merged)), st.idx)) adopt(merged); else st.marks = marksOf(merged);
          if (!sameIdx(indexOf(pick(merged)), indexOf(pick(remote)))) st.dirty = true;
          if (!remote.schema) st.dirty = true; // 1re synchronisation après mise à jour : on enregistre le nouveau format
          persist();
        } else { st.dirty = true; }
        st.pulled = true;
      }
      for (let i = 0; i < 4 && st.dirty; i++) {
        const body = { ...snapshot(), baseRev: st.rev }; delete body.dirty; delete body.rev;
        const sent = indexOf(pick(body));
        try {
          const out = await api("/api/data", { method: "POST", body, session: sess });
          st.rev = out.rev;
          if (sameIdx(sent, indexOf(st.data))) st.dirty = false; // sinon une modification est arrivée entre-temps
          persist();
        } catch (e) {
          if (e.status !== 409 || !e.data?.data) throw e;
          const merged = mergeData(snapshot(), e.data.data);
          st.rev = e.data.data.rev || 0;
          adopt(merged);
          persist();
        }
      }
      setStatus(st.dirty ? "error" : "ok"); setLastSync(new Date());
      return !st.dirty;
    } catch (e) {
      if (e.status === 401) { setStatus("local"); authLostRef.current?.(); }
      else setStatus(e.status ? "error" : "offline");
      return false;
    } finally {
      st.busy = false;
      if (st.again) { st.again = false; setTimeout(() => run(), 50); }
    }
  }, []);

  // Toute modification : datée, enregistrée sur l'appareil, puis envoyée au cloud
  useEffect(() => {
    st.data = pick(data);
    const out = stamp(st.idx, st.data, st.marks);
    st.idx = out.idx; st.marks = out.marks;
    if (out.changed) { st.dirty = true; st.changedAt = new Date().toISOString(); }
    persist();
    if (out.changed) { clearTimeout(st.timer); st.timer = setTimeout(() => run(), 1200); }
  }, COLLS.concat(SCALARS).map(k => data[k]));

  // Connexion, retour au premier plan, retour du réseau : on relit le cloud
  useEffect(() => {
    if (!session?.token) { st.pulled = false; setStatus("local"); return; }
    st.pulled = false; run({ pull: true });
  }, [session?.token]);
  useEffect(() => {
    const again = () => { if (document.visibilityState === "visible") run({ pull: true }); };
    const online = () => run({ pull: true });
    const retry = setInterval(() => { if (st.dirty) run(); }, 45000);
    document.addEventListener("visibilitychange", again); window.addEventListener("online", online);
    return () => { clearInterval(retry); document.removeEventListener("visibilitychange", again); window.removeEventListener("online", online); };
  }, []);

  const flush = useCallback(() => { clearTimeout(st.timer); st.timer = setTimeout(() => run(), 150); }, []);
  // Remplace tout par un jeu de données (import d'un fichier, restauration d'une sauvegarde)
  const replaceAll = useCallback(incoming => {
    const now = Date.now(), d = pick(incoming), marks = marksOf(st.marks);
    for (const c of COLLS) {
      d[c] = Array.isArray(d[c]) ? d[c] : [];
      const keep = new Set(d[c].map(r => String(r.id)));
      for (const id of Object.keys(st.idx[c] || {})) if (!keep.has(id)) { marks.tomb[c][id] = now; delete marks.meta[c][id]; }
      for (const r of d[c]) { marks.meta[c][r.id] = now; delete marks.tomb[c][r.id]; }
    }
    for (const s of SCALARS) { if (d[s] == null) d[s] = st.data[s]; marks.scalarU[s] = now; }
    st.marks = marks; st.data = d; st.idx = indexOf(d); st.dirty = true; st.changedAt = new Date().toISOString();
    applyRef.current(d); persist(); flush();
  }, []);

  return { status, lastSync, flush, syncNow: () => run({ pull: true }), replaceAll, exportAll: () => { const s = snapshot(); delete s.dirty; return s; }, hasPending: () => st.dirty };
}
