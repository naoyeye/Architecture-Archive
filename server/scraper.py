"""Shared article model, site dispatch, and Dezeen HTML parsing."""
from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from markdownify import markdownify as md


# Containers we strip from the article body before turning it into markdown.
# `<img>` and `<figure>` are NOT in this list anymore — figures are first
# rewritten into inline markdown image references with their caption.
REMOVE_SELECTORS = [
    ".related-in-article-wrapper",
    ".read-more",
    "script",
    "style",
    "noscript",
]


@dataclass
class Image:
    url: str
    caption: Optional[str] = None
    local_filename: str = ""  # set by _extract_images() once order is known


@dataclass
class ParsedArticle:
    url: str
    title: str
    building: str
    studio: str
    images: List[Image] = field(default_factory=list)
    content_md: str = ""

    @property
    def dir_name(self) -> str:
        """Build the output directory name.

        Standard layout (single project): `<building> - <studio> - <url-path>`.
        Roundup / lookbook layout (no single named project, `studio` is empty):
            `<building> - <url-path>` (two segments).
        """
        path = urlparse(self.url).path.strip("/")
        path_part = path.replace("/", "-") if path else "index"
        if (self.studio or "").strip():
            return _safe_filename(f"{self.building} - {self.studio} - {path_part}")
        return _safe_filename(f"{self.building} - {path_part}")


_INVALID_FS_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_filename(s: str) -> str:
    s = _INVALID_FS_CHARS.sub("-", s).strip()
    s = re.sub(r"\s+", " ", s)
    return s[:200]


def _clean_text(s: Optional[str]) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def _extract_title(soup: BeautifulSoup) -> str:
    """Prefer the article-scoped h1 over the global Dezeen-Magazine logo h1."""
    for sel in ("article h1", "main h1", ".article-header h1"):
        h1 = soup.select_one(sel)
        if h1 and h1.get_text(strip=True):
            return _clean_text(h1.get_text())
    og = soup.select_one('meta[property="og:title"]')
    if og and og.get("content"):
        return _clean_text(og["content"])
    title = soup.select_one("title")
    return _clean_text(title.get_text()) if title else "Untitled"


_BY_RE = re.compile(r"^(?P<b>.+?)\s+by\s+(?P<s>.+?)$", flags=re.I)
# Words that signal we're looking at a sub-image (plan/section/elevation/...).
_SUBJECT_PREFIX_RE = re.compile(
    r"^(plan|section|elevation|axonometric|diagram|sketch|drawing|render|rendering|"
    r"detail|interior|exterior|view|photo|photograph|model|aerial)s?\s+(of|for)\s+",
    flags=re.I,
)


# Words inside the URL slug that signal the article is a roundup/lookbook
# (not a single-project profile), so we should NOT try to mine "X by Y" from
# image alts — those would belong to one of the highlighted projects.
_ROUNDUP_URL_HINTS = {
    "lookbooks", "lookbook", "roundups", "roundup",
    "best-of", "highlights", "guide", "guides",
    "top-five", "top-ten", "top-architecture",
}


def _looks_like_roundup(title: str, url: str) -> bool:
    slug_words = set(re.split(r"[/\-]+", urlparse(url).path.lower()))
    if slug_words & _ROUNDUP_URL_HINTS:
        return True
    # No "by" in title and starts with a count word -> almost always a roundup.
    if re.match(r"^\s*(?:\d+|seven|eight|nine|ten|six|five|four|three|two)\s+",
                title, flags=re.I) and " by " not in title.lower():
        return True
    return False


def _roundup_studio(url: str) -> str:
    """For roundup articles, use the trailing slug word as the 'studio' label."""
    slug = urlparse(url).path.strip("/").split("/")[-1]
    last = slug.split("-")[-1] if slug else ""
    mapping = {
        "lookbooks": "Lookbooks", "lookbook": "Lookbook",
        "roundups": "Roundup",   "roundup": "Roundup",
        "guide": "Guide",        "guides": "Guide",
        "highlights": "Highlights",
    }
    return mapping.get(last.lower(), "Dezeen")


