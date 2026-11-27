// Travail au long cours : journal des travaux, chantiers pluriannuels, calendrier saisonnier, bilan des campagnes
import { useState } from "react";
import { css, TEAL, TEAL_D, INK, PARCH, STONE, MID, WARM } from "./theme.js";
import { Col, Box, Info, F, TxtBtn, PriBtn, SecBtn, Seg, SeasonPick, Chk, Row, fmtDate, yearsOf, locOf } from "./ui.jsx";
import { COPPER_LIMIT } from "./risk.js";
import { uid } from "./store.js";
import { invoiceTotal } from "./stock.js";
import { exportWorksPDF } from "./pdf.js";

export const WORK_TYPES = ["taille","bois","sol","palissage","ebourgeonnage","rognage","effeuillage","fauchage","fertilisation","plantation","murets","traitement","vendanges","cave","autre"];
const today = () => new Date().toISOString().slice(0, 10);
const ph = w => (Number(w.hours) || 0) * (Number(w.workers) || 1); // heures × personnes
const h1 = n => (Math.round(n * 10) / 10).toString();

// Calendrier type proposé (modifiable) — vigne en bio, Etna versant nord
export const DEFAULT_CALENDAR = [
  { key: "cal_taille", months: [1, 2] }, { key: "cal_bois", months: [2, 3] }, { key: "cal_sol", months: [3, 4] },
  { key: "cal_ebourg", months: [4, 5] }, { key: "cal_relevage", months: [5, 6] }, { key: "cal_protection", months: [5, 6, 7] },
  { key: "cal_rognage", months: [6, 7] }, { key: "cal_fauchage", months: [5, 7] }, { key: "cal_maturite", months: [8, 9] },
  { key: "cal_vendanges", months: [9, 10] }, { key: "cal_sovescio", months: [11] }, { key: "cal_murets", months: [11, 12] },
  { key: "cal_bilan", months: [12] },
];

export const tasksDue = (tasks, year, month) => tasks.filter(t => (t.months || []).includes(month) && !t.done?.[`${year}-${month}`]);

export default function Travaux({ T, lang, parcelles, treatments, invoices, works, setWorks, projects, setProjects, tasks, setTasks, season, setSeason, notify }) {
  const [view, setView] = useState("journal");
  const years = yearsOf(treatments, works, invoices);
  const pName = id => parcelles.find(p => String(p.id) === String(id))?.name || T("whole_estate");
  return (<Col>
    <Seg value={view} onChange={setView} options={[["journal", T("journal")], ["projects", T("projects")], ["calendar", T("calendar")], ["seasons", T("seasons")]]} />
    {view === "journal" && <Journal {...{ T, lang, parcelles, works, setWorks, projects, season, setSeason, years, pName, notify }} />}
    {view === "projects" && <Chantiers {...{ T, lang, parcelles, works, projects, setProjects, pName, notify }} />}
    {view === "calendar" && <Calendrier {...{ T, lang, parcelles, tasks, setTasks, season, setSeason, years, pName, notify }} />}
    {view === "seasons" && <Campagnes {...{ T, lang, parcelles, treatments, works, invoices, years }} />}
  </Col>);
}

