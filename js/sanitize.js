const ALLOWED_TAGS = new Set([
  "P", "BR", "DIV", "SPAN", "STRONG", "EM", "B", "I", "U", "UL", "OL", "LI",
  "A", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "PRE", "CODE", "HR", "TABLE",
  "THEAD", "TBODY", "TR", "TD", "TH"
]);

export function sanitizeHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  clean(root);
  return root.innerHTML;
}

function clean(node) {
  const children = [...node.childNodes];
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED" || tag === "LINK" || tag === "META") {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = child.parentNode;
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }
    for (const attr of [...child.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || name === "src" || name === "srcset" || name.startsWith("data-")) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (tag === "A" && name === "href") {
        const href = attr.value.trim();
        if (!/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
          child.removeAttribute("href");
        } else {
          child.setAttribute("rel", "noopener noreferrer nofollow");
          child.setAttribute("target", "_blank");
        }
        continue;
      }
      if (name !== "href" && name !== "title" && name !== "colspan" && name !== "rowspan") {
        child.removeAttribute(attr.name);
      }
    }
    clean(child);
  }
}

export function plainText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeHtml(html);
  return (tmp.textContent || "").replace(/\s+/g, " ").trim();
}
