/* City Computing Collective — core: data, cards, list views, theme hubs, member pages, composer, saved items.

   Data
     data/discussions.json   exported from GitHub Discussions by .github/workflows/discussions-feed.yml
     data/taxonomy.json      categories and research themes, shared with the exporter and the templates
     ?src=example            previews every view with data/examples/discussions.json

   Views are declared in HTML (data-view="list|stats|theme-hub|member") and configured with data
   attributes; see README. Each keeps its no-JavaScript fallback in the HTML.
   assets/palette.js adds the command palette on top of the API exposed as window.CCC. */
(() => {
  'use strict';

  const REPO = 'https://github.com/citycomputingcollective/citycomputingcollective.github.io/discussions';
  const SITE = 'https://citycomputingcollective.com';
  const params = new URLSearchParams(location.search);
  const example = params.get('src') === 'example';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getJSON = (url) => fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const parseDay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const daysUntil = (iso) => { const d = parseDay(iso); return d ? Math.round((d - today()) / 864e5) : null; };
  const fmtDay = (iso, opts) => { const d = parseDay(iso); return d ? d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const link = (href) => {
    if (!example || /^(https?:|#|mailto:)/.test(href)) return href;
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
  const saveBtn = (d) => `<button type="button" class="save-btn" data-save="${d.number}" aria-pressed="${saved.has(String(d.number))}" aria-label="Save “${esc(d.title)}” for later" title="Save for later">${ICON_SAVE}</button>`;
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

  function postCard(d, ctx, i) {
    const cat = ctx.cats[d.category] || {};
    const label = ctx.single && d.fields?.kind ? d.fields.kind : (cat.label || d.categoryName || d.category);
    return `<article class="post-card v2" style="--i:${i}">
      <div class="post-top"><span class="post-type"><span class="dot ${esc(cat.dot || '')}"></span>${esc(label)}</span><span class="top-right">${badge(d, ctx.single)}${saveBtn(d)}</span></div>
      <h3><a class="card-link" href="${esc(d.url)}">${esc(d.title)}</a></h3>
      ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
      ${themeChips(d, ctx)}
      <div class="post-foot">${avatar(d, 22)}<a class="who" href="${esc(memberHref(d.author))}">${esc(d.author)}</a><span aria-hidden="true">·</span><span>${plural(d.comments || 0, 'reply', 'replies')}</span>${d.upvotes ? `<span aria-hidden="true">·</span><span title="Upvotes">↑ ${d.upvotes}</span>` : ''}<span aria-hidden="true">·</span><span>${esc(ago(d.updatedAt))}</span><span class="post-arrow" aria-hidden="true">↗</span></div>
    </article>`;
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
        <div class="post-top"><span class="post-type">${esc(when)}</span><span class="top-right">${badge(d)}${saveBtn(d)}</span></div>
        <h3><a class="card-link" href="${esc(d.url)}">${esc(d.title)}</a></h3>
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
      <a class="person-link" href="${esc(d.url)}">Read the introduction <span aria-hidden="true">↗</span></a>
    </article>`;
  }

  function compactCard(d, ctx) {
    const cat = ctx.cats[d.category] || {};
    return `<li class="compact-item"><a href="${esc(d.url)}">${esc(d.title)}</a><span>${esc(cat.short || d.categoryName || '')} · ${plural(d.comments || 0, 'reply', 'replies')} · ${esc(ago(d.createdAt))}</span></li>`;
  }

  const CARDS = { post: postCard, event: eventCard, person: personCard, compact: compactCard };

  // ICS download for a single event
  function icsFor(d) {
    const f = d.fields || {};
    const day = parseDay(f.date);
    if (!day) return null;
    const ymd = (x) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
    const next = new Date(day); next.setDate(day.getDate() + 1);
    const text = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//City Computing Collective//Events//EN', 'BEGIN:VEVENT',
      `UID:ccc-${d.number}@citycomputingcollective.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(day)}`, `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${text(d.title)}`, `DESCRIPTION:${text([f.datetime ? 'Time: ' + f.datetime : '', d.excerpt, d.url].filter(Boolean).join('\n'))}`,
      `URL:${d.url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ics]');
    if (!b) return;
    ready.then((ctx) => {
      const d = ctx.all.find((x) => String(x.number) === b.dataset.ics);
      const ics = d && icsFor(d);
      if (!ics) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      a.download = `ccc-event-${d.number}.ics`;
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
      ${o.card === 'compact' ? '' : `<div class="list-meta"><p class="result-count" aria-live="polite"></p><button type="button" class="link-btn clear" hidden>Clear filters</button>${hasSaved ? '<button type="button" class="saved-toggle" aria-pressed="false"></button>' : ''}${o.githubSearch !== undefined ? `<a class="link-btn github" href="${REPO}">Search on GitHub ↗</a>` : ''}</div>`}
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
      slot('title').textContent = 'Theme not found.';
      slot('blurb').textContent = 'Choose one of the eight research themes below.';
      document.querySelectorAll('[data-hide-target]').forEach((s) => { s.hidden = true; });
      slot('switch').innerHTML = ctx.themes.map((x) => `<a class="theme-pill" href="${esc(link('theme.html?t=' + x.slug))}">${esc(x.label)}</a>`).join('');
      return;
    }
    const posts = ctx.all.filter((d) => (d.themes || []).includes(t.label));
    document.title = `${t.label} — City Computing Collective`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${t.label}: ${t.blurb} Questions, collaborations, projects, data, events, and people in the City Computing Collective.`);
    slot('eyebrow').textContent = `Research theme · ${t.code}`;
    slot('title').textContent = t.label;
    slot('blurb').textContent = t.blurb || '';
    const people = new Set(posts.map((d) => d.author)).size;
    const openN = posts.filter(isOpen).length;
    slot('stats').innerHTML = posts.length
      ? [[posts.length, 'post', 'posts'], [people, 'contributor', 'contributors'], [openN, 'open call or event', 'open calls & events']].map(([n, a, b]) => `<span><strong>${n}</strong> ${n === 1 ? a : b}</span>`).join('')
      : '<span>No posts yet</span>';
    slot('feed').href = `feeds/theme-${t.slug}.xml`;
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
    document.title = `${f.role || login} — City Computing Collective`;
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
    slot('links').innerHTML = `<a class="button light" href="${esc(gh)}" rel="noopener">GitHub profile ↗</a>${intro ? `<a class="button light" href="${esc(intro.url)}">Introduction ↗</a>` : ''}`;
    if (!intro) slot('note').hidden = false;
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
  window.CCC = { ready, esc, ago, avatar, link, saved, trendScore, REPO, SITE, example, openComposer: (slug, theme) => openComposer(slug, theme) };
})();
