// Station météo connectée dans une parcelle (ex. Tartaraci) : affine les données locales utilisées pour le risque
import { useState } from "react";
import { css, TEAL, TEAL_D, INK, STONE, MID, WARM } from "./theme.js";
import { Col, Box, Info, F, TxtBtn, PriBtn, SecBtn, Stat, Row, fmtDate } from "./ui.jsx";
import { api, isDeployed, uid } from "./store.js";

export const FRESH_MS = 6 * 3600e3;
const dayStr = (off = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - off * 86400e3));

// Pluie observée sur 3 jours (aujourd'hui et les 2 jours précédents)
export function observedRain3d(view) {
  if (!view?.days?.length) return null;
  const want = [dayStr(0), dayStr(1), dayStr(2)], got = view.days.filter(d => want.includes(d.date));
  return got.length ? Math.round(got.reduce((s, d) => s + (d.rain || 0), 0) * 10) / 10 : null;
}
// Météo d'une parcelle : mesures de la station si elles sont récentes, sinon Open-Meteo ; la pluie retenue est la plus forte des deux
export function stationWeather(view, weather) {
  if (!view || !weather) return null;
  const obs = observedRain3d(view), l = view.latest, fresh = l && Date.now() - l.ts < FRESH_MS && l.temp != null && l.rh != null;
  if (obs == null && !fresh) return null;
  return {
    ...weather,
    ...(fresh ? { temp: l.temp, rh: l.rh, dewpoint: l.dewpoint ?? weather.dewpoint, wind: l.wind ?? weather.wind } : {}),
    rain3d: Math.max(weather.rain3d || 0, obs || 0),
    source: fresh ? "station" : "mixed", obsRain3d: obs,
  };
}

