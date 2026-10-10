export const HUB_ROUTES = [
  {
    id: "hub-canvas",
    method: "POST",
    path: "/api/canvas",
    kind: "hub",
    auth: "Canvas access token in the JSON body, or an HTTP-only OAuth session cookie. Never put tokens in the URL.",
    params: [
      { name: "canvasUrl", in: "body", required: true, notes: "HTTPS Canvas origin, e.g. https://school.instructure.com" },
      { name: "token", in: "body", required: false, notes: "Personal access token when not using an OAuth session" },
      { name: "path", in: "body", required: true, notes: "Allowlisted Canvas REST path beginning with /api/v1/" }
    ],
    exampleResponse: { "id": 123, "name": "Ada Lovelace" },
    errors: ["400 invalid URL or disallowed path", "401 expired credentials", "403 permission denied", "429 rate limited", "502 Canvas unreachable"],
    rate: "Forwards Canvas rate limits. Retries 429 up to twice. Paginates at most 5 pages.",
    permissions: "Whatever the authenticated Canvas user can access. This proxy does not elevate privileges."
  },
  {
    id: "hub-session",
    method: "GET",
    path: "/api/session",
    kind: "hub",
    auth: "Optional HTTP-only session cookie. Returns no access tokens.",
    params: [],
    exampleResponse: { oauthConfigured: false, connected: false, canvasOrigin: null },
    errors: ["405 method not allowed"],
    rate: "Lightweight; not a Canvas request.",
    permissions: "None."
  },
  {
    id: "hub-logout",
    method: "POST",
    path: "/api/logout",
    kind: "hub",
    auth: "Clears the HTTP-only session cookie if present.",
    params: [],
    exampleResponse: { ok: true },
    errors: ["405 method not allowed"],
    rate: "None.",
    permissions: "None."
  },
  {
    id: "hub-oauth-start",
    method: "GET",
    path: "/api/oauth-start",
    kind: "hub",
    auth: "Requires CANVAS_OAUTH_CLIENT_ID, CANVAS_OAUTH_CLIENT_SECRET, SESSION_SECRET, and OAUTH_REDIRECT_URI.",
    params: [{ name: "canvasUrl", in: "query", required: true, notes: "HTTPS Canvas origin to authorize against" }],
    exampleResponse: "302 redirect to Canvas /login/oauth2/auth",
    errors: ["400 invalid Canvas URL", "501 OAuth not configured"],
    rate: "One redirect per authorize attempt.",
    permissions: "Institution Canvas developer key."
  },
  {
    id: "hub-oauth-callback",
    method: "GET",
    path: "/api/oauth-callback",
    kind: "hub",
    auth: "Validates OAuth state cookie, exchanges code server-side, sets HTTP-only session cookie.",
    params: [
      { name: "code", in: "query", required: true, notes: "Temporary authorization code from Canvas" },
      { name: "state", in: "query", required: true, notes: "Must match the state cookie" }
    ],
    exampleResponse: "302 redirect to /?oauth=success",
    errors: ["400 state mismatch", "501 not configured", "502 token exchange failed"],
    rate: "Single token exchange.",
    permissions: "Same as the authorizing user."
  }
];

export const CANVAS_ROUTES = [
  {
    id: "c-profile",
    method: "GET",
    path: "/api/v1/users/self/profile",
    kind: "canvas",
    auth: "Bearer token of the current user.",
    params: [],
    exampleResponse: { id: 1, name: "Ada Lovelace", short_name: "Ada", login_id: "ada" },
    errors: ["401", "403"],
    rate: "Standard Canvas REST limits.",
    permissions: "Authenticated user; reads the caller's own profile."
  },
  {
    id: "c-courses",
    method: "GET",
    path: "/api/v1/courses",
    kind: "canvas",
    auth: "Bearer token.",
    params: [
      { name: "enrollment_state", in: "query", required: false, notes: "Canvas Hub uses active" },
      { name: "include[]", in: "query", required: false, notes: "term, total_students, syllabus_body (allowlisted)" },
      { name: "per_page", in: "query", required: false, notes: "Max 100" }
    ],
    exampleResponse: [{ id: 101, name: "Biology 101", course_code: "BIO101", workflow_state: "available" }],
    errors: ["401", "403"],
    rate: "Paginated; Hub follows Link rel=next up to 5 pages.",
    permissions: "Courses the user is enrolled in."
  },
  {
    id: "c-course",
    method: "GET",
    path: "/api/v1/courses/:course_id",
    kind: "canvas",
    auth: "Bearer token.",
    params: [{ name: "include[]", in: "query", required: false, notes: "term, syllabus_body, teachers, total_scores" }],
    exampleResponse: { id: 101, name: "Biology 101", course_code: "BIO101", start_at: null, end_at: null },
    errors: ["401", "403", "404"],
    rate: "Standard Canvas REST limits.",
    permissions: "Enrollment in the course."
  },
  {
    id: "c-assignments",
    method: "GET",
    path: "/api/v1/courses/:course_id/assignments",
    kind: "canvas",
    auth: "Bearer token.",
    params: [
      { name: "include[]", in: "query", required: false, notes: "Hub requests submission for the current user" },
      { name: "order_by", in: "query", required: false, notes: "due_at" },
      { name: "per_page", in: "query", required: false, notes: "Max 100" }
    ],
    exampleResponse: [{ id: 9, name: "Lab 1", due_at: "2026-10-12T06:00:00Z", submission: { missing: false, workflow_state: "submitted" } }],
    errors: ["401", "403", "404"],
    rate: "One request per course (batched client-side).",
    permissions: "Assignments visible to the user."
  },
  {
    id: "c-enrollments",
    method: "GET",
    path: "/api/v1/courses/:course_id/enrollments",
    kind: "canvas",
    auth: "Bearer token.",
    params: [
      { name: "user_id", in: "query", required: false, notes: "self" },
      { name: "type[]", in: "query", required: false, notes: "StudentEnrollment or TeacherEnrollment" },
      { name: "include[]", in: "query", required: false, notes: "grades" }
    ],
    exampleResponse: [{ type: "StudentEnrollment", grades: { current_score: 92.5, current_grade: "A", final_score: null } }],
    errors: ["401", "403"],
    rate: "One request per course.",
    permissions: "Own enrollment and grades when published; instructor lists only if authorized."
  },
  {
    id: "c-announcements",
    method: "GET",
    path: "/api/v1/announcements",
    kind: "canvas",
    auth: "Bearer token.",
    params: [
      { name: "context_codes[]", in: "query", required: true, notes: "course_123" },
      { name: "per_page", in: "query", required: false, notes: "Hub uses 10" }
    ],
    exampleResponse: [{ id: 55, title: "Welcome", message: "<p>Hello</p>", posted_at: "2026-09-01T12:00:00Z" }],
    errors: ["401", "403"],
    rate: "One request per course (limited).",
    permissions: "Announcements the user can read."
  }
];

export const OFFICIAL_DOCS = "https://developerdocs.instructure.com/services/canvas";
