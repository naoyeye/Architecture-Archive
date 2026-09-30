"""Stream-download original images.

Items must expose `url` and `local_filename` attributes (e.g. `scraper.Image`).
Filenames are pre-computed by the scraper so a single source of truth maps
between markdown image references and on-disk files.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Callable, Iterable, List, Optional

from urllib.parse import urlparse

import requests


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.dezeen.com/",
}


ProgressCb = Callable[[int, int, str], None]
"""Progress callback: (current_index_1based, total, last_filename)."""
CancelCb = Callable[[], bool]


log = logging.getLogger(__name__)


def _download_one(
    url: str, target: Path, timeout: int, attempts: int = 4, should_cancel: Optional[CancelCb] = None
) -> None:
    """Stream-download `url` to `target`, retrying on transient network errors."""
    last_err: Optional[Exception] = None
    for i in range(attempts):
        if should_cancel and should_cancel():
            raise RuntimeError("Job cancelled by user")
        try:
            headers = dict(DEFAULT_HEADERS)
            if urlparse(url).hostname in {"images.dwell.com", "images2.dwell.com"}:
                headers["Referer"] = "https://www.dwell.com/"
            elif urlparse(url).hostname == "archello.s3.eu-central-1.amazonaws.com":
                headers["Referer"] = "https://archello.com/"
            elif urlparse(url).hostname == "images.adsttc.com":
                headers["Referer"] = "https://www.archdaily.com/"
            with requests.get(url, headers=headers, stream=True, timeout=timeout) as r:
                r.raise_for_status()
                if not r.headers.get("Content-Type", "").lower().startswith("image/"):
                    raise ValueError("Original image URL did not return an image")
                tmp = target.with_suffix(target.suffix + ".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        if should_cancel and should_cancel():
                            raise RuntimeError("Job cancelled by user")
                        if chunk:
                            f.write(chunk)
                tmp.replace(target)
            return
        except (requests.exceptions.SSLError,
                requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.ChunkedEncodingError) as e:
            last_err = e
            log.warning("download retry %d/%d for %s: %s", i + 1, attempts, url, e)
            end = time.time() + (0.5 * (2 ** i))
            while time.time() < end:
                if should_cancel and should_cancel():
                    raise RuntimeError("Job cancelled by user")
                time.sleep(0.1)
        except requests.exceptions.HTTPError as e:
            # 4xx -> don't retry. 5xx -> retry.
            status = getattr(e.response, "status_code", 0)
            if status and 500 <= status < 600:
                last_err = e
                log.warning("download retry %d/%d (HTTP %d) for %s", i + 1, attempts, status, url)
                end = time.time() + (0.5 * (2 ** i))
                while time.time() < end:
                    if should_cancel and should_cancel():
                        raise RuntimeError("Job cancelled by user")
                    time.sleep(0.1)
            else:
                raise
    assert last_err is not None
    raise last_err


def download_images(
    items: Iterable,
    out_dir: Path,
    on_progress: Optional[ProgressCb] = None,
    should_cancel: Optional[CancelCb] = None,
    timeout: int = 30,
) -> List[Path]:
    """Download images preserving order, using each item's `local_filename`."""
    items = list(items)
    out_dir.mkdir(parents=True, exist_ok=True)
    total = len(items)
    saved: List[Path] = []

    for idx, item in enumerate(items, start=1):
        if should_cancel and should_cancel():
            raise RuntimeError("Job cancelled by user")
        url = getattr(item, "url", "") or ""
        name = getattr(item, "local_filename", "") or f"{idx:02d}.jpg"
        if not url:
            continue
        target = out_dir / name
        # Clean up any stale error marker from a previous run.
        err_path = out_dir / f"{name}.error.txt"
        if err_path.exists():
            err_path.unlink()
        try:
            _download_one(url, target, timeout=timeout, should_cancel=should_cancel)
            saved.append(target)
        except Exception as e:
            err_path.write_text(f"{url}\n{e}\n", encoding="utf-8")

        if on_progress:
            on_progress(idx, total, name)

    return saved
