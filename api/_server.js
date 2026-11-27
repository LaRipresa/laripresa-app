// Outils partagés par les fonctions /api (Redis, identité, garde-fous)
import { createClient } from "redis";
import { createHash } from "crypto";

let _client = null;
export async function redis() {
  if (_client?.isOpen) return _client;
  _client = createClient({ url: process.env.REDIS_URL });
  _client.on("error", e => console.error("Redis:", e));
  await _client.connect();
  return _client;
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const SESSION_TTL = 60 * 60 * 24 * 30;
export const hashEmail = email => createHash("sha256").update(String(email).toLowerCase().trim()).digest("hex");
export const userKey = (emailHash, suffix = "") => `laripresa:user:${emailHash}${suffix}`;
export const validEmail = e => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length < 200;
export const safeId = id => typeof id === "string" || typeof id === "number" ? String(id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) : "";

// Les fonctions sont appelées par l'app elle-même (même origine) : pas de CORS ouvert.
export function preflight(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

export function readBody(req) {
  if (req.body == null || req.body === "") return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { throw new HttpError(400, "JSON invalide"); } }
  return req.body;
}

// Identité = jeton de session uniquement. Les données sont toujours rattachées à l'utilisateur connecté.
export async function identify(req) {
  const token = req.headers["x-session-token"];
  if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, "Non authentifié");
  const r = await redis();
  const key = `laripresa:session:${token}`;
  const raw = await r.get(key);
  if (!raw) throw new HttpError(401, "Session expirée");
  const s = JSON.parse(raw);
  r.expire(key, SESSION_TTL).catch(() => {}); // session glissante : 30 jours après la dernière utilisation
  return { emailHash: s.emailHash, email: s.email, name: s.name };
}

// Limiteur simple : max appels par fenêtre (secondes)
export async function rateLimit(name, max, windowSec) {
  const r = await redis();
  const key = `laripresa:rl:${name}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, windowSec);
  if (n > max) throw new HttpError(429, "Trop de tentatives, réessayez plus tard");
  return n;
}

export function fail(res, e) {
  const status = e instanceof HttpError ? e.status : 500;
  if (status >= 500) console.error(e);
  return res.status(status).json({ error: status >= 500 ? "Erreur serveur" : e.message });
}

// Date locale du vignoble (Europe/Rome) au format AAAA-MM-JJ
export const romeDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function scanKeys(match) {
  const r = await redis();
  const out = [];
  for await (const k of r.scanIterator({ MATCH: match, COUNT: 200 })) {
    if (Array.isArray(k)) out.push(...k); else out.push(k);
  }
  return out;
}
