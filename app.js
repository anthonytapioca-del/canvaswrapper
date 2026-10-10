import { $, $$, safeText, courseColor, dateLabel, dateTimeLabel, debounce, validHttpsOrigin, mapLimit, firstName, formatScore, skeleton } from "./js/util.js";
import { loadPrefs, savePrefs, applyPrefs, resetPrefs, DEFAULT_PREFS } from "./js/prefs.js";
import { sanitizeHtml, plainText } from "./js/sanitize.js";
import { assignmentStatus, isMissing, STATUS_LABELS, statusBadgeClass } from "./js/classify.js";
import { canvasRequest, diagnostics, resetDiagnostics, clearCache, abortInflight, fetchSession } from "./js/api.js";
import { HUB_ROUTES, CANVAS_ROUTES, OFFICIAL_DOCS } from "./js/docs-data.js";

const VIEWS = ["overview", "courses", "course", "assignments", "grades", "announcements", "developers", "settings", "diagnostics"];
const TITLES = {
  overview: ["Your school, at a glance", "Dashboard"],
  courses: ["Your classes", "Courses"],
  course: ["Course", "Course"],
  assignments: ["Stay on track", "Assignments"],
  grades: ["Academic progress", "Grades"],
  announcements: ["What's happening", "Announcements"],
  developers: ["Build with Canvas Hub", "API & Developers"],
  settings: ["Preferences", "Settings"],
  diagnostics: ["Connection health", "Diagnostics"]
};

const state = {
  courses: [],
  assignments: [],
  grades: [],
  announcements: [],
  profile: null,
  connected: false,
  currentView: "overview",
  courseId: null,
  courseTab: "overview",
  courseDetail: null,
  prefs: loadPrefs(),
  oauthConfigured: false,
  cookieSession: false,
  loading: false,
  lastSynced: null
};

const session = {
  get url() { return sessionStorage.getItem("canvasHubUrl") || ""; },
  set url(v) { sessionStorage.setItem("canvasHubUrl", v); },
  get token() { return sessionStorage.getItem("canvasHubToken") || ""; },
  set token(v) { if (v) sessionStorage.setItem("canvasHubToken", v); }
};

function toast(message, kind = "ok") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function showAlert(message, success = false) {
  const el = $("alert");
  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("success", success);
}

function clearAlert() { $("alert").classList.add("hidden"); }

function hasCreds() {
  return Boolean(session.url && (session.token || state.cookieSession));
}

function setConnected(on) {
  state.connected = on;
  for (const id of ["status-dot", "top-status-dot"]) {
    $(id).classList.toggle("connected", on);
    $(id).classList.toggle("error", Boolean(diagnostics.lastError) && !on);
  }
  $("connection-label").textContent = on ? "Canvas connected" : "Not connected";
  $("connection-sub").textContent = on ? (diagnostics.domain || "Data loaded from Canvas") : "Connect your Canvas account";
  $("top-status-text").textContent = on ? "Connected" : "Offline";
  $("connect-banner").classList.toggle("hidden", on);
  $("profile-avatar").textContent = state.profile?.name?.trim()?.[0]?.toUpperCase() || "?";
  const name = state.profile?.name;
  $("welcome-name").textContent = name ? `Welcome back, ${firstName(name)}` : "Your semester, organized";
  $("last-synced").textContent = state.lastSynced
    ? `Last synced ${dateTimeLabel(state.lastSynced)}. Quick notes below are local only.`
    : "Connect to load live Canvas data. Quick notes stay on this device.";
}

async function api(path, { cache = true } = {}) {
  return canvasRequest({
    canvasUrl: session.url,
    token: session.token,
    path,
    signal: abortInflight.current,
    useCache: cache
  });
}

function courseById(id) {
  return state.courses.find((c) => String(c.id) === String(id));
}

function assignmentsFor(courseId) {
  return state.assignments.filter((a) => String(a.course_id) === String(courseId));
}

function gradeFor(courseId) {
  return state.grades.find((g) => String(g.course_id) === String(courseId));
}

function missingCount(list = state.assignments) {
  return list.filter(isMissing).length;
}

function upcomingCount(list = state.assignments) {
  return list.filter((a) => assignmentStatus(a) === "upcoming").length;
}

function applyLayoutPrefs() {
  applyPrefs(state.prefs);
  const { sections, cards, showAnnouncements } = state.prefs;
  $("stats-grid").classList.toggle("hidden", !sections.stats);
  $$("[data-section]").forEach((el) => el.classList.toggle("hidden", !sections[el.dataset.section]));
  $$("[data-card]").forEach((el) => el.classList.toggle("hidden", !cards[el.dataset.card]));
  $$("[data-section='announcements'], #announcements-view").forEach((el) => {
    if (el.id === "announcements-view") return;
    if (!showAnnouncements) el.classList.add("hidden");
  });
  document.body.classList.toggle("asg-compact", state.prefs.assignmentDisplay === "compact");
  $("sidebar-toggle").setAttribute("aria-label", state.prefs.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
}

function openMobileNav(open) {
  $("sidebar").classList.toggle("open", open);
  $("nav-scrim").hidden = !open;
  $("mobile-nav").setAttribute("aria-expanded", String(open));
}

function switchView(view, { courseId, replace } = {}) {
  if (!VIEWS.includes(view)) view = "overview";
  if (view === "announcements" && !state.prefs.showAnnouncements) view = "overview";
  state.currentView = view;
  if (courseId) state.courseId = courseId;
  VIEWS.forEach((v) => $(`${v}-view`).classList.toggle("hidden", v !== view));
  $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view || (view === "course" && b.dataset.view === "courses")));
  const titles = TITLES[view];
  $("eyebrow").textContent = titles[0];
  $("page-title").textContent = view === "course" && courseById(state.courseId)?.name ? courseById(state.courseId).name : titles[1];
  openMobileNav(false);
  const url = new URL(location.href);
  url.searchParams.delete("token");
  url.searchParams.delete("access_token");
  if (view === "overview") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view === "course" && state.courseId) url.searchParams.set("course", String(state.courseId));
  else url.searchParams.delete("course");
  history[replace ? "replaceState" : "pushState"]({}, "", url);
  if (view === "course") renderCoursePage();
  if (view === "assignments") renderAssignments();
  if (view === "announcements") renderAnnouncements();
}

