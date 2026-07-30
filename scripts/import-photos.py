#!/usr/bin/env python3
"""Fetches the pictogram photos from Wikimedia Commons into public/photos/.

Why Commons rather than Unsplash: this app has to work offline, so the images
have to be bundled, not hotlinked. Unsplash's licence permits reuse, but its API
guidelines expect you to hotlink their CDN and fire a download event — which is
exactly what an offline-first app cannot do. Commons is built for
redistribution, is category-structured so a keyword actually maps to a concept,
and every file carries its licence and author in the API response, so the
attribution the licence asks for can be generated rather than hand-maintained.

Only a handful of cards get a photo at all; see src/data/photos.js for which and
why. Everything else keeps its emoji on purpose.

Run:
    python3 scripts/import-photos.py            # fetch anything missing
    python3 scripts/import-photos.py --force    # re-fetch everything

Needs network access. If yours is restricted, run the "Refresh pictogram photos"
GitHub Action instead — it runs this on a runner and commits the result.
"""

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "photos"
TABLE = ROOT / "src" / "data" / "photos.js"

API = "https://commons.wikimedia.org/w/api.php"
# Commons asks for a descriptive User-Agent that identifies the tool and a
# contact; a generic one gets throttled or blocked.
UA = "parcours-b2-photo-importer/1.0 (https://github.com/robertengineerr/french-b2)"

# Square, small, and WebP: the image is shown at ~200px in a card, so anything
# larger is bytes the phone downloads and never uses.
SIZE = 512
QUALITY = 78

# Licences we will actually ship. Ordered by preference — a public-domain file
# needs no attribution machinery at all, so it wins when quality is comparable.
LICENCE_RANK = {
    "cc0": 0,
    "pd": 0,
    "public domain": 0,
    "cc-by-4.0": 1,
    "cc-by-3.0": 1,
    "cc-by-2.0": 1,
    "cc-by-sa-4.0": 2,
    "cc-by-sa-3.0": 2,
    "cc-by-sa-2.0": 2,
}


def parse_table():
    """Reads the curated list out of the JS module.

    Keeping one source of truth in src/data/photos.js matters more than the
    small ugliness of regexing it: the app reads that file at runtime, and a
    second copy here would drift the moment someone edits one of them.
    """
    text = TABLE.read_text(encoding="utf-8")
    entries = []
    for block in re.findall(r"\{([^{}]*)\}", text, re.S):
        fields = dict(re.findall(r"(\w+):\s*'((?:[^'\\]|\\.)*)'", block))
        if "slug" in fields and "query" in fields:
            entries.append(fields)
    return entries


def api_get(params):
    params = {**params, "format": "json", "formatversion": "2"}
    url = f"{API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def licence_key(meta):
    name = (meta.get("LicenseShortName", {}).get("value") or "").strip().lower()
    return re.sub(r"\s+", "-", name)


def plain(html):
    """Commons returns author/description as HTML fragments."""
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", "", html)
    text = (
        text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    )
    return re.sub(r"\s+", " ", text).strip()


def candidates(entry):
    """Search results for one card, best licence first."""
    if entry.get("pin"):
        data = api_get(
            {
                "action": "query",
                "titles": f"File:{entry['pin']}",
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata|mime",
            }
        )
    else:
        data = api_get(
            {
                "action": "query",
                "generator": "search",
                "gsrsearch": f"filetype:bitmap {entry['query']}",
                "gsrnamespace": "6",
                "gsrlimit": "20",
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata|mime",
            }
        )

    out = []
    for page in data.get("query", {}).get("pages", []) or []:
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {}) or {}
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        w, h = info.get("width", 0), info.get("height", 0)
        # Too small to crop to 512 square, or a banner-shaped panorama that
        # loses its subject when squared.
        if min(w, h) < 600:
            continue
        if max(w, h) / max(min(w, h), 1) > 2.6:
            continue
        rank = LICENCE_RANK.get(licence_key(meta))
        if rank is None:
            continue
        out.append(
            {
                "rank": rank,
                "title": page.get("title", ""),
                "url": info.get("url"),
                "descUrl": info.get("descriptionurl"),
                "author": plain(meta.get("Artist", {}).get("value")),
                "licence": meta.get("LicenseShortName", {}).get("value", ""),
                "licenceUrl": meta.get("LicenseUrl", {}).get("value", ""),
                "pixels": w * h,
            }
        )
    # Prefer a permissive licence; within a licence tier, the bigger original.
    out.sort(key=lambda c: (c["rank"], -c["pixels"]))
    return out


def fetch_square(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
    im = Image.open(BytesIO(raw))
    im = im.convert("RGB")
    # Centre crop to square, then down to SIZE. Centre is the right guess for a
    # subject-led photo and avoids a "smart crop" dependency for eight images.
    w, h = im.size
    side = min(w, h)
    im = im.crop(
        ((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side)
    )
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-fetch images that already exist")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = parse_table()
    if not entries:
        sys.exit("No entries parsed from src/data/photos.js — check the file format.")

    credits_path = OUT_DIR / "credits.json"
    credits = {}
    if credits_path.exists():
        credits = json.loads(credits_path.read_text(encoding="utf-8")).get("photos", {})

    failed = []
    for e in entries:
        slug = e["slug"]
        dest = OUT_DIR / f"{slug}.webp"
        if dest.exists() and slug in credits and not args.force:
            print(f"  = {slug} (have it)")
            continue

        print(f"  → {slug}: searching “{e.get('pin') or e['query']}”")
        try:
            cands = candidates(e)
        except Exception as err:  # network, throttling, API shape change
            print(f"    ! search failed: {err}")
            failed.append(slug)
            continue

        picked = None
        for c in cands[:5]:
            try:
                im = fetch_square(c["url"])
            except Exception as err:
                print(f"    . skipping {c['title']}: {err}")
                continue
            im.save(dest, "WEBP", quality=QUALITY, method=6)
            picked = c
            break

        if not picked:
            print(f"    ! nothing usable for {slug}")
            failed.append(slug)
            continue

        credits[slug] = {
            "fr": e.get("fr", ""),
            "title": picked["title"],
            "author": picked["author"] or "unknown",
            "licence": picked["licence"],
            "licenceUrl": picked["licenceUrl"],
            "source": picked["descUrl"],
        }
        print(f"    ✓ {picked['title']} — {picked['licence']} ({dest.stat().st_size // 1024} KB)")

    credits_path.write_text(
        json.dumps(
            {
                "note": "Photos from Wikimedia Commons. Each entry carries the licence it "
                "ships under; the app shows this on the card.",
                "photos": credits,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )

    have = len([e for e in entries if (OUT_DIR / f"{e['slug']}.webp").exists()])
    total_kb = sum(p.stat().st_size for p in OUT_DIR.glob("*.webp")) // 1024
    print(f"\n{have}/{len(entries)} photos present, {total_kb} KB total → {OUT_DIR}")
    if failed:
        print(f"failed: {', '.join(failed)}")
        # A partial set is fine at runtime — cards without a photo fall back to
        # their emoji — but the job should say so rather than look clean.
        sys.exit(1)


if __name__ == "__main__":
    main()