function Journal({ T, lang, parcelles, works, setWorks, projects, season, setSeason, years, pName, notify }) {
  const blank = { date: today(), parcelleId: "", type: "taille", hours: "", workers: "1", projectId: "", notes: "" };
  const [show, setShow] = useState(false), [form, setForm] = useState(blank), [edit, setEdit] = useState(null), [open, setOpen] = useState(null);
  const list = works.filter(w => String(w.date).startsWith(String(season))).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const total = list.reduce((s, w) => s + ph(w), 0);
  const byType = WORK_TYPES.map(k => [k, list.filter(w => w.type === k).reduce((s, w) => s + ph(w), 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const byParcel = [...new Set(list.map(w => String(w.parcelleId || "")))].map(id => [id, list.filter(w => String(w.parcelleId || "") === id).reduce((s, w) => s + ph(w), 0)]).sort((a, b) => b[1] - a[1]);
  const save = () => {
    if (!form.date || !form.type) return;
    const rec = { ...form, hours: parseFloat(form.hours) || 0, workers: parseInt(form.workers) || 1 };
    if (edit) setWorks(prev => prev.map(w => w.id === edit ? { ...w, ...rec } : w));
    else setWorks(prev => [...prev, { ...rec, id: uid() }].sort((a, b) => String(b.date).localeCompare(String(a.date))));
    setForm(blank); setShow(false); setEdit(null); notify(T("saved"));
  };
  const months = [...new Set(list.map(w => w.date.slice(0, 7)))];
  return (<>
    <SeasonPick value={season} onChange={setSeason} years={years} label={T("season")} />
    <div style={{ display: "flex", gap: 8 }}>
      <PriBtn onClick={() => { setShow(s => !s); setEdit(null); setForm(blank); }}>{T("add_work")}</PriBtn>
      <SecBtn onClick={() => exportWorksPDF({ season, works: list, parcelles, projects, T, lang })}>{T("export_pdf")}</SecBtn>
    </div>
    {show && (<Box title={edit ? T("edit_work") : T("new_work")}><Col>
      <Row>
        <F label={T("date")}><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={css.dateInp} /></F>
        <F label={T("work_type")}><select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={css.inp}>{WORK_TYPES.map(k => <option key={k} value={k}>{T("wt_" + k)}</option>)}</select></F>
      </Row>
      <F label={T("parcel")}><select value={form.parcelleId} onChange={e => setForm(f => ({ ...f, parcelleId: e.target.value }))} style={css.inp}>
        <option value="">{T("whole_estate")}</option>{parcelles.map(p => <option key={p.id} value={p.id}>{p.parentId ? "  └ " : ""}{p.name}</option>)}</select></F>
      <Row>
        <F label={T("hours")}><input type="number" inputMode="decimal" step="0.5" min="0" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} style={css.inp} placeholder="6" /></F>
        <F label={T("workers")}><input type="number" inputMode="numeric" step="1" min="1" value={form.workers} onChange={e => setForm(f => ({ ...f, workers: e.target.value }))} style={css.inp} /></F>
      </Row>
      {projects.length > 0 && <F label={T("linked_project")}><select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} style={css.inp}>
        <option value="">—</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>}
      <F label={T("notes")}><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={css.inp} /></F>
      <PriBtn onClick={save}>{T("save")}</PriBtn>
    </Col></Box>)}

    {list.length > 0 && (<Box title={T("work_summary")} sub={`${h1(total)} ${T("person_hours")}`}>
      {byType.map(([k, v]) => (<div key={k} style={{ marginBottom: 7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: INK }}><span>{T("wt_" + k)}</span><span style={{ color: WARM }}>{h1(v)} h</span></div>
        <div style={css.track}><div style={{ ...css.bar, width: `${Math.max(2, v / total * 100)}%`, background: TEAL }} /></div>
      </div>))}
      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${STONE}` }}>
        {byParcel.map(([id, v]) => { const p = parcelles.find(x => String(x.id) === id); return (
          <div key={id || "all"} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: MID }}>
            <span>{pName(id)}</span><span>{h1(v)} h{p?.superficie ? ` · ${h1(v / p.superficie)} h/ha` : ""}</span></div>); })}
      </div>
    </Box>)}

    {months.map(m => (<Box key={m} title={new Date(m + "-15").toLocaleDateString(locOf(lang), { month: "long", year: "numeric" })}>
      {list.filter(w => w.date.startsWith(m)).map(w => { const isO = open === w.id; return (
        <div key={w.id} style={{ borderBottom: `1px solid ${STONE}` }}>
          <button onClick={() => setOpen(isO ? null : w.id)} style={{ width: "100%", background: "none", border: "none", padding: "9px 0", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 12, fontFamily: "DM Serif Display,serif", color: INK, flexShrink: 0 }}>{fmtDate(w.date, lang, { day: "numeric", month: "short" })}</span>
              <span style={{ fontSize: 11, color: WARM, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{T("wt_" + w.type)}</span>
              <span style={{ fontSize: 10, color: MID, flexShrink: 0 }}>{w.hours ? `${h1(ph(w))} h` : ""}</span>
            </div>
            <div style={{ fontSize: 10, color: MID, marginTop: 2 }}>{pName(w.parcelleId)}</div>
          </button>
          {isO && (<div style={{ padding: "4px 0 10px", fontSize: 11, color: MID }}>
            {w.hours > 0 && <div>{w.hours} h × {w.workers || 1} {T("workers").toLowerCase()}</div>}
            {w.projectId && <div>{T("linked_project")} : {projects.find(p => String(p.id) === String(w.projectId))?.name || "—"}</div>}
            {w.notes && <div style={{ fontStyle: "italic", marginTop: 3 }}>{w.notes}</div>}
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              <button style={css.del} onClick={() => { setForm({ date: w.date, parcelleId: w.parcelleId || "", type: w.type, hours: String(w.hours || ""), workers: String(w.workers || 1), projectId: w.projectId || "", notes: w.notes || "" }); setEdit(w.id); setShow(true); window.scrollTo?.(0, 0); }}>{T("edit")}</button>
              <button style={css.del} onClick={() => { if (window.confirm(T("confirm_delete"))) setWorks(prev => prev.filter(x => x.id !== w.id)); }}>{T("delete")}</button>
            </div>
          </div>)}
        </div>); })}
    </Box>))}
    {!list.length && <Info>{T("no_work")}</Info>}
  </>);
}

function Chantiers({ T, lang, parcelles, works, projects, setProjects, pName, notify }) {
  const blank = { name: "", parcelleId: "", start: today(), target: "", status: "active", notes: "" };
  const [show, setShow] = useState(false), [form, setForm] = useState(blank), [open, setOpen] = useState(null), [step, setStep] = useState({ label: "", due: "" });
  const upd = (id, fn) => setProjects(prev => prev.map(p => p.id === id ? fn(p) : p));
  const add = () => { if (!form.name.trim()) return; setProjects(prev => [...prev, { ...form, id: uid(), steps: [] }]); setForm(blank); setShow(false); notify(T("saved")); };
  const order = { active: 0, paused: 1, done: 2 };
  const list = [...projects].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || String(a.start).localeCompare(String(b.start)));
  return (<>
    <PriBtn onClick={() => setShow(s => !s)}>{T("add_project")}</PriBtn>
    {show && (<Box title={T("new_project")}><Col>
      <F label={T("project_name")}><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={css.inp} placeholder={T("project_ph")} /></F>
      <F label={T("parcel")}><select value={form.parcelleId} onChange={e => setForm(f => ({ ...f, parcelleId: e.target.value }))} style={css.inp}>
        <option value="">{T("whole_estate")}</option>{parcelles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
      <Row>
        <F label={T("start")}><input type="date" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} style={css.dateInp} /></F>
        <F label={T("target_date")}><input type="date" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} style={css.dateInp} /></F>
      </Row>
      <F label={T("notes")}><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={css.inp} /></F>
      <PriBtn onClick={add}>{T("save")}</PriBtn>
    </Col></Box>)}
    {list.map(p => {
      const steps = p.steps || [], done = steps.filter(s => s.done).length, pct = steps.length ? done / steps.length * 100 : (p.status === "done" ? 100 : 0);
      const hrs = works.filter(w => String(w.projectId) === String(p.id)).reduce((s, w) => s + ph(w), 0);
      const isO = open === p.id, late = p.status === "active" && p.target && p.target < today();
      const next = steps.filter(s => !s.done && s.due).sort((a, b) => a.due.localeCompare(b.due))[0];
      return (<Box key={p.id} title={pName(p.parcelleId)} sub={p.name}
        action={<span style={{ ...css.pill, background: p.status === "done" ? "rgba(30,155,138,.12)" : p.status === "paused" ? STONE : late ? "rgba(184,50,50,.1)" : "rgba(42,191,170,.12)", color: p.status === "done" ? TEAL_D : p.status === "paused" ? MID : late ? "#B83232" : TEAL_D }}>{late ? T("late") : T("st_" + p.status)}</span>}>
        <div style={css.track}><div style={{ ...css.bar, width: `${pct}%`, background: TEAL }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MID, marginTop: 6 }}>
          <span>{fmtDate(p.start, lang, { month: "short", year: "numeric" })}{p.target ? ` → ${fmtDate(p.target, lang, { month: "short", year: "numeric" })}` : ""}</span>
          <span>{steps.length ? `${done}/${steps.length} ${T("steps").toLowerCase()}` : ""}{hrs ? ` · ${h1(hrs)} h` : ""}</span>
        </div>
        {next && !isO && <div style={{ fontSize: 10, color: next.due < today() ? "#B83232" : WARM, marginTop: 4 }}>→ {next.label} · {fmtDate(next.due, lang)}</div>}
        <button onClick={() => setOpen(isO ? null : p.id)} style={css.toggleBtn}>{isO ? "▲ " + T("close") : "▼ " + T("steps")}</button>
        {isO && (<div style={{ borderTop: `1px solid ${STONE}`, paddingTop: 8 }}>
          {p.notes && <div style={{ fontSize: 11, color: MID, fontStyle: "italic", marginBottom: 6 }}>{p.notes}</div>}
          {steps.map(s => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Chk on={s.done} label={s.label + (s.due ? ` · ${fmtDate(s.due, lang)}` : "")} onClick={() => upd(p.id, x => ({ ...x, steps: x.steps.map(y => y.id === s.id ? { ...y, done: !y.done, doneDate: !y.done ? today() : "" } : y) }))} /></div>
            <button style={css.del} onClick={() => upd(p.id, x => ({ ...x, steps: x.steps.filter(y => y.id !== s.id) }))}>✕</button>
          </div>))}
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 0 }}><input value={step.label} onChange={e => setStep(s => ({ ...s, label: e.target.value }))} style={css.inp} placeholder={T("new_step")} /></div>
            <div style={{ flex: 1.4, minWidth: 0 }}><input type="date" value={step.due} onChange={e => setStep(s => ({ ...s, due: e.target.value }))} style={css.dateInp} /></div>
            <button style={{ ...css.sec, padding: "9px 12px" }} onClick={() => { if (!step.label.trim()) return; upd(p.id, x => ({ ...x, steps: [...(x.steps || []), { id: uid(), label: step.label.trim(), due: step.due, done: false }] })); setStep({ label: "", due: "" }); }}>+</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {["active", "paused", "done"].map(s => (<button key={s} onClick={() => upd(p.id, x => ({ ...x, status: s }))} style={{ ...css.cepBtn, ...(p.status === s ? css.cepOn : {}) }}>{T("st_" + s)}</button>))}
            <button style={{ ...css.del, marginLeft: "auto" }} onClick={() => { if (window.confirm(T("confirm_delete"))) setProjects(prev => prev.filter(x => x.id !== p.id)); }}>{T("delete")}</button>
          </div>
        </div>)}
      </Box>);
    })}
    {!projects.length && <Info>{T("no_project")}</Info>}
  </>);
}

function Calendrier({ T, lang, parcelles, tasks, setTasks, season, setSeason, years, pName, notify }) {
  const [show, setShow] = useState(false), [form, setForm] = useState({ label: "", months: [], parcelleId: "" }), [manage, setManage] = useState(false);
  const now = new Date(), curM = now.getMonth() + 1, curY = now.getFullYear();
  const mName = m => new Date(2024, m - 1, 15).toLocaleDateString(locOf(lang), { month: "long" });
  const mShort = m => new Date(2024, m - 1, 15).toLocaleDateString(locOf(lang), { month: "short" });
  const toggle = (t, m) => setTasks(prev => prev.map(x => { if (x.id !== t.id) return x; const k = `${season}-${m}`, d = { ...(x.done || {}) }; if (d[k]) delete d[k]; else d[k] = today(); return { ...x, done: d }; }));
  const add = () => { if (!form.label.trim() || !form.months.length) return; setTasks(prev => [...prev, { id: uid(), label: form.label.trim(), months: [...form.months].sort((a, b) => a - b), parcelleId: form.parcelleId, done: {} }]); setForm({ label: "", months: [], parcelleId: "" }); setShow(false); notify(T("saved")); };
  const loadDefault = () => { setTasks(prev => [...prev, ...DEFAULT_CALENDAR.map((d, i) => ({ id: uid() + i, label: T(d.key), months: d.months, parcelleId: "", done: {} }))]); notify(T("calendar_loaded")); };
  const order = season === curY ? [...Array(12)].map((_, i) => ((curM - 1 + i) % 12) + 1) : [...Array(12)].map((_, i) => i + 1);
  return (<>
    <SeasonPick value={season} onChange={setSeason} years={[...new Set([curY + 1, ...years])].sort((a, b) => b - a)} label={T("season")} />
    <div style={{ display: "flex", gap: 8 }}>
      <PriBtn onClick={() => setShow(s => !s)}>{T("add_task")}</PriBtn>
      {tasks.length > 0 && <SecBtn onClick={() => setManage(m => !m)}>{manage ? T("close") : T("edit")}</SecBtn>}
    </div>
    {show && (<Box title={T("new_task")}><Col>
      <F label={T("task_label")}><input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={css.inp} /></F>
      <F label={T("months")}><div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
        {[...Array(12)].map((_, i) => i + 1).map(m => (<button key={m} onClick={() => setForm(f => ({ ...f, months: f.months.includes(m) ? f.months.filter(x => x !== m) : [...f.months, m] }))} style={{ ...css.cepBtn, ...(form.months.includes(m) ? css.cepOn : {}) }}>{mShort(m)}</button>))}
      </div></F>
      <F label={T("parcel")}><select value={form.parcelleId} onChange={e => setForm(f => ({ ...f, parcelleId: e.target.value }))} style={css.inp}>
        <option value="">{T("whole_estate")}</option>{parcelles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></F>
      <PriBtn onClick={add}>{T("save")}</PriBtn>
    </Col></Box>)}
    {!tasks.length && (<Info>{T("no_task")} <TxtBtn onClick={loadDefault}>{T("load_calendar")}</TxtBtn></Info>)}
    {manage && (<Box title={T("recurring_tasks")}>
      {tasks.map(t => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${STONE}`, gap: 8 }}>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: INK }}>{t.label}</div><div style={{ fontSize: 9, color: MID }}>{(t.months || []).map(mShort).join(" · ")}{t.parcelleId ? ` — ${pName(t.parcelleId)}` : ""}</div></div>
        <button style={css.del} onClick={() => { if (window.confirm(T("confirm_delete"))) setTasks(prev => prev.filter(x => x.id !== t.id)); }}>{T("delete")}</button>
      </div>))}
    </Box>)}
    {tasks.length > 0 && order.map(m => {
      const ts = tasks.filter(t => (t.months || []).includes(m)); if (!ts.length) return null;
      const isCur = season === curY && m === curM, left = ts.filter(t => !t.done?.[`${season}-${m}`]).length;
      return (<Box key={m} title={mName(m) + (isCur ? " · " + T("this_month") : "")} action={<span style={{ fontSize: 10, color: left ? WARM : TEAL_D }}>{left ? `${left} ${T("to_do")}` : "✓"}</span>}>
        <div style={isCur ? { borderLeft: `2px solid ${TEAL}`, paddingLeft: 8 } : null}>
          {ts.map(t => <Chk key={t.id} on={!!t.done?.[`${season}-${m}`]} label={t.label + (t.parcelleId ? ` — ${pName(t.parcelleId)}` : "")} onClick={() => toggle(t, m)} />)}
        </div>
      </Box>);
    })}
  </>);
}

