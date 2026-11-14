#!/usr/bin/env python3
"""Export GitHub Discussions to data/discussions.json for the website.

Each discussion is reduced to what the site needs to list, filter, and sort it:
title, link, category, author, activity, an excerpt, research themes, and a few
structured fields read from the discussion form (stage, deadline, event date...).
Introductions contribute directory fields only when the author ticked the
"People directory" box.

It also writes data/posts/<number>.json with the GitHub-rendered body and the replies of each
discussion, for the on-site post pages. Introductions whose author did not tick the directory box
get no post file, so their text stays on GitHub only.

Alongside the JSON it writes the subscription files under feeds/ and the sitemap:

    feeds/all.xml                    every new discussion
    feeds/category-<slug>.xml        one per category in data/taxonomy.json
    feeds/unanswered.xml             Q&A discussions without an accepted answer
    feeds/resources.xml              datasets-data-requests and tools-code-methods
    feeds/theme-<slug>.xml           one per research theme (this site only)
    feeds/member-<login>.xml         one per author with a post
    feeds/post-<number>.xml          replies to one discussion (one per post file)
    feeds/events.ics                 events calendar
    feeds/deadlines.ics              opportunity deadlines, with reminders
    sitemap.xml                      static pages, theme hubs, and one URL per exported post

Output is deterministic: the same input gives byte-identical files (no build-time timestamps),
so the workflow only commits when content changed. Files of entities that disappeared are deleted.

Usage:
    python .github/scripts/export_discussions.py                   # fetch and write if changed
    python .github/scripts/export_discussions.py --check-templates # verify templates match data/taxonomy.json
    python .github/scripts/export_discussions.py --from-file raw.json  # use a saved GraphQL response (testing)

Environment: GH_TOKEN or GITHUB_TOKEN; GITHUB_REPOSITORY (owner/name).
Requires PyYAML for reading the discussion templates.
"""
import datetime as dt
import email.utils
import html
import json
import os
import pathlib
import re
import sys
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "discussions.json"
FEEDS = ROOT / "feeds"
POSTS = ROOT / "data" / "posts"
SITEMAP = ROOT / "sitemap.xml"
SITE = "https://citycomputingcollective.com"
NAME = "City Computing Collective"
TEMPLATES = ROOT / ".github" / "DISCUSSION_TEMPLATE"
TAXONOMY = json.loads((ROOT / "data" / "taxonomy.json").read_text(encoding="utf-8"))
THEMES = [t["label"] for t in TAXONOMY["themes"]]
MAX_DISCUSSIONS = 500
MAX_FEED_ITEMS = 50
STATIC_PAGES = ["", "community.html", "people.html", "projects.html", "resources.html", "opportunities.html",
                "about.html", "join.html", "follow.html"]

# Which form fields each category exposes on the site, and which field supplies the excerpt.
EXPORT = {
    "introductions": {"keep": ["role", "location"], "excerpt": "collaboration", "directory_only": True},
    "find-collaborators": {"keep": ["stage", "geography"], "excerpt": "question"},
    "project-showcase": {"keep": ["status"], "excerpt": "question"},
    "datasets-data-requests": {"keep": ["kind"], "excerpt": "use"},
    "tools-code-methods": {"keep": ["kind"], "excerpt": "problem"},
    "opportunities": {"keep": ["kind", "deadline", "official"], "excerpt": "relevance", "dates": ["deadline"]},
    "events-meetups": {"keep": ["date", "datetime", "format", "registration"], "excerpt": "description", "dates": ["date"]},
    "q-a": {"keep": ["geography"], "excerpt": "context"},
}

