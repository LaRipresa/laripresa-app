import { randomBytes, randomInt, timingSafeEqual } from "crypto";
import { redis, preflight, readBody, hashEmail, validEmail, rateLimit, fail, HttpError, SESSION_TTL } from "./_server.js";

const norm = e => String(e).toLowerCase().trim();
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function allowed(email) {
  const list = (process.env.AUTH_ALLOWED_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(norm(email));
}

async function createSession(email, name, picture) {
  const r = await redis();
  const token = randomBytes(32).toString("hex");
  await r.set(`laripresa:session:${token}`, JSON.stringify({ email: norm(email), emailHash: hashEmail(email), name, picture }), { EX: SESSION_TTL });
  return token;
}

// Jeton Google vérifié auprès de Google (signature + audience). Refusé si GOOGLE_CLIENT_ID n'est pas configuré.
async function verifyGoogle(credential) {
  if (!process.env.GOOGLE_CLIENT_ID) throw new HttpError(400, "Connexion Google non configurée");
  const g = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  if (!g.ok) throw new HttpError(401, "Jeton Google invalide");
  const d = await g.json();
  if (d.aud !== process.env.GOOGLE_CLIENT_ID || String(d.email_verified) !== "true" || !validEmail(d.email)) throw new HttpError(401, "Jeton Google invalide");
  return { email: d.email, name: d.name || d.email.split("@")[0], picture: d.picture || null };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = readBody(req);
    const { action } = body;
    const r = await redis();

    if (action === "google") {
      if (!body.credential) throw new HttpError(400, "credential requis");
      const u = await verifyGoogle(body.credential);
      if (!allowed(u.email)) throw new HttpError(403, "Email non autorisé");
      const token = await createSession(u.email, u.name, u.picture);
      return res.status(200).json({ token, email: norm(u.email), name: u.name, picture: u.picture });
    }

    if (action === "send_code") {
      const { email } = body;
      if (!validEmail(email)) throw new HttpError(400, "Email invalide");
      if (!allowed(email)) throw new HttpError(403, "Email non autorisé");
      await rateLimit(`send:${hashEmail(email)}`, 5, 900);
      const code = String(randomInt(100000, 1000000));
      await r.set(`laripresa:magic:${norm(email)}`, code, { EX: 600 });
      await r.del(`laripresa:magictry:${norm(email)}`);

      if (process.env.RESEND_API_KEY) {
        const m = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "La Ripresa <onboarding@resend.dev>",
            to: [email],
            subject: "Votre code de connexion La Ripresa",
            html: `<div style="font-family:Georgia,serif;max-width:400px;margin:0 auto;padding:32px">
              <h2 style="color:#5C3D1E;font-weight:400;margin-bottom:8px">La Ripresa · Etna DOC</h2>
              <p style="color:#9A8070;font-size:13px;margin-bottom:24px">Vignoble Biologique</p>
              <p style="font-size:14px;color:#1C1A17">Votre code de connexion :</p>
              <div style="font-size:36px;font-weight:300;letter-spacing:12px;color:#1C1A17;padding:20px 0;border-bottom:1px solid #EDE8DE;margin:12px 0">${code}</div>
              <p style="font-size:11px;color:#C0A882;margin-top:16px">Ce code expire dans 10 minutes.</p>
            </div>`,
          }),
        });
        if (!m.ok) throw new HttpError(502, "Envoi de l'email impossible");
        return res.status(200).json({ ok: true, mode: "email" });
      }
      // Pas de service d'email : avec APP_PIN, l'utilisateur saisit son code personnel (rien n'est affiché).
      if (process.env.APP_PIN) return res.status(200).json({ ok: true, mode: "pin" });
      // Sinon mode ouvert (historique) : le code est renvoyé à l'écran. À éviter en production.
      return res.status(200).json({ ok: true, mode: "open", code });
    }

    if (action === "verify_code") {
      const { email, code } = body;
      if (!validEmail(email) || !code) throw new HttpError(400, "email et code requis");
      if (!allowed(email)) throw new HttpError(403, "Email non autorisé");
      await rateLimit(`verify:${hashEmail(email)}`, 8, 900);
      const key = `laripresa:magic:${norm(email)}`;
      const stored = await r.get(key);
      const c = String(code).trim();
      const pinOk = !process.env.RESEND_API_KEY && process.env.APP_PIN && same(c, process.env.APP_PIN);
      const codeOk = stored && same(c, stored) && (process.env.RESEND_API_KEY || !process.env.APP_PIN);
      if (!pinOk && !codeOk) throw new HttpError(401, "Code invalide ou expiré");
      await r.del(key);
      const name = norm(email).split("@")[0];
      const token = await createSession(email, name, null);
      return res.status(200).json({ token, email: norm(email), name });
    }

    if (action === "signout") {
      const token = req.headers["x-session-token"];
      if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) await r.del(`laripresa:session:${token}`);
      return res.status(200).json({ ok: true });
    }

    throw new HttpError(400, "action inconnue");
  } catch (e) { return fail(res, e); }
}
