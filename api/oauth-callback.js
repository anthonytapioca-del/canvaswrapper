const { validCanvasOrigin } = require("./_lib/validate");
const {
  oauthConfigured, parseCookies, STATE_COOKIE, sessionCookie, clearCookie
} = require("./_lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET for the OAuth callback." });
  }
  if (!oauthConfigured()) {
    return res.status(501).json({ error: "Canvas OAuth is not configured on this deployment." });
  }

  const cookies = parseCookies(req);
  let stored;
  try { stored = JSON.parse(cookies[STATE_COOKIE] || "null"); } catch { stored = null; }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!stored || !state || stored.state !== state) {
    res.setHeader("Set-Cookie", clearCookie(STATE_COOKIE));
    return res.status(400).send("OAuth state mismatch. Close this window and try authorizing again.");
  }
  if (!code) {
    return res.status(400).send("Canvas did not return an authorization code.");
  }

  const origin = validCanvasOrigin(stored.canvasOrigin);
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!origin || !redirectUri) {
    return res.status(400).send("Invalid OAuth configuration.");
  }

  try {
    const tokenRes = await fetch(new URL("/login/oauth2/token", origin), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.CANVAS_OAUTH_CLIENT_ID,
        client_secret: process.env.CANVAS_OAUTH_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code
      })
    });
    if (!tokenRes.ok) {
      return res.status(502).send("Canvas could not complete OAuth. Confirm the developer key and redirect URI.");
    }
    const payload = await tokenRes.json();
    const accessToken = payload && payload.access_token;
    if (!accessToken) return res.status(502).send("Canvas did not return an access token.");

    const cookie = sessionCookie({
      canvasOrigin: origin,
      accessToken,
      refreshToken: payload.refresh_token || null,
      createdAt: Date.now()
    });
    if (!cookie) return res.status(500).send("Could not create a session.");
    if (cookie.tooLarge) {
      return res.status(500).send("The Canvas token is too large for a cookie session. Use a personal access token locally instead.");
    }

    res.setHeader("Set-Cookie", [cookie, clearCookie(STATE_COOKIE)]);
    res.writeHead(302, { Location: "/?oauth=success" });
    res.end();
  } catch {
    return res.status(502).send("Could not reach Canvas to complete OAuth.");
  }
};
