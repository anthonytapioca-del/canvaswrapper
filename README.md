# Canvas Hub

A static, Vercel-ready Canvas LMS launcher. It does not proxy Canvas or collect school credentials; it opens the school's real Canvas site in a new tab.

## Deploy to Vercel
1. Upload this folder to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Framework preset: **Other**. Build command: leave blank. Output directory: `.` (the project root).
4. Deploy.

You can also use Vercel's CLI if it is already installed: run `vercel` from this folder.

## Use
1. Open the deployed site.
2. Enter the full Canvas URL your school uses, such as `https://school.instructure.com` (use your actual school's URL).
3. Save it, then choose Courses, Assignments, Grades, or Calendar.

The URL is stored in local browser storage. The site does not ask for or store your Canvas password. Links open the official Canvas website and obey school account permissions.
