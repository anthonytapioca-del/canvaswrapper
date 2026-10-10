const crypto = require("crypto");

const COOKIE = "canvas_hub_session";
const STATE_COOKIE = "canvas_hub_oauth_state";
const MAX_COOKIE = 3500;

function secret() {
  return process.env.SESSION_SECRET || process.env.CANVAS_OAUTH_CLIENT_SECRET || "";
}

function oauthConfigured() {
  return Boolean(
    process.env.CANVAS_OAUTH_CLIENT_ID &&
    process.env.CANVAS_OAUTH_CLIENT_SECRET &&
    process.env.SESSION_SECRET
  );
}

function keyFromSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

function encryptJson(obj) {
  const s = secret();
  if (!s) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(s), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decryptJson(token) {
  const s = secret();
  if (!s || !token) return null;
  try {
    const buf = Buffer.from(String(token), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(s), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookieHeader(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    "Secure"
  ];
  if (httpOnly) parts.push("HttpOnly");
  if (typeof maxAge === "number") parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`;
}

function readSession(req) {
  const cookies = parseCookies(req);
  return decryptJson(cookies[COOKIE]);
}

function sessionCookie(payload, maxAge = 60 * 60 * 8) {
  const value = encryptJson(payload);
  if (!value) return null;
  if (value.length > MAX_COOKIE) return { tooLarge: true };
  return cookieHeader(COOKIE, value, { maxAge });
}

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = {
  COOKIE,
  STATE_COOKIE,
  oauthConfigured,
  encryptJson,
  decryptJson,
  parseCookies,
  cookieHeader,
  clearCookie,
  readSession,
  sessionCookie,
  randomState
};
