# citycomputingcollective.github.io

Official website and community hub for the City Computing Collective. Static site served by GitHub Pages at <https://citycomputingcollective.com>. The community itself runs on this repository's GitHub Discussions; the website is a faster way to browse it.

## Site map

| Page | Role |
| --- | --- |
| `index.html` | Hero, how it works, live activity counts, definition, pathways, latest activity, research themes, join |
| `community.html` | The explorer: search, kind of post, research theme, sort; theme view; start a post |
| `people.html` | Opt-in People directory built from introductions |
| `projects.html` | Projects from the Project Showcase category, filterable by status |
| `resources.html` | Datasets, data requests, tools and methods; connected platforms; sharing standard |
| `opportunities.html` | Open calls sorted by deadline (closed ones set aside) and events by date (past ones set aside) |
| `about.html` | Mission, governance, how this site works, connected platforms |
| `join.html` | Onboarding steps, introduction guide, privacy |
| `404.html` | Not-found page |

Shared assets: `community.css`, `assets/site.js`, `assets/og.png`. No build step and no external dependencies.

## How the data flows

```
GitHub Discussions ──► .github/workflows/discussions-feed.yml (on change + every 6 h)
                         └─► .github/scripts/export_discussions.py ──► data/discussions.json ──► assets/site.js
data/taxonomy.json  ──► categories and research themes, shared by the exporter, the templates and the site
```

- **The exporter** reads each discussion form using the templates in `.github/DISCUSSION_TEMPLATE/`, and keeps only what the site needs: title, link, category, author, activity, an excerpt, research themes, and a few form answers (stage, status, kind, geography, deadline, event date). Deadlines and event dates are normalised to `YYYY-MM-DD`.
- **Introductions** contribute role, location, themes and collaboration goals only when the author ticks the People-directory box. Otherwise only the title and link are exported.
- The workflow commits `data/discussions.json` only when the list changed; Pages redeploys on that commit.
- **`.github/workflows/checks.yml`** fails a pull request if a template's theme options drift from `data/taxonomy.json`.

Run locally (needs a token with read access and PyYAML):

```
GH_TOKEN=$(gh auth token) python .github/scripts/export_discussions.py
python .github/scripts/export_discussions.py --check-templates
```

## Views

Views are declared in HTML and filled by `assets/site.js`. Each keeps its own empty state in the HTML, so pages work without JavaScript or data.

`data-view="list"` options:

| Attribute | Effect |
| --- | --- |
| `data-categories` | Comma-separated category slugs to include (default: all) |
| `data-controls` | Any of `search,theme,sort,facet` |
| `data-facet` | `category`, or a form field such as `status`, `kind`, `format`; shown as filter chips with counts |
| `data-facet-order` | Order for facet values |
| `data-split` | `deadline` or `date`: split into open/upcoming and closed/past |
| `data-card` | `post` (default), `event`, or `person` |
| `data-filter="directory"` | Only introductions whose author opted in |
| `data-sync="url"` | Keep search, theme, facet and sort in the URL, so filtered views can be shared |
| `data-page`, `data-more-href` | Page size; link to a full page instead of "Show more" |
| `data-label`, `data-label-one` | Nouns for the result count |
| `data-theme-header`, `data-github-search`, `data-offer-compose` | Theme banner, "Search on GitHub" link, "Start a post" in the no-match state |

`data-view="stats"` shows activity counts when there is at least one discussion. `[data-theme-count="<slug>"]` shows a theme's post count. Any element with `data-compose` (optionally `data-compose="<category>"`) opens the post composer, which explains what each form asks for before continuing to GitHub.

Keyboard: `/` focuses search, `Esc` clears it or closes the composer, arrow keys move between post types.

### Previewing with example data

Add `?src=example` to any page to load `data/examples/discussions.json` instead of the live export. A banner marks the page and it is set to `noindex`. Example posts use placeholder authors.

## Community documents

- `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, linked from the About page.
- `.github/DISCUSSION_TEMPLATE/*.yml`: the structured form for each category, including Q&A. Every form asks for research themes.

Categories without a template on GitHub (General, Ideas, Polls, Show and tell) still appear in the explorer, but they overlap with the structured ones. Consider hiding them in the repository's Discussions settings.

## Network footer and social card

Every page ends with the network footer: the four sites in the same order (Urban Science AI Lab, UrbanProbe, XUrbanAI, City Computing Collective), each with its role, and the current site marked. Keep the order and wording identical across the four repositories.

`assets/og.png` is the 1200×630 card shown when a page is shared; the `<head>` of each page points to it.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. Navigation marks the current page with `aria-current="page"`.
