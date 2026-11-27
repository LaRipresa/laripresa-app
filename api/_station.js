// Normalisation des relevés de station météo (indépendant du fabricant)
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const f2c = f => (f == null ? null : (f - 32) * 5 / 9);
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

export function dewPoint(temp, rh) {
  if (temp == null || rh == null || rh <= 0) return null;
  const a = 17.62, b = 243.12, g = Math.log(rh / 100) + (a * temp) / (b + temp);
  return (b * g) / (a - g);
}

// Accepte : JSON métrique (temp, rh, rain, rainDay, wind, leafWet, soil, ts),
// protocole Ecowitt (tempf, humidity, dailyrainin, windspeedmph, dateutc…) et protocole Wunderground (mêmes champs, dewptf).
export function normalizeReading(q = {}) {
  let temp = num(q.temp ?? q.temperature ?? q.tempc); if (temp == null) temp = f2c(num(q.tempf));
  const rh = num(q.rh ?? q.humidity);
  let wind = num(q.wind ?? q.windspeedkmh); if (wind == null) { const m = num(q.windspeedmph); if (m != null) wind = m * 1.609344; }
  let rainDay = num(q.rainDay ?? q.dailyrainmm); if (rainDay == null) { const i = num(q.dailyrainin); if (i != null) rainDay = i * 25.4; }
  const rain = num(q.rain);
  let dew = num(q.dewpoint ?? q.dewptc); if (dew == null) dew = f2c(num(q.dewptf)); if (dew == null) dew = dewPoint(temp, rh);
  const leafWet = num(q.leafWet ?? q.leafwetness_ch1 ?? q.leafwetness);
  const soil = num(q.soil ?? q.soilmoisture1);
  let ts = Date.now();
  if (q.ts) { const t = typeof q.ts === "number" || /^\d+$/.test(q.ts) ? Number(q.ts) * (Number(q.ts) < 1e12 ? 1000 : 1) : Date.parse(q.ts); if (Number.isFinite(t)) ts = t; }
  else if (q.dateutc && q.dateutc !== "now") { const t = Date.parse(String(q.dateutc).replace("+", " ").replace(" ", "T") + "Z"); if (Number.isFinite(t)) ts = t; }
  if (ts > Date.now() + 3600e3) ts = Date.now();
  if (temp == null && rh == null && rainDay == null && rain == null) return null;
  if ((temp != null && (temp < -40 || temp > 60)) || (rh != null && (rh < 0 || rh > 100))) return null;
  return { ts, temp: r1(temp), rh: r1(rh), dewpoint: r1(dew), wind: r1(wind), rainDay: r1(rainDay), rain: r1(rain), leafWet: r1(leafWet), soil: r1(soil) };
}

// Réponse de l'API cloud Ecowitt v3 (device/real_time, unités métriques demandées dans l'URL)
export function fromEcowittCloud(data = {}) {
  const v = o => (o && typeof o === "object" ? o.value : o);
  const out = data.outdoor || {}, rf = data.rainfall || data.rainfall_piezo || {}, w = data.wind || {};
  const t = out.temperature?.time || data.time;
  return normalizeReading({
    temp: v(out.temperature), rh: v(out.humidity), dewpoint: v(out.dew_point),
    wind: v(w.wind_speed), rainDay: v(rf.daily),
    leafWet: v(data.leaf_ch1?.leaf_wetness), soil: v(data.soil_ch1?.soilmoisture),
    ts: t ? Number(t) : undefined,
  });
}

export const ecowittUrl = c => "https://api.ecowitt.net/api/v3/device/real_time?application_key=" + encodeURIComponent(c.applicationKey) +
  "&api_key=" + encodeURIComponent(c.apiKey) + "&mac=" + encodeURIComponent(c.mac) +
  "&call_back=all&temp_unitid=1&pressure_unitid=3&wind_speed_unitid=7&rainfall_unitid=12";

// Agrégat journalier
export function addToDay(day, r) {
  const d = day || { n: 0, tSum: 0, tmin: null, tmax: null, rhN: 0, rhSum: 0, rhMax: null, rainDay: null, rainSum: 0, windMax: null, wetN: 0 };
  if (r.temp != null) { d.n++; d.tSum += r.temp; d.tmin = d.tmin == null ? r.temp : Math.min(d.tmin, r.temp); d.tmax = d.tmax == null ? r.temp : Math.max(d.tmax, r.temp); }
  if (r.rh != null) { d.rhN++; d.rhSum += r.rh; d.rhMax = d.rhMax == null ? r.rh : Math.max(d.rhMax, r.rh); }
  if (r.rainDay != null) d.rainDay = d.rainDay == null ? r.rainDay : Math.max(d.rainDay, r.rainDay);
  if (r.rain != null && r.rain > 0) d.rainSum += r.rain;
  if (r.wind != null) d.windMax = d.windMax == null ? r.wind : Math.max(d.windMax, r.wind);
  if (r.leafWet != null && r.leafWet >= 50) d.wetN++;
  return d;
}
export const dayView = (date, d) => ({
  date, n: d.n,
  tmin: d.tmin, tmax: d.tmax, tavg: d.n ? r1(d.tSum / d.n) : null,
  rhAvg: d.rhN ? r1(d.rhSum / d.rhN) : null, rhMax: d.rhMax,
  rain: r1(Math.max(d.rainDay || 0, d.rainSum || 0)), windMax: d.windMax,
});
