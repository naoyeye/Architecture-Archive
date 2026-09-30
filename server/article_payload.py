"""Validate article snapshots and render Markdown without site DOM selectors."""
from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse, urlunparse

from bs4 import BeautifulSoup
from markdownify import markdownify

from scraper import Image, ParsedArticle, _ext_from_url

SECTION_TITLES = {"Project information", "Credits", "Details", "Tags"}
ROOT_FIELDS = {
    "schema_version", "source", "url", "title", "building", "studio", "body",
    "sections", "expected_photo_count", "photos", "warnings",
}


def original_image_url(raw: str) -> str:
    parsed = urlparse(raw)
    if parsed.hostname == "go.skimresources.com":
        parsed = urlparse(parse_qs(parsed.query).get("url", [""])[0])
    if (parsed.scheme != "https" or parsed.netloc not in {
        "images.dwell.com", "images2.dwell.com"
    } or not re.fullmatch(
        r"/photos/\d+/\d+/original\.(jpg|jpeg|png|webp|avif)", parsed.path
    )):
        raise ValueError("Dwell image must use an original URL on the image CDN")
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))


def archello_original_image_url(raw: str) -> str:
    parsed = urlparse(raw)
    if (parsed.scheme != "https"
            or parsed.netloc != "archello.s3.eu-central-1.amazonaws.com"
            or parsed.query or parsed.fragment
            or not re.fullmatch(
                r"/images/\d{4}/\d{2}/\d{2}/[^/%\\]+\.(jpg|jpeg|png|webp|avif)",
                parsed.path, re.IGNORECASE,
            )):
        raise ValueError("Archello image must use a confirmed original URL on its image CDN")
    return raw


def archdaily_large_image_url(raw: str) -> str:
    parsed = urlparse(raw)
    if (parsed.scheme != "https" or parsed.netloc != "images.adsttc.com"
            or parsed.fragment or (parsed.query and not re.fullmatch(r"[0-9]+", parsed.query))
            or not re.fullmatch(
                r"/media/images/(?:[a-f0-9]{4}/){6}slideshow/[^/%\\]+\.(jpg|jpeg|png|webp|avif)",
                parsed.path, re.IGNORECASE,
            )):
        raise ValueError("ArchDaily image must use a confirmed slideshow URL on its image CDN")
    return raw


def _string(value, field: str, allow_empty: bool = True) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise ValueError(f"{field} must be a {'non-empty ' if not allow_empty else ''}string")
    return value


def _plain_markdown(text: str) -> str:
    return re.sub(r"([\\`*_{}\[\]<>#|])", r"\\\1", text)


def _render_text(value, field: str) -> str:
    if not isinstance(value, dict):
        raise ValueError(f"{field} must include status, format, value and source")
    status = value.get("status")
    if status == "missing":
        raise ValueError(f"{field} is unconfirmed, not an empty field")
    if not isinstance(status, str) or status not in {"present", "empty"}:
        raise ValueError(f"{field}.status is invalid")
    source = _string(value.get("source"), f"{field}.source", False)
    if not source.startswith(("state.", "dom.")):
        raise ValueError(f"{field}.source is invalid")
    text = _string(value.get("value"), f"{field}.value")
    if status == "empty" and text.strip():
        raise ValueError(f"{field} is marked empty but contains text")
    if value.get("format") == "text":
        rendered = _plain_markdown(text).strip()
    elif value.get("format") == "html":
        soup = BeautifulSoup(text, "lxml")
        for node in soup.select(
            "script, style, iframe, object, embed, button, select, input, "
            "textarea, img, svg"
        ):
            node.decompose()
        for link in soup.find_all("a", href=True):
            if urlparse(link["href"]).scheme not in {"https", "http"}:
                del link["href"]
        rendered = markdownify(str(soup), heading_style="ATX").strip()
    else:
        raise ValueError(f"{field}.format is invalid")
    if status == "present" and not rendered:
        raise ValueError(f"{field} is marked present but contains no text")
    return rendered


def _cell(text: str) -> str:
    return _plain_markdown(re.sub(r"\s+", " ", text).strip())


