# Canvas Hub

Canvas Hub is a browser dashboard for Canvas LMS, with optional OAuth or a tab-scoped personal access token. It includes a MagicMirror² module that displays selected Canvas grades, missing assignments, and announcements in a hosted widget.

## MMM-CanvasHub MagicMirror² module

Install the **`MMM-CanvasHub`** module from the [`MMM-CanvasHub/` folder in this repository](https://github.com/anthonytapioca-del/canvaswrapper/tree/anthonytapioca-del-understand-codebase/MMM-CanvasHub). For the hosted-widget version currently deployed, run this on your MagicMirror device:

```bash
cd ~/MagicMirror/modules
git clone --depth 1 --branch anthonytapioca-del-understand-codebase https://github.com/anthonytapioca-del/canvaswrapper.git /tmp/canvaswrapper
cp -R /tmp/canvaswrapper/MMM-CanvasHub ./MMM-CanvasHub
```

Then:

1. In a browser, open [Canvas Hub](https://canvaswrapper.vercel.app/) and go to **API & Developers → MagicMirror widget builder**.
2. Create a Canvas access token in your Canvas account settings (usually **Account → Settings → Approved Integrations → + New Access Token**). If your school manages Canvas, token creation may be disabled; ask your Canvas administrator.
3. In the builder, enter your Canvas site URL (for example, `https://school.instructure.com`) and token. Select grades, missing work, and/or announcements, then choose the position and accent color.
4. Click **Generate config** and copy the generated object.
5. On the MagicMirror device, open `~/MagicMirror/config/config.js`. Paste the copied object as an entry inside the `modules: [ ... ]` array, keeping commas between entries. The generated entry uses `module: "MMM-CanvasHub"`; do not rename it.
6. Save the file and restart MagicMirror using your normal method (for example, `pm2 restart mm` if you run it with PM2). The mirror needs internet access to load the hosted widget.

The config contains your access token in plain text on the MagicMirror device. Keep `config.js` private, do not publish it, and use a dedicated token that can be revoked. Credentials stay in the local config until refresh, are sent to the hosted widget in memory, and are posted to Canvas Hub's allowlisted `/api/canvas` proxy; they are not included in the widget URL or stored on Canvas Hub. The module refreshes every 15 minutes, checks up to 20 active courses, and displays at most the three most recently due missing assignments.
