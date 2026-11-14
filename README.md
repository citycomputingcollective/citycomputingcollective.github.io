# citycomputingcollective.github.io

Official website and community hub for the City Computing Collective. Static site served by GitHub Pages at <https://citycomputingcollective.com>. The community itself runs on this repository's GitHub Discussions; the website is a faster way to browse it.

## Site map

| Page | Role |
| --- | --- |
| `index.html` | Hero, how it works, live activity counts, definition, pathways, latest activity, research themes, join |
| `community.html` | The explorer: search, kind of post, research theme, sort; theme view; start a post |
| `people.html` | Opt-in People directory built from introductions |
| `theme.html?t=<slug>` | Theme hub: collaborations, questions, projects, resources, calls, events, and people for one research theme, with a Follow button |
| `post.html?n=<number>` | A discussion on the site: structured form answers, body, replies with the accepted answer first, related posts, and Q&A or forum structured data |
| `member.html?u=<login>` | Member page: a person's directory entry (if listed), themes, and every public post |
| `projects.html` | Projects from the Project Showcase category, filterable by status |
| `resources.html` | Datasets, data requests, tools and methods; connected platforms; sharing standard |
| `opportunities.html` | Open calls sorted by deadline (closed ones set aside) and events by date (past ones set aside) |
| `about.html` | Mission, governance, how this site works, connected platforms |
| `join.html` | Onboarding steps, introduction guide, privacy |
| `follow.html` | Subscription centre: every feed and calendar, how each channel works, how to stop |
| `404.html` | Not-found page |

Shared assets: `community.css`, `assets/site.js` (data, views, composer, saved items, follow buttons), `assets/palette.js` (command palette), `assets/follow.js` and `assets/follow.css` (the follow dialog), `assets/og.png`. No build step and no external dependencies.

## How the data flows

```
GitHub Discussions ──► .github/workflows/discussions-feed.yml (on change + every 6 h)
                         └─► .github/scripts/export_discussions.py ──► data/discussions.json ──► assets/site.js
                         ├─► data/posts/<number>.json (GitHub-rendered body and replies)
                         ├─► feeds/*.xml (RSS), feeds/*.ics (calendars), see "Feeds and calendars" below
                         └─► sitemap.xml
data/taxonomy.json  ──► categories and research themes, shared by the exporter, the templates and the site
```

- **The exporter** reads each discussion form using the templates in `.github/DISCUSSION_TEMPLATE/`, and keeps only what the site needs: title, link, category, author, activity, an excerpt, research themes, and a few form answers (stage, status, kind, geography, deadline, event date). Deadlines and event dates are normalised to `YYYY-MM-DD`.
- **Introductions** contribute role, location, themes and collaboration goals only when the author ticks the People-directory box. Otherwise only the title and link are exported.
- The workflow commits `data/`, `feeds/` and `sitemap.xml` only when something changed; Pages redeploys on that commit. Output is deterministic (no build-time timestamps), so unchanged content gives byte-identical files.
- **`.github/workflows/checks.yml`** fails a pull request if a template's theme options drift from `data/taxonomy.json`, or if a feed, calendar, the sitemap or `follow.html` breaks the rules in `.github/scripts/check_feeds.py`.

Run locally (needs a token with read access and PyYAML):

