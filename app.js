const $ = (id) => document.getElementById(id);
const palette = ["#8c79f6", "#4da7ee", "#e3a64b", "#46b992", "#df78a5", "#6387e8", "#9a72d4"];
const state = { courses: [], assignments: [], grades: [], announcements: [], profile: null, connected: false };
const views = ["overview", "courses", "assignments", "grades", "announcements"];
const session = {
  get url(){ return sessionStorage.getItem("canvasHubUrl") || ""; },
  set url(v){ sessionStorage.setItem("canvasHubUrl",v); },
  get token(){ return sessionStorage.getItem("canvasHubToken") || ""; },
  set token(v){ sessionStorage.setItem("canvasHubToken",v); }
};
function safeText(value){ return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function dateLabel(value, options={month:"short",day:"numeric"}) {
  if(!value) return "No due date";
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return "Date unavailable";
  return d.toLocaleDateString(undefined, options);
}
function courseName(id){ return state.courses.find(c=>String(c.id)===String(id))?.name || "Course"; }
function showAlert(message, success=false){
  const el=$("alert"); el.textContent=message; el.classList.remove("hidden"); el.classList.toggle("success",success);
}
function clearAlert(){ $("alert").classList.add("hidden"); }
function setConnected(on){
  state.connected=on;
  $("status-dot").classList.toggle("connected",on);
  $("connection-label").textContent=on ? "Canvas connected" : "Not connected";
  $("connection-sub").textContent=on ? "Data loaded from Canvas" : "Connect your Canvas account";
  $("connect-banner").classList.toggle("hidden",on);
  $("profile-avatar").textContent=state.profile?.name?.trim()?.[0]?.toUpperCase() || "?";
  $("welcome-name").textContent=state.profile?.name ? `Welcome back, ${state.profile.name.split(" ")[0]}.` : "Your semester, organized.";
}
async function canvas(path){
  const res=await fetch("/api/canvas",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({canvasUrl:session.url,token:session.token,path})
  });
  let data; try{data=await res.json()}catch{throw new Error("The API returned an invalid response. Check your Vercel deployment.");}
  if(!res.ok) throw new Error(data.error || `Canvas request failed (${res.status}).`);
  return data;
}
async function loadAll(){
  if(!session.url || !session.token){openSettings();return;}
  clearAlert(); $("save-connect").disabled=true; $("save-connect").textContent="Loading…";
  try{
    const profile=await canvas("/api/v1/users/self/profile");
    state.profile=profile;
    const courses=await canvas("/api/v1/courses?enrollment_state=active&include[]=total_students&per_page=100");
    state.courses=Array.isArray(courses)?courses.filter(c=>!c.access_restricted_by_date):[];
    const [assignments,grades,announcements]=await Promise.all([
      loadAssignments(), loadGrades(), loadAnnouncements()
    ]);
    state.assignments=assignments; state.grades=grades; state.announcements=announcements;
    setConnected(true); renderAll(); showAlert("Connected successfully. Your Canvas data is loaded.",true);
    $("settings-dialog").close();
  }catch(err){
    setConnected(false); showAlert(err.message || "Could not connect. Check your Canvas URL and token.");
  }finally{$("save-connect").disabled=false;$("save-connect").textContent="Connect & load";}
}
async function loadAssignments(){
  const all=await Promise.all(state.courses.slice(0,30).map(async c=>{
    try{
      const data=await canvas(`/api/v1/courses/${encodeURIComponent(c.id)}/assignments?per_page=100&order_by=due_at`);
      return (Array.isArray(data)?data:[]).map(a=>({...a,course_id:c.id,course_name:c.name}));
    }catch{return [];}
  }));
  return all.flat().sort((a,b)=>new Date(a.due_at||"2999-01-01")-new Date(b.due_at||"2999-01-01"));
}
async function loadGrades(){
  const all=await Promise.all(state.courses.slice(0,30).map(async c=>{
    try{
      const enrollments=await canvas(`/api/v1/courses/${encodeURIComponent(c.id)}/enrollments?user_id=self&type[]=StudentEnrollment&include[]=grades`);
      const e=Array.isArray(enrollments)?enrollments.find(x=>x.type?.includes("StudentEnrollment")) || enrollments[0]:null;
      return e?{course_id:c.id,course_name:c.name,grades:e.grades||{},computed_current_score:e.grades?.current_score,computed_current_grade:e.grades?.current_grade}:null;
    }catch{return null;}
  }));
  return all.filter(Boolean);
}
async function loadAnnouncements(){
  const all=await Promise.all(state.courses.slice(0,20).map(async c=>{
    try{
      const data=await canvas(`/api/v1/announcements?context_codes[]=course_${encodeURIComponent(c.id)}&per_page=10`);
      return (Array.isArray(data)?data:[]).map(a=>({...a,course_name:c.name,course_id:c.id}));
    }catch{return [];}
  }));
  const seen=new Set();
  return all.flat().filter(a=>{const key=String(a.id);if(seen.has(key))return false;seen.add(key);return true;})
    .sort((a,b)=>new Date(b.posted_at||b.created_at||0)-new Date(a.posted_at||a.created_at||0)).slice(0,30);
}
function assignmentStatus(a){
  if(a.submission?.workflow_state==="graded") return ["Graded",""];
  if(!a.due_at)return ["No due date",""];
  const diff=new Date(a.due_at)-new Date();
  if(diff<0)return ["Past due","late"];
  if(diff<1000*60*60*48)return ["Due soon","soon"];
  return ["Upcoming",""];
}
function assignmentRow(a){
  const [status,klass]=assignmentStatus(a);
  return `<div class="list-row"><div class="row-icon">✓</div><div class="row-main"><strong>${safeText(a.name)}</strong><small>${safeText(a.course_name||courseName(a.course_id))} · ${safeText(a.points_possible!=null?`${a.points_possible} points`:"Assignment")}</small></div><div class="row-end"><strong>${safeText(dateLabel(a.due_at))}</strong><span class="badge ${klass}">${status}</span></div></div>`;
}
function courseMini(c,i){
  return `<div class="mini-course"><div class="course-stripe" style="--course-color:${palette[i%palette.length]}"></div><strong>${safeText(c.name)}</strong><small>${safeText(c.course_code||"Canvas course")}</small></div>`;
}
function courseCard(c,i){
  const g=state.grades.find(x=>String(x.course_id)===String(c.id));
  const score=g?.computed_current_score;
  return `<article class="course-card"><div class="course-cover" style="--course-color:${palette[i%palette.length]}"><span>COURSE ${String(i+1).padStart(2,"0")}</span></div><div class="course-body"><h3>${safeText(c.name)}</h3><p>${safeText(c.course_code||"Active course")}</p><div class="course-footer"><span>${score!=null?`Current grade: ${safeText(score)}%`:"Course workspace"}</span><a href="${safeText(c.html_url||session.url)}" target="_blank" rel="noopener noreferrer">Open course ↗</a></div></div></article>`;
}
function announcementRow(a){
  const plain=(a.message||"").replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
  const url=a.html_url || `${session.url}/courses/${encodeURIComponent(a.course_id)}/discussion_topics/${encodeURIComponent(a.id)}`;
  return `<div class="list-row"><div class="row-icon">◉</div><div class="row-main"><strong>${safeText(a.title||"Announcement")}</strong><small>${safeText(a.course_name||"Course")} · ${safeText(dateLabel(a.posted_at||a.created_at,{month:"short",day:"numeric",year:"numeric"}))}</small><div class="announcement-body">${safeText(plain||"Open this announcement in Canvas to read more.")}</div></div><div class="row-end"><a class="announcement-link" href="${safeText(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a></div></div>`;
}
function renderAll(){
  $("stat-courses").textContent=state.courses.length;
  const upcoming=state.assignments.filter(a=>!a.due_at||new Date(a.due_at)>=new Date()).filter(a=>a.submission?.workflow_state!=="graded");
  $("stat-assignments").textContent=upcoming.length;
  $("assignment-count").textContent=upcoming.length||"";
  $("stat-graded").textContent=state.grades.filter(g=>g.computed_current_score!=null||g.computed_current_grade).length;
  $("stat-announcements").textContent=state.announcements.length;
  $("overview-assignments").innerHTML=state.assignments.filter(a=>a.due_at&&new Date(a.due_at)>=new Date()).slice(0,5).map(assignmentRow).join("")||'<div class="empty-state">No upcoming assignments found. Nice work!</div>';
  $("overview-courses").innerHTML=state.courses.slice(0,4).map(courseMini).join("")||'<div class="empty-state">No active courses found.</div>';
  $("overview-announcements").innerHTML=state.announcements.slice(0,3).map(announcementRow).join("")||'<div class="empty-state">No recent announcements found.</div>';
  $("courses-grid").innerHTML=state.courses.map(courseCard).join("")||'<div class="empty-state">No active courses found.</div>';
  renderAssignments(); renderGrades();
  $("announcements-list").innerHTML=state.announcements.map(announcementRow).join("")||'<div class="empty-state">No announcements found for your active courses.</div>';
}
function renderAssignments(){
  const q=$("assignment-search").value.toLowerCase(), filter=$("assignment-filter").value, now=new Date();
  const list=state.assignments.filter(a=>{
    const due=a.due_at?new Date(a.due_at):null;
    const match=(a.name+" "+(a.course_name||"")).toLowerCase().includes(q);
    const stateMatch=filter==="all"||(filter==="past"&&due&&due<now)||(filter==="upcoming"&&(!due||due>=now));
    return match&&stateMatch;
  });
  $("assignments-list").innerHTML=list.map(assignmentRow).join("")||'<div class="empty-state">No assignments match this filter.</div>';
}
function renderGrades(){
  $("grades-grid").innerHTML=state.courses.map(c=>{
    const g=state.grades.find(x=>String(x.course_id)===String(c.id));
    const score=g?.computed_current_score;
    const grade=g?.computed_current_grade;
    const label=score!=null?`${Math.round(Number(score)*10)/10}%`:grade||"—";
    return `<article class="grade-card"><div class="grade-ring ${score==null&&!grade?"no-grade":""}">${safeText(label)}</div><div class="grade-info"><strong>${safeText(c.name)}</strong><small>${score!=null?"Current score reported by Canvas":grade?"Current letter grade reported by Canvas":"No current grade published"}</small></div></article>`;
  }).join("")||'<div class="empty-state">No grade data found.</div>';
}
function openSettings(){
  $("canvas-url").value=session.url;
  $("canvas-token").value=session.token;
  $("settings-dialog").showModal();
}
function switchView(view){
  views.forEach(v=>$(`${v}-view`).classList.toggle("hidden",v!==view));
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const titles={overview:["YOUR SCHOOL, AT A GLANCE","Good to see you."],courses:["YOUR CLASSES","Courses"],assignments:["STAY ON TRACK","Assignments"],grades:["ACADEMIC PROGRESS","Grades"],announcements:["WHAT'S HAPPENING","Announcements"]};
  $("eyebrow").textContent=titles[view][0];$("page-title").textContent=titles[view][1];
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.goto)));
$("connect-open").addEventListener("click",openSettings);$("settings-open").addEventListener("click",openSettings);$("footer-settings").addEventListener("click",openSettings);
$("settings-close").addEventListener("click",()=>$("settings-dialog").close());$("cancel-settings").addEventListener("click",()=>$("settings-dialog").close());
$("settings-form").addEventListener("submit",async e=>{
  e.preventDefault();
  let url=$("canvas-url").value.trim().replace(/\/+$/,"");
  try{const u=new URL(url);if(u.protocol!=="https:")throw new Error();url=u.origin;}catch{showAlert("Enter a valid HTTPS Canvas URL, such as https://school.instructure.com");return;}
  const token=$("canvas-token").value.trim();
  if(!token){showAlert("Paste your Canvas API access token.");return;}
  session.url=url;session.token=token;await loadAll();
});
$("disconnect-btn").addEventListener("click",()=>{
  sessionStorage.removeItem("canvasHubUrl");sessionStorage.removeItem("canvasHubToken");
  Object.assign(state,{courses:[],assignments:[],grades:[],announcements:[],profile:null});
  setConnected(false);renderAll();$("settings-dialog").close();showAlert("Disconnected. The saved session token was removed.",true);
});
$("assignment-search").addEventListener("input",renderAssignments);$("assignment-filter").addEventListener("change",renderAssignments);
$("theme-toggle").addEventListener("click",()=>{document.body.classList.toggle("light");sessionStorage.setItem("canvasHubTheme",document.body.classList.contains("light")?"light":"dark");});
if(sessionStorage.getItem("canvasHubTheme")==="light")document.body.classList.add("light");
$("today-date").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
setConnected(false);
if(session.url&&session.token)loadAll();
