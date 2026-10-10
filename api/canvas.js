const { validCanvasOrigin, sanitizeCanvasUrl, parseLinkNext, publicError } = require("./_lib/validate");
const { readSession } = require("./_lib/session");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canvasGet(url, token, attempt = 0) {
  const upstream = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });
  if (upstream.status === 429 && attempt < 2) {
    const retryAfter = Number(upstream.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) ? Math.min(retryAfter, 8) * 1000 : 800 * (attempt + 1);
    await sleep(wait);
    return canvasGet(url, token, attempt + 1);
  }
  return upstream;
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST for Canvas API requests." });
  }

  const body = req.body || {};
  const session = readSession(req);
  const bodyToken = typeof body.token === "string" ? body.token.trim() : "";
  const token = bodyToken || (session && typeof session.accessToken === "string" ? session.accessToken : "");
  const origin = validCanvasOrigin(body.canvasUrl || (session && session.canvasOrigin) || "");
  const path = typeof body.path === "string" ? body.path : "";

  if (!origin) return res.status(400).json({ error: "Enter a valid HTTPS Canvas URL." });
  if (session && session.canvasOrigin && origin !== session.canvasOrigin && !bodyToken) {
    return res.status(400).json({ error: "The requested Canvas domain does not match this session." });
  }
  if (!token || token.length > 4096) return res.status(400).json({ error: "A valid Canvas API token is required." });

  const parsed = sanitizeCanvasUrl(origin, path);
  if (!parsed) return res.status(400).json({ error: "This Canvas API endpoint is not enabled in Canvas Hub." });

  try {
    const upstream = await canvasGet(parsed.toString(), token);
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const mapped = publicError(upstream.status >= 400 ? upstream.status : 502);
      return res.status(mapped.status).json({ error: mapped.error });
    }

    let data = await upstream.json();
    if (!upstream.ok) {
      const mapped = publicError(upstream.status);
      return res.status(mapped.status).json({ error: mapped.error, status: mapped.status });
    }

    if (Array.isArray(data)) {
      let pages = 1;
      let next = parseLinkNext(upstream.headers.get("link"), origin);
      while (next && pages < 5) {
        const pageResponse = await canvasGet(next.toString(), token);
        if (!pageResponse.ok || !(pageResponse.headers.get("content-type") || "").includes("application/json")) break;
        const pageData = await pageResponse.json();
        if (!Array.isArray(pageData)) break;
        data.push(...pageData);
        next = parseLinkNext(pageResponse.headers.get("link"), origin);
        pages++;
      }
    }
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: "Could not reach Canvas. Check the URL and try again." });
  }
};
