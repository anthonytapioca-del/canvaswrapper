(() => {
  const input = document.getElementById('canvasUrl');
  const status = document.getElementById('status');
  const KEY = 'canvasHubBaseUrl';
  const routes = {
    home: '/',
    courses: '/courses',
    assignments: '/courses',
    grades: '/grades',
    calendar: '/calendar'
  };
  function cleanUrl(value) {
    let raw = value.trim();
    if (!raw) return '';
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    try {
      const url = new URL(raw);
      if (!['https:', 'http:'].includes(url.protocol)) return '';
      return url.origin;
    } catch { return ''; }
  }
  function getBase() {
    try { return cleanUrl(localStorage.getItem(KEY) || ''); } catch { return ''; }
  }
  function openRoute(route = '/') {
    const base = getBase();
    if (!base) {
      status.textContent = 'Enter and save your school Canvas URL first.';
      input.focus();
      document.getElementById('settings').scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    window.open(base + route, '_blank', 'noopener,noreferrer');
  }
  const saved = getBase();
  if (saved) { input.value = saved; status.textContent = 'Connected: ' + saved; }
  document.getElementById('saveUrl').addEventListener('click', () => {
    const base = cleanUrl(input.value);
    if (!base) { status.textContent = 'Enter a valid Canvas URL, such as https://school.instructure.com'; return; }
    try { localStorage.setItem(KEY, base); } catch { status.textContent = 'Could not save in this browser. Check browser storage settings.'; return; }
    input.value = base;
    status.textContent = 'Saved: ' + base;
  });
  document.getElementById('launchCanvas').addEventListener('click', () => openRoute('/'));
  document.getElementById('openCanvas').addEventListener('click', () => openRoute('/'));
  document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', () => openRoute(routes[el.dataset.route] || '/')));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); window.scrollTo({top:0,behavior:'smooth'}); });
})();