QUERY = """
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 50, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body bodyHTML createdAt updatedAt upvoteCount isAnswered locked
        category { name slug }
        author { login url avatarUrl }
        comments(first: 40) {
          totalCount
          nodes {
            url bodyHTML createdAt upvoteCount isAnswer
            author { login url avatarUrl }
            replies(first: 20) { totalCount nodes { url bodyHTML createdAt upvoteCount author { login url avatarUrl } } }
          }
        }
      }
    }
  }
}
"""

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def load_templates():
    """Return {category slug: {form label: field id}} and the theme options of each template."""
    labels, theme_options = {}, {}
    for path in sorted(TEMPLATES.glob("*.yml")):
        form = yaml.safe_load(path.read_text(encoding="utf-8"))
        slug = path.stem
        labels[slug] = {}
        for item in form.get("body", []):
            if item.get("id") and item.get("attributes", {}).get("label"):
                labels[slug][item["attributes"]["label"].strip()] = item["id"]
            if item.get("id") == "themes":
                theme_options[slug] = item["attributes"].get("options", [])
    return labels, theme_options


def check_templates():
    _, theme_options = load_templates()
    problems = []
    for slug in EXPORT:
        if slug not in theme_options:
            problems.append(f"{slug}.yml has no 'themes' field")
        elif theme_options[slug] != THEMES:
            problems.append(f"{slug}.yml theme options differ from data/taxonomy.json")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"OK: {len(theme_options)} templates use the {len(THEMES)} themes in data/taxonomy.json")


def parse_form(body, label_map):
    """Split a discussion-form body ('### Label' then value) into {field id: value}."""
    parts = re.split(r"^###[ \t]+(.+?)[ \t]*$", body or "", flags=re.M)
    fields = {}
    for i in range(1, len(parts) - 1, 2):
        fid = label_map.get(parts[i].strip())
        value = parts[i + 1].strip()
        if fid and value and value != "_No response_":
            fields[fid] = value
    return fields


