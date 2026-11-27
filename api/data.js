// Données du vignoble, toujours rattachées à l'utilisateur connecté.
// - révision (rev) : un envoi basé sur une révision dépassée est refusé (409) et le client fusionne
// - sauvegarde quotidienne automatique conservée 35 jours
import { redis, preflight, readBody, identify, userKey, fail, HttpError, romeDate, scanKeys } from "./_server.js";

const MAX_BYTES = 3_000_000;
const BAK_TTL = 60 * 60 * 24 * 35;
const revOf = d => (d ? (Number.isInteger(d.rev) ? d.rev : 1) : 0);

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { emailHash, email } = await identify(req);
    const key = userKey(emailHash);
    const r = await redis();

    if (req.method === "GET") {
      const q = req.query || {};
      if (q.backups) {
        const keys = await scanKeys(userKey(emailHash, ":bak:*"));
        return res.status(200).json({ backups: keys.map(k => k.split(":bak:")[1]).sort().reverse() });
      }
      if (q.backup) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.backup))) throw new HttpError(400, "Date invalide");
        const raw = await r.get(userKey(emailHash, ":bak:" + q.backup));
        if (!raw) throw new HttpError(404, "Sauvegarde introuvable");
        return res.status(200).json(JSON.parse(raw));
      }
      const raw = await r.get(key);
      if (!raw) return res.status(404).json({ error: "Aucune donnée" });
      const d = JSON.parse(raw);
      return res.status(200).json({ ...d, rev: revOf(d) });
    }

    if (req.method === "POST") {
      const p = readBody(req);
      if (!p || typeof p !== "object" || Array.isArray(p)) throw new HttpError(400, "Données invalides");
      const raw = await r.get(key);
      const existing = raw ? JSON.parse(raw) : null;
      const cur = revOf(existing);
      const { baseRev, ...incoming } = p;
      let next;
      if (incoming.schema >= 7) {
        if (existing && baseRev !== cur) return res.status(409).json({ conflict: true, data: { ...existing, rev: cur } });
        next = incoming;
      } else {
        // Ancienne version de l'app (avant fusion) : on ne perd pas les nouvelles rubriques déjà enregistrées
        next = { ...(existing || {}), ...incoming };
      }
      next.rev = cur + 1;
      next.owner = email;
      next.savedAt = incoming.savedAt || new Date().toISOString();
      const out = JSON.stringify(next);
      if (out.length > MAX_BYTES) throw new HttpError(413, "Données trop volumineuses");
      if (raw) await r.set(userKey(emailHash, ":bak:" + romeDate()), raw, { EX: BAK_TTL, NX: true }); // état d'avant la 1re écriture du jour
      await r.set(key, out); // sans expiration : historique pluriannuel
      return res.status(200).json({ ok: true, rev: next.rev });
    }

    if (req.method === "DELETE") {
      // Droit à l'effacement : toutes les clés de l'utilisateur (données, sauvegardes, factures, station)
      const keys = await scanKeys(userKey(emailHash, "*"));
      const pushKeys = [];
      for (const k of keys) if (k.includes(":stcfg:")) { try { const c = JSON.parse(await r.get(k)); if (c?.pushKey) pushKeys.push(`laripresa:stationkey:${c.pushKey}`); } catch {} }
      if (keys.length) await r.del(keys);
      if (pushKeys.length) await r.del(pushKeys);
      const members = await r.sMembers("laripresa:stations").catch(() => []);
      const mine = members.filter(m => m.startsWith(emailHash + ":"));
      if (mine.length) await r.sRem("laripresa:stations", mine);
      return res.status(200).json({ ok: true, deleted: keys.length });
    }

    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (e) { return fail(res, e); }
}
