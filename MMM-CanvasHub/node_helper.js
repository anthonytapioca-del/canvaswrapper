const NodeHelper = require("node_helper");

const MAX_COURSES = 30;
const MAX_PAGES = 5;

function validCanvasOrigin(input) {
  let url;
  try {
    url = new URL(String(input || "").trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.includes(":") ||
    !host.includes(".") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) return null;
  return url.origin;
}

function nextPage(linkHeader, origin) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    if (!/rel="next"/i.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      if (url.origin === origin && url.pathname.startsWith("/api/v1/")) return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

async function canvasRequest(url, token, origin) {
  const parsed = new URL(url);
  if (parsed.origin !== origin || !parsed.pathname.startsWith("/api/v1/")) {
    throw new Error("Canvas returned an invalid pagination link.");
  }
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(parsed, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error"
    });
    if (response.status !== 429 || attempt === 2) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) ? Math.min(retryAfter, 8) * 1000 : 800 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  if (!response.ok) throw new Error(`Canvas returned HTTP ${response.status}.`);
  try {
    return { data: await response.json(), link: response.headers.get("link") };
  } catch {
    throw new Error("Canvas returned an invalid response.");
  }
}

async function getAll(origin, path, token) {
  let url = new URL(path, origin).toString();
  const values = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const response = await canvasRequest(url, token, origin);
    if (!Array.isArray(response.data)) throw new Error("Canvas returned an unexpected response.");
    values.push(...response.data);
    url = nextPage(response.link, origin);
  }
  return values;
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function plainText(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function validRequest(payload) {
  const origin = validCanvasOrigin(payload.canvasUrl);
  return origin && typeof payload.accessToken === "string" &&
    payload.accessToken.trim() && payload.accessToken.length <= 4096
    ? { origin, token: payload.accessToken.trim() }
    : null;
}

module.exports = NodeHelper.create({
  start() {},

  socketNotificationReceived(notification, payload) {
    if (notification !== "CANVASHUB_FETCH") return;
    this.fetchData(payload || {});
  },

  async fetchData(payload) {
    const credentials = validRequest(payload);
    if (!credentials) {
      this.sendSocketNotification("CANVASHUB_DATA", {
        error: "Set a valid HTTPS Canvas URL and access token in the MagicMirror config."
      });
      return;
    }

    const { origin, token } = credentials;
    const options = {
      showGrades: payload.showGrades !== false,
      showMissing: payload.showMissing !== false,
      showAnnouncements: payload.showAnnouncements !== false
    };
    try {
      const courses = await getAll(origin, "/api/v1/courses?enrollment_state=active&per_page=100", token);
      const activeCourses = courses.filter((course) => !course.access_restricted_by_date).slice(0, MAX_COURSES);
      const errors = new Set();
      const courseData = await mapLimit(activeCourses, 3, async (course) => {
        const values = { grades: [], missing: [], announcements: [] };
        const tasks = [];
        if (options.showGrades) {
          tasks.push(getAll(
            origin,
            `/api/v1/courses/${encodeURIComponent(course.id)}/enrollments?user_id=self&type[]=StudentEnrollment&include[]=grades&per_page=100`,
            token
          ).then((enrollments) => {
            const enrollment = enrollments.find((item) => item.type?.includes("StudentEnrollment")) || enrollments[0];
            const grades = enrollment?.grades || {};
            const score = grades.current_score ?? grades.computed_current_score;
            const letter = grades.current_grade ?? grades.computed_current_grade;
            if (score != null || letter) {
              values.grades.push({
                courseName: course.name || course.course_code || "Course",
                score: score != null ? `${score}%` : letter
              });
            }
          }).catch(() => errors.add("grades")));
        }
        if (options.showMissing) {
          tasks.push(getAll(
            origin,
            `/api/v1/courses/${encodeURIComponent(course.id)}/assignments?include[]=submission&per_page=100`,
            token
          ).then((assignments) => {
            assignments.filter((assignment) => assignment.submission?.missing === true).forEach((assignment) => {
              values.missing.push({
                name: assignment.name || "Assignment",
                courseName: course.name || course.course_code || "Course",
                dueAt: assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : ""
              });
            });
          }).catch(() => errors.add("missing")));
        }
        if (options.showAnnouncements) {
          tasks.push(getAll(
            origin,
            `/api/v1/announcements?context_codes[]=course_${encodeURIComponent(course.id)}&per_page=10`,
            token
          ).then((announcements) => {
            announcements.forEach((announcement) => values.announcements.push({
              title: announcement.title || "Announcement",
              courseName: course.name || course.course_code || "Course",
              postedAt: announcement.posted_at || announcement.created_at || "",
              message: plainText(announcement.message)
            }));
          }).catch(() => errors.add("announcements")));
        }
        await Promise.all(tasks);
        return values;
      });

      const data = {
        grades: courseData.flatMap((item) => item.grades),
        missing: courseData.flatMap((item) => item.missing).slice(0, 100),
        announcements: courseData.flatMap((item) => item.announcements)
          .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0))
          .slice(0, 20)
      };
      this.sendSocketNotification("CANVASHUB_DATA", {
        data,
        warning: errors.size
          ? `Some ${[...errors].map((type) => ({
            grades: "grade data",
            missing: "missing assignment data",
            announcements: "announcement data"
          })[type]).join(", ")} could not be loaded.`
          : null
      });
    } catch (error) {
      this.sendSocketNotification("CANVASHUB_DATA", { error: error.message || "Could not load Canvas data." });
    }
  }
});
