"""Refresh building/studio in already-scraped article folders via the LLM.

The first version of the scraper relied purely on `<X> by <Y>` regex
matches in image alt-text and the article H1. When that fails (e.g. a
title like "Agricultural sheds inform 'unfussy and honest' home in
New Zealand") we end up writing nonsense like `building=Posts` and
`studio=Jon Astbury` into meta.json -- which then bakes into the folder
name itself.

This script walks the existing dataset, asks the configured LLM what the
real building / studio names are, and:

  - patches `meta.json` in place
  - optionally renames the parent directory to keep
    `<building> - <studio> - <slug>` in sync (use `--rename`).

Usage examples:

    # Dry-run check on a single folder
    python refine_meta.py --dir "/path/to/Posts - Jon Astbury - 2025-..."

    # Apply changes (meta.json only) to one folder
    python refine_meta.py --dir "/path/to/..." --apply

    # Apply changes AND rename the folder
    python refine_meta.py --dir "/path/to/..." --apply --rename

    # Sweep every folder under the workspace root
    python refine_meta.py --all --apply --rename

The script never crashes on a single bad folder -- it logs and moves on.
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse, urlunparse

from dotenv import load_dotenv

from analyzer import analyze_building_studio


# Default output root mirrors the one in app.py: scraped case folders live
# under <workspace>/projects/.
DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "projects"
_INVALID_FS_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

log = logging.getLogger("refine_meta")


def _safe_filename(s: str) -> str:
    """Same sanitiser as scraper._safe_filename, kept local to avoid the import."""
    s = _INVALID_FS_CHARS.sub("-", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:200]


def _slug_from_url(url: str) -> Optional[str]:
    """Same algorithm `ParsedArticle.dir_name` uses for the trailing portion."""
    if not url:
        return None
    path = urlparse(url).path.strip("/")
    return path.replace("/", "-") if path else None


def _normalize_url(url: str) -> str:
    """Drop ?query + #fragment so meta.json stores a canonical article URL."""
    if not url:
        return url
    parsed = urlparse(url.strip())
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))


def _build_dir_name(building: str, studio: str, slug: str) -> str:
    """Recreate the directory name using the same rules as ParsedArticle.dir_name."""
    building = (building or "").strip() or "Untitled"
    studio = (studio or "").strip()
    if studio:
        return _safe_filename(f"{building} - {studio} - {slug}")
    return _safe_filename(f"{building} - {slug}")


def _read_article_md(path: Path) -> Tuple[str, str]:
    """Return (title, body_markdown) extracted from a `# Title` markdown file.

    The scraper writes:
        # <title>

        [<url>](<url>)

        <body...>
    """
    text = path.read_text(encoding="utf-8")
    title = ""
    body_lines = []
    started_body = False
    for i, line in enumerate(text.splitlines()):
        if i == 0 and line.startswith("# "):
            title = line[2:].strip()
            continue
        if not started_body:
            stripped = line.strip()
            if not stripped:
                continue
            # Skip the URL link line directly under the heading.
            if re.match(r"^\[https?://[^\]]+\]\(https?://[^)]+\)\s*$", stripped):
                continue
            started_body = True
        body_lines.append(line)
    return title, "\n".join(body_lines).strip()


def _decide_final(
    title: str,
    cur_b: str,
    cur_s: str,
    ai_b: Optional[str],
    ai_s: Optional[str],
) -> Tuple[str, str, bool]:
    """Apply the (building, studio) decision policy.

    Returns (final_building, final_studio, was_roundup_collapse).

    Policy:
      - LLM returns a building -> use it. Studio uses LLM value when
        provided, otherwise keep the existing one (rather than wiping it).
      - LLM returns building=None AND studio=None -> the article truly
        covers multiple projects (roundup / lookbook / digest). Use the
        article title as `building` and clear `studio` so the directory
        collapses to a two-segment `<title> - <slug>` layout.
      - LLM returns building=None but studio is non-null -> defensive
        fallback. The prompt explicitly tells the model that single-project
        articles must have a non-null building, so this branch only fires
        when the model misbehaves. Treat it as a single project: use the
        article title as `building` and keep the LLM's studio so the
        directory still uses the three-segment layout.
    """
    if ai_b is None and ai_s is None:
        return title.strip() or cur_b, "", True
    if ai_b is None and ai_s:
        # Defensive: model didn't give a project name; fall back to the
        # title but keep the studio so the layout is still <b> - <s> - <slug>.
        return title.strip() or cur_b, ai_s, False
    final_b = ai_b or (title.strip() or cur_b)
    final_s = ai_s if ai_s is not None else cur_s
    return final_b, final_s, False


