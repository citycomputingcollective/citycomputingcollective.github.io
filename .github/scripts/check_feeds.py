#!/usr/bin/env python3
"""Check the generated feeds, calendars, and sitemap, and that follow.html links every feed.

    python .github/scripts/check_feeds.py            # check the repository
    python .github/scripts/check_feeds.py --root DIR # check another copy (for example a test export)

RSS files (feeds/*.xml) must parse as XML and have: rss 2.0, a channel with title, absolute link,
description, language, an atom:link rel=self; items with title, absolute link, a guid that is unique
in the file, and a pubDate in RFC 822 form with GMT; newest first; at most 50 items; lastBuildDate
equal to the newest item (and absent when there are none).

Calendar files (feeds/*.ics) must have CRLF line endings only, lines of at most 75 octets, balanced
BEGIN/END, the calendar properties and events properties the subscription needs, unique UIDs,
all-day dates with an exclusive end, and, for deadlines, two VALARM blocks.

Exits with status 1 and prints every problem when something fails.
"""
import datetime as dt
import email.utils
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

args = sys.argv[1:]
ROOT = pathlib.Path(args[args.index("--root") + 1]).resolve() if "--root" in args else pathlib.Path(__file__).resolve().parents[2]
FEEDS = ROOT / "feeds"
ATOM = "{http://www.w3.org/2005/Atom}"
RFC822 = re.compile(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$")
problems = []


def bad(where, msg):
    problems.append(f"{where}: {msg}")


def absolute(url):
    return bool(re.match(r"^https?://[^/\s]+", url or ""))


def parse_date(text):
    try:
        return email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None


def check_rss(path):
    where = f"feeds/{path.name}"
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as err:
        return bad(where, f"not well-formed XML ({err})")
    if root.tag != "rss" or root.get("version") != "2.0":
        return bad(where, "root element is not <rss version=\"2.0\">")
    channel = root.find("channel")
    if channel is None:
        return bad(where, "missing <channel>")
    for tag in ("title", "link", "description", "language"):
        el = channel.find(tag)
        if el is None or not (el.text or "").strip():
            bad(where, f"channel has no <{tag}>")
    if not absolute((channel.findtext("link") or "").strip()):
        bad(where, "channel link is not absolute")
    if (channel.findtext("language") or "") != "en":
        bad(where, "channel language is not en")
    selfs = [a for a in channel.findall(f"{ATOM}link") if a.get("rel") == "self"]
    if len(selfs) != 1 or selfs[0].get("type") != "application/rss+xml":
        bad(where, "needs exactly one <atom:link rel=\"self\" type=\"application/rss+xml\">")
    elif not selfs[0].get("href", "").endswith("/feeds/" + path.name) or not absolute(selfs[0].get("href")):
        bad(where, "atom:link self does not point to this file")
    items = channel.findall("item")
    if len(items) > 50:
        bad(where, f"{len(items)} items (more than 50)")
    guids, dates = set(), []
    for n, item in enumerate(items, 1):
        for tag in ("title", "link", "guid", "pubDate", "description"):
            el = item.find(tag)
            if el is None or not (el.text or "").strip():
                bad(where, f"item {n} has no <{tag}>")
        if not absolute((item.findtext("link") or "").strip()):
            bad(where, f"item {n} link is not absolute")
        if re.search(r"<[A-Za-z/!]", item.findtext("description") or ""):
            bad(where, f"item {n} description contains live HTML (user text must be escaped)")
        guid = (item.findtext("guid") or "").strip()
        if guid in guids:
            bad(where, f"duplicate guid {guid}")
        guids.add(guid)
        guid_el = item.find("guid")
        if guid_el is not None and guid_el.get("isPermaLink") == "true" and not absolute(guid):
            bad(where, f"item {n} guid is marked permalink but is not a URL")
        stamp = (item.findtext("pubDate") or "").strip()
        if not RFC822.match(stamp) or parse_date(stamp) is None:
            bad(where, f"item {n} pubDate is not RFC 822 GMT: {stamp!r}")
        else:
            dates.append(parse_date(stamp))
    if dates != sorted(dates, reverse=True):
        bad(where, "items are not newest first")
    build = channel.findtext("lastBuildDate")
    if items and dates:
        if not build or parse_date(build.strip()) != dates[0]:
            bad(where, "lastBuildDate is not the newest item date")
    elif build:
        bad(where, "empty feed should not have lastBuildDate")


def check_ics(path):
    where = f"feeds/{path.name}"
    raw = path.read_bytes()
    if b"\n" in raw.replace(b"\r\n", b""):
        bad(where, "has a line ending that is not CRLF")
    if not raw.endswith(b"\r\n"):
        bad(where, "does not end with CRLF")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return bad(where, "not UTF-8")
    physical = text.split("\r\n")[:-1]
    for n, line in enumerate(physical, 1):
        if len(line.encode("utf-8")) > 75:
            bad(where, f"line {n} is longer than 75 octets")
    lines = []
    for line in physical:  # unfold
        if line.startswith((" ", "\t")) and lines:
            lines[-1] += line[1:]
        else:
            lines.append(line)
    stack, events, cal_props, uids = [], [], {}, set()
    current = None
    for line in lines:
        name, _, value = line.partition(":")
        key = name.split(";")[0].upper()
        if key == "BEGIN":
            stack.append(value)
            if value == "VEVENT":
                current = {"props": {}, "alarms": 0}
                events.append(current)
            elif value == "VALARM" and current is not None:
                current["alarms"] += 1
        elif key == "END":
            if not stack or stack.pop() != value:
                return bad(where, f"END:{value} does not match a BEGIN")
            if value == "VEVENT":
                current = None
        elif len(stack) == 1:
            cal_props[key] = value
        elif len(stack) == 2 and stack[-1] == "VEVENT" and current is not None:
            current["props"][key] = (name, value)
    if stack:
        bad(where, f"unclosed {stack[-1]}")
    if not lines or lines[0] != "BEGIN:VCALENDAR" or lines[-1] != "END:VCALENDAR":
        bad(where, "must start with BEGIN:VCALENDAR and end with END:VCALENDAR")
    for key, expect in (("VERSION", "2.0"), ("CALSCALE", "GREGORIAN"), ("METHOD", "PUBLISH")):
        if cal_props.get(key) != expect:
            bad(where, f"{key} should be {expect}")
    for key in ("PRODID", "X-WR-CALNAME", "X-WR-CALDESC", "REFRESH-INTERVAL", "X-PUBLISHED-TTL"):
        if not cal_props.get(key):
            bad(where, f"missing {key}")
    for n, ev in enumerate(events, 1):
        p = ev["props"]
        for key in ("UID", "DTSTAMP", "LAST-MODIFIED", "DTSTART", "DTEND", "SUMMARY", "DESCRIPTION", "URL"):
            if key not in p:
                bad(where, f"event {n} is missing {key}")
        uid = p.get("UID", ("", ""))[1]
        if uid in uids:
            bad(where, f"duplicate UID {uid}")
        uids.add(uid)
        if p.get("DTSTAMP", ("", ""))[1] != p.get("LAST-MODIFIED", ("", "x"))[1]:
            bad(where, f"event {n}: DTSTAMP and LAST-MODIFIED differ")
        start, end = p.get("DTSTART"), p.get("DTEND")
        if start and end:
            if "VALUE=DATE" not in start[0] or "VALUE=DATE" not in end[0]:
                bad(where, f"event {n} is not an all-day event")
            else:
                try:
                    s = dt.datetime.strptime(start[1], "%Y%m%d").date()
                    e = dt.datetime.strptime(end[1], "%Y%m%d").date()
                    if e - s != dt.timedelta(days=1):
                        bad(where, f"event {n}: DTEND should be the day after DTSTART")
                except ValueError:
                    bad(where, f"event {n}: bad date")
        if not absolute(p.get("URL", ("", ""))[1]):
            bad(where, f"event {n} URL is not absolute")
        if path.name == "deadlines.ics":
            if not p.get("SUMMARY", ("", ""))[1].startswith("Deadline: "):
                bad(where, f"event {n} SUMMARY should start with 'Deadline: '")
            if ev["alarms"] != 2:
                bad(where, f"event {n} should have two VALARM blocks")


def check_sitemap():
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return bad("sitemap.xml", "missing")
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as err:
        return bad("sitemap.xml", f"not well-formed XML ({err})")
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    locs = [u.findtext(f"{ns}loc") or "" for u in root.findall(f"{ns}url")]
    if len(locs) != len(set(locs)):
        bad("sitemap.xml", "duplicate URLs")
    for loc in locs:
        if not loc.startswith("https://citycomputingcollective.com/"):
            bad("sitemap.xml", f"unexpected URL {loc}")
    if "https://citycomputingcollective.com/follow.html" not in locs:
        bad("sitemap.xml", "follow.html is missing")
    for u in root.findall(f"{ns}url"):
        last = u.findtext(f"{ns}lastmod")
        if last and not re.match(r"^\d{4}-\d{2}-\d{2}$", last):
            bad("sitemap.xml", f"bad lastmod {last}")


def check_follow_page():
    """Every feed the exporter writes for a whole list must be offered on follow.html."""
    page = ROOT / "follow.html"
    if not page.exists():
        return bad("follow.html", "missing")
    text = page.read_text(encoding="utf-8")
    taxonomy = json.loads((ROOT / "data" / "taxonomy.json").read_text(encoding="utf-8"))
    wanted = ["all.xml", "unanswered.xml", "resources.xml", "events.ics", "deadlines.ics"]
    wanted += [f"category-{c['slug']}.xml" for c in taxonomy["categories"]]
    for name in wanted:
        if f"feeds/{name}" not in text:
            bad("follow.html", f"does not link feeds/{name}")
    for t in taxonomy["themes"]:
        if f"feeds/theme-{t['slug']}.xml" not in text:
            bad("follow.html", f"does not link the network feed for theme {t['slug']}")
    for name in wanted:
        if not (FEEDS / name).exists():
            bad(f"feeds/{name}", "missing, but advertised on follow.html")
    for t in taxonomy["themes"]:
        if not (FEEDS / f"theme-{t['slug']}.xml").exists():
            bad(f"feeds/theme-{t['slug']}.xml", "missing")


def check_local_feed_links():
    """Feed files that pages point at by relative URL must exist (a link must never 404)."""
    for page in sorted(ROOT.glob("*.html")):
        text = page.read_text(encoding="utf-8")
        for ref in set(re.findall(r"""(?:href|data-follow-feed|data-follow-ics)=["'](?:/)?(feeds/[A-Za-z0-9_.-]+)["']""", text)):
            if not (ROOT / ref).exists():
                bad(page.name, f"links {ref}, which does not exist")


def main():
    files = sorted(FEEDS.glob("*")) if FEEDS.exists() else []
    if not files:
        bad("feeds/", "no feed files")
    for path in files:
        if path.suffix == ".xml":
            check_rss(path)
        elif path.suffix == ".ics":
            check_ics(path)
        else:
            bad(f"feeds/{path.name}", "unexpected file type")
    for required in ("all.xml", "events.ics", "deadlines.ics", "unanswered.xml", "resources.xml"):
        if not (FEEDS / required).exists():
            bad(f"feeds/{required}", "missing")
    check_sitemap()
    check_follow_page()
    check_local_feed_links()
    if problems:
        print("\n".join(problems))
        print(f"\n{len(problems)} problem(s)")
        sys.exit(1)
    print(f"OK: {len(files)} feed files, sitemap, and follow.html pass")


if __name__ == "__main__":
    main()
