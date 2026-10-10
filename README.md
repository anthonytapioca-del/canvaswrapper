# Canvas Hub

Canvas Hub is a browser dashboard for Canvas LMS, with optional OAuth or a tab-scoped personal access token. It includes a MagicMirror² module that displays selected Canvas grades, missing assignments, and announcements in a hosted widget.

## MMM-CanvasHub MagicMirror² module

1. Deploy Canvas Hub to your domain and copy the `MMM-CanvasHub` directory from this repository into your MagicMirror `modules` directory.
2. In Canvas Hub, open **API & Developers → MagicMirror widget builder**.
3. Enter your Canvas HTTPS URL and personal access token, choose the sections and position, then generate the config object.
4. Paste the object into the `modules` array in MagicMirror's `config/config.js` and restart MagicMirror.

The generated config points to the deployed Canvas Hub domain and contains the access token in plain text on the MagicMirror device. Keep `config.js` private, do not publish it, and use a dedicated token that can be revoked. The module sends credentials to the hosted widget using `postMessage` with an exact origin target; the widget keeps them in memory and posts them to Canvas Hub's allowlisted `/api/canvas` proxy when refreshing. Credentials are not put in the widget URL or stored on the Hub. The module refreshes every 15 minutes and limits data loading to the first 20 active courses. Missing assignments are ordered by due date, newest first, and the widget displays at most three with their assignment and course names.

The widget page is framed only at `/widget.html`; the main Canvas Hub app remains protected from framing. The hosted page uses Canvas endpoints for active courses, enrollment grades, submissions, and announcements according to the selected sections.
