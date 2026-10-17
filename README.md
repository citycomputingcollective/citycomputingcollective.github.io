# citycomputingcollective.github.io

Official website and community hub for the City Computing Collective. Static site served by GitHub Pages at <https://citycomputingcollective.com>. The community itself runs on this repository's GitHub Discussions.

## Site map

| Page | Role |
| --- | --- |
| `index.html` | Hero, how it works, definition, pathways, latest activity, research systems, join |
| `community.html` | Search and browse discussions, latest feed, start a post, themes |
| `projects.html` | Project registry (live from the Project Showcase category), lifecycle, three ways in |
| `resources.html` | Latest shared resources (Datasets and Tools categories), connected platforms, sharing standard |
| `opportunities.html` | Board (Opportunities and Events categories), kinds of listing |
| `about.html` | Mission, governance principles, connected platforms |
| `join.html` | Onboarding steps, introduction guide, privacy |
| `404.html` | Not-found page (served by GitHub Pages) |

Shared assets: `community.css` (one stylesheet for every page) and `assets/site.js` (mobile navigation and the live feed). No build step and no external dependencies.

## Live feed

The site cannot query GitHub Discussions directly from the browser, so a workflow exports them:

- `.github/workflows/discussions-feed.yml` runs every six hours, on demand, and whenever a discussion or comment changes.
- `.github/scripts/refresh-discussions.sh` queries the GraphQL API with the workflow token and writes `data/discussions.json` (the 50 most recently updated discussions).
- The workflow commits the file only when the list changed; GitHub Pages redeploys on that commit.
- `assets/site.js` reads the file and fills every `[data-feed]` mount. `data-categories` filters by category slug (comma-separated) and `data-limit` caps the count. With no matching posts the mount shows the empty state written in the HTML, so pages work without the file or without JavaScript.

Category slugs used by the pages: `introductions`, `find-collaborators`, `project-showcase`, `datasets-data-requests`, `tools-code-methods`, `opportunities`, `events-meetups`. If a category is renamed on GitHub, update the slug in the pages and in `.github/DISCUSSION_TEMPLATE/`.

## Community documents

- `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `CONTRIBUTING.md` — linked from the About page.
- `.github/DISCUSSION_TEMPLATE/*.yml` — the structured form for each custom discussion category.

## Network footer and social card

Every page ends with the network footer: the four sites in the same order (Urban Science AI Lab, UrbanProbe, XUrbanAI, City Computing Collective), each with its role, and the current site marked. Keep the order and wording identical across the four repositories.

`assets/og.png` is the 1200×630 card shown when a page is shared; the `<head>` of each page points to it.

## Editing

Pages share the same header, footer, and `<head>` block. When changing them, change every page. Navigation marks the current page with `aria-current="page"`.
