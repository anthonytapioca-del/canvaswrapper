Module.register("MMM-CanvasHub", {
  defaults: {
    canvasHubUrl: "",
    canvasUrl: "",
    accessToken: "",
    showGrades: true,
    showMissing: true,
    showAnnouncements: true,
    updateInterval: 15 * 60 * 1000
  },

  start() {
    this.hubOrigin = this.getHubOrigin();
    this.handleWidgetMessage = this.handleWidgetMessage.bind(this);
    window.addEventListener("message", this.handleWidgetMessage);
  },

  stop() {
    window.removeEventListener("message", this.handleWidgetMessage);
  },

  getHubOrigin() {
    try {
      const url = new URL(this.config.canvasHubUrl);
      if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
      return url.origin;
    } catch {
      return null;
    }
  },

  handleWidgetMessage(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow || event.origin !== this.hubOrigin) return;
    if (!event.data || event.data.type !== "CANVASHUB_READY") return;
    this.iframe.contentWindow.postMessage({
      type: "CANVASHUB_CONFIG",
      canvasUrl: this.config.canvasUrl,
      accessToken: this.config.accessToken,
      showGrades: this.config.showGrades,
      showMissing: this.config.showMissing,
      showAnnouncements: this.config.showAnnouncements,
      accentColor: this.config.accentColor,
      updateInterval: this.config.updateInterval
    }, this.hubOrigin);
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-hub-frame-wrap";
    if (!this.hubOrigin) {
      wrapper.textContent = "Set canvasHubUrl to the HTTPS origin of your deployed Canvas Hub.";
      return wrapper;
    }
    const frame = document.createElement("iframe");
    frame.title = "Canvas Hub MagicMirror widget";
    frame.src = `${this.hubOrigin}/widget.html`;
    frame.loading = "eager";
    frame.referrerPolicy = "no-referrer";
    frame.sandbox = "allow-scripts allow-same-origin";
    frame.style.width = "min(430px, 90vw)";
    frame.style.height = `${Math.max(360, Math.min(1000, Number(this.config.widgetHeight) || 720))}px`;
    frame.style.border = "0";
    frame.style.borderRadius = "16px";
    frame.style.overflow = "hidden";
    this.iframe = frame;
    wrapper.appendChild(frame);
    return wrapper;
  }
});