def _split_building_studio(title: str, url: str, soup: BeautifulSoup) -> tuple[str, str]:
    """
    Strategy:
      0. If the article looks like a roundup/lookbook (no single project),
         use (title, "<Lookbooks|Roundup|...>") to avoid picking a random
         highlighted project as the "building".
      1. Scan `<X> by <Y>` patterns in img alt / element titles inside the
         article; take the most common pair (Dezeen repeats it 10+ times).
      2. Fall back to splitting the article h1 with the same regex.
      3. Fall back to (h1, "Unknown Studio").
    """
    cleaned_title = re.sub(r"\s*[\|\-–—]\s*Dezeen\s*$", "", title, flags=re.I).strip()

    if _looks_like_roundup(cleaned_title, url):
        return cleaned_title or "Untitled", _roundup_studio(url)

    article_root = soup.select_one("article") or soup

    counter: Counter = Counter()
    for el in article_root.find_all(True):
        for attr in ("alt", "title", "data-title"):
            v = (el.get(attr) or "").strip()
            if not v or len(v) > 120:
                continue
            stripped = _SUBJECT_PREFIX_RE.sub("", v)
            m = _BY_RE.match(stripped)
            if not m:
                continue
            b = _clean_text(m.group("b"))
            s = _clean_text(m.group("s"))
            # Trim trailing location qualifier from studio side.
            s = re.split(r"\s+(?:in|near|for|on|at)\s+", s, maxsplit=1, flags=re.I)[0].strip()
            if b and s and len(b) < 80 and len(s) < 80:
                counter[(b, s)] += 1

    if counter:
        (building, studio), _n = counter.most_common(1)[0]
        return building, studio

    m = _BY_RE.match(cleaned_title)
    if m:
        b = _clean_text(m.group("b"))
        s = _clean_text(m.group("s"))
        s = re.split(r"\s+(?:in|near|for|on|at)\s+", s, maxsplit=1, flags=re.I)[0].strip()
        return b, s

    return cleaned_title or "Untitled", "Unknown Studio"


# Matches Dezeen's resized variant suffix `...-1704x2272.jpg` so we can recover
# the full-resolution original URL by stripping it.
_SIZE_SUFFIX_RE = re.compile(r"-\d{2,5}x\d{2,5}(?=\.[A-Za-z0-9]{2,5}$)")
# Picks "...300w" or "...2x" tokens from a srcset entry.
_SRCSET_DESC_RE = re.compile(r"^\s*(\S+)\s+([\d.]+)([wx])\s*$")


def _largest_from_srcset(srcset: str) -> Optional[str]:
    """Return the URL with the highest descriptor in a srcset string."""
    if not srcset:
        return None
    best_url: Optional[str] = None
    best_score = -1.0
    for entry in srcset.split(","):
        m = _SRCSET_DESC_RE.match(entry)
        if not m:
            url = entry.strip()
            if url and best_score < 0:
                best_url = url
            continue
        url, num_str, unit = m.group(1), m.group(2), m.group(3)
        try:
            num = float(num_str)
        except ValueError:
            continue
        # Treat `x` as smaller than `w`-based sizes only by relative scale; both
        # work here because we only compare within one srcset.
        score = num if unit == "w" else num * 1000
        if score > best_score:
            best_score = score
            best_url = url
    return best_url


def _strip_size_suffix(url: str) -> str:
    """`foo-1704x2272.jpg` -> `foo.jpg`. Also strips WordPress' `-scaled.jpg`."""
    out = _SIZE_SUFFIX_RE.sub("", url)
    out = re.sub(r"-scaled(?=\.[A-Za-z0-9]{2,5}$)", "", out)
    return out


def _ext_from_url(url: str, fallback: str = ".jpg") -> str:
    path = urlparse(url).path
    _, ext = os.path.splitext(path)
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}:
        return ext
    return fallback