def _refine_one(
    folder: Path,
    apply_changes: bool,
    rename: bool,
) -> None:
    meta_path = folder / "meta.json"
    article_path = folder / "article.md"
    if not meta_path.exists() or not article_path.exists():
        log.info("[skip] %s: missing meta.json or article.md", folder.name)
        return

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("[skip] %s: bad meta.json (%s)", folder.name, e)
        return

    title = (meta.get("title") or "").strip()
    body_title, body = _read_article_md(article_path)
    if not title:
        title = body_title
    if not body:
        log.warning("[skip] %s: empty article.md body", folder.name)
        return

    cur_b = (meta.get("building") or "").strip()
    cur_s = (meta.get("studio") or "").strip()
    cur_url = (meta.get("url") or "").strip()
    new_url = _normalize_url(cur_url)
    slug = _slug_from_url(new_url)
    url_changed = bool(cur_url) and (cur_url != new_url)

    log.info("[scan] %s", folder.name)
    log.info("       current: building=%r studio=%r", cur_b, cur_s)
    if url_changed:
        log.info("       url: %s", cur_url)
        log.info("        ->  %s", new_url)

    new_b, new_s = analyze_building_studio(title, body)
    log.info("       LLM:     building=%r studio=%r", new_b, new_s)

    final_b, final_s, collapsed = _decide_final(title, cur_b, cur_s, new_b, new_s)
    if collapsed:
        log.info("       (合辑文章: 折叠为两段目录名)")

    bs_changed = (final_b != cur_b) or (final_s != cur_s)
    if not bs_changed and not url_changed:
        log.info("       -> no change")
        return

    if not apply_changes:
        if bs_changed:
            log.info("       -> would write building=%r studio=%r (dry-run)", final_b, final_s)
        if url_changed:
            log.info("       -> would strip url query (dry-run)")
        if rename and slug and bs_changed:
            new_dir = folder.with_name(_build_dir_name(final_b, final_s, slug))
            if new_dir != folder:
                log.info("       -> would rename to %s", new_dir.name)
        return

    if bs_changed:
        meta["building"] = final_b
        meta["studio"] = final_s
    if url_changed:
        meta["url"] = new_url
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    bits = []
    if bs_changed:
        bits.append("building/studio")
    if url_changed:
        bits.append("url")
    log.info("       -> meta.json updated (%s)", ", ".join(bits))

    if rename and bs_changed:
        if not slug:
            log.warning("       -> cannot rename: meta.json has no usable url")
            return
        new_dir = folder.with_name(_build_dir_name(final_b, final_s, slug))
        if new_dir == folder:
            log.info("       -> rename: target name already matches")
        elif new_dir.exists():
            log.warning("       -> rename target already exists, skipping: %s", new_dir.name)
        else:
            folder.rename(new_dir)
            log.info("       -> renamed to %s", new_dir.name)


def _iter_article_dirs(root: Path):
    for entry in sorted(root.iterdir()):
        if not entry.is_dir():
            continue
        if (entry / "meta.json").exists() and (entry / "article.md").exists():
            yield entry


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--dir", type=Path, help="Refine a single article folder")
    g.add_argument("--all", action="store_true", help="Walk every article folder under --root")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help=f"Workspace root (default: {DEFAULT_ROOT})")
    parser.add_argument("--apply", action="store_true", help="Actually write meta.json (default is dry-run)")
    parser.add_argument("--rename", action="store_true", help="Also rename the folder when --apply is set")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose logging")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(message)s",
    )

    # Loads server/.env so DEEPSEEK_API_KEY etc. are populated even when the
    # script is invoked outside `python app.py`'s process.
    load_dotenv(Path(__file__).with_name(".env"))

    if args.dir:
        folder = args.dir.expanduser().resolve()
        if not folder.is_dir():
            log.error("not a directory: %s", folder)
            return 2
        _refine_one(folder, apply_changes=args.apply, rename=args.rename)
        return 0

    root = args.root.expanduser().resolve()
    if not root.is_dir():
        log.error("workspace root not found: %s", root)
        return 2
    n = 0
    for folder in _iter_article_dirs(root):
        n += 1
        try:
            _refine_one(folder, apply_changes=args.apply, rename=args.rename)
        except Exception as e:
            log.exception("error processing %s: %s", folder.name, e)
    log.info("scanned %d folders", n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
