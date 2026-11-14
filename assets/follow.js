/*
 * follow.js - shared "Follow" dialog for the four network sites.
 * Identical on every site. Vanilla JS, no dependencies.
 *
 * Any element with [data-follow] opens the dialog (event delegation).
 * API: window.Follow = { open(opts), close(), icon }
 * See assets/follow.css for the styling contract.
 */
(function () {
  'use strict';
  if (window.Follow && window.Follow.__ready) return;

  var SCRIPT = document.currentScript;
  if (!SCRIPT || !SCRIPT.src) {
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (/follow\.js(\?|#|$)/.test(all[i].src)) { SCRIPT = all[i]; break; }
    }
  }

  // Site root and config URL come from the script's own URL, so they work
  // from any page, including 404 pages at nested paths.
  var ROOT, CONFIG_URL;
  try {
    ROOT = new URL('../', SCRIPT.src);
    CONFIG_URL = new URL('../data/follow.json', SCRIPT.src).href;
  } catch (e) {
    ROOT = new URL('/', location.href);
    CONFIG_URL = new URL('/data/follow.json', location.href).href;
  }
  var FOLLOW_PAGE = new URL('follow.html', ROOT).href;
  // Keep example mode (?src=example) when going to the subscription centre.
  function followPageHref() {
    var u = new URL('follow.html', ROOT);
    try {
      if (new URLSearchParams(location.search).get('src') === 'example') u.searchParams.set('src', 'example');
    } catch (e) { /* keep plain link */ }
    return u.href;
  }

  var SITE_KEYS = {
    'citycomputingcollective.com': 'ccc',
    'xurbanai.com': 'xurbanai',
    'urbanprobe.com': 'urbanprobe',
    'urbanscience.ai': 'urbanscience'
  };
  function siteKey() {
    if (SCRIPT && SCRIPT.getAttribute('data-site')) return SCRIPT.getAttribute('data-site');
    var h = ROOT.hostname.replace(/^www\./, '');
    return SITE_KEYS[h] || h.split('.')[0] || 'site';
  }

  var COPY = {
    email: 'Blogtrottr, a free third-party service, can email you each new item. It shows ads, and every email has an unsubscribe link.',
    reader: 'Apps such as Feedly collect updates from many sites in one place. Copy the address and add it to your reader.',
    calendar: 'Subscribe once and new events appear in your calendar by themselves. Google Calendar can take up to a day to show changes.',
    discussions: 'If you have a GitHub account, open the repository, choose Watch, then Custom, and tick Discussions. GitHub then notifies you of every new discussion.',
    releases: 'If you have a GitHub account, open the repository, choose Watch, then Custom, and tick Releases. GitHub then notifies you of every new release.',
    thread: 'Open this discussion on GitHub and press Subscribe. GitHub then notifies you of every reply.',
    empty: 'Nothing has been published here yet. If you follow now, the first item will reach you when it appears.',
    privacy: 'This site does not store anything about you. Email and reader services are run by the companies named here.'
  };

  var ICON = '<svg class="follow-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cleanUrl(u) {
    if (!u) return '';
    try {
      var x = new URL(String(u).trim(), ROOT);
      return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : '';
    } catch (e) { return ''; }
  }
  function enc(s) { return encodeURIComponent(s); }

  function extLink(href, label, cls) {
    return '<a class="follow-action ' + (cls || '') + '" href="' + esc(href) + '" target="_blank" rel="noopener">' +
      esc(label) + '<span class="follow-sr"> (opens in a new tab)</span></a>';
  }
  function copyField(id, label, value) {
    return '<div class="follow-copy">' +
      '<label class="follow-sr" for="' + id + '">' + esc(label) + '</label>' +
      '<input class="follow-field" id="' + id + '" type="text" readonly value="' + esc(value) + '">' +
      '<button type="button" class="follow-action follow-primary" data-follow-copy="' + id + '">Copy address</button>' +
      '</div>';
  }

  // ---------- newsletter config (loaded once) ----------
  var configPromise = null;
  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch(CONFIG_URL)
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return configPromise;
  }
  function newsletterOf(cfg) {
    var n = cfg && cfg.newsletter;
    if (n && n.provider === 'buttondown' && typeof n.username === 'string' && n.username.trim()) {
      return { username: n.username.trim(), label: n.label || 'Weekly network digest' };
    }
    return null;
  }

  // ---------- dialog ----------
  var dialog, body, titleEl, whatEl, sr, opener = null, token = 0, abortCtl = null;
  var downOnBackdrop = false, srTimer = null;

  function build() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'follow-dialog';
    dialog.setAttribute('aria-labelledby', 'follow-title');
    dialog.innerHTML =
      '<div class="follow-panel">' +
      '<div class="follow-head">' +
      '<div class="follow-head-text"><h2 class="follow-title" id="follow-title"></h2><p class="follow-what" hidden></p></div>' +
      '<button type="button" class="follow-close" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
      '</button></div>' +
      '<div class="follow-body"></div>' +
      '<div class="follow-foot"><p class="follow-privacy"></p>' +
      '<p class="follow-all"><a href="">All ways to follow</a></p></div>' +
      '<div class="follow-sr" role="status" aria-live="polite" data-follow-announce></div>' +
      '</div>';
    document.body.appendChild(dialog);
    body = dialog.querySelector('.follow-body');
    titleEl = dialog.querySelector('.follow-title');
    whatEl = dialog.querySelector('.follow-what');
    sr = dialog.querySelector('[data-follow-announce]');
    dialog.querySelector('.follow-privacy').textContent = COPY.privacy;
    dialog.querySelector('.follow-all a').href = FOLLOW_PAGE;

    dialog.querySelector('.follow-close').addEventListener('click', close);
    // Backdrop: the panel fills the dialog, so a press on the dialog itself is a press outside.
    dialog.addEventListener('mousedown', function (e) { downOnBackdrop = e.target === dialog; });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog && downOnBackdrop) close();
      downOnBackdrop = false;
    });
    dialog.addEventListener('close', onClosed);
    dialog.addEventListener('click', onInside);
    dialog.addEventListener('focusin', function (e) {
      if (e.target.classList && e.target.classList.contains('follow-field')) e.target.select();
    });
  }

  function announce(msg) {
    if (!sr) return;
    sr.textContent = '';
    clearTimeout(srTimer);
    srTimer = setTimeout(function () { sr.textContent = msg; }, 30);
  }

  function onInside(e) {
    var btn = e.target.closest && e.target.closest('[data-follow-copy]');
    if (!btn) return;
    var input = dialog.querySelector('#' + btn.getAttribute('data-follow-copy'));
    if (input) copyText(input);
  }

  function copyText(input) {
    var text = input.value;
    function fallback() {
      input.focus();
      input.select();
      input.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      announce(ok ? 'Address copied' : 'Press Ctrl+C to copy the selected address');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        announce('Address copied');
      }, fallback);
    } else {
      fallback();
    }
  }

  function render(o, cfg) {
    var feed = cleanUrl(o.feed);
    var ics = cleanUrl(o.ics);
    var gh = cleanUrl(o.github);
    var news = o.newsletter ? newsletterOf(cfg) : null;
    var html = '';

    titleEl.textContent = 'Follow: ' + (o.title || 'updates');
    if (o.what) { whatEl.textContent = o.what; whatEl.hidden = false; } else { whatEl.textContent = ''; whatEl.hidden = true; }

    if (feed) html += '<p class="follow-status" data-follow-status role="status"></p>';

    if (news) {
      html += '<section class="follow-section" aria-labelledby="follow-h-news">' +
        '<h3 class="follow-h" id="follow-h-news">By email: ' + esc(news.label) + '</h3>' +
        '<p class="follow-text">Enter your address and Buttondown, a third-party newsletter service, will send you the ' + esc(news.label) + '.</p>' +
        '<form class="follow-form" method="post" target="_blank" rel="noopener" action="https://buttondown.com/api/emails/embed-subscribe/' + enc(news.username) + '">' +
        '<label class="follow-label" for="follow-email">Email address</label>' +
        '<div class="follow-copy">' +
        '<input class="follow-field follow-email" id="follow-email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">' +
        '<input type="hidden" name="tag" value="' + esc(siteKey()) + '">' +
        '<button type="submit" class="follow-action follow-primary">Subscribe</button>' +
        '</div>' +
        '<p class="follow-note">You will get an email to confirm.</p>' +
        '</form></section>';
    }

    if (feed) {
      html += '<section class="follow-section" aria-labelledby="follow-h-email">' +
        '<h3 class="follow-h" id="follow-h-email">By email</h3>' +
        '<p class="follow-text">' + esc(COPY.email) + '</p>' +
        '<div class="follow-row">' + extLink('https://blogtrottr.com/?subscribe=' + enc(feed), 'Email me new items', 'follow-primary') + '</div>' +
        '</section>';

      html += '<section class="follow-section" aria-labelledby="follow-h-reader">' +
        '<h3 class="follow-h" id="follow-h-reader">In a feed reader</h3>' +
        '<p class="follow-text">' + esc(COPY.reader) + '</p>' +
        copyField('follow-feed-url', 'Feed address', feed) +
        '<div class="follow-row">' +
        '<span data-follow-feedly>' + extLink('https://feedly.com/i/subscription/feed/' + enc(feed), 'Open in Feedly') + '</span>' +
        extLink('https://feedbin.com/?subscribe=' + enc(feed), 'Open in Feedbin') +
        '</div>' +
        '<p class="follow-small"><a href="' + esc(feed) + '" target="_blank" rel="noopener">View the raw feed<span class="follow-sr"> (opens in a new tab)</span></a></p>' +
        '</section>';
    }

    if (ics) {
      var u = new URL(ics);
      var webcal = 'webcal://' + u.host + u.pathname + u.search;
      var name = o.icsName || o.title || 'Calendar';
      html += '<section class="follow-section" aria-labelledby="follow-h-cal">' +
        '<h3 class="follow-h" id="follow-h-cal">In your calendar</h3>' +
        '<p class="follow-text">' + esc(COPY.calendar) + '</p>' +
        '<div class="follow-row">' +
        '<a class="follow-action follow-primary" href="' + esc(webcal) + '" rel="noopener">Apple Calendar and others</a>' +
        extLink('https://calendar.google.com/calendar/r?cid=' + enc(webcal), 'Google Calendar') +
        extLink('https://outlook.live.com/calendar/0/addfromweb?url=' + enc(ics) + '&name=' + enc(name), 'Outlook.com') +
        '</div>' +
        copyField('follow-ics-url', 'Calendar address', ics) +
        '</section>';
    }

    if (gh) {
      var kind = o.githubKind;
      if (kind !== 'discussions' && kind !== 'releases' && kind !== 'thread') {
        kind = /\/discussions\/\d+/.test(gh) ? 'thread' : 'discussions';
      }
      html += '<section class="follow-section" aria-labelledby="follow-h-gh">' +
        '<h3 class="follow-h" id="follow-h-gh">On GitHub</h3>' +
        '<p class="follow-text">' + esc(COPY[kind]) + '</p>' +
        '<div class="follow-row">' + extLink(gh, 'Open on GitHub') + '</div>' +
        '</section>';
    }

    body.innerHTML = html;
    return feed;
  }

  function checkFeed(feed, myToken) {
    var statusEl = body.querySelector('[data-follow-status]');
    if (!statusEl) return;
    if (abortCtl) abortCtl.abort();
    abortCtl = window.AbortController ? new AbortController() : null;
    fetch(feed, abortCtl ? { signal: abortCtl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.text(); })
      .then(function (txt) {
        if (myToken !== token) return;
        var doc = new DOMParser().parseFromString(txt, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return;
        var n = doc.getElementsByTagName('item').length + doc.getElementsByTagName('entry').length;
        if (n === 0) {
          statusEl.textContent = COPY.empty;
          var f = body.querySelector('[data-follow-feedly]');
          if (f) f.hidden = true;
        }
      })
      .catch(function () { /* say nothing */ });
  }

  function open(opts) {
    opts = opts || {};
    var o = {
      title: opts.title, what: opts.what, feed: opts.feed, ics: opts.ics, icsName: opts.icsName,
      github: opts.github, githubKind: opts.githubKind,
      newsletter: opts.newsletter === true || opts.newsletter === 'true'
    };
    if (typeof HTMLDialogElement === 'undefined') { location.href = FOLLOW_PAGE; return; }
    build();
    dialog.querySelector('.follow-all a').href = followPageHref();
    var wasOpen = dialog.open;
    if (!wasOpen) opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    var myToken = ++token;
    var cfgP = o.newsletter ? loadConfig() : Promise.resolve(null);
    cfgP.then(function (cfg) {
      if (myToken !== token) return;
      var feed = render(o, cfg);
      if (!dialog.open) {
        document.documentElement.classList.add('follow-open');
        dialog.showModal();
      }
      dialog.scrollTop = 0;
      var first = body.querySelector('a[href], button, input[type="email"]');
      if (first) first.focus(); else dialog.querySelector('.follow-close').focus();
      if (feed) checkFeed(feed, myToken);
    });
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
  }

  function onClosed() {
    token++;
    if (abortCtl) { abortCtl.abort(); abortCtl = null; }
    document.documentElement.classList.remove('follow-open');
    var el = opener;
    opener = null;
    if (el && el.isConnected && typeof el.focus === 'function') el.focus();
  }

  // ---------- triggers ----------
  function optsFrom(el) {
    var d = el.dataset;
    return {
      title: d.followTitle, what: d.followWhat, feed: d.followFeed, ics: d.followIcs,
      icsName: d.followIcsName, github: d.followGithub, githubKind: d.followGithubKind,
      newsletter: d.followNewsletter === 'true'
    };
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-follow]');
    if (!el || e.defaultPrevented) return;
    if (e.button && e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    opener = null;
    open(optsFrom(el));
    // keep the trigger as the focus-return target (Safari does not focus buttons on click)
    if (dialog) opener = el;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.defaultPrevented) return;
    var el = e.target.closest && e.target.closest('[data-follow]');
    if (!el || el !== e.target) return;
    var tag = el.tagName;
    // Native activation fires click for buttons and inputs, and for links on Enter only.
    // A link does not react to Space, so triggers styled as buttons need it here.
    if (tag === 'A' && e.key === ' ') { /* fall through: handle below */ }
    else if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return;
    e.preventDefault();
    el.click();
  });

  window.Follow = { open: open, close: close, icon: ICON, __ready: true };
})();