export default function Station({ T, lang, parcelles, stations, setStations, views, reload, weather, notify }) {
  const deployed = isDeployed();
  const def = parcelles.find(p => /tartara/i.test(p.name));
  const [show, setShow] = useState(false), [form, setForm] = useState({ name: "", parcelleId: "", mode: "ecowitt", mac: "", applicationKey: "", apiKey: "" });
  const [busy, setBusy] = useState(false), [open, setOpen] = useState(null), [rd, setRd] = useState({ temp: "", rh: "", rainDay: "", wind: "" }), [cfgEdit, setCfgEdit] = useState(null);
  const pName = id => parcelles.find(p => String(p.id) === String(id))?.name || "—";

  const saveCfg = async (id, f) => {
    const out = await api("/api/station?id=" + id, { method: "POST", body: { action: "config", mode: f.mode, mac: f.mac, applicationKey: f.applicationKey || undefined, apiKey: f.apiKey || undefined } });
    if (out.pullError) notify(T("station_pull_error") + " : " + out.pullError);
    return out;
  };
  const add = async () => {
    const parcelleId = form.parcelleId || (def ? String(def.id) : "");
    if (!parcelleId) return;
    setBusy(true);
    const id = "st" + uid();
    try { await saveCfg(id, form); setStations(prev => [...prev, { id, name: form.name.trim() || `Station ${pName(parcelleId)}`, parcelleId, mode: form.mode }]); setShow(false); setOpen(id); notify(T("saved")); setTimeout(reload, 300); }
    catch (e) { notify(T("error") + " : " + e.message); }
    setBusy(false);
  };
  const remove = async s => { if (!window.confirm(T("confirm_delete"))) return; setStations(prev => prev.filter(x => x.id !== s.id)); api("/api/station?id=" + s.id, { method: "DELETE" }).catch(() => {}); };
  const sendReading = async s => {
    const reading = Object.fromEntries(Object.entries(rd).filter(([, v]) => v !== ""));
    if (!Object.keys(reading).length) return;
    try { await api("/api/station?id=" + s.id, { method: "POST", body: { action: "reading", reading } }); setRd({ temp: "", rh: "", rainDay: "", wind: "" }); notify(T("reading_saved")); reload(); }
    catch (e) { notify(T("error") + " : " + e.message); }
  };

  const modeFields = (f, set) => (<>
    <F label={T("station_mode")}><select value={f.mode} onChange={e => set({ mode: e.target.value })} style={css.inp}>
      <option value="ecowitt">{T("mode_ecowitt")}</option><option value="push">{T("mode_push")}</option><option value="manual">{T("mode_manual")}</option></select></F>
    {f.mode === "ecowitt" && (<>
      <F label="Application Key"><input value={f.applicationKey} onChange={e => set({ applicationKey: e.target.value })} style={css.inp} autoCapitalize="none" autoComplete="off" /></F>
      <F label="API Key"><input value={f.apiKey} onChange={e => set({ apiKey: e.target.value })} style={css.inp} autoCapitalize="none" autoComplete="off" /></F>
      <F label={T("station_mac")}><input value={f.mac} onChange={e => set({ mac: e.target.value })} style={css.inp} placeholder="AA:BB:CC:DD:EE:FF" autoCapitalize="characters" /></F>
      <div style={{ fontSize: 10, color: MID }}>{T("ecowitt_help")}</div>
    </>)}
  </>);

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={css.sLabel}>{T("stations")}</span>
      {deployed && <TxtBtn onClick={() => { setShow(s => !s); setForm(f => ({ ...f, parcelleId: f.parcelleId || (def ? String(def.id) : "") })); }}>{T("add_station")}</TxtBtn>}
    </div>
    {!deployed && <Info>{T("station_needs_cloud")}</Info>}
    {deployed && !stations.length && !show && <Info>{T("station_intro")}</Info>}
    {show && (<Box title={T("new_station")}><Col>
      <F label={T("parcel")}><select value={form.parcelleId} onChange={e => setForm(f => ({ ...f, parcelleId: e.target.value }))} style={css.inp}>
        <option value="">{T("choose")}</option>{parcelles.filter(p => !p.parentId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
      <F label={T("name")}><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={css.inp} placeholder="Station Tartaraci" /></F>
      {modeFields(form, patch => setForm(f => ({ ...f, ...patch })))}
      <PriBtn disabled={busy} onClick={add}>{T("save")}</PriBtn>
    </Col></Box>)}

    {stations.map(s => {
      const v = views[s.id], l = v?.latest, isO = open === s.id, age = l ? Date.now() - l.ts : null, fresh = age != null && age < FRESH_MS;
      const obs = observedRain3d(v);
      return (<Box key={s.id} title={`${s.name} · ${pName(s.parcelleId)}`}
        sub={l ? `${fmtDate(l.ts, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : T("no_reading")}
        action={<span style={{ ...css.pill, background: fresh ? "rgba(42,191,170,.12)" : STONE, color: fresh ? TEAL_D : MID }}>{fresh ? T("station_live") : T("station_stale")}</span>}>
        {l && (<div style={css.wGrid}>
          <Stat v={l.temp != null ? `${l.temp}°C` : "—"} l={T("temperature")} />
          <Stat v={l.rh != null ? `${l.rh}%` : "—"} l={T("humidity")} />
          <Stat v={obs != null ? `${obs}mm` : "—"} l={T("rain_obs_3d")} />
          <Stat v={l.wind != null ? `${l.wind}km/h` : "—"} l={T("wind")} />
        </div>)}
        {l && weather && fresh && l.temp != null && (<div style={{ fontSize: 10, color: MID, marginTop: 8, textAlign: "center" }}>
          {T("vs_openmeteo")} : {(l.temp - weather.temp >= 0 ? "+" : "") + (l.temp - weather.temp).toFixed(1)}°C · {(l.rh - weather.rh >= 0 ? "+" : "") + (l.rh - weather.rh).toFixed(0)}% HR
        </div>)}
        <button onClick={() => setOpen(isO ? null : s.id)} style={css.toggleBtn}>{isO ? "▲ " + T("close") : "▼ " + T("details")}</button>
        {isO && (<div style={{ borderTop: `1px solid ${STONE}`, paddingTop: 8 }}><Col>
          {v?.pullError && <Info warn>{T("station_pull_error")} : {v.pullError}</Info>}
          {(v?.days || []).length > 0 && (<div>
            <div style={css.fieldLabel}>{T("last_days")}</div>
            {[...v.days].reverse().slice(0, 7).map(d => (<div key={d.date} style={{ display: "flex", gap: 6, fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${STONE}` }}>
              <span style={{ width: 70, color: MID }}>{fmtDate(d.date, lang, { weekday: "short", day: "numeric" })}</span>
              <span style={{ width: 86, color: INK, fontFamily: "DM Serif Display,serif" }}>{d.tmin ?? "–"}°/{d.tmax ?? "–"}°C</span>
              <span style={{ width: 54, color: d.rain > 5 ? "#4A6E8A" : MID }}>{d.rain > 0 ? `${d.rain}mm` : "—"}</span>
              <span style={{ color: MID }}>{d.rhAvg != null ? `${d.rhAvg}%` : ""}</span>
            </div>))}
          </div>)}
          <div>
            <div style={css.fieldLabel}>{T("manual_reading")}</div>
            <Row>
              <F label="°C"><input type="number" inputMode="decimal" step="0.1" value={rd.temp} onChange={e => setRd(r => ({ ...r, temp: e.target.value }))} style={css.inp} /></F>
              <F label="% HR"><input type="number" inputMode="decimal" value={rd.rh} onChange={e => setRd(r => ({ ...r, rh: e.target.value }))} style={css.inp} /></F>
              <F label={T("rain_today")}><input type="number" inputMode="decimal" step="0.1" value={rd.rainDay} onChange={e => setRd(r => ({ ...r, rainDay: e.target.value }))} style={css.inp} /></F>
            </Row>
            <div style={{ height: 8 }} /><SecBtn onClick={() => sendReading(s)}>{T("save_reading")}</SecBtn>
          </div>
          {v?.pushKey && (v.mode === "push") && (<div style={css.calcBox}>
            <div style={css.fieldLabel}>{T("push_url")}</div>
            <div style={{ fontSize: 10, color: INK, wordBreak: "break-all", userSelect: "all" }}>{window.location.origin}/api/station?k={v.pushKey}</div>
            <div style={{ fontSize: 10, color: MID, marginTop: 6 }}>{T("push_help")}</div>
          </div>)}
          {cfgEdit?.id === s.id ? (<Col>
            {modeFields(cfgEdit, patch => setCfgEdit(c => ({ ...c, ...patch })))}
            <PriBtn disabled={busy} onClick={async () => { setBusy(true); try { await saveCfg(s.id, cfgEdit); setStations(prev => prev.map(x => x.id === s.id ? { ...x, mode: cfgEdit.mode } : x)); setCfgEdit(null); notify(T("saved")); reload(); } catch (e) { notify(T("error") + " : " + e.message); } setBusy(false); }}>{T("save")}</PriBtn>
          </Col>) : (<div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <button style={{ ...css.del, color: TEAL_D }} onClick={() => reload(true)}>↺ {T("refresh")}</button>
            <button style={css.del} onClick={() => setCfgEdit({ id: s.id, mode: v?.mode || s.mode || "manual", mac: v?.mac || "", applicationKey: "", apiKey: "" })}>{T("station_settings")}{v?.mode === "ecowitt" && !v?.hasKeys ? " ⚠" : ""}</button>
            <button style={css.del} onClick={() => remove(s)}>{T("delete")}</button>
          </div>)}
        </Col></div>)}
      </Box>);
    })}
  </>);
}
