const KEY = "canvasHubPrefs";
const SENSITIVE = /token|secret|password|authorization|cookie/i;

export const DEFAULT_PREFS = {
  theme: "system",
  accent: "#7c6cf0",
  sidebarCollapsed: false,
  compact: false,
  defaultView: "overview",
  sections: {
    stats: true,
    upcoming: true,
    courses: true,
    announcements: true,
    grades: true,
    notes: true
  },
  cards: {
    courses: true,
    upcoming: true,
    missing: true,
    grades: true
  },
  assignmentDisplay: "comfortable",
  showAnnouncements: true
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS, sections: { ...DEFAULT_PREFS.sections }, cards: { ...DEFAULT_PREFS.cards } };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad");
    for (const k of Object.keys(parsed)) {
      if (SENSITIVE.test(k) || typeof parsed[k] === "string" && parsed[k].length > 400 && /canvas/i.test(k)) {
        delete parsed[k];
      }
    }
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      sections: { ...DEFAULT_PREFS.sections, ...(parsed.sections || {}) },
      cards: { ...DEFAULT_PREFS.cards, ...(parsed.cards || {}) }
    };
  } catch {
    return { ...DEFAULT_PREFS, sections: { ...DEFAULT_PREFS.sections }, cards: { ...DEFAULT_PREFS.cards } };
  }
}

export function savePrefs(prefs) {
  const clean = {
    theme: prefs.theme,
    accent: prefs.accent,
    sidebarCollapsed: Boolean(prefs.sidebarCollapsed),
    compact: Boolean(prefs.compact),
    defaultView: prefs.defaultView,
    sections: { ...prefs.sections },
    cards: { ...prefs.cards },
    assignmentDisplay: prefs.assignmentDisplay,
    showAnnouncements: Boolean(prefs.showAnnouncements)
  };
  localStorage.setItem(KEY, JSON.stringify(clean));
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  const theme = prefs.theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : prefs.theme;
  document.body.dataset.theme = theme;
  document.body.classList.toggle("light", theme === "light");
  document.body.classList.toggle("compact", Boolean(prefs.compact));
  document.body.classList.toggle("sidebar-collapsed", Boolean(prefs.sidebarCollapsed));
  root.style.setProperty("--accent", prefs.accent);
  root.style.setProperty("--accent2", prefs.accent);
}

export function resetPrefs() {
  const prefs = { ...DEFAULT_PREFS, sections: { ...DEFAULT_PREFS.sections }, cards: { ...DEFAULT_PREFS.cards } };
  savePrefs(prefs);
  return prefs;
}