def normalize_date(text):
    """Return YYYY-MM-DD from common date spellings, or None."""
    if not text:
        return None
    s = text.strip()
    m = re.search(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?,?\s+(\d{4})", s) or None
        if m:
            d, mo, y = int(m.group(1)), MONTHS.get(m.group(2)[:3].lower()), int(m.group(3))
        else:
            m = re.search(r"([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", s)
            if not m:
                return None
            mo, d, y = MONTHS.get(m.group(1)[:3].lower()), int(m.group(2)), int(m.group(3))
    if not 1970 <= y <= 2100:  # "9999-12-31" style placeholders are not real dates and overflow calendar math
        return None
    try:
        return dt.date(y, mo, d).isoformat() if mo else None
    except ValueError:
        return None


def plain(text, limit=200):
    """Markdown to a short plain-text excerpt."""
    t = re.sub(r"```.*?```", " ", text or "", flags=re.S)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^#+\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*]\s+\[[ xX]\]\s*", "", t, flags=re.M)
    t = re.sub(r"[*_`>]+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= limit:
        return t
    cut = t[:limit].rsplit(" ", 1)[0].rstrip(",.;:")
    return cut + "…"


def html_plain(markup, limit=300):
    """GitHub-rendered HTML to a short plain-text excerpt."""
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", markup or "", flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", html.unescape(t)).strip()
    if len(t) <= limit:
        return t
    return t[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def themes_in(value):
    """Theme labels contain commas, so match known labels instead of splitting."""
    return [label for label in THEMES if value and label in value]


def reduce(node, label_maps):
    cat = node["category"]["slug"]
    author = node.get("author") or {}
    item = {
        "number": node["number"],
        "title": re.sub(r"^\s*\[[^\]]{1,24}\]\s*", "", node["title"]).strip() or node["title"],
        "url": node["url"],
        "category": cat,
        "categoryName": node["category"]["name"],
        "author": author.get("login", "ghost"),
        "authorUrl": author.get("url", ""),
        "avatar": author.get("avatarUrl", ""),
        "createdAt": node["createdAt"],
        "updatedAt": node["updatedAt"],
        "comments": node["comments"]["totalCount"],
        "upvotes": node.get("upvoteCount", 0),
    }
    if node.get("isAnswered"):
        item["answered"] = True
    spec = EXPORT.get(cat)
    if not spec:
        item["excerpt"] = plain(node.get("body"))
        return item
    form = parse_form(node.get("body"), label_maps.get(cat, {}))
    item["themes"] = themes_in(form.get("themes", ""))
    item["excerpt"] = plain(form.get(spec["excerpt"], ""))
    fields = {k: plain(form[k], 120) for k in spec["keep"] if k in form}
    for k in spec.get("dates", []):
        if k in fields:
            fields[k] = normalize_date(form[k]) or ""
    if spec.get("directory_only"):
        listed = bool(re.search(r"-\s*\[[xX]\]", form.get("directory", "")))
        if listed:
            item["directory"] = True
        else:
            fields = {}
            item["excerpt"] = ""
            item["themes"] = []
    item["fields"] = {k: v for k, v in fields.items() if v}
    return item


def person(a):
    a = a or {}
    return {"author": a.get("login", "ghost"), "authorUrl": a.get("url", ""), "avatar": a.get("avatarUrl", "")}


def post_file(node, item):
    """Body and replies for the on-site post page, or None when the text should stay on GitHub."""
    if item["category"] == "introductions" and not item.get("directory"):
        return None
    comments = []
    for c in (node.get("comments") or {}).get("nodes") or []:
        comments.append({**person(c.get("author")), "url": c.get("url", ""), "createdAt": c["createdAt"], "upvotes": c.get("upvoteCount", 0),
                         "isAnswer": bool(c.get("isAnswer")), "bodyHTML": c.get("bodyHTML", ""),
                         "replies": [{**person(r.get("author")), "url": r.get("url", ""), "createdAt": r["createdAt"], "upvotes": r.get("upvoteCount", 0), "bodyHTML": r.get("bodyHTML", "")}
                                     for r in ((c.get("replies") or {}).get("nodes") or [])],
                         "moreReplies": max(0, ((c.get("replies") or {}).get("totalCount") or 0) - len((c.get("replies") or {}).get("nodes") or []))})
    return {"number": node["number"], "bodyHTML": node.get("bodyHTML", ""), "comments": comments,
            "moreComments": max(0, ((node.get("comments") or {}).get("totalCount") or 0) - len(comments))}


# ------------------------------------------------------------------ file helpers
def write_if_changed(path, data):
    """Write text or bytes only when the content differs. Returns True if the file changed."""
    raw = data.encode("utf-8") if isinstance(data, str) else data
    if path.exists() and path.read_bytes() == raw:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return True


def write_posts(files):
    """Write changed post files and remove files of deleted or withdrawn discussions. Returns True if anything changed."""
    POSTS.mkdir(parents=True, exist_ok=True)
    changed, keep = False, set()
    for number, data in files.items():
        keep.add(f"{number}.json")
        text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
        changed |= write_if_changed(POSTS / f"{number}.json", text)
    for old in POSTS.glob("*.json"):
        if old.name not in keep:
            old.unlink()
            changed = True
    return changed


# ------------------------------------------------------------------ RSS
def when(iso):
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(dt.timezone.utc)


def rfc822(d):
    return email.utils.format_datetime(d, usegmt=True)


def xml(text):
    """Escape text for XML and drop characters XML 1.0 cannot carry."""
    clean = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]", "", str(text or ""))
    return html.escape(clean)


def slug_file(value):
    return re.sub(r"[^A-Za-z0-9_-]", "_", value)


def discussion_item(d):
    return {"title": d["title"], "link": f"{SITE}/post.html?n={d['number']}", "guid": d["url"], "permalink": True,
            "date": when(d["createdAt"]), "creator": d.get("author", ""),
            "categories": [c for c in [d.get("categoryName", "")] + d.get("themes", []) if c],
            "description": d.get("excerpt") or d.get("categoryName", "")}


def reply_items(number, title, post):
    """One item per comment and reply of a discussion; each links to the comment on GitHub."""
    fallback = f"{SITE}/post.html?n={number}"
    out = []
    for i, c in enumerate(post.get("comments") or []):
        kind = "Accepted answer" if c.get("isAnswer") else "Reply"
        out.append({"title": f"{kind} by {c['author']}", "link": c.get("url") or fallback,
                    "guid": c.get("url") or f"ccc-post-{number}-comment-{i}", "permalink": bool(c.get("url")),
                    "date": when(c["createdAt"]), "creator": c["author"], "categories": [kind],
                    "description": html_plain(c.get("bodyHTML")) or title})
        for j, r in enumerate(c.get("replies") or []):
            out.append({"title": f"Reply by {r['author']} to {c['author']}", "link": r.get("url") or fallback,
                        "guid": r.get("url") or f"ccc-post-{number}-comment-{i}-reply-{j}", "permalink": bool(r.get("url")),
                        "date": when(r["createdAt"]), "creator": r["author"], "categories": ["Reply"],
                        "description": html_plain(r.get("bodyHTML")) or title})
    return out


def rss(name, title, link, description, items):
    # <description> is read as HTML by feed readers and mail services, so item text is escaped once for HTML and once for XML.
    newest = sorted(items, key=lambda i: (i["date"], i["guid"]), reverse=True)[:MAX_FEED_ITEMS]

    def one(i):
        cats = "".join(f"<category>{xml(c)}</category>" for c in i["categories"])
        creator = f"<dc:creator>{xml(i['creator'])}</dc:creator>" if i.get("creator") else ""
        return (f"<item><title>{xml(i['title'])}</title><link>{xml(i['link'])}</link>"
                f"<guid isPermaLink=\"{'true' if i['permalink'] else 'false'}\">{xml(i['guid'])}</guid>"
                f"<pubDate>{rfc822(i['date'])}</pubDate>{creator}{cats}<description>{xml(html.escape(i['description'], quote=False))}</description></item>")

    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
             "<channel>",
             f"<title>{xml(title)}</title><link>{xml(link)}</link><description>{xml(description)}</description><language>en</language>"]
    if newest:
        parts.append(f"<lastBuildDate>{rfc822(newest[0]['date'])}</lastBuildDate>")
    parts.append(f'<atom:link href="{SITE}/feeds/{name}" rel="self" type="application/rss+xml"/>')
    parts += [one(i) for i in newest]
    parts += ["</channel>", "</rss>", ""]
    return "\n".join(parts)


