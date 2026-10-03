/* City Computing Collective — mobile navigation + live discussion feed (no dependencies)
   The feed reads data/discussions.json, which a GitHub Action refreshes from GitHub Discussions.
   Pages work without it: each feed mount carries its own empty state in the HTML. */
(function () {
  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  // Live feed
  var mounts = document.querySelectorAll('[data-feed]');
  if (!mounts.length) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function rel(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var d = (Date.now() - t) / 1000;
    if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' min ago';
    if (d < 86400) return Math.round(d / 3600) + ' h ago';
    if (d < 86400 * 30) return Math.round(d / 86400) + ' d ago';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function render(mount, items) {
    var empty = mount.querySelector('.empty');
    if (!items.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;
    var html = items.map(function (d) {
      var replies = d.comments === 1 ? '1 reply' : (d.comments || 0) + ' replies';
      return '<a class="post-card" href="' + esc(d.url) + '">' +
        '<div class="post-top"><span class="post-type">' + esc(d.categoryName || d.category) + '</span><span class="post-arrow" aria-hidden="true">↗</span></div>' +
        '<h3>' + esc(d.title) + '</h3>' +
        '<p>' + esc(d.author) + ' · ' + replies + ' · updated ' + rel(d.updatedAt) + '</p></a>';
    }).join('');
    var box = document.createElement('div');
    box.className = 'feed-list';
    box.innerHTML = html;
    mount.insertBefore(box, mount.firstChild);
  }

  function apply(data) {
    var all = (data && data.discussions) || [];
    mounts.forEach(function (m) {
      var cats = (m.getAttribute('data-categories') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var limit = parseInt(m.getAttribute('data-limit') || '6', 10);
      var items = cats.length ? all.filter(function (d) { return cats.indexOf(d.category) >= 0; }) : all;
      render(m, items.slice(0, limit));
    });
  }

  fetch('data/discussions.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(apply)
    .catch(function () { apply(null); });
})();
