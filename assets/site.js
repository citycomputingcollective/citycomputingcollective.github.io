/* City Computing Collective — core: data, cards, list views, theme hubs, member pages, composer, saved items.

   Data
     data/discussions.json   exported from GitHub Discussions by .github/workflows/discussions-feed.yml
     data/taxonomy.json      categories and research themes, shared with the exporter and the templates
     ?src=example            previews every view with data/examples/discussions.json

   Follow buttons open the shared dialog in assets/follow.js (any element with data-follow).

   Views are declared in HTML (data-view="list|stats|theme-hub|member") and configured with data
   attributes; see README. Each keeps its no-JavaScript fallback in the HTML.
   assets/palette.js adds the command palette on top of the API exposed as window.CCC. */
(() => {
  'use strict';

  const REPO = 'https://github.com/citycomputingcollective/citycomputingcollective.github.io/discussions';
  const SITE = 'https://citycomputingcollective.com';
  const params = new URLSearchParams(location.search);
  const example = params.get('src') === 'example';
  // Site root from this script's own URL, so feed and data addresses stay right on 404 pages at nested paths.
  const ROOT = (() => { try { return new URL('../', document.currentScript.src).href; } catch { return new URL('/', location.href).href; } })();
  const abs = (p) => new URL(p, ROOT).href;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = (url) => fetch(abs(url), { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const parseDay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const daysUntil = (iso) => { const d = parseDay(iso); return d ? Math.round((d - today()) / 864e5) : null; };
  const fmtDay = (iso, opts) => { const d = parseDay(iso); return d ? d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const link = (href) => {
    if (!example || /^(https?:|#|mailto:|webcal:)/.test(href) || /[?&]src=/.test(href)) return href;
    const [path, hash = ''] = href.split('#');
    return path + (path.includes('?') ? '&' : '?') + 'src=example' + (hash ? '#' + hash : '');
  };
  function ago(iso) {
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 30) return plural(Math.round(s / 86400), 'day') + ' ago';
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function avatar(d, size) {
    if (d.avatar) {
      const src = d.avatar + (d.avatar.includes('?') ? '&' : '?') + 's=' + size * 2;
      return `<img class="avatar" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
    }
    const name = String(d.author || '?').replace(/^example-/, '');
    const letter = (/\d+$/.test(name) ? name.match(/\d+$/)[0].slice(-1) : name.charAt(0)).toUpperCase();
    return `<span class="avatar initials" style="--h:${hue(d.author)};width:${size}px;height:${size}px" aria-hidden="true">${esc(letter)}</span>`;
  }
  // ------------------------------------------------------------------ follow buttons (dialog lives in assets/follow.js)
  const GH_REPO = 'https://github.com/citycomputingcollective/citycomputingcollective.github.io';
  const NETWORK_FEEDS = 'https://urbanscience.ai/feeds/';
  const BELL = '<svg class="follow-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const FOLLOW = {
    all: { title: 'All discussions', what: 'Every new discussion in the City Computing Collective.', feed: abs('feeds/all.xml'), github: GH_REPO, githubKind: 'discussions', newsletter: true },
    openCalls: { title: 'Open calls', what: 'New calls, grants, positions, and challenges, and a calendar of their deadlines.', feed: abs('feeds/category-opportunities.xml'), ics: abs('feeds/deadlines.ics'), icsName: 'City Computing Collective deadlines' },
    events: { title: 'Events', what: 'New events: talks, clinics, and meetups.', feed: abs('feeds/category-events-meetups.xml'), ics: abs('feeds/events.ics'), icsName: 'City Computing Collective events' },
    unanswered: { title: 'Unanswered questions', what: 'Questions that do not have an accepted answer yet.', feed: abs('feeds/unanswered.xml') },
    category: (c) => ({ title: c.label, what: `New discussions in ${c.label}.`, feed: abs(`feeds/category-${c.slug}.xml`) }),
    // the network feed adds releases from XUrbanAI and UrbanProbe to the discussions here
    theme: (t) => ({ title: t.label, what: 'New discussions here plus new releases on XUrbanAI and UrbanProbe for this theme.', feed: `${NETWORK_FEEDS}theme-${t.slug}.xml` }),
    themeLocal: (t) => ({ title: t.label, what: 'New discussions tagged with this theme. This feed covers discussions only.', feed: abs(`feeds/theme-${t.slug}.xml`) }),
    // example members and posts have no real feeds, so example mode points at a placeholder file in data/examples/feeds
    member: (login, name) => ({ title: name, what: `New discussions started by ${login}.`, feed: abs(example ? 'data/examples/feeds/member.xml' : `feeds/member-${login.replace(/[^A-Za-z0-9_-]/g, '_')}.xml`) }),
    replies: (number) => abs(example ? 'data/examples/feeds/post.xml' : `feeds/post-${number}.xml`),
  };
  const followAttrs = (o) => ` data-follow data-follow-title="${esc(o.title)}"`
    + (o.what ? ` data-follow-what="${esc(o.what)}"` : '') + (o.feed ? ` data-follow-feed="${esc(o.feed)}"` : '')
    + (o.ics ? ` data-follow-ics="${esc(o.ics)}" data-follow-ics-name="${esc(o.icsName || '')}"` : '')
    + (o.github ? ` data-follow-github="${esc(o.github)}" data-follow-github-kind="${esc(o.githubKind || 'discussions')}"` : '')
    + (o.newsletter ? ' data-follow-newsletter="true"' : '');
  const followBtn = (o, label, cls = 'follow-btn small') => `<button type="button" class="${cls}"${followAttrs(o)}>${BELL}<span>${esc(label)}</span></button>`;
  // point an existing trigger at new content (used for the theme page)
  function setFollow(el, o) {
    if (!el) return;
    const set = (k, v) => (v ? el.setAttribute(k, v) : el.removeAttribute(k));
    set('data-follow-title', o.title); set('data-follow-what', o.what); set('data-follow-feed', o.feed);
    set('data-follow-ics', o.ics); set('data-follow-ics-name', o.icsName); set('data-follow-github', o.github);
    set('data-follow-github-kind', o.github ? o.githubKind || 'discussions' : '');
    if (o.feed && el.tagName === 'A') el.setAttribute('href', o.feed);
    el.hidden = false;
  }

  // follow.js builds the dialog's "All ways to follow" link without the preview flag, so carry it over here
  if (example) {
    const keepPreview = () => document.querySelectorAll('.follow-dialog .follow-all a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !/[?&]src=/.test(href)) { const u = new URL(href, location.href); u.searchParams.set('src', 'example'); a.setAttribute('href', u.href); }
    });
    new MutationObserver(keepPreview).observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    keepPreview();
  }

  // ------------------------------------------------------------------ page metadata for shared links and search engines
  function metaTag(attr, key, value) {
    let m = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.appendChild(m); }
    m.setAttribute('content', value);
  }
  function seo({ title, description, url, noindex }) {
    document.title = title;
    metaTag('property', 'og:title', title); metaTag('name', 'twitter:title', title);
    if (description !== undefined) { metaTag('name', 'description', description); metaTag('property', 'og:description', description); metaTag('name', 'twitter:description', description); }
    if (url) {
      metaTag('property', 'og:url', url);
      let c = document.head.querySelector('link[rel="canonical"]');
      if (!c) { c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
      c.href = url;
    }
    if (noindex) metaTag('name', 'robots', 'noindex');
  }
  function feedLink(href, title) {
    if (example) return;
    const l = document.createElement('link');
    l.rel = 'alternate'; l.type = 'application/rss+xml'; l.title = title; l.href = href;
    document.head.appendChild(l);
  }

  // ------------------------------------------------------------------ new since your last visit (per browser, per site)
  const VISIT_KEY = 'ccc:lastVisit:v1' + (example ? ':example' : '');
  const lastVisit = (() => { try { const v = Number(localStorage.getItem(VISIT_KEY)); return v > 0 ? v : null; } catch { return null; } })();
  const stampVisit = () => { try { localStorage.setItem(VISIT_KEY, String(Date.now())); } catch { /* storage unavailable */ } };
  if (!lastVisit) stampVisit(); // first visit: show nothing now, remember the time for the next one
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stampVisit(); });
  addEventListener('pagehide', stampVisit);
  const isNew = (d) => !!lastVisit && Date.parse(d.createdAt) > lastVisit;
  const newBadge = (d) => (isNew(d) ? '<span class="badge new">New</span>' : '');

  // Hacker-News-style gravity: engagement over age, so new posts with replies rise and old ones settle.
  const trendScore = (d) => (1 + (d.upvotes || 0) + 2 * (d.comments || 0)) / Math.pow(Math.max(0, (Date.now() - Date.parse(d.createdAt)) / 864e5) + 2, 1.3);
  const SORTS = {
    trending: (a, b) => trendScore(b) - trendScore(a),
    activity: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    replies: (a, b) => (b.comments || 0) - (a.comments || 0) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  };

  // ------------------------------------------------------------------ saved items (per browser)
  const SAVE_KEY = 'ccc:saved:v1';
  const saved = new Set((() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch { return []; } })());
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify([...saved])); } catch { /* storage unavailable */ } };
  const ICON_SAVE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 3.5h9a1 1 0 0 1 1 1v12.2l-5.5-3.6-5.5 3.6V4.5a1 1 0 0 1 1-1z"/></svg>';
  const saveBtn = (d, labelled) => `<button type="button" class="save-btn${labelled ? ' labelled' : ''}" data-save="${d.number}" aria-pressed="${saved.has(String(d.number))}" aria-label="${labelled ? `Save in this browser: “${esc(d.title)}”` : `Save “${esc(d.title)}” in this browser`}" title="Saved posts stay on this device only.">${ICON_SAVE}${labelled ? '<span>Save in this browser</span>' : ''}</button>`;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.save;
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    persist();
    document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach((x) => x.setAttribute('aria-pressed', String(saved.has(id))));
    document.dispatchEvent(new CustomEvent('ccc:saved'));
  });

  // ------------------------------------------------------------------ mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });
  }

  // "/" focuses the page's search box (the command palette owns Ctrl/Cmd+K)
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    const box = document.querySelector('.list-search input');
    if (box) { e.preventDefault(); box.focus(); box.select(); }
  });

  // ------------------------------------------------------------------ data
  const taxonomyP = getJSON('data/taxonomy.json').catch(() => ({ themes: [], categories: [] }));
  const dataP = getJSON(example ? 'data/examples/discussions.json' : 'data/discussions.json').catch(() => ({ discussions: [] }));
  const ready = Promise.all([dataP, taxonomyP]).then(([data, tax]) => {
    const themes = tax.themes || [];
    return {
      all: (data.discussions || []).slice(),
      generated: data.generated,
      cats: Object.fromEntries((tax.categories || []).map((c) => [c.slug, c])),
      categories: tax.categories || [],
      themes,
      themeBySlug: Object.fromEntries(themes.map((t) => [t.slug, t])),
      themeByLabel: Object.fromEntries(themes.map((t) => [t.label, t])),
    };
  });

  if (example) {
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin', '<div class="example-banner" role="note"><strong>Example data.</strong> These posts are placeholders for reviewing the layout. Remove <code>?src=example</code> to see the live community.</div>');
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.appendChild(robots);
    document.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (/^[\w-]+\.html/.test(h)) a.setAttribute('href', link(h));
    });
  }

  const views = document.querySelectorAll('[data-view]');
  views.forEach((v) => {
    if (v.dataset.view !== 'list') return;
    const empty = v.querySelector('.empty');
    if (empty) empty.hidden = true;
    const person = v.dataset.card === 'person';
    const n = v.dataset.card === 'compact' ? 3 : Math.min(parseInt(v.dataset.page || '6', 10), person ? 6 : 3);
    const one = v.dataset.card === 'compact' ? '<div class="skeleton slim"><i></i><i></i></div>' : '<div class="skeleton"><i></i><i></i><i></i></div>';
    v.insertAdjacentHTML('afterbegin', `<div class="skeletons ${person ? 'people-grid' : ''}" aria-hidden="true">${one.repeat(n)}</div>`);
  });

  ready.then((ctx) => {
    views.forEach((v) => {
      v.querySelector(':scope > .skeletons')?.remove();
      const kind = v.dataset.view;
      if (kind === 'theme-hub') themeHub(v, ctx);
      if (kind === 'member') memberHead(v, ctx);
      if (kind === 'post') postView(v, ctx);
      if (kind === 'network') networkReleases(v);
    });
    views.forEach((v) => {
      if (v.dataset.view === 'list') listView(v, ctx);
      if (v.dataset.view === 'stats') statsView(v, ctx);
    });
    themeCounts(ctx);
    if (ctx.generated) document.querySelectorAll('.feed-note').forEach((n) => n.insertAdjacentHTML('beforeend', ` <span>Updated ${esc(ago(ctx.generated))}.</span>`));
  });

  // ------------------------------------------------------------------ cards
  function badge(d, single) {
    const f = d.fields || {};
    if (d.category === 'opportunities') {
      const n = daysUntil(f.deadline);
      if (n === null) return '<span class="badge">Deadline in post</span>';
      if (n < 0) return '<span class="badge muted">Closed</span>';
      if (n === 0) return '<span class="badge urgent">Closes today</span>';
      return `<span class="badge${n <= 14 ? ' urgent' : ''}">Closes in ${plural(n, 'day')}</span>`;
    }
    if (d.category === 'events-meetups') {
      const n = daysUntil(f.date);
      if (n === null) return '';
      if (n < 0) return '<span class="badge muted">Past</span>';
      return `<span class="badge${n <= 7 ? ' urgent' : ''}">${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + plural(n, 'day')}</span>`;
    }
    if (d.category === 'q-a') return d.answered ? '<span class="badge good">Answered</span>' : '<span class="badge open">Needs an answer</span>';
    const label = f.stage || f.status || (single ? '' : f.kind);
    return label ? `<span class="badge">${esc(label)}</span>` : '';
  }

  function themeChips(d, ctx, max = 3) {
    const list = (d.themes || []).slice(0, max).map((label) => {
      const t = ctx.themeByLabel[label];
      return t ? `<a class="chip" href="${esc(link('theme.html?t=' + t.slug))}">${esc(t.label)}</a>` : '';
    }).join('');
    const extra = (d.themes || []).length > max ? `<span class="chip">+${d.themes.length - max}</span>` : '';
    const place = d.fields?.geography || '';
    return list || extra || place ? `<div class="meta-row">${list}${extra}${place ? `<span class="chip place">${esc(place)}</span>` : ''}</div>` : '';
  }

  const memberHref = (login) => link('member.html?u=' + encodeURIComponent(login));
  const postHref = (d) => link('post.html?n=' + d.number);

  function postCard(d, ctx, i) {
    const cat = ctx.cats[d.category] || {};
    const label = ctx.single && d.fields?.kind ? d.fields.kind : (cat.label || d.categoryName || d.category);
    return `<article class="post-card v2" style="--i:${i}">
      <div class="post-top"><span class="post-type"><span class="dot ${esc(cat.dot || '')}"></span>${esc(label)}</span><span class="top-right">${newBadge(d)}${badge(d, ctx.single)}${saveBtn(d)}</span></div>
      <h3><a class="card-link" href="${esc(postHref(d))}">${esc(d.title)}</a></h3>
      ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
      ${themeChips(d, ctx)}
      ${remindRow(d)}
      <div class="post-foot">${avatar(d, 22)}<a class="who" href="${esc(memberHref(d.author))}">${esc(d.author)}</a><span aria-hidden="true">·</span><span>${plural(d.comments || 0, 'reply', 'replies')}</span>${d.upvotes ? `<span aria-hidden="true">·</span><span title="Upvotes">↑ ${d.upvotes}</span>` : ''}<span aria-hidden="true">·</span><span>${esc(ago(d.updatedAt))}</span><span class="post-arrow" aria-hidden="true">↗</span></div>
    </article>`;
  }

  // open calls get a one-click reminder: a calendar file with the deadline and alarms 7 days and 1 day before
  function remindRow(d) {
    if (d.category !== 'opportunities') return '';
    const n = daysUntil(d.fields?.deadline);
    if (n === null || n < 0) return '';
    return `<div class="cal-row"><button type="button" class="cal-btn" data-remind="${d.number}" aria-label="Remind me about “${esc(d.title)}”" title="Downloads a calendar file with reminders 7 days and 1 day before the deadline">Remind me</button></div>`;
  }

  function calendarLinks(d) {
    const f = d.fields || {};
    const day = parseDay(f.date);
    if (!day || daysUntil(f.date) < 0) return '';
    const ymd = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const details = [f.datetime ? 'Time: ' + f.datetime : '', d.excerpt || '', 'Details: ' + d.url].filter(Boolean).join('\n');
    const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(d.title)}&dates=${ymd(day)}/${ymd(next)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(f.registration || d.url)}`;
    return `<div class="cal-row"><a class="cal-btn" href="${esc(g)}" rel="noopener">Google Calendar</a><button type="button" class="cal-btn" data-ics="${d.number}">Download .ics</button></div>`;
  }

  function eventCard(d, ctx, i) {
    const f = d.fields || {};
    const day = parseDay(f.date);
    const tile = day
      ? `<div class="date-tile" aria-hidden="true"><span>${esc(day.toLocaleDateString('en-GB', { month: 'short' }))}</span><strong>${day.getDate()}</strong></div>`
      : '<div class="date-tile" aria-hidden="true"><span>Date</span><strong>?</strong></div>';
    const when = [f.format || 'Event', day ? fmtDay(f.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '', f.datetime || ''].filter(Boolean).join(' · ');
    return `<article class="post-card v2 event" style="--i:${i}">
      ${tile}
      <div class="event-body">
        <div class="post-top"><span class="post-type">${esc(when)}</span><span class="top-right">${newBadge(d)}${badge(d)}${saveBtn(d)}</span></div>
        <h3><a class="card-link" href="${esc(postHref(d))}">${esc(d.title)}</a></h3>
        ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
        ${themeChips(d, ctx)}
        ${calendarLinks(d)}
      </div>
    </article>`;
  }

  function personCard(d, ctx, i) {
    const f = d.fields || {};
    return `<article class="person-card" style="--i:${i}">
      <div class="person-head">${avatar(d, 48)}<div><h3><a class="card-link" href="${esc(memberHref(d.author))}">${esc(f.role || d.title)}</a></h3>${f.location ? `<p class="where">${esc(f.location)}</p>` : ''}</div></div>
      ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
      ${themeChips(d, ctx, 4)}
      <a class="person-link" href="${esc(postHref(d))}">Read the introduction</a>
    </article>`;
  }

  function compactCard(d, ctx) {
    const cat = ctx.cats[d.category] || {};
    return `<li class="compact-item"><a href="${esc(postHref(d))}">${esc(d.title)}</a><span>${esc(cat.short || d.categoryName || '')} · ${plural(d.comments || 0, 'reply', 'replies')} · ${esc(ago(d.createdAt))}</span></li>`;
  }

  const CARDS = { post: postCard, event: eventCard, person: personCard, compact: compactCard };

  // Calendar files for one event or one deadline (same rules as the exporter: stable UID, stamp from the post, folded lines)
  const icsText = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const enc = new TextEncoder(), dec = new TextDecoder();
    let bytes = enc.encode(line);
    const out = [];
    while (bytes.length > 75) {
      let cut = 75;
      while ((bytes[cut] & 0xC0) === 0x80) cut--;
      out.push(dec.decode(bytes.slice(0, cut)));
      bytes = new Uint8Array([32, ...bytes.slice(cut)]);
    }
    out.push(dec.decode(bytes));
    return out.join('\r\n');
  }
  function icsFor(d, deadline) {
    const f = d.fields || {};
    const day = parseDay(deadline ? f.deadline : f.date);
    if (!day) return null;
    const ymd = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const stamp = new Date(Date.parse(d.updatedAt) || 0).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const page = `${SITE}/post.html?n=${d.number}`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//City Computing Collective//${deadline ? 'Deadlines' : 'Events'}//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:ccc-${deadline ? 'deadline-' : ''}${d.number}@citycomputingcollective.com`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${icsText(deadline ? 'Deadline: ' + d.title : d.title)}`,
      `DESCRIPTION:${icsText(deadline
        ? [`Deadline: ${f.deadline}`, f.kind, d.excerpt, f.official ? 'Official page: ' + f.official : '', page].filter(Boolean).join('\n')
        : [f.datetime ? 'Time: ' + f.datetime : '', d.excerpt, d.url].filter(Boolean).join('\n'))}`,
      `URL:${deadline ? page : d.url}`];
    if (deadline) {
      [['-P7D', '7 days'], ['-P1D', '1 day']].forEach(([t, label]) => lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(`Deadline: ${d.title} in ${label}`)}`, `TRIGGER:${t}`, 'END:VALARM'));
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ics], [data-remind]');
    if (!b) return;
    const deadline = b.hasAttribute('data-remind');
    const id = deadline ? b.dataset.remind : b.dataset.ics;
    ready.then((ctx) => {
      const d = ctx.all.find((x) => String(x.number) === id);
      const ics = d && icsFor(d, deadline);
      if (!ics) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = `ccc-${deadline ? 'deadline' : 'event'}-${d.number}.ics`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  // ------------------------------------------------------------------ list view
  function listView(el, ctx) {
    const o = el.dataset;
    const catFilter = (o.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
    const controls = new Set((o.controls || '').split(',').map((s) => s.trim()).filter(Boolean));
    const facet = o.facet || '';
    const pageSize = parseInt(o.page || '10', 10);
    const cardFn = CARDS[o.card] || postCard;
    const lctx = { ...ctx, single: catFilter.length === 1 };
    const card = (d, i) => cardFn(d, lctx, i);
    const noun = o.label || 'posts';
    const one = o.labelOne || noun.replace(/s$/, '');
    const split = o.split || '';
    const sync = o.sync === 'url';
    const presetTheme = ctx.themeBySlug[o.themeFrom ? params.get(o.themeFrom) : o.theme]?.label || '';
    const author = o.authorFrom ? params.get(o.authorFrom) : '';
    const followView = o.followView !== undefined;

    let items = ctx.all.filter((d) => !catFilter.length || catFilter.includes(d.category));
    if (o.filter === 'directory') items = items.filter((d) => d.directory);
    if (o.filter === 'unanswered') items = items.filter((d) => d.category === 'q-a' && !d.answered);
    if (presetTheme) items = items.filter((d) => (d.themes || []).includes(presetTheme));
    if (o.authorFrom) items = items.filter((d) => d.author === author);
    const empty = el.querySelector('.empty');
    if (!items.length) {
      if (o.hideEmpty !== undefined) { (el.closest('[data-hide-target]') || el).hidden = true; return; }
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const facetValue = (d) => (facet === 'category' ? d.category : (d.fields || {})[facet] || '');
    const facetLabel = (v) => (facet === 'category' ? (ctx.cats[v]?.short || v) : v);
    const facetOptions = [...new Set(items.map(facetValue).filter(Boolean))];
    const order = facet === 'category' ? Object.keys(ctx.cats) : (o.facetOrder || '').split(',').map((s) => s.trim());
    facetOptions.sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b));

    const defaultSort = SORTS[o.sort] ? o.sort : 'activity';
    const state = { q: '', theme: '', facet: '', sort: defaultSort, saved: false, shown: pageSize };
    const facetKey = facet === 'category' ? 'category' : facet;
    if (sync) {
      state.q = params.get('q') || '';
      state.theme = ctx.themeBySlug[params.get('theme')] ? params.get('theme') : '';
      state.facet = facetOptions.includes(params.get(facetKey)) ? params.get(facetKey) : '';
      state.sort = SORTS[params.get('sort')] ? params.get('sort') : defaultSort;
      state.saved = params.get('saved') === '1';
    }

    const themesPresent = ctx.themes.filter((t) => items.some((d) => (d.themes || []).includes(t.label)));
    const hasSearch = controls.has('search');
    const hasTheme = controls.has('theme') && themesPresent.length > 0 && !presetTheme;
    const hasSort = controls.has('sort') && !split;
    const hasFacet = controls.has('facet') && facetOptions.length > 1;
    const hasSaved = o.savedToggle !== undefined;
    const listClass = o.card === 'person' ? 'people-grid' : o.card === 'compact' ? 'compact-list' : 'feed-list';
    const listTag = o.card === 'compact' ? 'ul' : 'div';
    el.insertAdjacentHTML('afterbegin', `
      ${o.themeHeader !== undefined ? '<div class="theme-context" hidden></div>' : ''}
      ${hasSearch || hasTheme || hasSort ? `<div class="list-controls">
        ${hasSearch ? `<label class="list-search"><span class="visually-hidden">Search ${esc(noun)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" placeholder="Search ${esc(noun)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>` : ''}
        ${hasTheme ? `<label class="list-select"><span>Theme</span><select data-k="theme"><option value="">All themes</option>${themesPresent.map((t) => `<option value="${t.slug}">${esc(t.label)}</option>`).join('')}</select></label>` : ''}
        ${hasSort ? `<label class="list-select"><span>Sort</span><select data-k="sort"><option value="trending">Trending</option><option value="activity">Recent activity</option><option value="new">Newest</option><option value="replies">Most replies</option></select></label>` : ''}
      </div>` : ''}
      ${hasFacet ? `<div class="chip-row" role="group" aria-label="Filter ${esc(noun)}"></div>` : ''}
      ${o.card === 'compact' ? '' : `<div class="list-meta"><p class="result-count" aria-live="polite"></p><p class="new-count"></p><button type="button" class="link-btn clear" hidden>Clear filters</button>${hasSaved ? '<button type="button" class="saved-toggle" aria-pressed="false"></button>' : ''}${followView ? '<span class="follow-slot"></span>' : ''}${o.githubSearch !== undefined ? `<a class="link-btn github" href="${REPO}">Search on GitHub ↗</a>` : ''}</div>`}
      <div class="list-results"></div>
      <div class="list-more" hidden></div>`);

    const $ = (s) => el.querySelector(s);
    const input = $('.list-search input');
    const themeSel = $('select[data-k="theme"]');
    const sortSel = $('select[data-k="sort"]');
    const chipRow = $('.chip-row');
    const results = $('.list-results');
    const count = $('.result-count');
    const clear = $('.clear');
    const more = $('.list-more');
    const gh = $('.github');
    const header = $('.theme-context');
    const savedBtn = $('.saved-toggle');
    const newCount = $('.new-count');
    const followSlot = $('.follow-slot');
    if (input) input.value = state.q;
    if (themeSel) themeSel.value = state.theme;
    if (sortSel) sortSel.value = state.sort;

    const haystack = new Map(items.map((d) => [d, [d.title, d.excerpt, d.author, d.categoryName, ...(d.themes || []), ...Object.values(d.fields || {})].join(' ').toLowerCase()]));
    const matchText = (d) => state.q.trim().toLowerCase().split(/\s+/).filter(Boolean).every((t) => haystack.get(d).includes(t));
    const matchTheme = (d) => !state.theme || (d.themes || []).includes(ctx.themeBySlug[state.theme]?.label);
    const matchSaved = (d) => !state.saved || saved.has(String(d.number));

    function writeURL() {
      if (!sync) return;
      const p = new URLSearchParams(location.search);
      const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
      set('q', state.q.trim()); set('theme', state.theme); set(facetKey, state.facet);
      set('sort', state.sort !== defaultSort ? state.sort : ''); set('saved', state.saved ? '1' : '');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    // "Follow this view": no filter is the whole community, one kind of post or one theme has its own feed, a mix has none
    let followKey = null;
    function followView_() {
      if (!followSlot) return;
      let target = null;
      if (!state.q.trim() && !state.saved && !(state.facet && state.theme)) {
        if (state.facet) target = FOLLOW.category(ctx.cats[state.facet] || { slug: state.facet, label: state.facet });
        else if (state.theme) target = FOLLOW.themeLocal(ctx.themeBySlug[state.theme]);
        else target = FOLLOW.all;
      }
      const key = target ? JSON.stringify(target) : '';
      if (key === followKey) return;
      followKey = key;
      followSlot.innerHTML = target ? followBtn(target, 'Follow this view') : '';
    }

    function render(animate) {
      const base = items.filter((d) => matchText(d) && matchTheme(d) && matchSaved(d));
      const filtered = base.filter((d) => !state.facet || facetValue(d) === state.facet);
      const active = !!(state.q.trim() || state.theme || state.facet || state.saved);

      if (chipRow) {
        const opts = [['', 'All', base.length], ...facetOptions.map((v) => [v, facetLabel(v), base.filter((d) => facetValue(d) === v).length])];
        chipRow.innerHTML = opts.filter(([v, , n]) => n > 0 || v === '' || state.facet === v)
          .map(([v, label, n]) => `<button type="button" class="filter-chip" data-v="${esc(v)}" aria-pressed="${state.facet === v}">${esc(label)}<span class="n">${n}</span></button>`).join('');
        chipRow.classList.toggle('overflowing', chipRow.scrollWidth > chipRow.clientWidth + 2);
      }
      if (header) {
        const t = ctx.themeBySlug[state.theme];
        header.hidden = !t;
        if (t) header.innerHTML = `<div><p class="eyebrow">Theme · ${esc(t.code)}</p><h2>${esc(t.label)}</h2><p>${esc(t.blurb || '')}</p></div><div class="theme-context-actions"><a class="button light" href="${esc(link('theme.html?t=' + t.slug))}">Open the theme hub</a><button type="button" class="link-btn" data-clear-theme>All themes</button></div>`;
      }
      if (sync) {
        document.querySelectorAll('.theme-links a').forEach((a) => {
          const on = !!state.theme && new URL(a.href).searchParams.get('theme') === state.theme;
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      }
      if (savedBtn) {
        const n = items.filter((d) => saved.has(String(d.number))).length;
        savedBtn.innerHTML = `${ICON_SAVE}Saved<span class="n">${n}</span>`;
        savedBtn.setAttribute('aria-pressed', String(state.saved));
        savedBtn.hidden = !n && !state.saved;
      }

      let html = '';
      if (split) {
        const key = split;
        const n = (d) => daysUntil((d.fields || {})[key]);
        const open = filtered.filter((d) => n(d) === null || n(d) >= 0).sort((a, b) => (n(a) ?? 1e9) - (n(b) ?? 1e9));
        const closed = filtered.filter((d) => n(d) !== null && n(d) < 0).sort((a, b) => n(b) - n(a));
        if (o.hideEmpty !== undefined && !open.length && !active) { (el.closest('[data-hide-target]') || el).hidden = true; return; }
        const openLabel = key === 'date' ? 'Upcoming' : 'Open';
        const closedLabel = key === 'date' ? 'Past events' : 'Closed';
        html += open.length
          ? `<h3 class="group-title">${openLabel} <span>${open.length}</span></h3><div class="${listClass}">${open.map((d, i) => card(d, i)).join('')}</div>`
          : `<p class="group-empty">${key === 'date' ? 'No upcoming events' : 'No open listings'}${active ? ' match these filters' : ''}.</p>`;
        if (closed.length) html += `<details class="closed-group"><summary>${closedLabel} <span>${closed.length}</span></summary><div class="${listClass}">${closed.map((d, i) => card(d, i)).join('')}</div></details>`;
        more.hidden = true;
      } else {
        const sorted = filtered.slice().sort(SORTS[state.sort] || SORTS.activity);
        const page = sorted.slice(0, state.shown);
        html = page.length ? `<${listTag} class="${listClass}">${page.map((d, i) => card(d, animate ? i : -1)).join('')}</${listTag}>` : '';
        more.hidden = sorted.length <= state.shown;
        if (!more.hidden) {
          const href = o.moreHref ? link(o.moreHref.replace('{t}', params.get(o.themeFrom || 't') || '').replace('{u}', encodeURIComponent(author || ''))) : '';
          more.innerHTML = href
            ? `<a class="${o.card === 'compact' ? 'link-btn' : 'button light'}" href="${esc(href)}">See all ${sorted.length} ${esc(noun)} →</a>`
            : `<button type="button" class="button light">Show more (${sorted.length - state.shown})</button>`;
        }
      }
      if (!filtered.length) {
        html = state.saved && !state.q && !state.facet && !state.theme
          ? '<div class="no-match"><strong>Nothing saved yet.</strong><p>Use the bookmark on any post to keep it here. Saved posts stay in this browser.</p><div class="buttons"><button type="button" class="button light" data-clear>Show all</button></div></div>'
          : `<div class="no-match"><strong>Nothing matches.</strong><p>Try a different word or theme${o.offerCompose !== undefined ? ', or start the conversation yourself' : ''}.</p><div class="buttons"><button type="button" class="button light" data-clear>Clear filters</button>${o.offerCompose !== undefined ? `<a class="button primary" href="${REPO}/new/choose" data-compose>Start a post</a>` : ''}</div></div>`;
      }
      results.innerHTML = html;
      results.classList.toggle('animate', !!animate && !reduceMotion);
      if (newCount) {
        const n = items.filter(isNew).length;
        newCount.textContent = n ? `${n} new since your last visit` : '';
      }
      followView_();
      if (count) count.textContent = active ? `${plural(filtered.length, one, noun)} of ${items.length}` : plural(items.length, one, noun);
      if (clear) clear.hidden = !active;
      if (gh) gh.href = state.q.trim() ? `${REPO}?discussions_q=${encodeURIComponent(state.q.trim())}` : REPO;
      writeURL();
    }

    let timer;
    input?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = input.value; state.shown = pageSize; render(false); }, 120); });
    input?.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; state.q = ''; render(false); } });
    themeSel?.addEventListener('change', () => { state.theme = themeSel.value; state.shown = pageSize; render(true); });
    sortSel?.addEventListener('change', () => { state.sort = sortSel.value; render(true); });
    chipRow?.addEventListener('click', (e) => {
      const b = e.target.closest('.filter-chip'); if (!b) return;
      state.facet = b.dataset.v; state.shown = pageSize; render(true);
    });
    savedBtn?.addEventListener('click', () => { state.saved = !state.saved; state.shown = pageSize; render(true); });
    document.addEventListener('ccc:saved', () => { if (savedBtn) render(false); });
    more.addEventListener('click', (e) => {
      if (!e.target.closest('button')) return;
      state.shown += pageSize; render(false);
    });
    const reset = () => { Object.assign(state, { q: '', theme: '', facet: '', saved: false, shown: pageSize }); if (input) input.value = ''; if (themeSel) themeSel.value = ''; render(true); };
    clear?.addEventListener('click', reset);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) reset();
      if (e.target.closest('[data-clear-theme]')) { state.theme = ''; if (themeSel) themeSel.value = ''; render(true); }
    });
    if (sync) el._setTheme = (slug) => { state.theme = ctx.themeBySlug[slug] ? slug : ''; state.shown = pageSize; if (themeSel) themeSel.value = state.theme; render(true); };
    render(true);
    if (chipRow) addEventListener('resize', () => chipRow.classList.toggle('overflowing', chipRow.scrollWidth > chipRow.clientWidth + 2), { passive: true });
  }

  // in-page theme links update the synced list instead of reloading
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.href, location.href);
    const target = document.querySelector('[data-view="list"][data-sync="url"]');
    if (!target?._setTheme || url.pathname !== location.pathname || !url.searchParams.has('theme')) return;
    e.preventDefault();
    target._setTheme(url.searchParams.get('theme'));
    (document.getElementById('browse') || target).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  // ------------------------------------------------------------------ stats, theme counts
  const isOpen = (d) => (d.category === 'opportunities' && (daysUntil(d.fields?.deadline) ?? 0) >= 0) || (d.category === 'events-meetups' && (daysUntil(d.fields?.date) ?? -1) >= 0);

  function statsView(el, ctx) {
    const all = ctx.all;
    if (!all.length) return;
    const cells = [
      ['Discussions', all.length, 'community.html#browse'],
      ['People listed', all.filter((d) => d.directory).length, 'people.html'],
      ['Questions needing an answer', all.filter((d) => d.category === 'q-a' && !d.answered).length, 'community.html?category=q-a#browse'],
      ['Open calls & upcoming events', all.filter(isOpen).length, 'opportunities.html'],
    ];
    el.innerHTML = cells.map(([label, n, href]) => `<a class="stat" href="${esc(link(href))}"><strong>${n}</strong><span>${label}</span></a>`).join('');
    el.hidden = false;
  }

  function themeCounts(ctx) {
    document.querySelectorAll('[data-theme-count]').forEach((n) => {
      const t = ctx.themeBySlug[n.dataset.themeCount];
      const c = t ? ctx.all.filter((d) => (d.themes || []).includes(t.label)).length : 0;
      if (c) { n.textContent = n.tagName === 'SMALL' ? String(c) : plural(c, 'post'); n.hidden = false; }
    });
  }

  // ------------------------------------------------------------------ theme hub (theme.html?t=slug)
  function themeHub(el, ctx) {
    const slug = params.get('t');
    const t = ctx.themeBySlug[slug];
    const slot = (n) => el.querySelector(`[data-slot="${n}"]`);
    if (!t) {
      seo({ title: 'Theme not found — City Computing Collective', noindex: true });
      document.querySelectorAll('[data-slot="feed"], [data-slot="empty-follow"]').forEach((b) => { b.hidden = true; });
      slot('title').textContent = 'Theme not found.';
      slot('blurb').textContent = 'Choose one of the eight research themes below.';
      document.querySelectorAll('[data-hide-target]').forEach((s) => { s.hidden = true; });
      slot('switch').innerHTML = ctx.themes.map((x) => `<a class="theme-pill" href="${esc(link('theme.html?t=' + x.slug))}">${esc(x.label)}</a>`).join('');
      return;
    }
    const posts = ctx.all.filter((d) => (d.themes || []).includes(t.label));
    seo({ title: `${t.label} — City Computing Collective`, url: `${SITE}/theme.html?t=${t.slug}`,
      description: `${t.label}: ${t.blurb} Questions, collaborations, projects, data, events, and people in the City Computing Collective.` });
    slot('eyebrow').textContent = `Research theme · ${t.code}`;
    slot('title').textContent = t.label;
    slot('blurb').textContent = t.blurb || '';
    const people = new Set(posts.map((d) => d.author)).size;
    const openN = posts.filter(isOpen).length;
    slot('stats').innerHTML = posts.length
      ? [[posts.length, 'post', 'posts'], [people, 'contributor', 'contributors'], [openN, 'open call or event', 'open calls & events']].map(([n, a, b]) => `<span><strong>${n}</strong> ${n === 1 ? a : b}</span>`).join('')
      : '<span>No posts yet</span>';
    setFollow(slot('feed'), FOLLOW.theme(t));
    slot('browse').href = link(`community.html?theme=${t.slug}#browse`);
    el.querySelectorAll('[data-compose]').forEach((b) => { b.dataset.theme = t.label; });
    slot('switch').innerHTML = ctx.themes.map((x) => x.slug === t.slug
      ? `<span class="theme-pill" aria-current="page">${esc(x.label)}</span>`
      : `<a class="theme-pill" href="${esc(link('theme.html?t=' + x.slug))}">${esc(x.label)}</a>`).join('');
    const sw = slot('switch');
    const cur = sw.querySelector('[aria-current]');
    sw.classList.toggle('overflowing', sw.scrollWidth > sw.clientWidth + 2);
    if (cur) sw.scrollLeft = cur.offsetLeft - sw.offsetLeft - (sw.clientWidth - cur.offsetWidth) / 2;
    const emptyPanel = document.querySelector('[data-slot="theme-empty"]');
    if (emptyPanel) {
      emptyPanel.hidden = posts.length > 0;
      emptyPanel.querySelector('[data-slot="empty-theme-name"]').textContent = t.label;
      emptyPanel.querySelectorAll('[data-compose]').forEach((b) => { b.dataset.theme = t.label; });
      setFollow(emptyPanel.querySelector('[data-slot="empty-follow"]'), FOLLOW.theme(t));
    }
    const alt = document.querySelector('link[data-theme-feed]');
    if (alt) { alt.href = `feeds/theme-${t.slug}.xml`; alt.title = `${t.label} — City Computing Collective`; }
  }

  // ------------------------------------------------------------------ member page (member.html?u=login)
  function memberHead(el, ctx) {
    const login = params.get('u') || '';
    const posts = ctx.all.filter((d) => d.author === login);
    const slot = (n) => el.querySelector(`[data-slot="${n}"]`);
    if (!posts.length) {
      seo({ title: `${login ? 'No public posts' : 'Member not found'} — City Computing Collective`, noindex: true });
      slot('name').textContent = login ? `No public posts by ${login}.` : 'Member not found.';
      slot('role').textContent = 'Members appear here once they post in the community.';
      slot('avatar').innerHTML = '';
      slot('aside').hidden = true;
      return;
    }
    const intro = posts.find((d) => d.category === 'introductions' && d.directory);
    const f = intro?.fields || {};
    const themeCount = {};
    posts.forEach((d) => (d.themes || []).forEach((label) => { themeCount[label] = (themeCount[label] || 0) + 1; }));
    const topThemes = Object.entries(themeCount).sort((a, b) => b[1] - a[1]).map(([label]) => ctx.themeByLabel[label]).filter(Boolean);
    seo({ title: `${f.role || login} — City Computing Collective`, url: `${SITE}/member.html?u=${encodeURIComponent(login)}`,
      description: `${f.role || login} in the City Computing Collective: ${plural(posts.length, 'public post')} and the research themes they work on.` });
    feedLink(`feeds/member-${login.replace(/[^A-Za-z0-9_-]/g, '_')}.xml`, `${f.role || login} — City Computing Collective`);
    slot('avatar').innerHTML = avatar(posts[0], 72);
    slot('name').textContent = f.role || login;
    slot('role').innerHTML = [f.role ? `<span>@${esc(login)}</span>` : '', f.location ? `<span>${esc(f.location)}</span>` : '', `<span>Active ${esc(ago(posts.map((d) => d.updatedAt).sort().pop()))}</span>`].filter(Boolean).join('<span aria-hidden="true">·</span>');
    slot('themes').innerHTML = topThemes.map((t) => `<a class="chip" href="${esc(link('theme.html?t=' + t.slug))}">${esc(t.label)}</a>`).join('');
    slot('about').textContent = intro?.excerpt || '';
    slot('about').hidden = !intro?.excerpt;
    const replies = posts.reduce((s, d) => s + (d.comments || 0), 0);
    slot('stats').innerHTML = [[posts.length, 'post', 'posts'], [replies, 'reply received', 'replies received'], [topThemes.length, 'theme', 'themes']]
      .map(([n, a, b]) => `<div><strong>${n}</strong><span>${n === 1 ? a : b}</span></div>`).join('');
    const gh = posts[0].authorUrl || `https://github.com/${encodeURIComponent(login)}`;
    slot('links').innerHTML = `<a class="button light" href="${esc(gh)}" rel="noopener">GitHub profile ↗</a>${intro ? `<a class="button light" href="${esc(postHref(intro))}">Introduction</a>` : ''}${followBtn(FOLLOW.member(login, f.role || login), `Follow ${f.role || login}`, 'button light follow-btn')}`;
    if (!intro) slot('note').hidden = false;
  }

  // ------------------------------------------------------------------ post page (post.html?n=number), after Discourse topic pages
  const FORM_NOISE = /^(community agreement|accuracy|data rights|people directory|research themes)$/i;
  function cleanHTML(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    root.querySelectorAll('script,style,iframe,object,embed,form,input,button,select,textarea,link,meta,base').forEach((n) => n.remove());
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
        if (n.startsWith('on') || n === 'style' || n === 'srcset' || ((n === 'href' || n === 'src' || n === 'xlink:href') && /^(javascript|vbscript|data):/.test(v))) el.removeAttribute(a.name);
      });
      if (el.tagName === 'A') el.setAttribute('rel', 'noopener nofollow ugc');
      if (el.tagName === 'IMG') { el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); }
    });
    // discussion forms render as <h3>Label</h3> followed by the answer; drop empty answers and form boilerplate
    root.querySelectorAll('h3').forEach((h) => {
      const label = h.textContent.trim();
      const parts = [];
      let n = h.nextElementSibling;
      while (n && n.tagName !== 'H3') { parts.push(n); n = n.nextElementSibling; }
      const answer = parts.map((x) => x.textContent.trim()).join(' ');
      if (FORM_NOISE.test(label) || /^_?no response_?$/i.test(answer)) { parts.forEach((x) => x.remove()); h.remove(); return; }
      const field = doc.createElement('div'); field.className = 'form-field';
      h.replaceWith(field); field.appendChild(h); parts.forEach((x) => field.appendChild(x));
    });
    return root.innerHTML;
  }
  const textOf = (html, n = 500) => { const d = new DOMParser().parseFromString(html || '', 'text/html'); return (d.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, n); };

  function postView(el, ctx) {
    const num = params.get('n');
    const d = ctx.all.find((x) => String(x.number) === num);
    const slot = (k) => el.querySelector(`[data-slot="${k}"]`);
    if (!d) {
      seo({ title: 'Post not found — City Computing Collective', noindex: true });
      slot('title').textContent = 'Post not found.';
      slot('body').innerHTML = `<p class="muted-note">It may have been removed, or the site has not refreshed since it was posted. <a href="${REPO}">Browse the discussions on GitHub</a>.</p>`;
      slot('side').hidden = true;
      return;
    }
    const cat = ctx.cats[d.category] || {};
    seo({ title: `${d.title} — City Computing Collective`, url: `${SITE}/post.html?n=${d.number}`, description: d.excerpt || d.title });
    slot('crumbs').innerHTML = `<a href="${esc(link('community.html#browse'))}">Community</a><span aria-hidden="true">›</span><a href="${esc(link('community.html?category=' + d.category + '#browse'))}">${esc(cat.label || d.categoryName)}</a>`;
    slot('title').textContent = d.title;
    slot('meta').innerHTML = `${avatar(d, 32)}<div><a class="who" href="${esc(memberHref(d.author))}">${esc(d.author)}</a><span>posted ${esc(ago(d.createdAt))}${d.updatedAt !== d.createdAt ? ` · active ${esc(ago(d.updatedAt))}` : ''}</span></div><span class="top-right">${badge(d, true)}</span>`;
    slot('themes').innerHTML = themeChips(d, ctx, 8).replace(/^<div class="meta-row">|<\/div>$/g, '');
    const cal = d.category === 'events-meetups' ? calendarLinks(d) : '';
    slot('actions').innerHTML = `<a class="button primary" href="${esc(d.url)}">Reply on GitHub ↗</a>${followBtn({ title: d.title, what: 'New replies to this discussion.', github: d.url, githubKind: 'thread' }, 'Follow replies', 'button light follow-btn js-follow-replies')}${saveBtn(d, true)}<button type="button" class="button light" data-copy-link>Copy link</button>${cal}`;

    const related = ctx.all.filter((x) => x !== d).map((x) => [x, (x.themes || []).filter((t) => (d.themes || []).includes(t)).length + (x.category === d.category ? 0.5 : 0)])
      .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || trendScore(b[0]) - trendScore(a[0])).slice(0, 5).map(([x]) => x);
    slot('side').innerHTML = `
      <div class="panel"><p class="panel-title">About this post</p><dl class="post-facts">
        <dt>Kind</dt><dd><a href="${esc(link('community.html?category=' + d.category + '#browse'))}">${esc(cat.label || d.categoryName)}</a></dd>
        <dt>Posted</dt><dd>${esc(new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</dd>
        <dt>Replies</dt><dd>${d.comments || 0}</dd>${d.upvotes ? `<dt>Upvotes</dt><dd>${d.upvotes}</dd>` : ''}
        ${Object.entries(d.fields || {}).filter(([k]) => ['stage', 'status', 'kind', 'geography', 'format', 'location', 'role'].includes(k)).map(([k, v]) => `<dt>${esc(k[0].toUpperCase() + k.slice(1))}</dt><dd>${esc(v)}</dd>`).join('')}
      </dl></div>
      ${related.length ? `<div class="panel"><p class="panel-title">Related</p><ul class="compact-list">${related.map((x) => compactCard(x, ctx)).join('')}</ul></div>` : ''}
      <div class="side-cta"><strong>Have something to add?</strong><p>Reply on GitHub, or start a post of your own.</p><a class="button" href="${REPO}/new/choose" data-compose>Start a post</a></div>`;

    slot('body').innerHTML = '<div class="skeleton"><i></i><i></i><i></i></div>';
    getJSON(`data/${example ? 'examples/' : ''}posts/${d.number}.json`).then((post) => {
      // the reply feed exists only for posts that have a post file
      const fb = el.querySelector('.js-follow-replies');
      if (fb) fb.setAttribute('data-follow-feed', FOLLOW.replies(d.number));
      feedLink(`feeds/post-${d.number}.xml`, `Replies to ${d.title} — City Computing Collective`);
      slot('body').innerHTML = cleanHTML(post.bodyHTML) || `<p>${esc(d.excerpt)}</p>`;
      const comments = (post.comments || []).slice().sort((a, b) => (b.isAnswer && d.category === 'q-a') - (a.isAnswer && d.category === 'q-a') || a.createdAt.localeCompare(b.createdAt));
      const reply = (c, nested) => `
        <article class="reply${c.isAnswer ? ' is-answer' : ''}${nested ? ' nested' : ''}">
          <header>${avatar(c, nested ? 24 : 30)}<a class="who" href="${esc(memberHref(c.author))}">${esc(c.author)}</a><span>${esc(ago(c.createdAt))}</span>${c.upvotes ? `<span title="Upvotes">↑ ${c.upvotes}</span>` : ''}${c.isAnswer ? '<span class="badge good">Accepted answer</span>' : ''}</header>
          <div class="post-body">${cleanHTML(c.bodyHTML)}</div>
          ${(c.replies || []).map((r) => reply(r, true)).join('')}
          ${c.moreReplies ? `<a class="more-on-gh" href="${esc(d.url)}">${plural(c.moreReplies, 'more reply', 'more replies')} on GitHub ↗</a>` : ''}
        </article>`;
      slot('replies').innerHTML = comments.length
        ? `<h2>${plural(d.comments || comments.length, 'reply', 'replies')}</h2>${comments.map((c) => reply(c, false)).join('')}${post.moreComments ? `<a class="more-on-gh" href="${esc(d.url)}">${plural(post.moreComments, 'more reply', 'more replies')} on GitHub ↗</a>` : ''}`
        : `<div class="no-replies"><strong>${d.category === 'q-a' ? 'No answers yet.' : 'No replies yet.'}</strong><p>${d.category === 'q-a' ? 'If you know something that helps, answer on GitHub.' : 'Be the first to reply on GitHub.'}</p></div>`;
      slot('cta').innerHTML = `<a class="button primary" href="${esc(d.url)}">${d.category === 'q-a' && !d.answered ? 'Answer on GitHub' : 'Reply on GitHub'} ↗</a><span>Replies use a free GitHub account and appear here after the next refresh.</span>`;
      postLD(d, post, comments);
    }).catch(() => {
      const unlisted = d.category === 'introductions' && !d.directory;
      slot('body').innerHTML = `${d.excerpt ? `<p>${esc(d.excerpt)}</p>` : ''}<p class="muted-note">${unlisted ? 'This introduction is not in the People directory, so its text stays on GitHub.' : 'The full text is on GitHub.'} <a href="${esc(d.url)}">Read it there ↗</a></p>`;
      slot('replies').innerHTML = '';
      postLD(d, null, []);
    });
  }

  function postLD(d, post, comments) {
    const author = (a, url) => ({ '@type': 'Person', name: a, url: url || `https://github.com/${a}` });
    const pageUrl = `${SITE}/post.html?n=${d.number}`;
    let ld;
    if (d.category === 'q-a') {
      const accepted = comments.find((c) => c.isAnswer);
      ld = { '@context': 'https://schema.org', '@type': 'QAPage', mainEntity: {
        '@type': 'Question', name: d.title, text: post ? textOf(post.bodyHTML) : d.excerpt, answerCount: d.comments || 0, upvoteCount: d.upvotes || 0,
        dateCreated: d.createdAt, author: author(d.author, d.authorUrl), url: pageUrl,
        ...(accepted ? { acceptedAnswer: { '@type': 'Answer', text: textOf(accepted.bodyHTML), dateCreated: accepted.createdAt, upvoteCount: accepted.upvotes || 0, author: author(accepted.author, accepted.authorUrl), url: pageUrl } } : {}),
        suggestedAnswer: comments.filter((c) => !c.isAnswer).slice(0, 5).map((c) => ({ '@type': 'Answer', text: textOf(c.bodyHTML), dateCreated: c.createdAt, upvoteCount: c.upvotes || 0, author: author(c.author, c.authorUrl), url: pageUrl })),
      } };
    } else {
      ld = { '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: d.title, text: post ? textOf(post.bodyHTML, 1000) : d.excerpt, url: pageUrl,
        datePublished: d.createdAt, dateModified: d.updatedAt, author: author(d.author, d.authorUrl), sameAs: d.url,
        interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: d.comments || 0 },
          { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: d.upvotes || 0 }],
        comment: comments.slice(0, 5).map((c) => ({ '@type': 'Comment', text: textOf(c.bodyHTML), datePublished: c.createdAt, author: author(c.author, c.authorUrl) })) };
    }
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy-link]');
    if (!b) return;
    const u = new URL(location.href);
    u.searchParams.delete('src');
    const url = u.toString();
    navigator.clipboard?.writeText(url).then(() => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); }, () => {});
  });

  // ------------------------------------------------------------------ network: releases from XUrbanAI and UrbanProbe in a theme
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const NETWORK = [
    { key: 'xurbanai', name: 'XUrbanAI', base: LOCAL ? '/xurbanai' : 'https://xurbanai.com' },
    { key: 'urbanprobe', name: 'UrbanProbe', base: LOCAL ? '/urbanprobe' : 'https://urbanprobe.com' },
  ];
  function networkReleases(el) {
    const slug = el.dataset.themeFrom ? params.get(el.dataset.themeFrom) : el.dataset.theme;
    Promise.all(NETWORK.map((s) => Promise.all([getJSON(`${s.base}/data/${example ? 'examples/' : ''}registry.json`), getJSON(`${s.base}/data/schema.json`)])
      .then(([data, schema]) => (schema['x-registries'] || []).flatMap((r) => (data[r.key] || []).filter((e) => e.status === 'released' && (!slug || (e.themes || []).includes(slug)))
        .map((e) => ({ site: s, reg: r, e }))))
      .catch(() => []))).then((lists) => {
      const rows = lists.flat().sort((a, b) => String(b.e.updated || b.e.released).localeCompare(String(a.e.updated || a.e.released))).slice(0, 6);
      const target = el.closest('[data-hide-target]') || el;
      if (!rows.length) { target.hidden = true; return; }
      el.innerHTML = `<div class="net-grid">${rows.map(({ site, reg, e }) => `
        <a class="net-card" href="${esc(`${site.base}/entry.html?registry=${reg.key}&id=${e.id}${example ? '&src=example' : ''}`)}">
          <span class="net-site">${esc(site.name)} · ${esc(reg.singular)}</span><strong>${esc(e.title)}</strong><small>${esc(e.summary)}</small><span class="net-v">v${esc(e.version || '')}</span>
        </a>`).join('')}</div>`;
      target.hidden = false;
    });
  }

  // ------------------------------------------------------------------ composer dialog
  let dialog = null;
  let openComposer = () => {};
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-compose]');
    if (!t || !dialog || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    openComposer(t.dataset.compose, t.dataset.theme);
  });

  taxonomyP.then((tax) => {
    const options = (tax.categories || []).filter((c) => c.action);
    if (!options.length || typeof HTMLDialogElement !== 'function' || !document.querySelector('[data-compose], [data-palette]')) return;
    dialog = document.createElement('dialog');
    dialog.className = 'compose';
    dialog.setAttribute('aria-labelledby', 'compose-title');
    dialog.innerHTML = `
      <div class="compose-head">
        <div><p class="eyebrow">Start a post</p><h2 id="compose-title">What would you like to post?</h2></div>
        <button type="button" class="icon-btn" data-close aria-label="Close">×</button>
      </div>
      <div class="compose-body">
        <div class="compose-options" role="radiogroup" aria-label="Post type">
          ${options.map((c, i) => `<button type="button" class="compose-option" role="radio" aria-checked="false" data-slug="${c.slug}" tabindex="${i ? -1 : 0}"><span class="dot ${esc(c.dot)}"></span><span><strong>${esc(c.action)}</strong><small>${esc(c.summary || '')}</small></span></button>`).join('')}
        </div>
        <div class="compose-detail" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(dialog);
    const detail = dialog.querySelector('.compose-detail');
    const buttons = [...dialog.querySelectorAll('.compose-option')];
    let themeHint = '';

    function select(slug, focus) {
      const c = options.find((x) => x.slug === slug) || options[0];
      buttons.forEach((b) => {
        const on = b.dataset.slug === c.slug;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      detail.innerHTML = `
        <p class="eyebrow">${esc(c.label)}</p>
        <h3>${esc(c.action)}</h3>
        <p>${esc(c.summary || '')}</p>
        <p class="needs-title">The form asks for</p>
        <ul class="needs">${(c.needs || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        ${themeHint ? `<p class="theme-hint">Choose <strong>${esc(themeHint)}</strong> under Research themes so the post appears in this theme.</p>` : ''}
        <div class="compose-actions">
          <a class="button primary" href="${REPO}/new?category=${encodeURIComponent(c.slug)}">Continue on GitHub <span aria-hidden="true">↗</span></a>
          <p class="hint">Posting needs a free GitHub account. Posts are public; share only what you choose.</p>
        </div>`;
    }

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
      const b = e.target.closest('.compose-option');
      if (b) select(b.dataset.slug);
    });
    dialog.querySelector('.compose-options').addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (step) { e.preventDefault(); select(buttons[(i + step + buttons.length) % buttons.length].dataset.slug, true); }
    });
    let opener = null;
    dialog.addEventListener('close', () => { document.documentElement.classList.remove('dialog-open'); opener?.focus?.(); });

    openComposer = (slug, theme) => {
      opener = document.activeElement;
      themeHint = theme || '';
      select(slug && options.some((x) => x.slug === slug) ? slug : options[0].slug);
      dialog.showModal();
      document.documentElement.classList.add('dialog-open');
      dialog.querySelector('.compose-option[aria-checked="true"]').focus();
    };
  });

  // ------------------------------------------------------------------ public API for palette.js
  window.CCC = { ready, esc, ago, avatar, link, abs, saved, trendScore, REPO, SITE, example, FOLLOW,
    follow: (o) => (window.Follow ? window.Follow.open(o) : (location.href = link('follow.html'))), postHref: (d) => postHref(d), openComposer: (slug, theme) => openComposer(slug, theme) };
})();