def parse_article_payload(url: str, data) -> ParsedArticle:
    if not isinstance(data, dict):
        raise ValueError("This site requires article JSON; update the userscript")
    if set(data) != ROOT_FIELDS:
        raise ValueError("Article JSON fields do not match schema version 1")
    if type(data["schema_version"]) is not int or data["schema_version"] != 1:
        raise ValueError("Unsupported article schema version")
    parsed = urlparse(url)
    source = {"www.dwell.com": "dwell", "archello.com": "archello", "www.archdaily.com": "archdaily"}.get(parsed.hostname)
    if source is None or data["source"] != source:
        raise ValueError("Unsupported article source")
    canonical = urlunparse((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), "", "", ""))
    if data["url"] != canonical:
        raise ValueError("Article URL does not match the requested project")
    title = _string(data["title"], "title", False)
    building = _string(data["building"], "building", False)
    studio = _string(data["studio"], "studio")
    body = _render_text(data["body"], "body")
    warnings = data["warnings"]
    if not isinstance(warnings, list) or len(warnings) > 30:
        raise ValueError("warnings must be a list with at most 30 entries")
    for warning in warnings:
        _string(warning, "warning", False)
    sections = data["sections"]
    if not isinstance(sections, list) or len(sections) > len(SECTION_TITLES):
        raise ValueError("sections must be a list of project tables")
    content = [f"## Description\n\n{body}"] if body else []
    seen_sections = set()
    for section in sections:
        if not isinstance(section, dict):
            raise ValueError("Invalid project section")
        name = _string(section.get("title"), "section.title", False)
        if name not in SECTION_TITLES or name in seen_sections:
            raise ValueError("Unknown or duplicate project section")
        seen_sections.add(name)
        rows = section.get("rows")
        if not isinstance(rows, list) or not rows or len(rows) > 200:
            raise ValueError("Section rows must contain 1 to 200 entries")
        rendered_rows = []
        for row in rows:
            if not isinstance(row, dict):
                raise ValueError("Invalid project row")
            label = _string(row.get("label"), "row.label", False)
            value = _string(row.get("value"), "row.value", False)
            rendered_rows.append(f"| {_cell(label)} | {_cell(value)} |")
        content.append(
            f"## {name}\n\n| Field | Value |\n| --- | --- |\n"
            + "\n".join(rendered_rows)
        )
    count = data["expected_photo_count"]
    photos = data["photos"]
    if type(count) is not int or not 1 <= count <= 1000:
        raise ValueError("expected_photo_count must be between 1 and 1000")
    if not isinstance(photos, list) or len(photos) != count:
        raise ValueError("Article gallery incomplete: photo count mismatch")
    seen_ids = set()
    seen_urls = set()
    images = []
    blocks = []
    width = max(2, len(str(count)))
    for index, photo in enumerate(photos, 1):
        if not isinstance(photo, dict):
            raise ValueError("Invalid photo record")
        photo_id = _string(photo.get("id"), "photo.id", False)
        raw_url = _string(photo.get("url"), "photo.url", False)
        if source == "archdaily":
            original = archdaily_large_image_url(raw_url)
            valid_id = photo_id == "".join(urlparse(original).path.split("/")[3:9])
        elif source == "archello":
            original = archello_original_image_url(raw_url)
            valid_id = photo_id == urlparse(original).path
        else:
            original = original_image_url(raw_url)
            valid_id = photo_id.isascii() and photo_id.isdigit() and urlparse(original).path.split("/")[3] == photo_id
        if not valid_id:
            raise ValueError("Photo ID does not match its original URL")
        if photo_id in seen_ids or original in seen_urls:
            raise ValueError("Duplicate photo ID or original URL")
        seen_ids.add(photo_id)
        seen_urls.add(original)
        caption = _render_text(photo.get("caption"), f"photo {photo_id} caption")
        image = Image(original, caption or None)
        image.local_filename = f"{index:0{width}d}{_ext_from_url(original)}"
        images.append(image)
        blocks.append(f"![](images/{image.local_filename})\n\n{caption}")
    content.append("## Photos\n\n" + "\n\n".join(blocks))
    return ParsedArticle(
        canonical, title, building, studio, images,
        "\n\n".join(content).rstrip() + "\n",
    )