def _safe_caption_for_filename(caption: str, max_len: int = 80) -> str:
    s = _INVALID_FS_CHARS.sub("-", caption)
    s = re.sub(r"\s+", " ", s).strip().strip("._- ")
    if len(s) > max_len:
        s = s[:max_len].rstrip().rstrip(".,;:-")
    return s


def _figure_image_url(fig) -> Optional[str]:
    """Resolve a body-figure to its largest, canonicalized URL."""
    img = fig.find("img")
    if not img:
        return None
    url = _largest_from_srcset(img.get("srcset") or "") or (img.get("src") or "").strip()
    if not url:
        return None
    return _strip_size_suffix(url)


def _extract_images(soup: BeautifulSoup) -> List[Image]:
    """
    Walk the article in document order:
      1. `article > header figure` -> largest img + figcaption (with caption)
      2. `.main-article-body figure` -> largest img + figcaption (with caption)
      3. `.extra-lightbox-images [data-lightboximage]` (no caption)

    Images are deduped by canonicalized URL, so an image present in both the
    body and the lightbox gallery is downloaded once and reused.
    Each Image gets a `local_filename` assigned in numeric order.
    """
    images: List[Image] = []
    seen: Dict[str, Image] = {}  # canonical url -> Image

    article = soup.select_one("article")
    if article:
        header = article.find("header", recursive=False)
        if header is None:
            header = article.find("header")
        for fig in header.select("figure") if header else []:
            url = _figure_image_url(fig)
            if not url or url in seen:
                continue
            cap_el = fig.find("figcaption")
            caption = _clean_text(cap_el.get_text(" ", strip=True)) if cap_el else None
            obj = Image(url=url, caption=caption or None)
            seen[url] = obj
            images.append(obj)

    body = soup.select_one(".main-article-body")
    if body:
        for fig in body.select("figure"):
            url = _figure_image_url(fig)
            if not url or url in seen:
                continue
            cap_el = fig.find("figcaption")
            caption = _clean_text(cap_el.get_text(" ", strip=True)) if cap_el else None
            obj = Image(url=url, caption=caption or None)
            seen[url] = obj
            images.append(obj)

    container = soup.select_one(".extra-lightbox-images")
    if container:
        for el in container.select("[data-lightboximage]"):
            raw = (el.get("data-lightboximage") or "").strip()
            if not raw:
                continue
            canon = _strip_size_suffix(raw)
            if canon in seen:
                continue
            obj = Image(url=raw, caption=None)
            seen[canon] = obj
            images.append(obj)

    width = max(2, len(str(len(images))))
    for i, img in enumerate(images, start=1):
        ext = _ext_from_url(img.url)
        prefix = str(i).zfill(width)
        if img.caption:
            cap = _safe_caption_for_filename(img.caption)
            img.local_filename = f"{prefix} - {cap}{ext}" if cap else f"{prefix}{ext}"
        else:
            img.local_filename = f"{prefix}{ext}"

    return images


# NOTE: must contain only chars that markdownify does not escape (no _ * etc.)
_PLACEHOLDER_RE = re.compile(r"@@ARCHIVEIMG(\d+)@@")


def _md_escape_alt(s: str) -> str:
    """Escape brackets that would break `![alt](url)` syntax."""
    return (s or "").replace("\\", "\\\\").replace("[", "\\[").replace("]", "\\]")


def _md_image_block(local_filename: str, caption: str) -> str:
    """Build the final markdown for one figure.

    Uses CommonMark angle-bracket form `<...>` so that spaces in the local
    filename remain valid in the URL.
    """
    alt = _md_escape_alt(caption) if caption else ""
    out = f"![{alt}](<images/{local_filename}>)"
    if caption:
        out += f"\n\n*{caption}*"
    return out


