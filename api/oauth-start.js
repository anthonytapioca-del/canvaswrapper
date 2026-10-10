const { validCanvasOrigin } = require("./_lib/validate");
const { oauthConfigured, cookieHeader, STATE_COOKIE, randomState } = require("./_lib/session");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Use GET to start Canvas OAuth." });
  }
  if (!oauthConfigured()) {
    return res.status(501).json({
      error: "Canvas OAuth is not configured on this deployment.",
      required: ["CANVAS_OAUTH_CLIENT_ID", "CANVAS_OAUTH_CLIENT_SECRET", "SESSION_SECRET", "OAUTH_REDIRECT_URI"]
    });
  }

  const origin = validCanvasOrigin(req.query.canvasUrl || process.env.CANVAS_BASE_URL || "");
  if (!origin) {
    return res.status(400).json({ error: "Provide a valid HTTPS Canvas URL to authorize." });
  }

  const state = randomState();
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!redirectUri || !redirectUri.startsWith("https://")) {
    return res.status(501).json({ error: "OAUTH_REDIRECT_URI must be an HTTPS URL pointing to /api/oauth-callback." });
  }

  const authorize = new URL("/login/oauth2/auth", origin);
  authorize.searchParams.set("client_id", process.env.CANVAS_OAUTH_CLIENT_ID);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("purpose", "Canvas Hub");

  res.setHeader("Set-Cookie", cookieHeader(STATE_COOKIE, JSON.stringify({ state, canvasOrigin: origin }), { maxAge: 600 }));
  res.writeHead(302, { Location: authorize.toString() });
  res.end();
};
