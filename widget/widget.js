const state = {
  config: null,
  timer: null,
  loading: false
};

const byId = (id) => document.getElementById(id);

function setStatus(label, kind = "") {
  const status = byId("status");
  status.textContent = label;
  status.className = `status ${kind}`.trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function displayDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mostRecentlyDue(assignments) {
  return [...assignments]
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.NEGATIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.NEGATIVE_INFINITY;
      const validADue = Number.isFinite(aDue) ? aDue : Number.NEGATIVE_INFINITY;
      const validBDue = Number.isFinite(bDue) ? bDue : Number.NEGATIVE_INFINITY;
      return validBDue - validADue;
    })
    .slice(0, 3);
}

async function canvasRequest(path) {
  const response = await fetch("/api/canvas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      canvasUrl: state.config.canvasUrl,
      token: state.config.accessToken,
      path
    }),
    cache: "no-store"
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Canvas Hub returned an invalid response.");
  }
  if (!response.ok) throw new Error(data.error || `Canvas Hub request failed (${response.status}).`);
  return data;
}

async function mapLimit(items, limit, callback) {
  const result = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      result[index] = await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

function renderSummary(data) {
  const cards = [
    { label: "Courses", value: data.courseCount, tone: "violet", icon: "▦" },
    { label: "Missing", value: data.missing.length, tone: "rose", icon: "!" },
    { label: "Grades", value: data.grades.length, tone: "mint", icon: "↗" }
  ];
  byId("summary").innerHTML = cards.map((card) => `
    <article class="summary-card ${card.tone}">
      <span class="summary-icon" aria-hidden="true">${card.icon}</span>
      <span class="summary-label">${card.label}</span>
      <strong>${card.value}</strong>
    </article>`).join("");
  byId("summary").classList.remove("hidden");
}

function renderGrades(grades) {
  if (!state.config.showGrades) return "";
  return `<section class="widget-section">
    <div class="section-heading"><div><p class="eyebrow">Academic progress</p><h2>Course grades</h2></div><span class="section-count">${grades.length}</span></div>
    ${grades.length ? `<div class="data-list">${grades.slice(0, 8).map((grade) => `
      <article class="data-row">
        <span class="course-dot violet-dot" aria-hidden="true"></span>
        <span class="row-copy"><strong>${escapeHtml(grade.courseName)}</strong><small>${escapeHtml(grade.label)}</small></span>
        <span class="grade-value">${escapeHtml(grade.value)}</span>
      </article>`).join("")}</div>` : '<p class="empty">No published grades yet.</p>'}
  </section>`;
}

function renderMissing(assignments) {
  if (!state.config.showMissing) return "";
  const recent = mostRecentlyDue(assignments);
  return `<section class="widget-section">
    <div class="section-heading"><div><p class="eyebrow">3 most recently due</p><h2>Missing assignments</h2></div><span class="section-count ${assignments.length ? "alert-count" : ""}">${assignments.length}</span></div>
    ${recent.length ? `<div class="data-list">${recent.map((assignment) => `
      <article class="data-row">
        <span class="course-dot rose-dot" aria-hidden="true">!</span>
        <span class="row-copy"><strong>${escapeHtml(assignment.name)}</strong><small>${escapeHtml(assignment.courseName)}</small></span>
        <span class="row-date">${assignment.dueAt ? `Due ${escapeHtml(displayDate(assignment.dueAt))}` : "Missing"}</span>
      </article>`).join("")}</div>` : '<p class="empty">You are all caught up. No missing assignments.</p>'}
  </section>`;
}

function renderAnnouncements(announcements) {
  if (!state.config.showAnnouncements) return "";
  return `<section class="widget-section">
    <div class="section-heading"><div><p class="eyebrow">From your instructors</p><h2>Announcements</h2></div><span class="section-count">${announcements.length}</span></div>
    ${announcements.length ? `<div class="announcement-list">${announcements.slice(0, 4).map((announcement) => `
      <article class="announcement">
        <div class="announcement-top"><strong>${escapeHtml(announcement.title)}</strong><time>${escapeHtml(displayDate(announcement.postedAt))}</time></div>
        <p class="announcement-course">${escapeHtml(announcement.courseName)}</p>
        ${announcement.message ? `<p class="announcement-message">${escapeHtml(announcement.message)}</p>` : ""}
      </article>`).join("")}</div>` : '<p class="empty">No recent announcements.</p>'}
  </section>`;
}

function showError(message) {
  byId("alert").textContent = message;
  byId("alert").classList.remove("hidden");
  setStatus("Needs attention", "error");
}

async function loadData() {
  if (!state.config || state.loading) return;
  state.loading = true;
  setStatus("Syncing");
  byId("alert").classList.add("hidden");

  try {
    const coursesResponse = await canvasRequest("/api/v1/courses?enrollment_state=active&include[]=total_scores&per_page=100");
    const courses = Array.isArray(coursesResponse)
      ? coursesResponse.filter((course) => !course.access_restricted_by_date).slice(0, 20)
      : [];
    const failures = new Set();
    const courseData = await mapLimit(courses, 3, async (course) => {
      const item = { grades: [], missing: [], announcements: [] };
      const requests = [];
      if (state.config.showGrades) {
        requests.push(canvasRequest(`/api/v1/courses/${encodeURIComponent(course.id)}/enrollments?user_id=self&type[]=StudentEnrollment&include[]=grades`)
          .then((enrollments) => {
            const enrollment = Array.isArray(enrollments)
              ? enrollments.find((value) => value.type?.includes("StudentEnrollment")) || enrollments[0]
              : null;
            const grades = enrollment?.grades || {};
            const score = grades.current_score ?? grades.computed_current_score;
            const letter = grades.current_grade ?? grades.computed_current_grade;
            if (score != null || letter) item.grades.push({
              courseName: course.name || course.course_code || "Course",
              label: score != null && letter ? `Current grade · ${letter}` : "Current grade",
              value: score != null ? `${score}%` : letter
            });
          }).catch(() => failures.add("Some grade data could not be loaded.")));
      }
      if (state.config.showMissing) {
        requests.push(canvasRequest(`/api/v1/courses/${encodeURIComponent(course.id)}/assignments?include[]=submission&per_page=100`)
          .then((assignments) => {
            if (!Array.isArray(assignments)) return;
            assignments.filter((assignment) => assignment.submission?.missing === true).forEach((assignment) => {
              item.missing.push({
                name: assignment.name || "Assignment",
                courseName: course.name || course.course_code || "Course",
                dueAt: assignment.due_at || ""
              });
            });
          }).catch(() => failures.add("Some missing assignment data could not be loaded.")));
      }
      if (state.config.showAnnouncements) {
        requests.push(canvasRequest(`/api/v1/announcements?context_codes[]=course_${encodeURIComponent(course.id)}&per_page=10`)
          .then((announcements) => {
            if (!Array.isArray(announcements)) return;
            announcements.forEach((announcement) => {
              const message = String(announcement.message || "")
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
                .slice(0, 260);
              item.announcements.push({
                title: announcement.title || "Announcement",
                courseName: course.name || course.course_code || "Course",
                postedAt: announcement.posted_at || announcement.created_at || "",
                message
              });
            });
          }).catch(() => failures.add("Some announcement data could not be loaded.")));
      }
      await Promise.all(requests);
      return item;
    });

    const data = {
      courseCount: courses.length,
      grades: courseData.flatMap((item) => item.grades),
      missing: courseData.flatMap((item) => item.missing),
      announcements: courseData.flatMap((item) => item.announcements)
        .sort((a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0))
    };
    renderSummary(data);
    byId("sections").innerHTML = renderGrades(data.grades) + renderMissing(data.missing) + renderAnnouncements(data.announcements);
    const partialErrors = [...failures];
    if (courses.length >= 20) partialErrors.push("Showing the first 20 active courses.");
    if (partialErrors.length) showError(partialErrors.join(" "));
    else setStatus("Up to date", "ok");
    byId("welcome").innerHTML = `
      <p class="eyebrow">Your semester, organized</p>
      <h2>${courses.length ? `${courses.length} active courses` : "No active courses found"}</h2>
      <p>Grades, missing work, and class updates from your Canvas account.</p>`;
    byId("updated").textContent = `Last synced ${new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  } catch (error) {
    showError(error.message || "Could not load Canvas data. Check your URL, token, and Canvas permissions.");
    byId("sections").innerHTML = "";
  } finally {
    state.loading = false;
  }
}

function acceptConfig(event) {
  if (event.source !== window.parent || !event.data || event.data.type !== "CANVASHUB_CONFIG") return;
  const message = event.data;
  if (typeof message.canvasUrl !== "string" || typeof message.accessToken !== "string") return;
  state.config = {
    canvasUrl: message.canvasUrl,
    accessToken: message.accessToken,
    showGrades: message.showGrades !== false,
    showMissing: message.showMissing !== false,
    showAnnouncements: message.showAnnouncements !== false,
    accentColor: /^#[\da-f]{6}$/i.test(message.accentColor) ? message.accentColor : "#a392ff"
  };
  document.documentElement.style.setProperty("--accent-color", state.config.accentColor);
  if (state.timer) clearInterval(state.timer);
  const interval = Number(message.updateInterval);
  state.timer = setInterval(loadData, Number.isFinite(interval) ? Math.max(60000, interval) : 15 * 60 * 1000);
  loadData();
}

window.addEventListener("message", acceptConfig);
window.parent.postMessage({ type: "CANVASHUB_READY" }, "*");