def _rewrite_figures_to_placeholders(
    body_copy: BeautifulSoup,
    url_to_local: Dict[str, str],
) -> List[str]:
    """In-place: replace each <figure> with `@@ARCHIVEIMG_<i>@@`, return the
    parallel list of fully-formed markdown blocks to substitute back later.
    """
    from bs4 import NavigableString

    blocks: List[str] = []
    for fig in list(body_copy.select("figure")):
        url = _figure_image_url(fig)
        if not url or url not in url_to_local:
            fig.decompose()
            continue
        cap_el = fig.find("figcaption")
        caption = _clean_text(cap_el.get_text(" ", strip=True)) if cap_el else ""
        idx = len(blocks)
        blocks.append(_md_image_block(url_to_local[url], caption))
        fig.replace_with(NavigableString(f"@@ARCHIVEIMG{idx}@@"))
    return blocks


def _extract_content_md(soup: BeautifulSoup, url_to_local: Dict[str, str]) -> str:
    body = soup.select_one(".main-article-body")
    if not body:
        return ""

    # Work on a copy so we don't mutate the parsed soup.
    body_copy = BeautifulSoup(str(body), "lxml").select_one(".main-article-body")
    if body_copy is None:
        return ""

    blocks = _rewrite_figures_to_placeholders(body_copy, url_to_local)

    for sel in REMOVE_SELECTORS:
        for el in body_copy.select(sel):
            el.decompose()

    # Drop any orphan <img> outside of figures (rare on Dezeen; avoids leaking
    # tracking pixels or share icons into the markdown).
    for el in body_copy.find_all("img"):
        el.decompose()

    # Drop empty containers left over from any decomposed nodes.
    for el in list(body_copy.find_all(["div", "section", "p"])):
        if not el.get_text(strip=True) and not el.find(["a", "br", "img"]):
            el.decompose()

    text = md(str(body_copy), heading_style="ATX")

    # Substitute the placeholders with the real markdown image blocks. We pad
    # with blank lines so the image renders as its own paragraph.
    def _sub(m: re.Match) -> str:
        i = int(m.group(1))
        return f"\n\n{blocks[i]}\n\n" if 0 <= i < len(blocks) else ""

    text = _PLACEHOLDER_RE.sub(_sub, text)

    # Collapse 3+ blank lines to 2.
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text


def parse_dezeen_article(url: str, html: str) -> ParsedArticle:
    soup = BeautifulSoup(html, "lxml")
    title = _extract_title(soup)
    building, studio = _split_building_studio(title, url, soup)
    images = _extract_images(soup)
    # Build a canonical-URL -> local-filename map so we can rewrite body figures.
    url_to_local: Dict[str, str] = {}
    for img in images:
        url_to_local[_strip_size_suffix(img.url)] = img.local_filename
    content_md = _extract_content_md(soup, url_to_local)
    return ParsedArticle(
        url=url,
        title=title,
        building=building,
        studio=studio,
        images=images,
        content_md=content_md,
    )


def supported_article_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.username or parsed.password:
        return False
    if parsed.netloc in {"www.dezeen.com", "dezeen.com"}:
        return bool(parsed.path.strip("/"))
    if parsed.netloc == "archello.com":
        return bool(re.fullmatch(r"/project/[^/]+/?", parsed.path))
    if parsed.netloc == "www.archdaily.com":
        return bool(re.fullmatch(r"/[0-9]+/[^/]+/?", parsed.path))
    return parsed.netloc == "www.dwell.com" and bool(
        re.fullmatch(r"/(?:home|article)/[^/]+/?", parsed.path)
    )


def parse_article(url: str, html: str = "", article_data=None) -> ParsedArticle:
    if not supported_article_url(url):
        raise ValueError("Only Dezeen, Dwell home/article, Archello project and ArchDaily /<id>/<slug> pages are supported")
    if urlparse(url).hostname in {"www.dwell.com", "archello.com", "www.archdaily.com"}:
        from article_payload import parse_article_payload
        return parse_article_payload(url, article_data)
    return parse_dezeen_article(url, html)
