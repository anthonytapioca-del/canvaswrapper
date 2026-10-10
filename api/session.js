const { oauthConfigured, readSession } = require("./_lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET to inspect the session." });
  }
  const session = readSession(req);
  return res.status(200).json({
    oauthConfigured: oauthConfigured(),
    connected: Boolean(session && session.accessToken && session.canvasOrigin),
    canvasOrigin: session && session.canvasOrigin ? session.canvasOrigin : null
  });
};
