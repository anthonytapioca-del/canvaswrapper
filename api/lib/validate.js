function validCanvasOrigin(input) {
  let url;
  try { url = new URL(String(input || "").trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(":") ||
    !host.includes(".")
  ) return null;
  if (host === "vercel.app" || host.endsWith(".vercel.app")) return null;
  return url.origin;
}

const ALLOWED_PATHS = [
  /^\/api\/v1\/users\/self\/profile$/,
  /^\/api\/v1\/courses$/,
  /^\/api\/v1\/courses\/\d+$/,
  /^\/api\/v1\/courses\/\d+\/assignments$/,
  /^\/api\/v1\/courses\/\d+\/enrollments$/,
  /^\/api\/v1\/announcements$/
];

const ALLOWED_QUERY = {
  "/api/v1/users/self/profile": new Set([]),
  "/api/v1/courses": new Set(["enrollment_state", "include[]", "per_page", "page"]),
  "/api/v1/courses/:id": new Set(["include[]", "per_page"]),
  "/api/v1/courses/:id/assignments": new Set(["include[]", "per_page", "page", "order_by", "bucket"]),
  "/api/v1/courses/:id/enrollments": new Set(["user_id", "type[]", "include[]", "per_page", "page"]),
  "/api/v1/announcements": new Set(["context_codes[]", "per_page", "page", "start_date", "only_announcements"])
};

const INCLUDE_ALLOW = new Set([
  "total_students", "term", "syllabus_body", "public_description",
  "course_image", "teachers", "total_scores", "submission", "grades",
  "observed_users", "concluded"
]);

function pathKey(pathname) {
  if (pathname === "/api/v1/users/self/profile") return pathname;
  if (pathname === "/api/v1/courses") return pathname;
  if (pathname === "/api/v1/announcements") return pathname;
  if (/^\/api\/v1\/courses\/\d+$/.test(pathname)) return "/api/v1/courses/:id";
  if (/^\/api\/v1\/courses\/\d+\/assignments$/.test(pathname)) return "/api/v1/courses/:id/assignments";
  if (/^\/api\/v1\/courses\/\d+\/enrollments$/.test(pathname)) return "/api/v1/courses/:id/enrollments";
  return null;
}

function allowedQueryValue(key, value) {
  if (value.length > 200) return false;
  if (key === "per_page") return /^\d{1,3}$/.test(value) && Number(value) <= 100;
  if (key === "page") return /^\d{1,4}$/.test(value);
  if (key === "enrollment_state") return /^(active|invited_or_pending|completed)$/.test(value);
  if (key === "order_by") return /^(due_at|name|position)$/.test(value);
  if (key === "bucket") return /^(past|overdue|undated|ungraded|unsubmitted|upcoming)$/.test(value);
  if (key === "user_id") return value === "self" || /^\d+$/.test(value);
  if (key === "type[]") return /^(StudentEnrollment|TeacherEnrollment|TaEnrollment|ObserverEnrollment|DesignerEnrollment)$/.test(value);
  if (key === "include[]") return INCLUDE_ALLOW.has(value);
  if (key === "context_codes[]") return /^course_\d+$/.test(value);
  if (key === "start_date") return /^\d{4}-\d{2}-\d{2}/.test(value);
  if (key === "only_announcements") return value === "true" || value === "false";
  return false;
}

function sanitizeCanvasUrl(origin, path) {
  if (typeof path !== "string" || path.length > 1800 || !path.startsWith("/api/v1/")) return null;
  let parsed;
  try { parsed = new URL(path, origin); } catch { return null; }
  if (parsed.origin !== origin) return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.hash) return null;
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(parsed.pathname))) return null;
  const key = pathKey(parsed.pathname);
  if (!key) return null;
  const allowed = ALLOWED_QUERY[key];
  const next = new URL(parsed.pathname, origin);
  for (const [name, value] of parsed.searchParams.entries()) {
    if (!allowed.has(name) || !allowedQueryValue(name, value)) continue;
    next.searchParams.append(name, value);
  }
  return next;
}

function parseLinkNext(linkHeader, origin) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(",");
  for (const part of parts) {
    if (!/rel="next"/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    let nextUrl;
    try { nextUrl = new URL(match[1]); } catch { continue; }
    if (nextUrl.origin !== origin) continue;
    const sanitized = sanitizeCanvasUrl(origin, `${nextUrl.pathname}${nextUrl.search}`);
    if (sanitized) return sanitized;
  }
  return null;
}

function publicError(status) {
  if (status === 401) return { status: 401, error: "Canvas rejected the credentials. The token may be invalid or expired." };
  if (status === 403) return { status: 403, error: "Canvas denied access. Your account may not have permission for this data." };
  if (status === 404) return { status: 404, error: "Canvas could not find that resource. Check the Canvas URL and course access." };
  if (status === 429) return { status: 429, error: "Canvas rate-limited this request. Wait a moment and retry." };
  if (status >= 500) return { status: 502, error: "Canvas is unavailable or returned a server error. Try again later." };
  return { status: 502, error: "Canvas API request failed." };
}

module.exports = {
  validCanvasOrigin,
  ALLOWED_PATHS,
  sanitizeCanvasUrl,
  parseLinkNext,
  publicError
};