# ------------------------------------------------------------------ iCalendar
def ics_text(v):
    return str(v or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\n").replace("\n", "\\n")


def fold(line):
    """Fold a content line so no physical line exceeds 75 octets (RFC 5545 section 3.1)."""
    out, b = [], line.encode("utf-8")
    while len(b) > 75:
        cut = 75
        while (b[cut] & 0xC0) == 0x80:
            cut -= 1
        out.append(b[:cut].decode("utf-8"))
        b = b" " + b[cut:]
    out.append(b.decode("utf-8"))
    return "\r\n".join(out)


def ics_calendar(name, description, prodid, events):
    """events: dicts with uid, stamp (datetime), day (date), summary, description, url, location, alarms (bool)."""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{NAME}//{prodid}//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             f"X-WR-CALNAME:{ics_text(name)}", f"X-WR-CALDESC:{ics_text(description)}",
             "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"]
    for e in sorted(events, key=lambda e: (e["day"], e["uid"])):
        stamp = e["stamp"].strftime("%Y%m%dT%H%M%SZ")
        lines += ["BEGIN:VEVENT", f"UID:{e['uid']}", f"DTSTAMP:{stamp}", f"LAST-MODIFIED:{stamp}",
                  f"DTSTART;VALUE=DATE:{e['day']:%Y%m%d}", f"DTEND;VALUE=DATE:{e['day'] + dt.timedelta(days=1):%Y%m%d}",
                  f"SUMMARY:{ics_text(e['summary'])}", f"DESCRIPTION:{ics_text(e['description'])}", f"URL:{e['url']}"]
        if e.get("location"):
            lines.append(f"LOCATION:{ics_text(e['location'])}")
        if e.get("alarms"):
            for trigger, label in (("-P7D", "7 days"), ("-P1D", "1 day")):
                lines += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(e['summary'] + ' in ' + label)}",
                          f"TRIGGER:{trigger}", "END:VALARM"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return ("\r\n".join(fold(l) for l in lines) + "\r\n").encode("utf-8")


