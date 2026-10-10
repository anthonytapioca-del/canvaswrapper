export const STATUS_LABELS = {
  missing: "Missing",
  upcoming: "Upcoming",
  submitted: "Submitted",
  graded: "Graded",
  excused: "Excused",
  "past-due": "Past due",
  late: "Late",
  undated: "No due date"
};

export function assignmentStatus(assignment, now = new Date()) {
  const sub = assignment.submission && typeof assignment.submission === "object" ? assignment.submission : null;
  const due = assignment.due_at ? new Date(assignment.due_at) : null;
  const dueValid = due && !Number.isNaN(due.getTime());

  if (sub?.excused === true || sub?.workflow_state === "excused") return "excused";
  if (sub?.missing === true) return "missing";
  if (sub?.workflow_state === "graded") return "graded";
  const submitted = Boolean(sub?.submitted_at) || ["submitted", "pending_review"].includes(sub?.workflow_state);
  if (submitted && sub?.late === true) return "late";
  if (submitted) return "submitted";
  if (dueValid && due < now) return "past-due";
  if (dueValid && due >= now) return "upcoming";
  return "undated";
}

export function isMissing(assignment) {
  return assignmentStatus(assignment) === "missing";
}

export function isUpcoming(assignment, now = new Date()) {
  const status = assignmentStatus(assignment, now);
  return status === "upcoming";
}

export function statusBadgeClass(status) {
  if (status === "missing") return "badge missing";
  if (status === "late" || status === "past-due") return "badge late";
  if (status === "upcoming") return "badge soon";
  if (status === "graded" || status === "submitted") return "badge ok";
  if (status === "excused") return "badge";
  return "badge";
}