// Bilan pluriannuel : cuivre par campagne et cumul glissant sur 7 ans (28 kg/ha), heures, achats
export function cuByYear(pid, treatments) {
  const out = {};
  for (const t of treatments) if (String(t.parcelleId) === String(pid)) { const y = String(t.date).slice(0, 4); out[y] = (out[y] || 0) + (t.cu_applied || 0); }
  return out;
}
function Campagnes({ T, parcelles, treatments, works, invoices, years }) {
  const ys = [...years].sort((a, b) => b - a), cur = new Date().getFullYear();
  const of = (list, y) => list.filter(r => String(r.date).startsWith(String(y)));
  return (<>
    <Box title={T("seasons_overview")}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr 1fr 1fr", gap: "6px 8px", fontSize: 11, alignItems: "baseline" }}>
        {["", T("treatments"), "Cu kg", T("hours"), T("purchases")].map((h, i) => <div key={i} style={{ fontSize: 8, color: MID, letterSpacing: .8, textTransform: "uppercase", textAlign: i ? "right" : "left" }}>{h}</div>)}
        {ys.map(y => { const ts = of(treatments, y); return [
          <div key={y + "a"} style={{ fontFamily: "DM Serif Display,serif", fontSize: 13, color: INK }}>{y}</div>,
          <div key={y + "b"} style={{ textAlign: "right", color: WARM }}>{ts.length}</div>,
          <div key={y + "c"} style={{ textAlign: "right", color: WARM }}>{ts.reduce((s, t) => s + (t.cu_applied || 0), 0).toFixed(2)}</div>,
          <div key={y + "d"} style={{ textAlign: "right", color: WARM }}>{h1(of(works, y).reduce((s, w) => s + ph(w), 0))}</div>,
          <div key={y + "e"} style={{ textAlign: "right", color: WARM }}>{of(invoices, y).reduce((s, i) => s + invoiceTotal(i), 0).toFixed(0)} €</div>]; })}
      </div>
    </Box>
    {parcelles.map(p => {
      const by = cuByYear(p.id, treatments), surf = p.superficie || 1;
      const win = [...Array(7)].map((_, i) => cur - i), sum7 = win.reduce((s, y) => s + (by[y] || 0), 0), lim7 = 28 * surf, pct7 = Math.min(100, sum7 / lim7 * 100);
      if (!Object.keys(by).length) return null;
      return (<Box key={p.id} title={p.name} sub={`${T("cu_7y")} : ${(sum7 / surf).toFixed(2)} / 28 kg/ha`}>
        <div style={css.track}><div style={{ ...css.bar, width: `${pct7}%`, background: pct7 > 80 ? "#B83232" : TEAL }} /></div>
        <div style={{ height: 8 }} />
        {win.filter(y => by[y]).map(y => { const perHa = by[y] / surf, pct = Math.min(100, perHa / COPPER_LIMIT * 100); return (
          <div key={y} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
            <span style={{ width: 36, fontSize: 11, color: MID }}>{y}</span>
            <div style={{ ...css.track, flex: 1 }}><div style={{ ...css.bar, width: `${pct}%`, background: perHa > COPPER_LIMIT ? "#B83232" : WARM }} /></div>
            <span style={{ width: 78, textAlign: "right", fontSize: 10, color: perHa > COPPER_LIMIT ? "#B83232" : WARM }}>{perHa.toFixed(2)} kg/ha</span>
          </div>); })}
        <div style={{ fontSize: 9, color: MID, marginTop: 6 }}>{T("cu_7y_note")}</div>
      </Box>);
    })}
    {!treatments.length && <Info>{T("no_treatment")}</Info>}
  </>);
}
