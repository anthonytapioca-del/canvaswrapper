# Canvas Hub

Canvas Hub is a browser dashboard for Canvas LMS, with optional OAuth or a tab-scoped personal access token. It includes a MagicMirror² module that displays selected Canvas grades, missing assignments, and announcements.

## MMM-CanvasHub MagicMirror² module

1. Copy the `MMM-CanvasHub` directory from this repository into your MagicMirror `modules` directory.
2. In Canvas Hub, open **API & Developers → MagicMirror widget builder**.
3. Enter your Canvas HTTPS URL and personal access token, choose the sections and position, then generate the config object.
4. Paste the object into the `modules` array in `config/config.js` and restart MagicMirror.

The generated config contains the access token in plain text on the MagicMirror device. Keep `config.js` private, do not publish it, and use a dedicated token that can be revoked. The token is sent directly from the MagicMirror server to Canvas over HTTPS; it is not sent to or stored by Canvas Hub. The module refreshes every 15 minutes and limits data loading to the first 30 active courses.

The module requires a MagicMirror² version running on Node.js 18 or later (for built-in `fetch`). It uses Canvas endpoints for active courses, enrollment grades, submissions, and announcements according to the selected sections.