def event_entries(discussions):
    out = []
    for d in discussions:
        f = d.get("fields") or {}
        if d["category"] != "events-meetups" or not f.get("date"):
            continue
        desc = "\n".join(x for x in [("Time: " + f["datetime"]) if f.get("datetime") else "", d.get("excerpt", ""), d["url"]] if x)
        out.append({"uid": f"ccc-{d['number']}@citycomputingcollective.com", "stamp": when(d["updatedAt"]),
                    "day": dt.date.fromisoformat(f["date"]), "summary": d["title"], "description": desc, "url": d["url"],
                    "location": f.get("registration") or f.get("format") or ""})
    return out


def deadline_entries(discussions):
    out = []
    for d in discussions:
        f = d.get("fields") or {}
        if d["category"] != "opportunities" or not f.get("deadline"):
            continue
        page = f"{SITE}/post.html?n={d['number']}"
        desc = "\n".join(x for x in [f"Deadline: {f['deadline']}", f.get("kind", ""), d.get("excerpt", ""),
                                     ("Official page: " + f["official"]) if f.get("official") else "", page] if x)
        out.append({"uid": f"ccc-deadline-{d['number']}@citycomputingcollective.com", "stamp": when(d["updatedAt"]),
                    "day": dt.date.fromisoformat(f["deadline"]), "summary": f"Deadline: {d['title']}", "description": desc,
                    "url": page, "alarms": True})
    return out


# ------------------------------------------------------------------ all feeds and the sitemap
def feed_plan(discussions, posts):
    """Return {file name: bytes} for every file that should exist in feeds/."""
    files = {}
    by_new = discussions
    files["all.xml"] = rss("all.xml", f"{NAME}: all discussions", f"{SITE}/community.html",
                           f"Every new discussion in the {NAME}.", [discussion_item(d) for d in by_new])
    for c in TAXONOMY["categories"]:
        name = f"category-{c['slug']}.xml"
        files[name] = rss(name, f"{NAME}: {c['label']}", f"{SITE}/community.html?category={c['slug']}",
                          f"New discussions in the category {c['label']}.",
                          [discussion_item(d) for d in by_new if d["category"] == c["slug"]])
    files["unanswered.xml"] = rss("unanswered.xml", f"{NAME}: unanswered questions", f"{SITE}/community.html?category=q-a",
                                  "Questions that do not have an accepted answer yet.",
                                  [discussion_item(d) for d in by_new if d["category"] == "q-a" and not d.get("answered")])
    files["resources.xml"] = rss("resources.xml", f"{NAME}: data, tools and methods", f"{SITE}/resources.html",
                                 "New datasets, data requests, tools, and methods.",
                                 [discussion_item(d) for d in by_new if d["category"] in ("datasets-data-requests", "tools-code-methods")])
    for t in TAXONOMY["themes"]:
        name = f"theme-{t['slug']}.xml"
        files[name] = rss(name, f"{NAME}: {t['label']}", f"{SITE}/theme.html?t={t['slug']}", t.get("blurb", t["label"]),
                          [discussion_item(d) for d in by_new if t["label"] in d.get("themes", [])])
    authors = sorted({d["author"] for d in by_new})
    for login in authors:
        name = f"member-{slug_file(login)}.xml"
        files[name] = rss(name, f"{NAME}: posts by {login}", f"{SITE}/member.html?u={login}",
                          f"New discussions started by {login}.", [discussion_item(d) for d in by_new if d["author"] == login])
    titles = {d["number"]: d["title"] for d in by_new}
    for number, post in sorted(posts.items()):
        name = f"post-{number}.xml"
        title = titles.get(number, f"Discussion {number}")
        files[name] = rss(name, f"Replies to: {title}", f"{SITE}/post.html?n={number}",
                          f"New replies to the discussion “{title}” in the {NAME}.", reply_items(number, title, post))
    files["events.ics"] = ics_calendar(f"{NAME} events", "Talks, clinics, and meetups posted in the community.", "Events", event_entries(by_new))
    files["deadlines.ics"] = ics_calendar(f"{NAME} deadlines", "Deadlines of calls, grants, and positions posted in the community, with reminders 7 days and 1 day before.",
                                          "Deadlines", deadline_entries(by_new))
    return files


