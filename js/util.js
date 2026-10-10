export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const PALETTE = ["#7c6cf0", "#3d9be8", "#d89a3c", "#2fbf8a", "#d56b9a", "#5b7de6", "#8a63d4", "#e06d5c"];

export function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

export function courseColor(id) {
  const n = [...String(id)].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return PALETTE[n % PALETTE.length];
}

export function dateLabel(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "No due date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Date unavailable";
  return d.toLocaleDateString(undefined, options);
}

export function dateTimeLabel(value) {
  if (!value) return "Not available";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Date unavailable";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function validHttpsOrigin(input) {
  try {
    const url = new URL(String(input || "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" || host.endsWith(".localhost") ||
      host === "127.0.0.1" || host === "::1" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes(".")
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length) || 0;
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

export function firstName(name) {
  const part = String(name || "").trim().split(/\s+/)[0];
  return part || "there";
}

export function formatScore(score, points) {
  if (score == null || score === "") return null;
  const n = Number(score);
  if (Number.isNaN(n)) return String(score);
  if (points != null && points !== "") return `${n} / ${points}`;
  return String(n);
}

export function skeleton(rows = 4) {
  return `<div class="skeleton-stack" aria-hidden="true">${Array.from({ length: rows }, () => '<div class="skeleton-row"><div class="sk sk-icon"></div><div class="sk-lines"><div class="sk sk-line"></div><div class="sk sk-line short"></div></div></div>').join("")}</div>`;
}
