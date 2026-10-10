const { COOKIE, STATE_COOKIE, clearCookie } = require("./_lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST to sign out." });
  }
  res.setHeader("Set-Cookie", [clearCookie(COOKIE), clearCookie(STATE_COOKIE)]);
  return res.status(200).json({ ok: true });
};