def write_feeds(discussions, posts):
    FEEDS.mkdir(exist_ok=True)
    plan = feed_plan(discussions, posts)
    changed = 0
    for name, data in plan.items():
        changed += write_if_changed(FEEDS / name, data)
    for old in FEEDS.iterdir():
        if old.is_file() and old.suffix in (".xml", ".ics") and old.name not in plan:
            old.unlink()
            changed += 1
    return changed


def sitemap_text(discussions, posts):
    urls = [f"  <url><loc>{SITE}/{p}</loc></url>" for p in STATIC_PAGES]
    urls += [f"  <url><loc>{SITE}/theme.html?t={t['slug']}</loc></url>" for t in TAXONOMY["themes"]]
    for d in sorted(discussions, key=lambda d: d["number"]):
        if d["number"] in posts:
            urls.append(f"  <url><loc>{SITE}/post.html?n={d['number']}</loc><lastmod>{when(d['updatedAt']):%Y-%m-%d}</lastmod></url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(urls) + "\n</urlset>\n")


def fetch(owner, name, token):
    nodes, after = [], None
    while len(nodes) < MAX_DISCUSSIONS:
        payload = json.dumps({"query": QUERY, "variables": {"owner": owner, "name": name, "after": after}}).encode()
        req = urllib.request.Request("https://api.github.com/graphql", data=payload, headers={
            "Authorization": f"bearer {token}", "Content-Type": "application/json", "User-Agent": "ccc-discussions-export"})
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
        if out.get("errors"):
            sys.exit("GraphQL error: " + json.dumps(out["errors"])[:500])
        page = out["data"]["repository"]["discussions"]
        nodes += page["nodes"]
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return nodes


def main():
    if "--check-templates" in sys.argv:
        return check_templates()
    label_maps, _ = load_templates()
    if "--from-file" in sys.argv:
        raw = json.loads(pathlib.Path(sys.argv[sys.argv.index("--from-file") + 1]).read_text(encoding="utf-8"))
        nodes = raw["data"]["repository"]["discussions"]["nodes"] if "data" in raw else raw
    else:
        token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
        repo = os.environ.get("GITHUB_REPOSITORY", "citycomputingcollective/citycomputingcollective.github.io")
        if not token:
            sys.exit("Set GH_TOKEN or GITHUB_TOKEN")
        owner, name = repo.split("/", 1)
        nodes = fetch(owner, name, token)

    pairs = [(n, reduce(n, label_maps)) for n in nodes if n.get("category")]
    discussions = [item for _, item in pairs]
    posts = {}
    for node, item in pairs:
        data = post_file(node, item)
        if data is not None:
            posts[node["number"]] = data
    posts_changed = write_posts(posts)
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    data_changed = previous.get("discussions") != discussions or posts_changed or "--force" in sys.argv
    if data_changed:
        out = {
            "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "discussions": discussions,
        }
        OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    feeds_changed = write_feeds(discussions, posts)
    site_changed = write_if_changed(SITEMAP, sitemap_text(discussions, posts))
    if data_changed:
        print(f"updated: {len(discussions)} discussions, {len(posts)} post files, feeds and sitemap")
    elif feeds_changed or site_changed:
        print(f"unchanged ({len(discussions)} discussions); feeds or sitemap rewritten")
    else:
        print(f"unchanged ({len(discussions)} discussions)")


if __name__ == "__main__":
    main()
