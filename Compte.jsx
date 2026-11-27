// Compte et sauvegarde : état de la synchronisation, export / import, restauration, effacement
import { useState, useRef } from "react";
import { css, TEAL, TEAL_D, INK, PARCH, STONE, MID } from "./theme.js";
import { PriBtn, SecBtn, fmtDate } from "./ui.jsx";
import { api, isDeployed, downloadFile, COLLS, K } from "./store.js";

export const syncLabel = (T, status) => T("sync_" + status);
export const syncColor = status => status === "ok" ? TEAL : status === "syncing" ? "#C0A882" : status === "local" ? "#9A9090" : "#C07828";

export default function Compte({ T, lang, session, sync, notify }) {
  const [backups, setBackups] = useState(null), [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const deployed = isDeployed();
  const exportJson = () => downloadFile(`la-ripresa-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(sync.exportAll(), null, 1), "application/json");
  const importJson = async e => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || typeof d !== "object" || !COLLS.some(c => Array.isArray(d[c]))) throw new Error("format");
      const n = COLLS.reduce((s, c) => s + (Array.isArray(d[c]) ? d[c].length : 0), 0);
      if (!window.confirm(T("import_confirm").replace("%d", n))) return;
      sync.replaceAll(d); notify(T("import_done"));
    } catch { notify(T("import_bad")); }
  };
  const listBackups = async () => { setBusy(true); try { setBackups((await api("/api/data?backups=1")).backups || []); } catch (e) { notify(T("error") + " : " + e.message); } setBusy(false); };
  const restore = async date => {
    if (!window.confirm(T("restore_confirm").replace("%s", fmtDate(date, lang, { day: "numeric", month: "long", year: "numeric" })))) return;
    try { sync.replaceAll(await api("/api/data?backup=" + date)); notify(T("restore_done")); } catch (e) { notify(T("error") + " : " + e.message); }
  };
  const wipe = async () => {
    if (!window.confirm(T("wipe_confirm"))) return;
    try { await api("/api/data", { method: "DELETE" }); localStorage.removeItem(K); notify(T("wipe_done")); setTimeout(() => window.location.reload(), 800); }
    catch (e) { notify(T("error") + " : " + e.message); }
  };
  return (<div style={{ marginTop: 14 }}>
    <div style={{ fontSize: 9, color: MID, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{T("backup_title")}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: PARCH, border: `1px solid ${STONE}`, borderRadius: 4, marginBottom: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: syncColor(sync.status), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: INK }}>{syncLabel(T, sync.status)}</div>
        <div style={{ fontSize: 10, color: MID }}>{deployed && session ? `${T("account")} ${session.email}` : T("sync_local_hint")}{sync.lastSync ? ` · ${sync.lastSync.toLocaleTimeString(lang === "en" ? "en-GB" : lang === "it" ? "it-IT" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {deployed && <PriBtn onClick={async () => { const ok = await sync.syncNow(); notify(ok ? T("sync_done") : T("sync_failed")); }}>{T("sync_now")}</PriBtn>}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><SecBtn full onClick={exportJson}>{T("export_file")}</SecBtn></div>
        <div style={{ flex: 1 }}><SecBtn full onClick={() => fileRef.current?.click()}>{T("import_file")}</SecBtn></div>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={importJson} style={{ display: "none" }} />
      {deployed && (backups === null
        ? <SecBtn full onClick={listBackups}>{busy ? "…" : T("show_backups")}</SecBtn>
        : (<div style={{ padding: "8px 12px", background: PARCH, border: `1px solid ${STONE}`, borderRadius: 4 }}>
            <div style={css.fieldLabel}>{T("daily_backups")}</div>
            {!backups.length && <div style={{ fontSize: 11, color: MID, fontStyle: "italic" }}>{T("no_backup")}</div>}
            {backups.slice(0, 12).map(d => (<div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${STONE}`, fontSize: 12 }}>
              <span style={{ color: INK }}>{fmtDate(d, lang, { weekday: "short", day: "numeric", month: "long" })}</span>
              <button style={{ ...css.del, color: TEAL_D }} onClick={() => restore(d)}>{T("restore")}</button>
            </div>))}
          </div>))}
      {deployed && <button onClick={wipe} style={{ ...css.del, fontSize: 9, color: "#C0A882" }}>{T("wipe_data")}</button>}
    </div>
    <div style={{ marginTop: 12, padding: "10px 12px", background: PARCH, borderRadius: 4, border: `1px solid ${STONE}`, fontSize: 10, color: MID, lineHeight: 1.6 }}>{T("backup_note")}</div>
  </div>);
}
