// Pièces jointes (photos de factures), une clé par document, rattachée à l'utilisateur.
import { redis, preflight, readBody, identify, userKey, fail, HttpError, safeId, scanKeys } from "./_server.js";

const MAX_DOC = 1_200_000, MAX_COUNT = 400;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { emailHash } = await identify(req);
    const r = await redis();
    const id = safeId((req.query || {}).id);
    const key = userKey(emailHash, ":doc:" + id);

    if (req.method === "GET") {
      if (!id) throw new HttpError(400, "id requis");
      const raw = await r.get(key);
      if (!raw) throw new HttpError(404, "Document introuvable");
      return res.status(200).json({ id, dataUrl: raw });
    }
    if (req.method === "POST") {
      const { dataUrl } = readBody(req);
      if (!id) throw new HttpError(400, "id requis");
      if (typeof dataUrl !== "string" || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(dataUrl)) throw new HttpError(400, "Format non accepté");
      if (dataUrl.length > MAX_DOC) throw new HttpError(413, "Document trop volumineux");
      if (!(await r.exists(key)) && (await scanKeys(userKey(emailHash, ":doc:*"))).length >= MAX_COUNT) throw new HttpError(413, "Nombre maximal de documents atteint");
      await r.set(key, dataUrl);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      if (!id) throw new HttpError(400, "id requis");
      await r.del(key);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (e) { return fail(res, e); }
}
