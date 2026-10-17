/* City Computing Collective — navigation, the post composer, and the live community views.

   Data
     data/discussions.json   exported from GitHub Discussions by .github/workflows/discussions-feed.yml
     data/taxonomy.json      categories and research themes, shared with the exporter and the templates
     ?src=example            previews every view with data/examples/discussions.json

   Views are declared in HTML with data-view="list|stats" and configured with data attributes
   (see README). Each view keeps its no-JavaScript fallback in the HTML. */
(() => {
  'use strict';

  const REPO = 'https://github.com/citycomputingcollective/citycomputingcollective.github.io/discussions';
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
    const letter = (d.author || '?').replace(/^example-/, '').charAt(0).toUpperCase();
    return `<span class="avatar initials" style="--h:${hue(d.author)};width:${size}px;height:${size}px" aria-hidden="true">${esc(letter)}</span>`;
  }

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

  // ------------------------------------------------------------------ keyboard: "/" focuses search
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    const box = document.querySelector('.list-search input');
    if (box) { e.preventDefault(); box.focus(); box.select(); }
  });

  // ------------------------------------------------------------------ data
  const taxonomyP = getJSON('data/taxonomy.json').catch(() => ({ themes: [], categories: [] }));
  const views = document.querySelectorAll('[data-view]');
  const composers = document.querySelectorAll('[data-compose]');
  if (!views.length && !composers.length) return;
  const dataP = views.length
    ? getJSON(example ? 'data/examples/discussions.json' : 'data/discussions.json').catch(() => ({ discussions: [] }))
    : Promise.resolve({ discussions: [] });

  if (example) {
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin', '<div class="example-banner" role="note"><strong>Example data.</strong> These posts are placeholders for reviewing the layout. Remove <code>?src=example</code> to see the live community.</div>');
    const robots = document.createElement('meta'); robots.name = 'robots'; robots.content = 'noindex'; document.head.appendChild(robots);
  }

  // skeletons while loading
  views.forEach((v) => {
    if (v.dataset.view !== 'list') return;
    const empty = v.querySelector('.empty');
    if (empty) empty.hidden = true;
    const n = Math.min(parseInt(v.dataset.page || '6', 10), v.dataset.card === 'person' ? 6 : 3);
    v.insertAdjacentHTML('afterbegin', `<div class="skeletons ${v.dataset.card === 'person' ? 'people-grid' : ''}" aria-hidden="true">${'<div class="skeleton"><i></i><i></i><i></i></div>'.repeat(n)}</div>`);
  });

  Promise.all([dataP, taxonomyP]).then(([data, tax]) => {
    const all = (data.discussions || []).slice();
    const cats = Object.fromEntries((tax.categories || []).map((c) => [c.slug, c]));
    const themes = tax.themes || [];
    const themeBySlug = Object.fromEntries(themes.map((t) => [t.slug, t]));
    const themeByLabel = Object.fromEntries(themes.map((t) => [t.label, t]));
    const ctx = { all, cats, themes, themeBySlug, themeByLabel, generated: data.generated };

    views.forEach((v) => {
      v.querySelector('.skeletons')?.remove();
      if (v.dataset.view === 'list') listView(v, ctx);
      if (v.dataset.view === 'stats') statsView(v, ctx);
    });
    themeCounts(ctx);
    if (data.generated) {
      document.querySelectorAll('.feed-note').forEach((n) => { n.insertAdjacentHTML('beforeend', ` <span>Updated ${esc(ago(data.generated))}.</span>`); });
    }
  });

  if (composers.length) taxonomyP.then((tax) => composer(tax, composers));

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
    if (d.category === 'q-a') return d.answered ? '<span class="badge good">Answered</span>' : '<span class="badge">Open question</span>';
    const label = f.stage || f.status || (single ? '' : f.kind);
    return label ? `<span class="badge">${esc(label)}</span>` : '';
  }

  function themeChips(d, ctx, max = 3) {
    const list = (d.themes || []).slice(0, max).map((label) => {
      const t = ctx.themeByLabel[label];
      return t ? `<span class="chip">${esc(t.label)}</span>` : '';
    }).join('');
    const extra = (d.themes || []).length > max ? `<span class="chip">+${d.themes.length - max}</span>` : '';
    const place = d.fields?.geography || '';
    return list || extra || place ? `<div class="meta-row">${list}${extra}${place ? `<span class="chip place">${esc(place)}</span>` : ''}</div>` : '';
  }

  function postCard(d, ctx, i) {
    const cat = ctx.cats[d.category] || {};
    const replies = plural(d.comments || 0, 'reply', 'replies');
    return `<a class="post-card v2" href="${esc(d.url)}" style="--i:${i}">
      <div class="post-top"><span class="post-type"><span class="dot ${esc(cat.dot || '')}"></span>${esc(ctx.single && d.fields?.kind ? d.fields.kind : (cat.label || d.categoryName || d.category))}</span>${badge(d, ctx.single)}</div>
      <h3>${esc(d.title)}</h3>
      ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
      ${themeChips(d, ctx)}
      <div class="post-foot">${avatar(d, 22)}<span class="who">${esc(d.author)}</span><span aria-hidden="true">·</span><span>${replies}</span><span aria-hidden="true">·</span><span>${esc(ago(d.updatedAt))}</span><span class="post-arrow" aria-hidden="true">↗</span></div>
    </a>`;
  }

  function eventCard(d, ctx, i) {
    const f = d.fields || {};
    const day = parseDay(f.date);
    const tile = day
      ? `<div class="date-tile" aria-hidden="true"><span>${esc(day.toLocaleDateString('en-GB', { month: 'short' }))}</span><strong>${day.getDate()}</strong></div>`
      : '<div class="date-tile" aria-hidden="true"><span>Date</span><strong>?</strong></div>';
    return `<a class="post-card v2 event" href="${esc(d.url)}" style="--i:${i}">
      ${tile}
      <div class="event-body">
        <div class="post-top"><span class="post-type">${esc(f.format || 'Event')}${day ? ' · ' + esc(fmtDay(f.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })) : ''}</span>${badge(d)}</div>
        <h3>${esc(d.title)}</h3>
        ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
        ${themeChips(d, ctx)}
      </div>
    </a>`;
  }

  function personCard(d, ctx, i) {
    const f = d.fields || {};
    return `<article class="person-card" style="--i:${i}">
      <div class="person-head">${avatar(d, 48)}<div><h3>${esc(f.role || d.title)}</h3>${f.location ? `<p class="where">${esc(f.location)}</p>` : ''}</div></div>
      ${d.excerpt ? `<p class="excerpt">${esc(d.excerpt)}</p>` : ''}
      ${themeChips(d, ctx, 4)}
      <a class="person-link" href="${esc(d.url)}">Read the introduction <span aria-hidden="true">↗</span></a>
    </article>`;
  }

  const CARDS = { post: postCard, event: eventCard, person: personCard };

  // ------------------------------------------------------------------ list view
  function listView(el, ctx) {
    const o = el.dataset;
    const catFilter = (o.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
    const controls = new Set((o.controls || '').split(',').map((s) => s.trim()).filter(Boolean));
    const facet = o.facet || '';
    const pageSize = parseInt(o.page || '10', 10);
    const cardFn = CARDS[o.card] || postCard;
    const noun = o.label || 'posts';
    const one = o.labelOne || noun.replace(/s$/, '');
    const split = o.split || '';
    const sync = o.sync === 'url';

    const lctx = { ...ctx, single: catFilter.length === 1 };
    const card = (d, _c, i) => cardFn(d, lctx, i);
    let items = ctx.all.filter((d) => !catFilter.length || catFilter.includes(d.category));
    if (o.filter === 'directory') items = items.filter((d) => d.directory);
    const empty = el.querySelector('.empty');
    if (!items.length) { if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;

    const facetValue = (d) => (facet === 'category' ? d.category : (d.fields || {})[facet] || '');
    const facetLabel = (v) => (facet === 'category' ? (ctx.cats[v]?.short || v) : v);
    let facetOptions = [...new Set(items.map(facetValue).filter(Boolean))];
    const order = facet === 'category' ? Object.keys(ctx.cats) : (o.facetOrder || '').split(',').map((s) => s.trim());
    facetOptions.sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b));

    const state = { q: '', theme: '', facet: '', sort: 'activity', shown: pageSize };
    if (sync) {
      state.q = params.get('q') || '';
      state.theme = ctx.themeBySlug[params.get('theme')] ? params.get('theme') : '';
      state.facet = facetOptions.includes(params.get(facet === 'category' ? 'category' : facet)) ? params.get(facet === 'category' ? 'category' : facet) : '';
      state.sort = ['activity', 'new', 'replies'].includes(params.get('sort')) ? params.get('sort') : 'activity';
    }

    // shell
    const themesPresent = ctx.themes.filter((t) => items.some((d) => (d.themes || []).includes(t.label)));
    const hasSearch = controls.has('search');
    const hasTheme = controls.has('theme') && themesPresent.length > 0;
    const hasSort = controls.has('sort') && !split;
    const hasFacet = controls.has('facet') && facetOptions.length > 1;
    el.insertAdjacentHTML('afterbegin', `
      ${o.themeHeader !== undefined ? '<div class="theme-context" hidden></div>' : ''}
      ${hasSearch || hasTheme || hasSort ? `<div class="list-controls">
        ${hasSearch ? `<label class="list-search"><span class="visually-hidden">Search ${esc(noun)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" placeholder="Search ${esc(noun)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>` : ''}
        ${hasTheme ? `<label class="list-select"><span>Theme</span><select data-k="theme"><option value="">All themes</option>${themesPresent.map((t) => `<option value="${t.slug}">${esc(t.label)}</option>`).join('')}</select></label>` : ''}
        ${hasSort ? '<label class="list-select"><span>Sort</span><select data-k="sort"><option value="activity">Recent activity</option><option value="new">Newest</option><option value="replies">Most replies</option></select></label>' : ''}
      </div>` : ''}
      ${hasFacet ? `<div class="chip-row" role="group" aria-label="Filter ${esc(noun)}"></div>` : ''}
      <div class="list-meta"><p class="result-count" aria-live="polite"></p><button type="button" class="link-btn clear" hidden>Clear filters</button>${o.githubSearch !== undefined ? `<a class="link-btn github" href="${REPO}">Search on GitHub ↗</a>` : ''}</div>
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
    if (input) input.value = state.q;
    if (themeSel) themeSel.value = state.theme;
    if (sortSel) sortSel.value = state.sort;
    if (!hasSort) state.sort = 'activity';

    const haystack = new Map(items.map((d) => [d, [d.title, d.excerpt, d.author, d.categoryName, ...(d.themes || []), ...Object.values(d.fields || {})].join(' ').toLowerCase()]));
    const matchText = (d) => state.q.trim().toLowerCase().split(/\s+/).filter(Boolean).every((t) => haystack.get(d).includes(t));
    const matchTheme = (d) => !state.theme || (d.themes || []).includes(ctx.themeBySlug[state.theme]?.label);
    const sorters = {
      activity: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      replies: (a, b) => (b.comments || 0) - (a.comments || 0) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    };

    function writeURL() {
      if (!sync) return;
      const p = new URLSearchParams(location.search);
      const set = (k, v) => (v ? p.set(k, v) : p.delete(k));
      set('q', state.q.trim()); set('theme', state.theme); set(facet === 'category' ? 'category' : facet, state.facet);
      set('sort', state.sort !== 'activity' ? state.sort : '');
      const qs = p.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    function render(animate) {
      const base = items.filter((d) => matchText(d) && matchTheme(d));
      const filtered = base.filter((d) => !state.facet || facetValue(d) === state.facet);
      const active = !!(state.q.trim() || state.theme || state.facet);

      if (chipRow) {
        const opts = [['', 'All', base.length], ...facetOptions.map((v) => [v, facetLabel(v), base.filter((d) => facetValue(d) === v).length])];
        chipRow.innerHTML = opts.filter(([v, , n]) => n > 0 || v === '' || state.facet === v)
          .map(([v, label, n]) => `<button type="button" class="filter-chip" data-v="${esc(v)}" aria-pressed="${state.facet === v}">${esc(label)}<span class="n">${n}</span></button>`).join('');
        chipRow.classList.toggle('overflowing', chipRow.scrollWidth > chipRow.clientWidth + 2);
      }
      if (header) {
        const t = ctx.themeBySlug[state.theme];
        header.hidden = !t;
        if (t) header.innerHTML = `<div><p class="eyebrow">Theme · ${esc(t.code)}</p><h2>${esc(t.label)}</h2><p>${esc(t.blurb || '')}</p></div><button type="button" class="link-btn" data-clear-theme>All themes</button>`;
      }
      if (sync) {
        document.querySelectorAll('.theme-links a').forEach((a) => {
          const on = new URL(a.href).searchParams.get('theme') === state.theme && !!state.theme;
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      }

      let html = '';
      let shownCount = filtered.length;
      if (split) {
        const key = split;
        const n = (d) => daysUntil((d.fields || {})[key]);
        const open = filtered.filter((d) => n(d) === null || n(d) >= 0).sort((a, b) => (n(a) ?? 1e9) - (n(b) ?? 1e9));
        const closed = filtered.filter((d) => n(d) !== null && n(d) < 0).sort((a, b) => n(b) - n(a));
        const openLabel = key === 'date' ? 'Upcoming' : 'Open';
        const closedLabel = key === 'date' ? 'Past events' : 'Closed';
        html += open.length
          ? `<h3 class="group-title">${openLabel} <span>${open.length}</span></h3><div class="feed-list">${open.map((d, i) => card(d, ctx, i)).join('')}</div>`
          : `<p class="group-empty">${key === 'date' ? 'No upcoming events' : 'No open listings'}${active ? ' match these filters' : ''}.</p>`;
        if (closed.length) html += `<details class="closed-group"><summary>${closedLabel} <span>${closed.length}</span></summary><div class="feed-list">${closed.map((d, i) => card(d, ctx, i)).join('')}</div></details>`;
        more.hidden = true;
        shownCount = filtered.length;
      } else {
        const sorted = filtered.slice().sort(sorters[state.sort]);
        const page = sorted.slice(0, state.shown);
        html = page.length ? `<div class="${o.card === 'person' ? 'people-grid' : 'feed-list'}">${page.map((d, i) => card(d, ctx, animate ? i : -1)).join('')}</div>` : '';
        more.hidden = sorted.length <= state.shown;
        if (!more.hidden) {
          more.innerHTML = o.moreHref
            ? `<a class="button light" href="${esc(o.moreHref)}">See all ${sorted.length} ${esc(noun)}</a>`
            : `<button type="button" class="button light">Show more (${sorted.length - state.shown})</button>`;
        }
      }
      if (!filtered.length) {
        html = `<div class="no-match"><strong>Nothing matches.</strong><p>Try a different word or theme${o.offerCompose !== undefined ? ', or start the conversation yourself' : ''}.</p><div class="buttons"><button type="button" class="button light" data-clear>Clear filters</button>${o.offerCompose !== undefined ? `<a class="button primary" href="${REPO}/new/choose" data-compose>Start a post</a>` : ''}</div></div>`;
      }
      results.innerHTML = html;
      results.classList.toggle('animate', !!animate && !reduceMotion);
      count.textContent = active ? `${plural(shownCount, one, noun)} of ${items.length}` : plural(items.length, one, noun);
      clear.hidden = !active;
      if (gh) gh.href = state.q.trim() ? `${REPO}?discussions_q=${encodeURIComponent(state.q.trim())}` : REPO;
      results.querySelectorAll('[data-compose]').forEach((a) => a.addEventListener('click', openComposerFromEvent));
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
    more.addEventListener('click', (e) => {
      if (!e.target.closest('button')) return;
      const before = results.querySelectorAll('.post-card, .person-card').length;
      state.shown += pageSize; render(false);
      results.querySelectorAll('.post-card, .person-card')[before]?.focus?.();
    });
    const reset = () => { state.q = ''; state.theme = ''; state.facet = ''; state.shown = pageSize; if (input) input.value = ''; if (themeSel) themeSel.value = ''; render(true); };
    clear.addEventListener('click', reset);
    if (sync) el._setTheme = (slug) => { state.theme = ctx.themeBySlug[slug] ? slug : ''; state.shown = pageSize; if (themeSel) themeSel.value = state.theme; render(true); };
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-clear]')) reset();
      if (e.target.closest('[data-clear-theme]')) { state.theme = ''; if (themeSel) themeSel.value = ''; render(true); }
    });
    render(true);
    if (chipRow) addEventListener('resize', () => chipRow.classList.toggle('overflowing', chipRow.scrollWidth > chipRow.clientWidth + 2), { passive: true });
  }

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

  // ------------------------------------------------------------------ stats and theme counts
  function statsView(el, ctx) {
    const all = ctx.all;
    if (!all.length) return;
    const people = all.filter((d) => d.directory).length;
    const projects = all.filter((d) => d.category === 'project-showcase').length;
    const open = all.filter((d) => (d.category === 'opportunities' && (daysUntil(d.fields?.deadline) ?? 0) >= 0) || (d.category === 'events-meetups' && (daysUntil(d.fields?.date) ?? -1) >= 0)).length;
    const cells = [
      ['Discussions', all.length, 'community.html'],
      ['People listed', people, 'people.html'],
      ['Projects', projects, 'projects.html'],
      ['Open calls & events', open, 'opportunities.html'],
    ];
    el.innerHTML = cells.map(([label, n, href]) => `<a class="stat" href="${href}${example ? '?src=example' : ''}"><strong>${n}</strong><span>${label}</span></a>`).join('');
    el.hidden = false;
  }

  function themeCounts(ctx) {
    document.querySelectorAll('[data-theme-count]').forEach((n) => {
      const t = ctx.themeBySlug[n.dataset.themeCount];
      const c = t ? ctx.all.filter((d) => (d.themes || []).includes(t.label)).length : 0;
      if (c) { n.textContent = n.tagName === 'SMALL' ? String(c) : plural(c, 'post'); n.hidden = false; }
    });
    if (example) document.querySelectorAll('a[href*="community.html?theme="], a[href*="people.html"], a[href*="projects.html"], a[href*="opportunities.html"]').forEach((a) => {
      if (!a.href.includes('src=example')) { const u = new URL(a.href); u.searchParams.set('src', 'example'); a.href = u.toString(); }
    });
  }

  // ------------------------------------------------------------------ composer dialog
  let dialog = null;
  let openComposer = () => {};
  function openComposerFromEvent(e) { if (dialog) { e.preventDefault(); openComposer(e.currentTarget.dataset.compose); } }

  function composer(tax, triggers) {
    const options = (tax.categories || []).filter((c) => c.action);
    if (!options.length || typeof HTMLDialogElement !== 'function') return;
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
    dialog.addEventListener('close', () => { document.documentElement.classList.remove('dialog-open'); opener?.focus(); });

    openComposer = (slug) => {
      opener = document.activeElement;
      select(slug && options.some((o) => o.slug === slug) ? slug : options[0].slug);
      dialog.showModal();
      document.documentElement.classList.add('dialog-open');
      dialog.querySelector('.compose-option[aria-checked="true"]').focus();
    };
    triggers.forEach((t) => t.addEventListener('click', openComposerFromEvent));
  }
})();
