// Relais vers l'API Anthropic (analyse agronomique, lecture de factures).
// Réservé aux utilisateurs connectés ; le modèle et les plafonds sont fixés côté serveur.
import { preflight, readBody, identify, rateLimit, fail, HttpError } from "./_server.js";


export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { emailHash } = await identify(req);
    await rateLimit(`ai:${emailHash}`, 80, 86400);
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Clé ANTHROPIC_API_KEY absente");
    const b = readBody(req);
    if (!Array.isArray(b.messages) || !b.messages.length) throw new HttpError(400, "messages requis");
    const payload = {
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: Math.min(Number(b.max_tokens) || 750, 2500),
      messages: b.messages,
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    return res.status(r.status).json(d);
  } catch (e) { return fail(res, e); }
}
