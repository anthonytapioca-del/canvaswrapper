Module.register("MMM-CanvasHub", {
  limits: {
    grades: 4,
    missing: 3,
    announcements: 3
  },

  defaults: {
    canvasUrl: "",
    accessToken: "",
    showGrades: true,
    showMissing: true,
    showAnnouncements: true,
    updateInterval: 15 * 60 * 1000
  },

  start() {
    this.data = null;
    this.error = null;
    this.warning = null;
    this.loaded = false;
    this.requestData();
    this.updateTimer = setInterval(() => this.requestData(), this.config.updateInterval);
  },

  stop() {
    clearInterval(this.updateTimer);
  },

  getStyles() {
    return ["MMM-CanvasHub.css"];
  },

  requestData() {
    this.sendSocketNotification("CANVASHUB_FETCH", {
      canvasUrl: this.config.canvasUrl,
      accessToken: this.config.accessToken,
      showGrades: this.config.showGrades,
      showMissing: this.config.showMissing,
      showAnnouncements: this.config.showAnnouncements
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "CANVASHUB_DATA") return;
    this.loaded = true;
    this.error = payload.error || null;
    this.warning = payload.warning || null;
    this.data = payload.data || null;
    this.updateDom(300);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-hub-widget";
    const title = document.createElement("header");
    title.className = "canvas-hub-title";
    title.textContent = "Canvas Hub";
    wrapper.appendChild(title);

    if (!this.loaded) {
      wrapper.appendChild(this.makeText("Loading Canvas data…", "dimmed"));
      return wrapper;
    }
    if (this.error) {
      wrapper.appendChild(this.makeText(this.error, "canvas-hub-error"));
      return wrapper;
    }
    if (!this.data) {
      wrapper.appendChild(this.makeText("No Canvas data returned.", "dimmed"));
      return wrapper;
    }

    const content = document.createElement("div");
    content.className = "canvas-hub-content";
    if (this.config.showGrades) this.renderGrades(content, this.data.grades);
    if (this.config.showMissing) this.renderMissing(content, this.data.missing);
    if (this.config.showAnnouncements) this.renderAnnouncements(content, this.data.announcements);
    wrapper.appendChild(content);
    if (this.warning) wrapper.appendChild(this.makeText(this.warning, "dimmed canvas-hub-warning"));
    return wrapper;
  },

  makeText(text, className) {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
  },

  addSection(parent, label) {
    const section = document.createElement("section");
    section.className = "canvas-hub-section";
    const heading = document.createElement("div");
    heading.className = "canvas-hub-section-title";
    heading.textContent = label;
    section.appendChild(heading);
    parent.appendChild(section);
    return section;
  },

  renderGrades(parent, grades) {
    const section = this.addSection(parent, `Grades${grades.length ? ` · ${grades.length}` : ""}`);
    if (!grades.length) {
      section.appendChild(this.makeText("No published grades.", "dimmed"));
      return;
    }
    grades.slice(0, this.limits.grades).forEach((grade) => {
      const row = document.createElement("div");
      row.className = "canvas-hub-row";
      row.appendChild(this.makeText(grade.courseName, "canvas-hub-course"));
      row.appendChild(this.makeText(grade.score, "canvas-hub-value"));
      section.appendChild(row);
    });
  },

  renderMissing(parent, missing) {
    const section = this.addSection(parent, `Missing (${missing.length})`);
    if (!missing.length) {
      section.appendChild(this.makeText("No missing assignments.", "dimmed"));
      return;
    }
    missing.slice(0, this.limits.missing).forEach((assignment) => {
      const row = document.createElement("div");
      row.className = "canvas-hub-item";
      row.appendChild(this.makeText(assignment.name, "canvas-hub-course"));
      row.appendChild(this.makeText(`${assignment.courseName}${assignment.dueAt ? ` · Due ${assignment.dueAt}` : ""}`, "dimmed"));
      section.appendChild(row);
    });
  },

  renderAnnouncements(parent, announcements) {
    const section = this.addSection(parent, `Announcements${announcements.length ? ` · ${announcements.length}` : ""}`);
    if (!announcements.length) {
      section.appendChild(this.makeText("No recent announcements.", "dimmed"));
      return;
    }
    announcements.slice(0, this.limits.announcements).forEach((announcement) => {
      const item = document.createElement("div");
      item.className = "canvas-hub-item";
      item.appendChild(this.makeText(announcement.title, "canvas-hub-course"));
      const date = announcement.postedAt ? new Date(announcement.postedAt).toLocaleDateString() : "";
      item.appendChild(this.makeText(`${announcement.courseName}${date ? ` · ${date}` : ""}`, "dimmed"));
      if (announcement.message) item.appendChild(this.makeText(announcement.message, "canvas-hub-message"));
      section.appendChild(item);
    });
  }
});