function assignmentRow(a, { clickable = true } = {}) {
  const status = assignmentStatus(a);
  const tag = clickable ? "button" : "div";
  return `<${tag} class="list-row" type="button" data-assignment-id="${safeText(a.id)}" data-course-id="${safeText(a.course_id)}">
    <div class="row-icon" aria-hidden="true"><i data-lucide="clipboard-check"></i></div>
    <div class="row-main">
      <strong>${safeText(a.name)}</strong>
      <small>${safeText(a.course_name || courseById(a.course_id)?.name || "Course")} · ${safeText(a.points_possible != null ? `${a.points_possible} pts` : "Assignment")}</small>
    </div>
    <div class="row-end">
      <strong>${safeText(dateLabel(a.due_at))}</strong>
      <span class="${statusBadgeClass(status)}">${STATUS_LABELS[status]}</span>
    </div>
  </${tag}>`;
}

function courseCard(c) {
  const g = gradeFor(c.id);
  const score = g?.computed_current_score;
  return `<button class="course-card" type="button" data-open-course="${safeText(c.id)}">
    <div class="course-cover" style="--course-color:${courseColor(c.id)}">${safeText(c.course_code || "Course")}</div>
    <div class="course-body">
      <h3>${safeText(c.name)}</h3>
      <p>${score != null ? `Current grade: ${safeText(score)}%` : "Open course in Canvas Hub"}</p>
    </div>
  </button>`;
}

function refreshIcons() {
  if (window.lucide?.createIcons) window.lucide.createIcons();
}

function renderAll() {
  $("stat-courses").textContent = state.courses.length;
  $("stat-upcoming").textContent = upcomingCount();
  $("stat-missing").textContent = missingCount();
  $("stat-graded").textContent = state.grades.filter((g) => g.computed_current_score != null || g.computed_current_grade).length;
  const missingNav = $("missing-nav-count");
  const miss = missingCount();
  missingNav.hidden = !miss;
  missingNav.textContent = miss || "";

  $("overview-assignments").innerHTML = state.assignments.filter((a) => assignmentStatus(a) === "upcoming").slice(0, 6).map((a) => assignmentRow(a)).join("")
    || '<div class="empty-state">No upcoming assignments found.</div>';
  $("overview-courses").innerHTML = state.courses.slice(0, 6).map((c) =>
    `<button class="mini-course" type="button" data-open-course="${safeText(c.id)}"><div class="course-stripe" style="--course-color:${courseColor(c.id)}"></div><strong>${safeText(c.name)}</strong><small>${safeText(c.course_code || "Canvas course")}</small></button>`
  ).join("") || '<div class="empty-state">No active courses found.</div>';
  $("overview-announcements").innerHTML = state.prefs.showAnnouncements
    ? (state.announcements.slice(0, 4).map(announcementCard).join("") || '<div class="empty-state">No recent announcements found.</div>')
    : '<div class="empty-state">Announcements are hidden in Settings.</div>';
  $("overview-grades").innerHTML = state.courses.slice(0, 5).map((c) => {
    const g = gradeFor(c.id);
    const score = g?.computed_current_score;
    return `<div class="list-row"><div class="row-main"><strong>${safeText(c.name)}</strong><small>${score != null ? `${score}% current` : "No published grade"}</small></div></div>`;
  }).join("") || '<div class="empty-state">No grade data found.</div>';

  renderCoursesGrid();
  renderAssignments();
  renderGrades();
  renderAnnouncements();
  fillCourseFilters();
  renderDiagnostics();
  applyLayoutPrefs();
  bindDynamicClicks();
  refreshIcons();
}

function renderCoursesGrid() {
  const q = ($("course-search").value || "").toLowerCase();
  const list = state.courses.filter((c) => `${c.name} ${c.course_code || ""}`.toLowerCase().includes(q));
  $("courses-grid").innerHTML = list.map(courseCard).join("") || '<div class="empty-state">No courses match this search.</div>';
}

function fillCourseFilters() {
  const opts = ['<option value="all">All courses</option>'].concat(
    state.courses.map((c) => `<option value="${safeText(c.id)}">${safeText(c.name)}</option>`)
  ).join("");
  $("assignment-course").innerHTML = opts;
  $("announcement-course").innerHTML = opts;
}

