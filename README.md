# Canvas Hub

A Canvas LMS dashboard that talks to your school’s Canvas instance through the official REST API. Courses, assignments, missing work, grades, and announcements stay inside the app instead of bouncing you to Canvas.

This project is an independent wrapper. It is not an Instructure product and cannot bypass school permissions.

## What works now

- In-app course pages (overview, assignments, grades, announcements, course information)
- Missing-assignment counts based on Canvas `submission.missing`, not “anything past due”
- Assignments page with search, course filter, status filter, due-date sort, and an in-app detail dialog
- Grades page that only shows scores Canvas actually returned
- Sanitized in-app announcements
- API & Developers documentation plus a personalized link generator (domain + starting view only)
- Settings (theme, accent, layout, dashboard sections) stored separately from credentials
- Connection diagnostics, refresh, disconnect
- HTTPS-only Canvas origin checks, endpoint allowlisting, pagination via `Link`, and `no-store` on private API responses
- OAuth2 **structure** for multi-user production (start, callback, HTTP-only session cookie, logout). This is inactive until a Canvas developer key and Vercel env vars are set.

## Important security notes

- The default connect flow uses a **user-provided Canvas API token** kept in this tab’s `sessionStorage` and sent in the POST body to `/api/canvas`. It is never placed in a URL.
- Session storage is a temporary approach. Anyone with access to the browser tab can use the token until Disconnect. Do not use this on a public computer.
- UI preferences go in `localStorage`. Tokens do not.
- For a public multi-user app, do **not** ask people to paste tokens. Configure Canvas OAuth2 (below).
- The proxy only forwards allowlisted `/api/v1/...` paths to a validated HTTPS Canvas origin.

## Required environment variables

None are required for personal-token mode.

For OAuth:

| Variable | Purpose |
| --- | --- |
| `CANVAS_OAUTH_CLIENT_ID` | Canvas developer key id |
| `CANVAS_OAUTH_CLIENT_SECRET` | Canvas developer key secret (server only) |
| `SESSION_SECRET` | Encrypts the HTTP-only session cookie |
| `OAUTH_REDIRECT_URI` | `https://YOUR_DEPLOYMENT/api/oauth-callback` |
| `CANVAS_BASE_URL` | Optional default Canvas origin |

See `.env.example`. Never commit real secrets.

## Canvas administrator configuration (OAuth)

1. Ask your Canvas admin for a **developer key** (OAuth client) for Canvas Hub.
2. Set the redirect URI exactly to `https://<your-vercel-domain>/api/oauth-callback`.
3. Put the client id, client secret, a long random `SESSION_SECRET`, and the redirect URI in Vercel → Project → Settings → Environment Variables.
4. Redeploy.

Until those values exist, **Authorize with Canvas** is disabled and the app stays on personal tokens. Do not claim OAuth is live without that setup.

OAuth tokens are stored in an encrypted HTTP-only cookie (Vercel has no built-in session database). Very large tokens may not fit in a cookie; personal-token mode still works.

## Test locally

```bash
npx vercel dev
```

Open the printed local URL. You need a Canvas HTTPS origin and an authorized token (or configured OAuth) to load live data.

Static UI-only preview (API routes will not work):

```bash
npx --yes serve . -p 3000
```

Checks to run:

1. App loads with no JavaScript errors
2. Sidebar, mobile menu, settings, docs, and link generator work without a token
3. Invalid Canvas URLs are rejected
4. Connect with a real token: courses open in-app, missing counts match across Overview / Assignments / course pages
5. Disconnect clears the session
6. Generated links contain only `canvas` and `view` — never tokens

## Deploy / redeploy on Vercel

The existing project at [canvaswrapper.vercel.app](https://canvaswrapper.vercel.app) can stay attached to this GitHub repo.

1. Commit and push to `https://github.com/anthonytapioca-del/canvaswrapper`
2. Vercel rebuilds automatically if the GitHub integration is on
3. Or: Vercel → Add New → Project → import this repo
4. Framework preset: **Other**. No build command. Output directory blank / `.`
5. Confirm `index.html`, `style.css`, `app.js`, `js/`, `api/`, and `vercel.json` are at the repo root
6. Add OAuth env vars only if you have a developer key
7. Open the deployment and use **Connect Canvas**

## Canvas Hub API routes

| Method | Path | Role |
| --- | --- | --- |
| POST | `/api/canvas` | Allowlisted Canvas proxy |
| GET | `/api/session` | OAuth/session status (no tokens) |
| POST | `/api/logout` | Clear session cookie |
| GET | `/api/oauth-start` | Redirect to Canvas OAuth (if configured) |
| GET | `/api/oauth-callback` | Token exchange (if configured) |

Official Canvas endpoints used: `/api/v1/users/self/profile`, `/api/v1/courses`, `/api/v1/courses/:id`, `/api/v1/courses/:id/assignments` (`include[]=submission`), `/api/v1/courses/:id/enrollments`, `/api/v1/announcements`.

Full examples live on the in-app **API & Developers** page.

## Not implemented

- Submitting assignments, taking quizzes, or posting in Canvas
- Server-synced notes (Quick notes are local only)
- Invented grades or a made-up letter-grade scale
- A shared multi-tenant token store / database (OAuth uses an encrypted cookie instead)
- OAuth against your school until a developer key is issued
