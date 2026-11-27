// Station météo connectée (ex. parcelle Tartaraci)
//  - app (session) : configuration, lecture des relevés, saisie manuelle
//  - station/relais (clé d'envoi ?k=…) : réception de relevés en HTTPS
//  - tâche planifiée (?cron=1) : interrogation quotidienne du cloud Ecowitt pour ne pas perdre le cumul de pluie
import { randomBytes } from "crypto";
import { redis, preflight, readBody, identify, userKey, fail, HttpError, safeId, romeDate, rateLimit } from "./_server.js";
import { normalizeReading, fromEcowittCloud, ecowittUrl, addToDay, dayView } from "./_station.js";

const REG = "laripresa:stations";
const kCfg = (h, id) => userKey(h, `:stcfg:${id}`);
const kLatest = (h, id) => userKey(h, `:st:${id}:latest`);
const kDays = (h, id) => userKey(h, `:st:${id}:days`);

async function store(h, id, reading) {
  const r = await redis();
  const date = romeDate(new Date(reading.ts));
  const raw = await r.hGet(kDays(h, id), date);
  await r.hSet(kDays(h, id), date, JSON.stringify(addToDay(raw ? JSON.parse(raw) : null, reading)));
  const prev = await r.get(kLatest(h, id));
  if (!prev || JSON.parse(prev).ts <= reading.ts) await r.set(kLatest(h, id), JSON.stringify(reading));
}

async function pullEcowitt(h, id, cfg) {
  if (cfg?.mode !== "ecowitt" || !cfg.applicationKey || !cfg.apiKey || !cfg.mac) return { pulled: false };
  const g = await fetch(ecowittUrl(cfg));
  const d = await g.json().catch(() => null);
  if (!g.ok || !d || d.code !== 0) return { pulled: false, error: d?.msg || `HTTP ${g.status}` };
  const reading = fromEcowittCloud(d.data);
  if (!reading) return { pulled: false, error: "Réponse sans mesure exploitable" };
  await store(h, id, reading);
  return { pulled: true };
}

async function view(h, id, cfg, extra = {}) {
  const r = await redis();
  const latest = await r.get(kLatest(h, id));
  const all = await r.hGetAll(kDays(h, id));
  const days = Object.keys(all || {}).sort().slice(-21).map(date => dayView(date, JSON.parse(all[date])));
  return { id, mode: cfg?.mode || "manual", mac: cfg?.mac || "", hasKeys: !!(cfg?.applicationKey && cfg?.apiKey), pushKey: cfg?.pushKey || null, latest: latest ? JSON.parse(latest) : null, days, ...extra };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const q = req.query || {};
    const r = await redis();

    // ── Tâche planifiée Vercel ──
    if (q.cron) {
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw new HttpError(401, "Non autorisé");
      const members = await r.sMembers(REG);
      let ok = 0;
      for (const m of members) {
        const [h, id] = m.split(":");
        const raw = await r.get(kCfg(h, id));
        if (!raw) { await r.sRem(REG, m); continue; }
        const out = await pullEcowitt(h, id, JSON.parse(raw)).catch(() => ({}));
        if (out.pulled) ok++;
      }
      return res.status(200).json({ ok: true, stations: members.length, pulled: ok });
    }

    // ── Envoi direct par la station ou un relais ──
    if (q.k) {
      const k = safeId(q.k);
      const raw = await r.get(`laripresa:stationkey:${k}`);
      if (!raw) throw new HttpError(401, "Clé d'envoi inconnue");
      const { h, id } = JSON.parse(raw);
      await rateLimit(`st:${k}`, 120, 3600);
      const src = req.method === "POST" ? { ...q, ...readBody(req) } : q;
      const reading = normalizeReading(src);
      if (!reading) throw new HttpError(400, "Aucune mesure reconnue");
      await store(h, id, reading);
      return res.status(200).json({ ok: true });
    }

    // ── App (utilisateur connecté) ──
    const { emailHash: h } = await identify(req);
    const id = safeId(q.id);
    if (!id) throw new HttpError(400, "id requis");
    const rawCfg = await r.get(kCfg(h, id));
    let cfg = rawCfg ? JSON.parse(rawCfg) : null;

    if (req.method === "GET") {
      let extra = {};
      if (cfg?.mode === "ecowitt") {
        const latest = await r.get(kLatest(h, id));
        const age = latest ? Date.now() - JSON.parse(latest).ts : Infinity;
        if (age > 10 * 60e3 || q.refresh) { const out = await pullEcowitt(h, id, cfg).catch(e => ({ error: e.message })); if (out.error) extra.pullError = out.error; }
      }
      return res.status(200).json(await view(h, id, cfg, extra));
    }

    if (req.method === "POST") {
      const b = readBody(req);
      if (b.action === "config") {
        const mode = ["ecowitt", "push", "manual"].includes(b.mode) ? b.mode : "manual";
        const next = { ...(cfg || {}), mode, mac: String(b.mac || cfg?.mac || "").trim().slice(0, 40) };
        if (b.applicationKey) next.applicationKey = String(b.applicationKey).trim().slice(0, 120);
        if (b.apiKey) next.apiKey = String(b.apiKey).trim().slice(0, 120);
        if (!next.pushKey) { next.pushKey = randomBytes(18).toString("hex"); await r.set(`laripresa:stationkey:${next.pushKey}`, JSON.stringify({ h, id })); }
        await r.set(kCfg(h, id), JSON.stringify(next));
        if (mode === "ecowitt") await r.sAdd(REG, `${h}:${id}`); else await r.sRem(REG, `${h}:${id}`);
        cfg = next;
        let extra = {};
        if (mode === "ecowitt") { const out = await pullEcowitt(h, id, cfg).catch(e => ({ error: e.message })); if (out.error) extra.pullError = out.error; }
        return res.status(200).json(await view(h, id, cfg, extra));
      }
      if (b.action === "reading") {
        const reading = normalizeReading(b.reading || {});
        if (!reading) throw new HttpError(400, "Relevé invalide");
        await store(h, id, reading);
        return res.status(200).json(await view(h, id, cfg));
      }
      throw new HttpError(400, "action inconnue");
    }

    if (req.method === "DELETE") {
      if (cfg?.pushKey) await r.del(`laripresa:stationkey:${cfg.pushKey}`);
      await r.del([kCfg(h, id), kLatest(h, id), kDays(h, id)]);
      await r.sRem(REG, `${h}:${id}`);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (e) { return fail(res, e); }
}