function filteredAssignments({ searchId, courseId, status, sort, list }) {
  const q = ($(searchId)?.value || "").toLowerCase();
  const course = courseId || $("assignment-course")?.value || "all";
  const st = status || $("assignment-filter")?.value || "all";
  const sortKey = sort || $("assignment-sort")?.value || "due-asc";
  let out = (list || state.assignments).filter((a) => {
    const match = String(a.name || "").toLowerCase().includes(q);
    const courseMatch = course === "all" || String(a.course_id) === String(course);
    const statusMatch = st === "all" || assignmentStatus(a) === st;
    return match && courseMatch && statusMatch;
  });
  out.sort((a, b) => {
    if (sortKey === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    const da = a.due_at ? new Date(a.due_at).getTime() : (sortKey === "due-desc" ? 0 : 8e15);
    const db = b.due_at ? new Date(b.due_at).getTime() : (sortKey === "due-desc" ? 0 : 8e15);
    return sortKey === "due-desc" ? db - da : da - db;
  });
  return out;
}

function renderAssignments() {
  const list = filteredAssignments({});
  $("assignments-list").innerHTML = list.map((a) => assignmentRow(a)).join("") || '<div class="empty-state">No assignments match these filters.</div>';
  bindDynamicClicks();
}

function renderGrades() {
  const withData = state.grades.filter((g) => g.computed_current_score != null || g.computed_current_grade || g.computed_final_score != null);
  $("grades-summary").textContent = `${withData.length} of ${state.courses.length} courses have published grade data.`;
  $("grades-grid").innerHTML = state.courses.map((c) => {
    const g = gradeFor(c.id);
    const score = g?.computed_current_score;
    const finalScore = g?.computed_final_score;
    const letter = g?.computed_current_grade;
    const label = score != null ? `${Math.round(Number(score) * 10) / 10}%` : (letter || "—");
    const bar = score != null ? Math.max(0, Math.min(100, Number(score))) : 0;
    return `<article class="grade-card">
      <div class="grade-ring ${score == null && !letter ? "no-grade" : ""}">${safeText(label)}</div>
      <div class="grade-info">
        <strong>${safeText(c.name)}</strong>
        <small>${score != null ? "Current score from Canvas" : letter ? "Letter grade from Canvas" : "No current grade published"}</small>
        ${finalScore != null ? `<small>Final: ${safeText(finalScore)}%</small>` : ""}
        ${letter && score != null ? `<small>Letter: ${safeText(letter)}</small>` : ""}
        <div class="grade-bar" aria-hidden="true"><span style="width:${score != null ? bar : 0}%"></span></div>
      </div>
    </article>`;
  }).join("") || '<div class="empty-state">No grade data found.</div>';
}

function announcementCard(a) {
  const html = sanitizeHtml(a.message || "");
  const fallback = plainText(a.message || "") || "No message text was returned.";
  return `<article class="list-row" style="cursor:default">
    <div class="row-icon" aria-hidden="true"><i data-lucide="megaphone"></i></div>
    <div class="row-main">
      <strong>${safeText(a.title || "Announcement")}</strong>
      <small>${safeText(a.course_name || "Course")} · ${safeText(dateLabel(a.posted_at || a.created_at, { month: "short", day: "numeric", year: "numeric" }))}</small>
      <div class="announcement-body rich-html">${html || safeText(fallback)}</div>
    </div>
  </article>`;
}

function renderAnnouncements() {
  const q = ($("announcement-search").value || "").toLowerCase();
  const course = $("announcement-course").value;
  const list = state.announcements.filter((a) => {
    const text = `${a.title || ""} ${plainText(a.message || "")}`.toLowerCase();
    return text.includes(q) && (course === "all" || String(a.course_id) === String(course));
  });
  $("announcements-list").innerHTML = list.map(announcementCard).join("") || '<div class="empty-state">No announcements match this filter.</div>';
}

async function renderCoursePage() {
  refreshIcons();
  const course = courseById(state.courseId);
  if (!course) {
    $("course-header").innerHTML = '<div class="empty-state">Course not found in the loaded enrollment list.</div>';
    return;
  }
  $("page-title").textContent = course.name;
  const asgs = assignmentsFor(course.id);
  const miss = missingCount(asgs);
  const up = upcomingCount(asgs);
  const g = gradeFor(course.id);
  $("course-missing-count").hidden = !miss;
  $("course-missing-count").textContent = miss || "";
  $("course-header").innerHTML = `
    <div class="course-hero-banner" style="background:linear-gradient(130deg, ${courseColor(course.id)}, #1b1e2b)">${safeText(course.course_code || "Course")}</div>
    <div class="course-hero-body">
      <h2>${safeText(course.name)}</h2>
      <p class="fine-print">${safeText(course.course_code || "")} · ID ${safeText(course.id)}</p>
      <div class="meta-grid">
        <div class="meta-item"><small>Current grade</small><strong>${g?.computed_current_score != null ? safeText(g.computed_current_score) + "%" : "Not published"}</strong></div>
        <div class="meta-item"><small>Assignments</small><strong>${asgs.length}</strong></div>
        <div class="meta-item"><small>Missing</small><strong>${miss}</strong></div>
        <div class="meta-item"><small>Upcoming</small><strong>${up}</strong></div>
      </div>
    </div>`;

  let detail = state.courseDetail && String(state.courseDetail.id) === String(course.id) ? state.courseDetail : course;
  if (hasCreds()) {
    try {
      detail = await api(`/api/v1/courses/${encodeURIComponent(course.id)}?include[]=term&include[]=syllabus_body&include[]=teachers&include[]=total_scores`);
      state.courseDetail = detail;
    } catch {
      detail = course;
    }
  }

  const submitted = asgs.filter((a) => ["submitted", "graded", "late"].includes(assignmentStatus(a))).length;
  const term = detail.term?.name || "Not provided";
  const desc = detail.public_description || plainText(detail.syllabus_body || "") || "No description was returned by Canvas.";
  $("course-tab-overview").innerHTML = `
    <section class="panel">
      <h3>Overview</h3>
      <p>${safeText(desc).slice(0, 1200)}</p>
      <div class="meta-grid">
        <div class="meta-item"><small>Term</small><strong>${safeText(term)}</strong></div>
        <div class="meta-item"><small>Starts</small><strong>${safeText(detail.start_at ? dateLabel(detail.start_at) : "Not provided")}</strong></div>
        <div class="meta-item"><small>Ends</small><strong>${safeText(detail.end_at ? dateLabel(detail.end_at) : "Not provided")}</strong></div>
        <div class="meta-item"><small>Submission progress</small><strong>${asgs.length ? `${submitted} / ${asgs.length} submitted or graded` : "Not enough data"}</strong></div>
      </div>
    </section>`;

  renderCourseAssignments();
  const letter = g?.computed_current_grade;
  $("course-tab-grades").innerHTML = `<section class="panel">
    <h3>Grades</h3>
    <p>${g?.computed_current_score != null ? `Current score: <strong>${safeText(g.computed_current_score)}%</strong>` : "No current score published."}</p>
    <p>${g?.computed_final_score != null ? `Final score: <strong>${safeText(g.computed_final_score)}%</strong>` : "No final score published."}</p>
    <p>${letter ? `Letter grade from Canvas: <strong>${safeText(letter)}</strong>` : "No letter grade was returned. Canvas Hub does not invent a scale."}</p>
  </section>`;
  const anns = state.announcements.filter((a) => String(a.course_id) === String(course.id));
  $("course-tab-announcements").innerHTML = anns.map(announcementCard).join("") || '<div class="empty-state">No announcements for this course.</div>';
  const teachers = Array.isArray(detail.teachers) ? detail.teachers : [];
  $("course-tab-info").innerHTML = `<section class="panel">
    <h3>Course information</h3>
    <div class="meta-grid">
      <div class="meta-item"><small>Course code</small><strong>${safeText(detail.course_code || "Not provided")}</strong></div>
      <div class="meta-item"><small>Term</small><strong>${safeText(term)}</strong></div>
      <div class="meta-item"><small>Workflow</small><strong>${safeText(detail.workflow_state || "Not provided")}</strong></div>
      <div class="meta-item"><small>Published</small><strong>${detail.workflow_state === "available" ? "Available" : safeText(detail.workflow_state || "Unknown")}</strong></div>
    </div>
    <p class="help-text" style="margin-top:12px">${safeText(detail.public_description || "No public description returned.")}</p>
    ${teachers.length ? `<p><strong>Instructors</strong> (only shown because Canvas returned them): ${teachers.map((t) => safeText(t.display_name || t.name)).join(", ")}</p>` : `<p class="help-text">Instructor names were not returned or are not visible to this account.</p>`}
  </section>`;
}

function renderCourseAssignments() {
  const list = filteredAssignments({
    searchId: "course-asg-search",
    courseId: state.courseId,
    status: $("course-asg-filter").value,
    list: assignmentsFor(state.courseId)
  });
  $("course-assignments").innerHTML = list.map((a) => assignmentRow(a)).join("") || '<div class="empty-state">No assignments match these filters.</div>';
  bindDynamicClicks();
}

function setCourseTab(tab) {
  state.courseTab = tab;
  $$("[data-course-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.courseTab === tab)));
  ["overview", "assignments", "grades", "announcements", "info"].forEach((t) => {
    $(`course-tab-${t}`).classList.toggle("hidden", t !== tab);
  });
}

function openAssignment(id, courseId) {
  const a = state.assignments.find((x) => String(x.id) === String(id) && String(x.course_id) === String(courseId));
  if (!a) return;
  const status = assignmentStatus(a);
  const sub = a.submission || {};
  $("asg-dialog-title").textContent = a.name || "Assignment";
  $("asg-dialog-body").innerHTML = `
    <p class="fine-print">${safeText(a.course_name || courseById(a.course_id)?.name || "")}</p>
    <p><span class="${statusBadgeClass(status)}">${STATUS_LABELS[status]}</span></p>
    <div class="meta-grid">
      <div class="meta-item"><small>Due</small><strong>${safeText(dateTimeLabel(a.due_at))}</strong></div>
      <div class="meta-item"><small>Points</small><strong>${safeText(a.points_possible ?? "Not provided")}</strong></div>
      <div class="meta-item"><small>Score</small><strong>${safeText(formatScore(sub.score, a.points_possible) || "Not provided")}</strong></div>
      <div class="meta-item"><small>Submitted</small><strong>${safeText(sub.submitted_at ? dateTimeLabel(sub.submitted_at) : "Not submitted")}</strong></div>
    </div>
    <div class="announcement-body rich-html" style="margin-top:12px">${sanitizeHtml(a.description || "") || "<p>No description returned.</p>"}</div>
    <p class="help-text">${sub.missing === true ? "Canvas marked this assignment missing (submission.missing)." : sub.late === true ? "Canvas marked this submission late." : ""}</p>
    <p><button class="secondary-btn" type="button" disabled title="Not implemented">Submit in Canvas Hub — not implemented</button></p>`;
  $("assignment-dialog").showModal();
}

function bindDynamicClicks() {
  refreshIcons();
  $$("[data-open-course]").forEach((el) => {
    el.onclick = () => switchView("course", { courseId: el.dataset.openCourse });
  });
  $$("[data-assignment-id]").forEach((el) => {
    el.onclick = () => openAssignment(el.dataset.assignmentId, el.dataset.courseId);
  });
}

async function loadAssignments() {
  diagnostics.assignments = "loading";
  const results = await mapLimit(state.courses.slice(0, 30), 4, async (c) => {
    try {
      const data = await api(`/api/v1/courses/${encodeURIComponent(c.id)}/assignments?per_page=100&order_by=due_at&include[]=submission`);
      return (Array.isArray(data) ? data : []).map((a) => ({ ...a, course_id: c.id, course_name: c.name }));
    } catch (err) {
      return { __error: true, course_id: c.id, message: err.message };
    }
  });
  const failed = results.filter((r) => r && r.__error);
  const ok = results.filter((r) => Array.isArray(r)).flat();
  diagnostics.assignments = failed.length && !ok.length ? "error" : "ok";
  if (failed.length) diagnostics.lastError = `${failed.length} course assignment request(s) failed.`;
  return ok.sort((a, b) => new Date(a.due_at || "2999-01-01") - new Date(b.due_at || "2999-01-01"));
}

async function loadGrades() {
  diagnostics.grades = "loading";
  const results = await mapLimit(state.courses.slice(0, 30), 4, async (c) => {
    try {
      const enrollments = await api(`/api/v1/courses/${encodeURIComponent(c.id)}/enrollments?user_id=self&type[]=StudentEnrollment&include[]=grades`);
      const e = Array.isArray(enrollments) ? enrollments.find((x) => x.type?.includes("StudentEnrollment")) || enrollments[0] : null;
      if (!e) return null;
      return {
        course_id: c.id,
        course_name: c.name,
        grades: e.grades || {},
        computed_current_score: e.grades?.current_score ?? e.grades?.computed_current_score ?? null,
        computed_current_grade: e.grades?.current_grade ?? e.grades?.computed_current_grade ?? null,
        computed_final_score: e.grades?.final_score ?? e.grades?.computed_final_score ?? null
      };
    } catch {
      return null;
    }
  });
  const list = results.filter(Boolean);
  diagnostics.grades = list.some((g) => g.computed_current_score != null || g.computed_current_grade) ? "ok" : "empty";
  return list;
}

async function loadAnnouncements() {
  diagnostics.announcements = "loading";
  const results = await mapLimit(state.courses.slice(0, 20), 3, async (c) => {
    try {
      const data = await api(`/api/v1/announcements?context_codes[]=course_${encodeURIComponent(c.id)}&per_page=10`);
      return (Array.isArray(data) ? data : []).map((a) => ({ ...a, course_name: c.name, course_id: c.id }));
    } catch {
      return [];
    }
  });
  const seen = new Set();
  const list = results.flat().filter((a) => {
    const key = String(a.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.posted_at || b.created_at || 0) - new Date(a.posted_at || a.created_at || 0)).slice(0, 40);
  diagnostics.announcements = "ok";
  return list;
}

async function loadAll({ quiet } = {}) {
  if (!hasCreds()) { openConnect(); return; }
  if (state.loading) return;
  state.loading = true;
  abortInflight.current = abortInflight();
  clearCache();
  resetDiagnostics();
  diagnostics.domain = session.url;
  $("save-connect").disabled = true;
  $("save-connect").textContent = "Loading…";
  $("refresh-btn").disabled = true;
  $("overview-assignments").innerHTML = skeleton(5);
  if (!quiet) clearAlert();
  try {
    diagnostics.profile = "loading";
    const profile = await api("/api/v1/users/self/profile", { cache: false });
    state.profile = profile;
    diagnostics.profile = "ok";
    diagnostics.courses = "loading";
    const courses = await api("/api/v1/courses?enrollment_state=active&include[]=term&include[]=total_students&per_page=100", { cache: false });
    state.courses = Array.isArray(courses) ? courses.filter((c) => !c.access_restricted_by_date) : [];
    diagnostics.courses = "ok";
    const [assignments, grades, announcements] = await Promise.all([loadAssignments(), loadGrades(), loadAnnouncements()]);
    state.assignments = assignments;
    state.grades = grades;
    state.announcements = announcements;
    state.lastSynced = new Date().toISOString();
    diagnostics.lastSuccess = state.lastSynced;
    setConnected(true);
    renderAll();
    if (state.currentView === "course") renderCoursePage();
    if (!quiet) {
      showAlert("Connected. Live Canvas data is loaded.", true);
      toast("Canvas data refreshed", "ok");
    }
    $("connect-dialog").close();
  } catch (err) {
    if (err.name === "AbortError") return;
    diagnostics.lastError = err.message;
    if (err.status === 401) diagnostics.profile = "error";
    setConnected(false);
    showAlert(err.message || "Could not connect. Check your Canvas URL and token.");
    toast(err.message || "Connection failed", "err");
    renderDiagnostics();
  } finally {
    state.loading = false;
    $("save-connect").disabled = false;
    $("save-connect").textContent = "Connect & load";
    $("refresh-btn").disabled = false;
  }
}

function renderDiagnostics() {
  const rows = [
    ["Canvas connected", state.connected ? "Yes" : "No"],
    ["Canvas domain", diagnostics.domain || session.url || "Not set"],
    ["Profile", diagnostics.profile],
    ["Courses", diagnostics.courses],
    ["Assignments", diagnostics.assignments],
    ["Grades", diagnostics.grades],
    ["Last success", diagnostics.lastSuccess ? dateTimeLabel(diagnostics.lastSuccess) : "Never"],
    ["Last error", diagnostics.lastError || "None"]
  ];
  $("diag-panel").innerHTML = rows.map(([k, v]) => `<div class="diag-item"><small>${safeText(k)}</small><strong>${safeText(v)}</strong></div>`).join("");
}

function openConnect() {
  $("canvas-url").value = session.url;
  $("canvas-token").value = "";
  $("oauth-help").textContent = state.oauthConfigured
    ? "OAuth is configured on this deployment. Authorize with Canvas to avoid pasting a token. You can still use a personal token if your school allows it."
    : "OAuth is not fully configured (developer key + SESSION_SECRET required). Personal access tokens are a temporary, tab-scoped option. Do not use a shared computer.";
  $("oauth-btn").disabled = !state.oauthConfigured && !session.url;
  $("connect-dialog").showModal();
}

function exampleSnippets(route) {
  const hub = route.kind === "hub";
  const path = hub ? route.path : `/api/canvas`;
  const js = hub && route.method === "GET"
    ? `// Server or browser — no tokens in URLs
const res = await fetch("${route.path}", { cache: "no-store" });
const data = await res.json();`
    : `// Server-side example. Keep CANVAS_ACCESS_TOKEN out of the browser.
const res = await fetch("${path}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    canvasUrl: process.env.CANVAS_DOMAIN || "https://YOUR_CANVAS_DOMAIN",
    token: process.env.CANVAS_ACCESS_TOKEN,
    path: "${route.kind === "canvas" ? route.path.replace(":course_id", "101") : "/api/v1/users/self/profile"}"
  })
});
const data = await res.json();`;
  const py = `import os, requests
# Server-side example. Never print or log the token.
r = requests.post("https://your-canvas-hub.vercel.app/api/canvas", json={
  "canvasUrl": os.environ["CANVAS_DOMAIN"],
  "token": os.environ["CANVAS_ACCESS_TOKEN"],
  "path": "${route.kind === "canvas" ? route.path.replace(":course_id", "101") : "/api/v1/users/self/profile"}"
})
print(r.json())`;
  const curl = `curl -sS -X POST "$CANVAS_HUB_ORIGIN/api/canvas" \\
  -H "Content-Type: application/json" \\
  -d '{"canvasUrl":"https://YOUR_CANVAS_DOMAIN","token":"'"$CANVAS_ACCESS_TOKEN"'","path":"${route.kind === "canvas" ? route.path.replace(":course_id", "101") : "/api/v1/users/self/profile"}"}'`;
  return { js, py, curl };
}

function renderDocs() {
  const all = [...HUB_ROUTES, ...CANVAS_ROUTES];
  $("docs-list").innerHTML = all.map((route) => {
    const snips = exampleSnippets(route);
    return `<article class="docs-card" id="${safeText(route.id)}">
      <p><span class="pill ${route.kind}">${route.kind === "hub" ? "Canvas Hub" : "Official Canvas"}</span>
      <strong> ${safeText(route.method)} ${safeText(route.path)}</strong></p>
      <p class="help-text">${safeText(route.auth)}</p>
      <p><strong>Parameters</strong></p>
      <ul class="help-list">${route.params.length ? route.params.map((p) => `<li><code>${safeText(p.name)}</code> (${safeText(p.in)}${p.required ? ", required" : ""}) — ${safeText(p.notes)}</li>`).join("") : "<li>None</li>"}</ul>
      <p><strong>Example response</strong></p>
      <pre>${safeText(typeof route.exampleResponse === "string" ? route.exampleResponse : JSON.stringify(route.exampleResponse, null, 2))}</pre>
      <p><strong>Errors</strong> ${safeText(route.errors.join("; "))}</p>
      <p><strong>Rate limits</strong> ${safeText(route.rate)}</p>
      <p><strong>Canvas permissions</strong> ${safeText(route.permissions)}</p>
      <div class="lang-tabs">
        <button type="button" class="active" data-lang="js">JavaScript</button>
        <button type="button" data-lang="py">Python</button>
        <button type="button" data-lang="curl">cURL</button>
        <button type="button" data-copy>Copy</button>
      </div>
      <pre class="snip" data-js>${safeText(snips.js)}</pre>
      <pre class="snip hidden" data-py>${safeText(snips.py)}</pre>
      <pre class="snip hidden" data-curl>${safeText(snips.curl)}</pre>
      ${route.kind === "canvas" ? `<p class="help-text">Official docs: <a href="${OFFICIAL_DOCS}" target="_blank" rel="noopener noreferrer">${OFFICIAL_DOCS}</a></p>` : ""}
    </article>`;
  }).join("");
  $$(".docs-card").forEach((card) => {
    const tabs = $$("[data-lang]", card);
    tabs.forEach((btn) => btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      card.querySelectorAll(".snip").forEach((pre) => pre.classList.add("hidden"));
      card.querySelector(`[data-${btn.dataset.lang}]`).classList.remove("hidden");
    }));
    card.querySelector("[data-copy]").addEventListener("click", async () => {
      const visible = [...card.querySelectorAll(".snip")].find((p) => !p.classList.contains("hidden"));
      await navigator.clipboard.writeText(visible.textContent);
      toast("Snippet copied", "ok");
    });
  });
}

function generatedLink() {
  const origin = validHttpsOrigin($("gen-domain").value || session.url);
  const page = $("gen-page").value;
  const err = $("gen-error");
  if (!origin) {
    err.textContent = "Enter a valid HTTPS Canvas domain. Tokens, grades, and names are not allowed in the URL.";
    $("gen-preview").textContent = "";
    return "";
  }
  err.textContent = "This configures Canvas Hub only. Recipients must still authenticate with their own account.";
  const url = new URL(location.origin);
  url.searchParams.set("canvas", origin);
  if (page !== "overview") url.searchParams.set("view", page);
  $("gen-preview").textContent = url.toString();
  return url.toString();
}

function generateMagicMirrorConfig() {
  const origin = validHttpsOrigin($("mm-canvas-url").value);
  const accessToken = $("mm-canvas-token").value.trim();
  const error = $("mm-builder-error");
  const showGrades = $("mm-show-grades").checked;
  const showMissing = $("mm-show-missing").checked;
  const showAnnouncements = $("mm-show-announcements").checked;
  error.textContent = "";

  if (!origin) {
    error.textContent = "Enter a valid HTTPS Canvas URL.";
    hideMagicMirrorConfig();
    return;
  }
  if (!accessToken) {
    error.textContent = "Enter your Canvas API access token.";
    hideMagicMirrorConfig();
    return;
  }
  if (!showGrades && !showMissing && !showAnnouncements) {
    error.textContent = "Choose at least one type of Canvas data to display.";
    hideMagicMirrorConfig();
    return;
  }

  const config = {
    module: "MMM-CanvasHub",
    position: $("mm-position").value,
    config: {
      canvasHubUrl: location.origin,
      canvasUrl: origin,
      accessToken,
      showGrades,
      showMissing,
      showAnnouncements,
      accentColor: $("mm-accent-color").value
    }
  };
  $("mm-generated-code").textContent = JSON.stringify(config, null, 2);
  $("mm-generated-wrap").classList.remove("hidden");
}

function hideMagicMirrorConfig() {
  $("mm-generated-code").textContent = "";
  $("mm-generated-wrap").classList.add("hidden");
}

function fillPrefsForm() {
  const p = state.prefs;
  $$(`#prefs-form [name=theme]`).forEach((r) => { r.checked = r.value === p.theme; });
  $("accent-color").value = p.accent;
  $("pref-collapse").checked = p.sidebarCollapsed;
  $("pref-compact").checked = p.compact;
  $("pref-start").value = p.defaultView;
  $("pref-announcements").checked = p.showAnnouncements;
  $("pref-asg-display").value = p.assignmentDisplay;
  $$("[data-section-toggle]").forEach((el) => { el.checked = Boolean(p.sections[el.dataset.sectionToggle]); });
  $$("[data-card-toggle]").forEach((el) => { el.checked = Boolean(p.cards[el.dataset.cardToggle]); });
}

function readPrefsForm() {
  const theme = $$("#prefs-form [name=theme]").find((r) => r.checked)?.value || "system";
  const sections = { ...DEFAULT_PREFS.sections };
  $$("[data-section-toggle]").forEach((el) => { sections[el.dataset.sectionToggle] = el.checked; });
  const cards = { ...DEFAULT_PREFS.cards };
  $$("[data-card-toggle]").forEach((el) => { cards[el.dataset.cardToggle] = el.checked; });
  return {
    theme,
    accent: $("accent-color").value,
    sidebarCollapsed: $("pref-collapse").checked,
    compact: $("pref-compact").checked,
    defaultView: $("pref-start").value,
    showAnnouncements: $("pref-announcements").checked,
    assignmentDisplay: $("pref-asg-display").value,
    sections,
    cards
  };
}

function consumeLaunchParams() {
  const params = new URLSearchParams(location.search);
  if (params.has("token") || params.has("access_token")) {
    params.delete("token");
    params.delete("access_token");
    history.replaceState({}, "", `${location.pathname}?${params}${location.hash}`);
    toast("Tokens in URLs are ignored and were removed.", "err");
  }
  const canvas = validHttpsOrigin(params.get("canvas") || "");
  if (canvas && !session.url) {
    session.url = canvas;
    $("canvas-url").value = canvas;
    $("gen-domain").value = canvas;
  } else if (session.url) {
    $("gen-domain").value = session.url;
  }
  let view = params.get("view") || state.prefs.defaultView || "overview";
  const course = params.get("course");
  if (params.get("oauth") === "success") toast("Canvas authorization completed. Loading your session…", "ok");
  if (view === "course" && course) switchView("course", { courseId: course, replace: true });
  else switchView(view, { replace: true });
}

async function disconnect() {
  sessionStorage.removeItem("canvasHubUrl");
  sessionStorage.removeItem("canvasHubToken");
  try { await fetch("/api/logout", { method: "POST" }); } catch { /* cookie may not exist */ }
  Object.assign(state, { courses: [], assignments: [], grades: [], announcements: [], profile: null, cookieSession: false, lastSynced: null });
  clearCache();
  resetDiagnostics();
  setConnected(false);
  renderAll();
  $("connect-dialog").close();
  showAlert("Disconnected. Session credentials were cleared.", true);
}

function loadNotes() {
  $("quick-notes").value = localStorage.getItem("canvasHubNotes") || "";
}

async function boot() {
  applyLayoutPrefs();
  fillPrefsForm();
  loadNotes();
  renderDocs();
  generatedLink();
  $("today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const sess = await fetchSession();
  state.oauthConfigured = Boolean(sess.oauthConfigured);
  if (sess.connected && sess.canvasOrigin) {
    state.cookieSession = true;
    session.url = sess.canvasOrigin;
  }
  consumeLaunchParams();
  setConnected(false);
  renderDiagnostics();
  if (hasCreds()) loadAll({ quiet: true });
}

$$("[data-view]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => switchView(b.dataset.goto)));
$("connect-open").addEventListener("click", openConnect);
$("connect-banner-btn").addEventListener("click", openConnect);
$("footer-connect").addEventListener("click", openConnect);
$("profile-avatar").addEventListener("click", openConnect);
$("connect-close").addEventListener("click", () => $("connect-dialog").close());
$("asg-close").addEventListener("click", () => $("assignment-dialog").close());
$("sidebar-toggle").addEventListener("click", () => {
  state.prefs.sidebarCollapsed = !state.prefs.sidebarCollapsed;
  savePrefs(state.prefs);
  applyLayoutPrefs();
});
$("mobile-nav").addEventListener("click", () => openMobileNav(!$("sidebar").classList.contains("open")));
$("nav-scrim").addEventListener("click", () => openMobileNav(false));
$("refresh-btn").addEventListener("click", () => loadAll());
$("course-back").addEventListener("click", () => switchView("courses"));
$$("[data-course-tab]").forEach((b) => b.addEventListener("click", () => setCourseTab(b.dataset.courseTab)));
$("assignment-search").addEventListener("input", debounce(renderAssignments));
$("assignment-filter").addEventListener("change", renderAssignments);
$("assignment-course").addEventListener("change", renderAssignments);
$("assignment-sort").addEventListener("change", renderAssignments);
$("course-search").addEventListener("input", debounce(renderCoursesGrid));
$("course-asg-search").addEventListener("input", debounce(renderCourseAssignments));
$("course-asg-filter").addEventListener("change", renderCourseAssignments);
$("announcement-search").addEventListener("input", debounce(renderAnnouncements));
$("announcement-course").addEventListener("change", renderAnnouncements);
$("gen-domain").addEventListener("input", generatedLink);
$("gen-page").addEventListener("change", generatedLink);
$("generate-mm-config").addEventListener("click", generateMagicMirrorConfig);
$("copy-mm-config").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("mm-generated-code").textContent);
  toast("MagicMirror config copied. Keep it private because it contains your token.", "ok");
});
$("mm-canvas-url").addEventListener("input", hideMagicMirrorConfig);
$("mm-canvas-token").addEventListener("input", hideMagicMirrorConfig);
["mm-show-grades", "mm-show-missing", "mm-show-announcements", "mm-position", "mm-accent-color"].forEach((id) => {
  $(id).addEventListener("change", hideMagicMirrorConfig);
});
$("copy-link").addEventListener("click", async () => {
  const link = generatedLink();
  if (!link) return;
  await navigator.clipboard.writeText(link);
  toast("Link copied. It does not grant account access.", "ok");
});
$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const origin = validHttpsOrigin($("canvas-url").value);
  if (!origin) { showAlert("Enter a valid HTTPS Canvas URL, such as https://school.instructure.com"); return; }
  const token = $("canvas-token").value.trim();
  session.url = origin;
  if (token) session.token = token;
  if (!token && !state.cookieSession) { showAlert("Paste your Canvas API access token, or complete OAuth."); return; }
  await loadAll();
});
$("disconnect-btn").addEventListener("click", disconnect);
$("oauth-btn").addEventListener("click", () => {
  const origin = validHttpsOrigin($("canvas-url").value || session.url);
  if (!origin) { showAlert("Enter a valid HTTPS Canvas URL first."); return; }
  if (!state.oauthConfigured) {
    showAlert("OAuth is not configured on this deployment. A Canvas developer key, SESSION_SECRET, and OAUTH_REDIRECT_URI are required.");
    return;
  }
  location.href = `/api/oauth-start?canvasUrl=${encodeURIComponent(origin)}`;
});
$("prefs-form").addEventListener("submit", (e) => {
  e.preventDefault();
  state.prefs = readPrefsForm();
  savePrefs(state.prefs);
  applyLayoutPrefs();
  toast("Preferences saved", "ok");
});
$("prefs-form").addEventListener("input", () => {
  state.prefs = readPrefsForm();
  savePrefs(state.prefs);
  applyLayoutPrefs();
});
$("reset-prefs").addEventListener("click", () => {
  if (!confirm("Reset appearance and dashboard preferences to defaults?")) return;
  state.prefs = resetPrefs();
  fillPrefsForm();
  applyLayoutPrefs();
  toast("Preferences reset", "ok");
});
$("quick-notes").addEventListener("input", debounce(() => {
  localStorage.setItem("canvasHubNotes", $("quick-notes").value);
}, 250));
$("test-connection").addEventListener("click", async () => {
  if (!hasCreds()) { openConnect(); return; }
  try {
    await api("/api/v1/users/self/profile", { cache: false });
    diagnostics.profile = "ok";
    toast("Profile endpoint succeeded", "ok");
  } catch (err) {
    diagnostics.profile = "error";
    diagnostics.lastError = err.message;
    toast(err.message, "err");
  }
  renderDiagnostics();
});
$("retry-load").addEventListener("click", () => loadAll());
window.addEventListener("popstate", () => consumeLaunchParams());
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => applyLayoutPrefs());

boot();