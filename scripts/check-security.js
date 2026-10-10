const assert = require("assert");
const { validCanvasOrigin, sanitizeCanvasUrl } = require("../api/_lib/validate");

assert.strictEqual(validCanvasOrigin("https://school.instructure.com"), "https://school.instructure.com");
assert.strictEqual(validCanvasOrigin("http://school.instructure.com"), null);
assert.strictEqual(validCanvasOrigin("https://127.0.0.1"), null);
assert.strictEqual(validCanvasOrigin("https://localhost"), null);
assert.strictEqual(validCanvasOrigin("https://evil.com:443@school.instructure.com"), null);
assert.strictEqual(validCanvasOrigin("not a url"), null);

const origin = "https://school.instructure.com";
assert.ok(sanitizeCanvasUrl(origin, "/api/v1/users/self/profile"));
assert.ok(sanitizeCanvasUrl(origin, "/api/v1/courses/12/assignments?include[]=submission&per_page=100"));
assert.ok(sanitizeCanvasUrl(origin, "/api/v1/announcements?context_codes[]=course_12"));
assert.strictEqual(sanitizeCanvasUrl(origin, "/api/v1/users/1/files"), null);
assert.strictEqual(sanitizeCanvasUrl(origin, "https://evil.example/api/v1/courses"), null);
const stripped = sanitizeCanvasUrl(origin, "/api/v1/courses/12/assignments?callback=http://evil&include[]=submission");
assert.ok(stripped);
assert.strictEqual(stripped.searchParams.get("callback"), null);
assert.strictEqual(stripped.searchParams.get("include[]"), "submission");

const sanitized = sanitizeCanvasUrl(origin, "/api/v1/courses?enrollment_state=active&include[]=term&hack=1");
assert.ok(sanitized);
assert.strictEqual(sanitized.searchParams.get("hack"), null);
assert.strictEqual(sanitized.origin, origin);

console.log("security checks passed");
