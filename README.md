# Canvas Hub — Vercel starter

A responsive Canvas LMS dashboard using the official Canvas REST API. Includes courses, assignments, current grades when available, announcements, and a dark/light theme.

## Important security notes

- This starter uses a **user-provided Canvas API access token**. It does not store the token in a database or Vercel environment variable. It is kept in the current browser tab's `sessionStorage` and sent in the POST body to `/api/canvas`; it is not placed in a URL.
- Anyone who controls the browser session can use the token while the session is active. Disconnect when finished, and do not use this on a public/shared computer.
- Use only a Canvas account and token you are authorized to use. Your school may disable personal access tokens or restrict API access.
- For a public multi-user production app, do **not** ask users to paste tokens. Implement Canvas OAuth2 with an institution-approved developer key, server-side sessions, CSRF protection, and secure encrypted token storage. OAuth setup may require your Canvas administrator.
- This is an independent wrapper, not an official Instructure product. It does not bypass school permissions.
- The API proxy has an endpoint allowlist and only accepts HTTPS Canvas origins. It intentionally supports the endpoints this dashboard needs.

## Deploy to Vercel

1. Download and unzip this project.
2. Create a repository on GitHub and upload the contents of this folder (make sure `index.html`, `style.css`, `app.js`, `vercel.json`, and `api/canvas.js` are at the repository root / expected paths).
3. In Vercel, choose **Add New → Project**, import the repository, and deploy.
4. This is a static HTML/CSS/JS project with one Vercel serverless function. Use the **Other** framework preset. No build command is required; the static files are served from the project root. If Vercel asks for an output directory, leave it blank or use `.`.
5. Open the deployed URL and choose **Connect Canvas**.

## Connect Canvas

1. Enter your Canvas base URL, e.g. `https://school.instructure.com` or the Canvas URL supplied by your school. Use the site's origin, not a course URL.
2. Create a personal access token only if your school permits it. In Canvas this is commonly under **Account → Settings → Approved Integrations → New Access Token**; the labels can vary or the option may be disabled by your school.
3. Paste the token and click **Connect & load**.
4. If you see a 401 error, the token may be invalid/expired or the Canvas URL may be wrong. A 403 usually means the account/token is not permitted to access that data.

## Included dashboard features

- Active course cards and course links
- Upcoming assignments, due dates, and basic due-state labels
- Current course grades/score where Canvas exposes them
- Recent course announcements
- Search and due-date filters for assignments
- Dark/light theme toggle
- Responsive layout for desktop and mobile

## Notes / limitations

- The API currently loads assignments and grades from up to 30 active courses to keep serverless requests bounded. Announcements are loaded for up to 20 courses.
- Some courses may not expose a current grade or announcements through the API; the dashboard will show an empty state.
- Grade values are presented as returned by Canvas, and grading policies can differ by course.
- This starter does not submit assignments, change grades, or write to Canvas.
- The proxy is designed for personal use, not as a public token relay. Do not expose it as a shared service.
