const cache = new Map();
let inflight = new Map();
let activeAbort = null;

export const diagnostics = {
  profile: "idle",
  courses: "idle",
  assignments: "idle",
  grades: "idle",
  announcements: "idle",
  lastSuccess: null,
  lastError: null,
  domain: ""
};

export function resetDiagnostics() {
  diagnostics.profile = "idle";
  diagnostics.courses = "idle";
  diagnostics.assignments = "idle";
  diagnostics.grades = "idle";
  diagnostics.announcements = "idle";
  diagnostics.lastSuccess = null;
  diagnostics.lastError = null;
}

export function clearCache() {
  cache.clear();
  inflight.clear();
}

export function abortInflight() {
  if (activeAbort) activeAbort.abort();
  activeAbort = new AbortController();
  return activeAbort.signal;
}

export async function canvasRequest({ canvasUrl, token, path, signal, useCache = true }) {
  const key = `${canvasUrl}|${path}`;
  if (useCache && cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const res = await fetch("/api/canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canvasUrl, token, path }),
      signal,
      cache: "no-store"
    });
    let data;
    try { data = await res.json(); }
    catch { throw new Error("The API returned an invalid response. Check your Vercel deployment."); }
    if (!res.ok) {
      const err = new Error(data.error || `Canvas request failed (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    cache.set(key, data);
    return data;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export async function fetchSession() {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    if (!res.ok) return { oauthConfigured: false, connected: false, canvasOrigin: null };
    return await res.json();
  } catch {
    return { oauthConfigured: false, connected: false, canvasOrigin: null };
  }
}