```
GH_TOKEN=$(gh auth token) python .github/scripts/export_discussions.py
python .github/scripts/export_discussions.py --check-templates
python .github/scripts/check_feeds.py
python .github/scripts/export_discussions.py --from-file raw.json   # a saved GraphQL response, for tests
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
| `data-card` | `post` (default), `event` (with calendar buttons), `person`, or `compact` |
| `data-filter="directory"` | Only introductions whose author opted in |
| `data-sync="url"` | Keep search, theme, facet and sort in the URL, so filtered views can be shared |
| `data-page`, `data-more-href` | Page size; link to a full page instead of "Show more" (`{t}` and `{u}` are replaced by the theme and member) |
| `data-sort` | Default order: `trending` (engagement over age), `activity`, `new`, or `replies` |
| `data-theme-from`, `data-author-from` | Fix the list to the theme or member named in that URL parameter |
| `data-filter="unanswered"` | Only questions without a marked answer |
| `data-hide-empty` | Hide the nearest `[data-hide-target]` when the list is empty |
| `data-saved-toggle` | Show a "Saved" filter for posts bookmarked in this browser |
| `data-label`, `data-label-one` | Nouns for the result count |
| `data-theme-header`, `data-github-search`, `data-offer-compose` | Theme banner, "Search on GitHub" link, "Start a post" in the no-match state |

`data-view="stats"` shows activity counts when there is at least one discussion. `[data-theme-count="<slug>"]` shows a theme's post count. Any element with `data-compose` (optionally `data-compose="<category>"`) opens the post composer, which explains what each form asks for before continuing to GitHub.

`data-view="theme-hub"` and `data-view="member"` fill the headers of `theme.html` and `member.html`.

Keyboard: `Ctrl K` or `⌘K` opens the command palette (posts, people, themes, pages, actions) anywhere; `/` focuses the page's search; `Esc` clears search or closes a dialog; arrow keys move through the palette and the post types.

Saved posts are kept in the browser's local storage only; nothing is sent anywhere. The button says "Save in this browser" on post pages because saving does not notify anyone; to be told about replies, use Follow replies.

### Previewing with example data

Add `?src=example` to any page to load `data/examples/discussions.json` instead of the live export. A banner marks the page and it is set to `noindex`. Example posts use placeholder authors. Follow buttons on member and post pages in this mode point at the placeholder feeds in `data/examples/feeds/` (keep those files), because feeds of example members and posts do not exist. Other Follow buttons still point at the real feed paths. The example open call "Postdoctoral position in urban data science" has a far-off deadline so Remind me can always be tried.

## Feeds and calendars

The exporter writes these files on every run. All feeds are RSS 2.0 (newest first, at most 50 items, `lastBuildDate` equal to the newest item, so an unchanged community gives unchanged files). Every advertised file exists, empty when there is nothing yet, so a link never returns 404. Feed items link to the on-site page `post.html?n=<number>`, except reply items, which link to the comment on GitHub.

| File | What it contains |
| --- | --- |
| `feeds/all.xml` | Every new discussion |
| `feeds/category-<slug>.xml` | New discussions in one category; one file for every category in `data/taxonomy.json`, including `announcements` and `q-a` |
| `feeds/unanswered.xml` | Q&A discussions without an accepted answer |
| `feeds/resources.xml` | `datasets-data-requests` and `tools-code-methods` together |
| `feeds/theme-<slug>.xml` | New discussions tagged with one research theme (this site only; the network feed on urbanscience.ai also includes releases) |
| `feeds/member-<login>.xml` | New discussions by one author; written for every author with a post, deleted when the author has none |
| `feeds/post-<number>.xml` | Comments and replies of one discussion, each linking to its GitHub comment; written for every discussion that has a post file |
| `feeds/events.ics` | Events with a date, as all-day entries |
| `feeds/deadlines.ics` | Opportunities with a parseable deadline, as all-day entries titled `Deadline: <title>` with two reminders (7 days and 1 day before) |
| `sitemap.xml` | Static pages, `follow.html`, the 8 theme hubs, and one `post.html?n=` per exported post with `<lastmod>` from its last update |

Calendar files use CRLF line endings, lines folded at 75 octets, a stable `UID`, and `DTSTAMP` and `LAST-MODIFIED` taken from the discussion's last update (never the build time). `.gitattributes` keeps `*.ics` byte for byte. Files of entities that disappeared are deleted on the next run. Every page links the main feed with `<link rel="alternate">`; theme, member and post pages add their own.

To test the exporter offline, save a GraphQL response in the shape of the query in `export_discussions.py` and run it with `--from-file`. An empty response (`{"data":{"repository":{"discussions":{"nodes":[]}}}}`) regenerates the committed empty state.

## Follow

`assets/follow.js` and `assets/follow.css` are one shared component, identical on all four network sites. Any element with `data-follow` opens a dialog that explains how to follow one thing by email, in a feed reader, in a calendar or on GitHub. Anchors keep their `href` (a raw feed) as the no-JavaScript fallback.

| Attribute | Meaning |
| --- | --- |
| `data-follow-title` | Plain name of what is followed (required) |
| `data-follow-what` | One sentence on what arrives |
| `data-follow-feed`, `data-follow-ics`, `data-follow-ics-name` | RSS feed; calendar file and its display name |
| `data-follow-github`, `data-follow-github-kind` | GitHub URL; `discussions`, `releases` or `thread` |
| `data-follow-newsletter="true"` | Show the owner newsletter form first, when it is configured |

`window.Follow.open({ title, what, feed, ics, icsName, github, githubKind, newsletter })` opens the same dialog from code. This site sets the component's colours in `community.css` (`--follow-bg`, `--follow-fg`, `--follow-muted`, `--follow-line`, `--follow-surface`, `--follow-accent`, `--follow-accent-fg`, `--follow-radius`, `--follow-mono`). Do not edit `follow.js` or `follow.css` here; change them in all four repositories together.

Where the buttons are:

- **Header bell and footer link** on every page, to `follow.html`. `Ctrl K` has follow actions for the main targets.
- **`follow.html`**, the subscription centre. It is plain HTML, so it works without JavaScript: every row has its raw feed link. It lists all discussions, each category, unanswered questions, resources, each research theme (the network feed on urbanscience.ai), the events and deadlines calendars, and the weekly network digest.
- **`community.html`**: "Follow this view" next to the result count. No filter follows all discussions, one kind of post follows its category feed, one theme follows `feeds/theme-<slug>.xml` (discussions only). A search, the Saved filter, or a kind plus a theme has no feed, so the button is hidden.
- **`theme.html`**: Follow button for the network theme feed. **`member.html`**: Follow the member. **`post.html`**: Follow replies (reply feed and the GitHub thread). **`opportunities.html`**: Follow open calls (category feed and deadlines calendar) and Subscribe to events.
- **Empty states** on every list: "Get notified" with "Be told when the first one is added."
- **Remind me** on each open call downloads a one-event `.ics` with the deadline and alarms 7 days and 1 day before.
- **New since your last visit**: the browser keeps one time stamp per site in `localStorage` (`ccc:lastVisit:v1`). On a return visit, posts created after it get a "New" badge and the list says how many are new. Nothing breaks when storage is blocked.

### Owner newsletter slot

`data/follow.json` holds the optional newsletter, hidden while `provider` is `null`. To turn it on, set `"provider": "buttondown"` and `"username"` to a Buttondown username. The dialogs for all discussions then show a plain HTML signup form that posts to Buttondown in a new tab (it never uses `fetch`), with the site key `ccc` as a tag. No other provider is supported. Nothing in this repository signs anyone up; the owner creates the Buttondown account.

## Community documents

- `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, linked from the About page.
- `.github/DISCUSSION_TEMPLATE/*.yml`: the structured form for each category, including Q&A. Every form asks for research themes.

Categories without a template on GitHub (General, Ideas, Polls, Show and tell) still appear in the explorer, but they overlap with the structured ones. Consider hiding them in the repository's Discussions settings.

## Network footer and social card

Every page ends with the network footer: the four sites in the same order (Urban Science AI Lab, UrbanProbe, XUrbanAI, City Computing Collective), each with its role, and the current site marked. Keep the order and wording identical across the four repositories.

`assets/og.png` is the 1200×630 card shown when a page is shared; the `<head>` of each page points to it.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. Navigation marks the current page with `aria-current="page"`.

## Post pages and the wider network

- `post.html` renders `data/posts/<number>.json`. The HTML is GitHub's own rendering; the page removes scripts, event handlers, and form boilerplate before showing it. Introductions outside the People directory have no post file, so their text stays on GitHub.
- Theme hubs list releases from XUrbanAI and UrbanProbe in the same theme, read from those sites' public `data/registry.json` (open CORS on GitHub Pages). On `localhost` the hub reads sibling folders `/xurbanai` and `/urbanprobe` instead, for local previews of all sites together.

