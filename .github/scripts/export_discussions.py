#!/usr/bin/env python3
"""Export GitHub Discussions to data/discussions.json for the website.

Each discussion is reduced to what the site needs to list, filter, and sort it:
title, link, category, author, activity, an excerpt, research themes, and a few
structured fields read from the discussion form (stage, deadline, event date...).
Introductions contribute directory fields only when the author ticked the
"People directory" box.

Usage:
    python .github/scripts/export_discussions.py                   # fetch and write if changed
    python .github/scripts/export_discussions.py --check-templates # verify templates match data/taxonomy.json
    python .github/scripts/export_discussions.py --from-file raw.json  # use a saved GraphQL response (testing)

Environment: GH_TOKEN or GITHUB_TOKEN; GITHUB_REPOSITORY (owner/name).
Requires PyYAML for reading the discussion templates.
"""
import datetime as dt
import json
import os
import pathlib
import re
import sys
import urllib.request

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "discussions.json"
TEMPLATES = ROOT / ".github" / "DISCUSSION_TEMPLATE"
TAXONOMY = json.loads((ROOT / "data" / "taxonomy.json").read_text(encoding="utf-8"))
THEMES = [t["label"] for t in TAXONOMY["themes"]]
MAX_DISCUSSIONS = 500

# Which form fields each category exposes on the site, and which field supplies the excerpt.
EXPORT = {
    "introductions": {"keep": ["role", "location"], "excerpt": "collaboration", "directory_only": True},
    "find-collaborators": {"keep": ["stage", "geography"], "excerpt": "question"},
    "project-showcase": {"keep": ["status"], "excerpt": "question"},
    "datasets-data-requests": {"keep": ["kind"], "excerpt": "use"},
    "tools-code-methods": {"keep": ["kind"], "excerpt": "problem"},
    "opportunities": {"keep": ["kind", "deadline", "official"], "excerpt": "relevance", "dates": ["deadline"]},
    "events-meetups": {"keep": ["date", "format", "registration"], "excerpt": "description", "dates": ["date"]},
    "q-a": {"keep": ["geography"], "excerpt": "context"},
}

QUERY = """
query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body createdAt updatedAt upvoteCount isAnswered locked
        category { name slug }
        author { login url avatarUrl }
        comments { totalCount }
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

    discussions = [reduce(n, label_maps) for n in nodes if n.get("category")]
    previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    if previous.get("discussions") == discussions and "--force" not in sys.argv:
        print(f"unchanged ({len(discussions)} discussions)")
        return
    out = {
        "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "discussions": discussions,
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"updated: {len(discussions)} discussions")


if __name__ == "__main__":
    main()
