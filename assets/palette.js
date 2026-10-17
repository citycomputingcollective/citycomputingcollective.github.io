/* City Computing Collective — command palette (Ctrl/Cmd+K).
   One box to reach discussions, people, research themes, pages, and actions. Needs assets/site.js. */
(() => {
  'use strict';
  const C = window.CCC;
  if (!C || typeof HTMLDialogElement !== 'function') return;
  const { esc, link } = C;
  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform || navigator.platform || '');
  const PAGES = [
    ['Community', 'community.html', 'Browse and filter every discussion'],
    ['People', 'people.html', 'Members who chose to be listed'],
    ['Projects', 'projects.html', 'Projects at every stage'],
    ['Resources', 'resources.html', 'Datasets, data requests, tools and methods'],
    ['Opportunities & events', 'opportunities.html', 'Open calls by deadline, events by date'],
    ['About & governance', 'about.html', 'Mission, rules, and how this site works'],
    ['Join', 'join.html', 'Create an account and introduce yourself'],
  ];
  const ICON = {
    action: '<path d="M10 4v12M4 10h12"/>',
    page: '<path d="M6 3.5h6l3 3v10H6z"/><path d="M12 3.5v3h3"/>',
    theme: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
    post: '<path d="M4 5.5h12v8H8l-4 3z"/>',
    person: '<circle cx="10" cy="7.5" r="3"/><path d="M4.5 16.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 20 20" aria-hidden="true">${ICON[k]}</svg>`;

  // header buttons ship hidden so they never appear without JavaScript
  document.querySelectorAll('[data-palette]').forEach((b) => {
    b.hidden = false;
    const k = b.querySelector('kbd');
    if (k) k.textContent = isMac ? '⌘K' : 'Ctrl K';
    b.setAttribute('aria-keyshortcuts', isMac ? 'Meta+K' : 'Control+K');
  });

  let dialog, input, list, items = [], active = 0, sources = null;

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'palette';
    dialog.setAttribute('aria-label', 'Search the community');
    dialog.innerHTML = `
      <div class="palette-box">
        <svg class="palette-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>
        <input type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search posts, people, themes, pages…">
        <kbd>esc</kbd>
      </div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Results"></div>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>`;
    document.body.appendChild(dialog);
    input = dialog.querySelector('input');
    list = dialog.querySelector('.palette-list');
    input.addEventListener('input', render);
    input.addEventListener('keydown', onKey);
    list.addEventListener('mousemove', (e) => { const o = e.target.closest('[role="option"]'); if (o) setActive(+o.dataset.i, false); });
    list.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (o) { e.preventDefault(); run(items[+o.dataset.i], e.metaKey || e.ctrlKey); } });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => document.documentElement.classList.remove('dialog-open'));
  }

  function loadSources() {
    if (sources) return sources;
    sources = C.ready.then((ctx) => {
      const actions = [
        { kind: 'action', title: 'Start a post', sub: 'Choose a kind of post and see what its form asks for', run: () => C.openComposer() },
        ...ctx.categories.filter((c) => c.action).map((c) => ({ kind: 'action', title: c.action, sub: c.summary || '', run: () => C.openComposer(c.slug) })),
        { kind: 'action', title: 'Saved posts', sub: 'Posts you bookmarked in this browser', href: 'community.html?saved=1#browse' },
      ];
      const pages = PAGES.map(([title, href, sub]) => ({ kind: 'page', title, sub, href }));
      const themes = ctx.themes.map((t) => ({ kind: 'theme', title: t.label, sub: `${t.code} · ${t.blurb || ''}`, href: `theme.html?t=${t.slug}` }));
      const posts = ctx.all.map((d) => ({
        kind: 'post', title: d.title, sub: `${ctx.cats[d.category]?.short || d.categoryName} · ${d.author} · ${C.ago(d.updatedAt)}`,
        href: d.url, external: true, extra: [d.excerpt, d.author, ...(d.themes || []), ...Object.values(d.fields || {})].join(' '), score: C.trendScore(d),
      }));
      const people = ctx.all.filter((d) => d.directory).map((d) => ({
        kind: 'person', title: d.fields?.role || d.author, sub: [d.author, d.fields?.location].filter(Boolean).join(' · '),
        href: `member.html?u=${encodeURIComponent(d.author)}`, extra: [d.excerpt, ...(d.themes || [])].join(' '),
      }));
      return { actions, pages, themes, posts, people };
    });
    return sources;
  }

  function match(item, terms) {
    if (!terms.length) return 1;
    const t = item.title.toLowerCase();
    const rest = `${item.sub || ''} ${item.extra || ''}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (t.startsWith(term)) score += 4;
      else if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) score += 3;
      else if (t.includes(term)) score += 2;
      else if (rest.includes(term)) score += 1;
      else return 0;
    }
    return score;
  }

  async function render() {
    const src = await loadSources();
    const q = input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const pick = (arr, n) => arr.map((x) => [x, match(x, terms)]).filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || (b[0].score || 0) - (a[0].score || 0)).slice(0, n).map(([x]) => x);
    const groups = q
      ? [['Discussions', pick(src.posts, 6)], ['People', pick(src.people, 4)], ['Themes', pick(src.themes, 4)], ['Pages', pick(src.pages, 4)], ['Actions', pick(src.actions, 4)]]
      : [['Actions', src.actions.slice(0, 4)], ['Trending', src.posts.slice().sort((a, b) => b.score - a.score).slice(0, 5)], ['Research themes', src.themes], ['Pages', src.pages]];
    items = [];
    let html = '';
    for (const [label, arr] of groups) {
      if (!arr.length) continue;
      html += `<div class="palette-group" role="presentation"><p class="palette-label" role="presentation">${esc(label)}</p>`;
      for (const it of arr) {
        const i = items.push(it) - 1;
        html += `<div class="palette-item" role="option" id="pal-${i}" data-i="${i}" aria-selected="false">${icon(it.kind)}<span class="palette-text"><strong>${esc(it.title)}</strong>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.external ? '<span class="palette-ext" aria-hidden="true">↗</span>' : ''}</div>`;
      }
      html += '</div>';
    }
    if (!items.length) {
      html = `<div class="palette-empty"><strong>No results for “${esc(input.value.trim())}”.</strong><p>Search GitHub Discussions instead, or start a post.</p></div>`;
      items.push({ kind: 'action', title: `Search GitHub Discussions for “${input.value.trim()}”`, href: `${C.REPO}?discussions_q=${encodeURIComponent(input.value.trim())}`, external: true });
      items.push({ kind: 'action', title: 'Start a post', run: () => C.openComposer() });
      html += items.map((it, i) => `<div class="palette-item" role="option" id="pal-${i}" data-i="${i}" aria-selected="false">${icon(it.kind)}<span class="palette-text"><strong>${esc(it.title)}</strong></span></div>`).join('');
    }
    list.innerHTML = html;
    setActive(0, false);
  }

  function setActive(i, scroll = true) {
    if (!items.length) return;
    active = (i + items.length) % items.length;
    list.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute('aria-selected', String(+o.dataset.i === active)));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
    if (scroll) list.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) run(items[active], e.metaKey || e.ctrlKey); }
  }

  function run(item, newTab) {
    if (!item) return;
    if (item.run) { dialog.close(); setTimeout(item.run, 0); return; }
    const href = item.external ? item.href : link(item.href);
    if (newTab) { window.open(href, '_blank', 'noopener'); return; }
    dialog.close();
    location.href = href;
  }

  function open() {
    if (!dialog) build();
    if (dialog.open) return;
    input.value = '';
    dialog.showModal();
    document.documentElement.classList.add('dialog-open');
    input.focus();
    render();
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dialog?.open) dialog.close(); else open();
    }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-palette]')) { e.preventDefault(); open(); } });
})();
