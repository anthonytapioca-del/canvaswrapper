const ALLOWED_PATHS = [
  /^\/api\/v1\/users\/self\/profile$/,
  /^\/api\/v1\/courses$/,
  /^\/api\/v1\/courses\/\d+\/assignments$/,
  /^\/api\/v1\/courses\/\d+\/enrollments$/,
  /^\/api\/v1\/announcements$/
];

function validCanvasOrigin(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") ||
      host === "127.0.0.1" || host === "::1" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
      !host.includes(".")) return null;
  return url.origin;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for Canvas API requests." });
  }

  const body = req.body || {};
  const origin = validCanvasOrigin(body.canvasUrl);
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const path = typeof body.path === "string" ? body.path : "";

  if (!origin) return res.status(400).json({ error: "Enter a valid HTTPS Canvas URL." });
  if (!token || token.length > 4096) return res.status(400).json({ error: "A valid Canvas API token is required." });
  if (path.length > 1800 || !path.startsWith("/api/v1/")) return res.status(400).json({ error: "Unsupported Canvas API path." });

  let parsed;
  try { parsed = new URL(path, origin); } catch { return res.status(400).json({ error: "Invalid API path." }); }
  if (parsed.origin !== origin || !ALLOWED_PATHS.some(pattern => pattern.test(parsed.pathname))) {
    return res.status(400).json({ error: "This Canvas API endpoint is not enabled in the wrapper." });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return res.status(upstream.status >= 400 ? upstream.status : 502)
        .json({ error: "Canvas returned an unexpected response. Check the Canvas URL and API token." });
    }

    let data = await upstream.json();
    if (!upstream.ok) {
      const status = upstream.status === 401 || upstream.status === 403 ? upstream.status : 502;
      const detail = typeof data?.errors?.[0]?.message === "string" ? data.errors[0].message : "";
      return res.status(status).json({
        error: status === 401 ? "Canvas rejected the token. Check it and try again." :
          status === 403 ? "Canvas denied access. Your school may restrict this data or token." :
          detail || "Canvas API request failed."
      });
    }

    // Collect a small, bounded number of Canvas pagination pages.
    if (Array.isArray(data)) {
      let pages = 1;
      let next = upstream.headers.get("link");
      while (next && /rel="next"/.test(next) && pages < 5) {
        const match = next.match(/<([^>]+)>;\s*rel="next"/);
        if (!match) break;
        const nextUrl = new URL(match[1]);
        if (nextUrl.origin !== origin || !ALLOWED_PATHS.some(pattern => pattern.test(nextUrl.pathname))) break;
        const pageResponse = await fetch(nextUrl.toString(), {
          headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
        });
        if (!pageResponse.ok || !(pageResponse.headers.get("content-type") || "").includes("application/json")) break;
        const pageData = await pageResponse.json();
        if (!Array.isArray(pageData)) break;
        data.push(...pageData);
        next = pageResponse.headers.get("link");
        pages++;
      }
    }
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Could not reach Canvas. Check the URL and try again." });
  }
};
